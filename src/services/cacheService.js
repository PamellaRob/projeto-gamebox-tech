const { getRedis } = require("../config/redis");

const CHAVE_CATALOGO = "catalogo:produtos";
const TTL_CATALOGO = 60; // segundos
const MAX_VISTOS = 5;

// ----- Cache do catálogo -----

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

module.exports = {
  lerCatalogo,
  salvarCatalogo,
  limparCatalogo,
  registrarVisto,
  listarVistos,
};