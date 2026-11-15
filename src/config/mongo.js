// Conexao com o Mongo

const { MongoClient } = require("mongodb");

// Uma única conexão com o MongoDB Atlas, reaproveitada por toda a aplicação
const client = new MongoClient(process.env.MONGODB_URI);
let db;

// Conecta na primeira chamada ("lazy") e devolve o banco definido em MONGODB_DB
async function getDb() {
  if (!db) {
    await client.connect();
    db = client.db(process.env.MONGODB_DB);
  }
  return db;
}

module.exports = { getDb };