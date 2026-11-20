// GameBox Tech: ponto de entrada do servidor
//
// Três bancos de dados, cada um com a sua função:
//   Supabase (PostgreSQL): login do administrador e pedidos
//   MongoDB: catálogo de produtos
//   Redis: cache da vitrine, "vistos recentemente" e ranking de mais vistos
// ============================================================

require("dotenv").config();
const express = require("express");
const path = require("path");
// express-session guarda os dados de cada visitante (login do admin e carrinho)
// em um cookie assinado com o SESSION_SECRET
const session = require("express-session");
const app = express();


// Configuração das telas: o EJS monta o HTML usando os arquivos da pasta "views"
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// Arquivos públicos (CSS, imagens) ficam na pasta "public"
app.use(express.static(path.join(__dirname, "public")));
// Permite ler os dados enviados pelos formulários (req.body)
app.use(express.urlencoded({ extended: true }));
// Sessão: cada visitante recebe um cookie. "saveUninitialized: false" só cria
// o cookie quando algo é guardado (carrinho, login ou produto visto)
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // httpOnly: o JavaScript da página não lê o cookie
    // sameSite "lax": o navegador não envia o cookie em pedidos vindos de outros sites
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 2 }, // 2 horas
  })
);

// Disponibiliza a quantidade de itens do carrinho para todas as telas (ícone do topo)
app.use((req, res, next) => {
  const carrinho = req.session.carrinho || {};
  res.locals.qtdCarrinho = Object.values(carrinho).reduce((soma, q) => soma + q, 0);
  next();
});

// Rotas: primeiro o painel administrativo (/admin) e depois a loja pública
app.use("/admin", require("./src/routes/admin"));

app.use("/", require("./src/routes/loja"));

// Se nenhuma rota acima respondeu, mostra a página "não encontrada" (404)
app.use((req, res) => {
  res.status(404).render("404");
});

// Qualquer erro não tratado (banco fora do ar, falha inesperada) cai aqui.
// O detalhe técnico vai só para o terminal; o visitante vê uma página simples.
// Este tratador precisa ter 4 parâmetros (err, req, res, next) para o Express reconhecê-lo
app.use((err, req, res, next) => {
  console.error("Erro no servidor:", err);
  if (res.headersSent) return next(err);
  res.locals.qtdCarrinho = res.locals.qtdCarrinho || 0;
  res.status(500).render("500");
});

const PORT = process.env.PORT || 3000;

// Cria os índices do MongoDB (se ainda não existirem) quando o servidor inicia
require("./src/services/produtoService").garantirIndices();

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});