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

module.exports = {
  criar,
  listar,
  listarComCache,
  buscarPorId,
  buscarPorIds,
  atualizar,
  excluir,
};