// conexão com o Redis, aberta uma única vez, como no Mongo
const { createClient } = require("redis");

const client = createClient({ 
    username: "default",
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
  }, 
});

client.on("error", (err) => console.error("Erro no Redis:", err.message));

let conexao;

async function getRedis() {
  if (!conexao) {
    conexao = client.connect();
  }
  await conexao;
  return client;
}

module.exports = { getRedis };