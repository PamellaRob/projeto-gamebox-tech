// conexão com o Redis, aberta uma única vez, como no Mongo
const { createClient } = require("redis");

// Dados de acesso ao Redis Cloud vêm do arquivo .env
const client = createClient({ 
    username: "default",
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
  }, 
});

// Sem este ouvinte, um erro de conexão derrubaria o servidor inteiro
client.on("error", (err) => console.error("Erro no Redis:", err.message));

let conexao;

// Abre a conexão só na primeira vez; as demais chamadas reaproveitam a mesma
async function getRedis() {
  if (!conexao) {
    conexao = client.connect();
  }
  await conexao;
  return client;
}

module.exports = { getRedis };