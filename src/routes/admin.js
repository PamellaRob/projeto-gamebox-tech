const express = require("express");
const supabase = require("../config/supabase");
const requireAdmin = require("../middleware/auth");
const produtoService = require("../services/produtoService");
const router = express.Router();


// Mostra o formulário de login
router.get("/login", (req, res) => {
  if (req.session.admin) return res.redirect("/admin");
  res.render("admin/login", { erro: null });
});

// Recebe e-mail e senha e confere no Supabase
router.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    return res
      .status(401)
      .render("admin/login", { erro: "E-mail ou senha inválidos." });
  }

  req.session.admin = { id: data.user.id, email: data.user.email };
  res.redirect("/admin");
});

// Painel (protegido pelo porteiro)
router.get("/", requireAdmin, (req, res) => {
  res.render("admin/painel", { admin: req.session.admin });
});

// Sair
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

// Formulário de cadastro
router.get("/produtos/novo", requireAdmin, (req, res) => {
  res.render("admin/produto-form", { erro: null, sucesso: null });
});

// Recebe o formulário e salva no MongoDB
router.post("/produtos", requireAdmin, async (req, res) => {
  try {
    const { nome, descricao, preco, imagem, categoria, estoque, caracteristicas } = req.body;

    const precoNumero = Number(String(preco).replace(",", "."));
    const estoqueNumero = Number(estoque);

    if (!nome.trim() || isNaN(precoNumero) || precoNumero < 0 || isNaN(estoqueNumero)) {
      return res.status(400).render("admin/produto-form", {
        erro: "Confira o nome, o preço e o estoque.",
        sucesso: null,
      });
    }

    // Transforma as linhas "chave: valor" em um objeto
    const atributos = Object.fromEntries(
      (caracteristicas || "")
        .split("\n")
        .map((linha) => linha.split(":"))
        .filter((partes) => partes.length >= 2 && partes[0].trim())
        .map((partes) => [partes[0].trim(), partes.slice(1).join(":").trim()])
    );

    await produtoService.criar({
      nome: nome.trim(),
      descricao: descricao.trim(),
      preco: precoNumero,
      imagem: imagem.trim(),
      categoria,
      estoque: estoqueNumero,
      atributos,
    });

    res.render("admin/produto-form", { erro: null, sucesso: "Produto cadastrado com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500).render("admin/produto-form", {
      erro: "Não foi possível cadastrar o produto.",
      sucesso: null,
    });
  }
});

module.exports = router;