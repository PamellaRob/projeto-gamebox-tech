// Serviço do Redis - Todas as funções têm try/catch: se o Redis cair, o site continua funcionando (só sem cache)
// Chaves usadas:
//   catalogo:produtos        vitrine da home (expira em 60 s)
//   vistos:<visitante>       últimos produtos vistos por cada visitante
//   ranking:visualizacoes    sorted set com as visualizações de cada produto
//   contou:<visitante>:<id>  evita contar a mesma visita várias vezes
const { getRedis } = require("../config/redis");

const CHAVE_CATALOGO = "catalogo:produtos";
const TTL_CATALOGO = 60; // segundos
const MAX_VISTOS = 5;
const CHAVE_RANKING = "ranking:visualizacoes";

// ----- Cache do catálogo -----

// Devolve a vitrine guardada, ou null se não houver (cache MISS)
async function lerCatalogo() {
  try {
    const redis = await getRedis();
    const dados = await redis.get(CHAVE_CATALOGO);
    return dados ? JSON.parse(dados) : null;
  } catch (err) {
    console.error("Cache indisponível (leitura):", err.message);
    return null;
  }
}

async function salvarCatalogo(produtos) {
  try {
    const redis = await getRedis();
    await redis.set(CHAVE_CATALOGO, JSON.stringify(produtos), { EX: TTL_CATALOGO });
  } catch (err) {
    console.error("Cache indisponível (escrita):", err.message);
  }
}

async function limparCatalogo() {
  try {
    const redis = await getRedis();
    await redis.del(CHAVE_CATALOGO);
  } catch (err) {
    console.error("Cache indisponível (limpeza):", err.message);
  }
}

// ----- Vistos recentemente (uma lista por visitante) -----

// Lista por visitante: LREM remove repetido, LPUSH põe no início, LTRIM limita o tamanho
async function registrarVisto(visitanteId, produtoId) {
  try {
    const redis = await getRedis();
    const chave = `vistos:${visitanteId}`;
    await redis.lRem(chave, 0, produtoId);   // tira o produto se já estava na lista
    await redis.lPush(chave, produtoId);     // coloca no começo
    await redis.lTrim(chave, 0, MAX_VISTOS - 1); // mantém só os 5 mais recentes
    await redis.expire(chave, 60 * 60 * 24 * 7); // a lista some em 7 dias
  } catch (err) {
    console.error("Cache indisponível (vistos):", err.message);
  }
}

async function listarVistos(visitanteId) {
  try {
    const redis = await getRedis();
    return await redis.lRange(`vistos:${visitanteId}`, 0, -1);
  } catch (err) {
    console.error("Cache indisponível (vistos):", err.message);
    return [];
  }
}

// ----- Ranking de mais vistos (sorted set) -----

// ZINCRBY soma 1 na pontuação do produto dentro do sorted set
async function registrarVisualizacao(visitanteId, produtoId) {
  try {
    const redis = await getRedis();
    // Conta só uma vez por visitante a cada hora (NX = só grava se ainda não existir)
    const primeiraVez = await redis.set(`contou:${visitanteId}:${produtoId}`, "1", {
      NX: true,
      EX: 60 * 60,
    });
    if (primeiraVez) {
      await redis.zIncrBy(CHAVE_RANKING, 1, produtoId);
    }
  } catch (err) {
    console.error("Cache indisponível (ranking):", err.message);
  }
}

// REV: true devolve da maior pontuação para a menor
async function listarMaisVistos(limite = 4) {
  try {
    const redis = await getRedis();
    const itens = await redis.zRangeWithScores(CHAVE_RANKING, 0, limite - 1, { REV: true });
    return itens.map((i) => ({ id: i.value, visualizacoes: i.score }));
  } catch (err) {
    console.error("Cache indisponível (ranking):", err.message);
    return [];
  }
}

// Devolve { idDoProduto: visualizacoes } para todos os produtos do ranking
async function obterVisualizacoes() {
  try {
    const redis = await getRedis();
    const itens = await redis.zRangeWithScores(CHAVE_RANKING, 0, -1);
    return Object.fromEntries(itens.map((i) => [i.value, i.score]));
  } catch (err) {
    console.error("Cache indisponível (ranking):", err.message);
    return {};
  }
}

async function removerDoRanking(produtoId) {
  try {
    const redis = await getRedis();
    await redis.zRem(CHAVE_RANKING, String(produtoId));
  } catch (err) {
    console.error("Cache indisponível (ranking):", err.message);
  }
}

module.exports = {
  lerCatalogo,
  salvarCatalogo,
  limparCatalogo,
  registrarVisto,
  listarVistos,
  registrarVisualizacao,
  listarMaisVistos,
  obterVisualizacoes,
  removerDoRanking,
};