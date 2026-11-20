// Serviço de produtos (MongoDB) - Cada produto é um documento; as características variam por produto e ficam no campo "atributos"
const { ObjectId } = require("mongodb");
const { getDb } = require("../config/mongo");
const cache = require("./cacheService");

const VITRINE_TAMANHO = 8; // quantos produtos aparecem na home
const CATEGORIAS_VALIDAS = ["jogos", "eletronicos"];

// O segundo campo (_id) desempata e mantém a ordem estável entre as páginas
const ORDENACOES = {
  recentes: { criadoEm: -1, _id: -1 },
  menor: { preco: 1, _id: 1 },
  maior: { preco: -1, _id: 1 },
  nome: { nome: 1, _id: 1 },
};

// A conexão com o MongoDB é aberta uma vez e reaproveitada
async function colecao() {
  const db = await getDb();
  return db.collection("produtos");
}

// ----- Cadastro, edição e exclusão -----

// Sempre que o catálogo muda, o cache da vitrine é apagado para não mostrar dados velhos
async function criar(produto) {
  const produtos = await colecao();
  const resultado = await produtos.insertOne({
    ...produto,
    criadoEm: new Date(),
  });
  await cache.limparCatalogo(); // a vitrine mudou, então o cache velho sai
  return resultado.insertedId;
}

async function atualizar(id, dados) {
  if (!ObjectId.isValid(id)) return false;
  const produtos = await colecao();
  const resultado = await produtos.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...dados, atualizadoEm: new Date() } }
  );
  await cache.limparCatalogo();
  return resultado.matchedCount > 0;
}

async function excluir(id) {
  if (!ObjectId.isValid(id)) return false;
  const produtos = await colecao();
  const resultado = await produtos.deleteOne({ _id: new ObjectId(id) });
  await cache.limparCatalogo();
  await cache.removerDoRanking(id);
  return resultado.deletedCount > 0;
}

// ----- Leituras -----

// Lista completa (usada pelo painel do admin, sem cache)
async function listar() {
  const produtos = await colecao();
  return produtos.find().sort({ criadoEm: -1 }).toArray();
}

// Vitrine da home: só os lançamentos mais recentes, guardados no Redis
async function listarVitrine() {
  const emCache = await cache.lerCatalogo();
  if (emCache) {
    console.log("Vitrine da home servida pelo Redis (cache HIT)");
    return emCache.slice(0, VITRINE_TAMANHO);
  }

  console.log("Vitrine da home lida do MongoDB (cache MISS)");
  const produtos = await colecao();
  const vitrine = await produtos
    .find()
    .sort({ criadoEm: -1 })
    .limit(VITRINE_TAMANHO)
    .toArray();
  await cache.salvarCatalogo(vitrine);
  return vitrine;
}

async function buscarPorId(id) {
  if (!ObjectId.isValid(id)) return null;
  const produtos = await colecao();
  return produtos.findOne({ _id: new ObjectId(id) });
}

// Uma única consulta para vários produtos (carrinho, vistos e ranking)
async function buscarPorIds(ids) {
  const validos = ids.filter((id) => ObjectId.isValid(id));
  if (validos.length === 0) return [];

  const produtos = await colecao();
  const docs = await produtos
    .find({ _id: { $in: validos.map((id) => new ObjectId(id)) } })
    .toArray();

  // O Mongo não garante a ordem, então reordenamos pela ordem da lista recebida
  return validos
    .map((id) => docs.find((d) => String(d._id) === id))
    .filter(Boolean);
}

// ----- Busca, filtros e paginação -----

// Protege a busca: trata o texto digitado como texto comum, não como regex
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Monta a consulta do MongoDB com os filtros escolhidos na tela
function montarFiltro({ q, categoria, plataforma }) {
  const filtro = {};

  if (q) {
    const padrao = escaparRegex(q);
    filtro.$or = [
      { nome: { $regex: padrao, $options: "i" } },
      { descricao: { $regex: padrao, $options: "i" } },
    ];
  }
  if (CATEGORIAS_VALIDAS.includes(categoria)) {
    filtro.categoria = categoria;
  }
  if (plataforma) {
    // Aceita "plataforma" e "plataformas", e vários nomes no mesmo texto
    const padrao = { $regex: escaparRegex(plataforma), $options: "i" };
    filtro.$and = [
      { $or: [{ "atributos.plataforma": padrao }, { "atributos.plataformas": padrao }] },
    ];
  }
  return filtro;
}

// Devolve uma página de resultados e os totais para montar a paginação
// Paginação: countDocuments conta o total, skip pula as páginas anteriores e limit traz só a página atual
async function listarFiltrado(filtros, { pagina = 1, porPagina = 12 } = {}) {
  const filtro = montarFiltro(filtros);
  const produtos = await colecao();

  const total = await produtos.countDocuments(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);

  const lista = await produtos
    .find(filtro)
    .sort(ORDENACOES[filtros.ordem] || ORDENACOES.recentes)
    .skip((paginaAtual - 1) * porPagina)
    .limit(porPagina)
    .toArray();

  return { produtos: lista, total, pagina: paginaAtual, totalPaginas };
}

// Valores de plataforma que existem hoje nos produtos
async function listarPlataformas() {
  const produtos = await colecao();
  const valores = [
    ...(await produtos.distinct("atributos.plataforma")),
    ...(await produtos.distinct("atributos.plataformas")),
  ];
    // "PlayStation 4, Xbox One e PC" vira três opções separadas, sem repetir
  const unicas = new Map();
  valores
    .filter((v) => typeof v === "string")
    .flatMap((v) => v.split(/\s*(?:,|;|\/|\||\se\s)\s*/))
    .map((nome) => nome.trim())
    .filter(Boolean)
    .forEach((nome) => {
      const chave = nome.toLowerCase();
      if (!unicas.has(chave)) unicas.set(chave, nome);
    });
  return [...unicas.values()].sort((x, y) => x.localeCompare(y, "pt-BR"));
}

// Índices aceleram as consultas (criados uma vez, na inicialização)
async function garantirIndices() {
  try {
    const produtos = await colecao();
    await produtos.createIndex({ categoria: 1 });
    await produtos.createIndex({ criadoEm: -1 });
    await produtos.createIndex({ "atributos.plataforma": 1 });
  } catch (err) {
    console.error("Não foi possível criar os índices:", err.message);
  }
}

module.exports = {
  criar,
  atualizar,
  excluir,
  listar,
  listarVitrine,
  buscarPorId,
  buscarPorIds,
  listarFiltrado,
  listarPlataformas,
  garantirIndices,
  CATEGORIAS_VALIDAS,
};