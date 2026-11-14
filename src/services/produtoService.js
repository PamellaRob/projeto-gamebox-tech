const { ObjectId } = require("mongodb");
const { getDb } = require("../config/mongo");
const cache = require("./cacheService");

async function colecao() {
  const db = await getDb();
  return db.collection("produtos");
}

async function criar(produto) {
  const produtos = await colecao();
  const resultado = await produtos.insertOne({
    ...produto,
    criadoEm: new Date(),
  });
  await cache.limparCatalogo(); // o catálogo mudou, então o cache velho sai
  return resultado.insertedId;
}

async function listar() {
  const produtos = await colecao();
  return produtos.find().sort({ criadoEm: -1 }).toArray();
}

async function listarComCache() {
  const emCache = await cache.lerCatalogo();
  if (emCache) {
    console.log("Catálogo vindo do Redis (cache HIT)");
    return emCache;
  }

  console.log("Catálogo vindo do MongoDB (cache MISS)");
  const produtos = await listar();
  await cache.salvarCatalogo(produtos);
  return produtos;
}

async function buscarPorId(id) {
  if (!ObjectId.isValid(id)) return null;
  const produtos = await colecao();
  return produtos.findOne({ _id: new ObjectId(id) });
}

async function buscarPorIds(ids) {
  const validos = ids.filter((id) => ObjectId.isValid(id));
  if (validos.length === 0) return [];

  const produtos = await colecao();
  const docs = await produtos
    .find({ _id: { $in: validos.map((id) => new ObjectId(id)) } })
    .toArray();

  // O Mongo não garante a ordem, então reordenamos pela ordem da lista do Redis
  return validos
    .map((id) => docs.find((d) => String(d._id) === id))
    .filter(Boolean);
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
  return resultado.deletedCount > 0;
}

const CATEGORIAS_VALIDAS = ["jogos", "eletronicos"];

const ORDENACOES = {
  recentes: { criadoEm: -1 },
  menor: { preco: 1 },
  maior: { preco: -1 },
  nome: { nome: 1 },
};

// Protege a busca: trata o texto digitado como texto comum, não como regex
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listarFiltrado({ q, categoria, plataforma, ordem }) {
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
    filtro["atributos.plataforma"] = plataforma;
  }

  const produtos = await colecao();
  return produtos
    .find(filtro)
    .sort(ORDENACOES[ordem] || ORDENACOES.recentes)
    .toArray();
}

// Valores de plataforma que existem hoje nos produtos
async function listarPlataformas() {
  const produtos = await colecao();
  const valores = await produtos.distinct("atributos.plataforma");
  return valores.filter((v) => typeof v === "string" && v).sort();
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
  listar,
  listarComCache,
  buscarPorId,
  buscarPorIds,
  atualizar,
  excluir,
  listarFiltrado,
  listarPlataformas,
  garantirIndices,
  CATEGORIAS_VALIDAS,
};