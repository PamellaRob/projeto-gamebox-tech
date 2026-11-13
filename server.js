require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const app = express();


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 2 }, // 2 horas
  })
);

app.use((req, res, next) => {
  const carrinho = req.session.carrinho || {};
  res.locals.qtdCarrinho = Object.values(carrinho).reduce((soma, q) => soma + q, 0);
  next();
});

app.use("/admin", require("./src/routes/admin"));

app.use("/", require("./src/routes/loja"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});