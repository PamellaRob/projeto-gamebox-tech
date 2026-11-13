const express = require("express");
const supabase = require("../config/supabase");
const requireAdmin = require("../middleware/auth");
const produtoService = require("../services/produtoService");
const pedidoService = require("../services/pedidoService");

const router = express.Router();

const CATEGORIAS = ["jogos", "eletronicos"];

// ----- Funções auxiliares -----

// Lê e valida os campos do formulário de produto
function lerFormulario(body) {
  const nome = (body.nome || "").trim();
  const descricao = (body.descricao || "").trim();
  const imagem = (body.imagem || "").trim();
  const categoria = body.categoria;
  const preco = Number(String(body.preco).replace(",", "."));
  const estoque = Number(body.estoque);

  if (!nome || isNaN(preco) || preco < 0 || !Number.isInteger(estoque) || estoque < 0) {
    return { erro: "Confira o nome, o preço e o estoque." };
  }
  if (!CATEGORIAS.includes(categoria)) {
    return { erro: "Categoria inválida." };
  }

  // Transforma as linhas "chave: valor" em um objeto
  const atributos = Object.fromEntries(
    (body.caracteristicas || "")
      .split("\n")
      .map((linha) => linha.split(":"))
      .filter((partes) => partes.length >= 2 && partes[0].trim())
      .map((partes) => [partes[0].trim(), partes.slice(1).join(":").trim()])
  );

  return { produto: { nome, descricao, preco, imagem, categoria, estoque, atributos } };
}

// Transforma o objeto de atributos de volta em linhas "chave: valor"
function atributosParaTexto(atributos) {
  return Object.entries(atributos || {})
    .map(([chave, valor]) => `${chave}: ${valor}`)
    .join("\n");
}

// Desenha o formulário (de cadastro ou de edição)
function renderForm(res, extra = {}) {
  res.render("admin/produto-form", {
    titulo: "Cadastrar novo produto",
    acao: "/admin/produtos",
    botao: "Cadastrar",
    produto: null,
    caracteristicas: "",
    erro: null,
    sucesso: null,
    ...extra,
  });
}

// ----- Login e logout -----

router.get("/login", (req, res) => {
  if (req.session.admin) return res.redirect("/admin");
  res.render("admin/login", { erro: null });
});

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

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

// ----- Painel -----

router.get("/", requireAdmin, (req, res) => {
  res.render("admin/painel", { admin: req.session.admin });
});

// ----- Produtos -----

// Lista (lê direto do MongoDB, sem cache: o admin precisa ver o dado real)
router.get("/produtos", requireAdmin, async (req, res) => {
  const produtos = await produtoService.listar();
  res.render("admin/produtos", { produtos, msg: req.query.msg || null });
});

router.get("/produtos/novo", requireAdmin, (req, res) => {
  renderForm(res);
});

router.post("/produtos", requireAdmin, async (req, res) => {
  try {
    const { erro, produto } = lerFormulario(req.body);
    if (erro) return res.status(400), renderForm(res, { erro });

    await produtoService.criar(produto);
    renderForm(res, { sucesso: "Produto cadastrado com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500);
    renderForm(res, { erro: "Não foi possível cadastrar o produto." });
  }
});

router.get("/produtos/:id/editar", requireAdmin, async (req, res) => {
  const produto = await produtoService.buscarPorId(req.params.id);
  if (!produto) return res.redirect("/admin/produtos");

  renderForm(res, {
    titulo: "Editar produto",
    acao: `/admin/produtos/${produto._id}`,
    botao: "Salvar alterações",
    produto,
    caracteristicas: atributosParaTexto(produto.atributos),
  });
});

router.post("/produtos/:id", requireAdmin, async (req, res) => {
  try {
    const existente = await produtoService.buscarPorId(req.params.id);
    if (!existente) return res.redirect("/admin/produtos");

    const { erro, produto } = lerFormulario(req.body);
    if (erro) {
      res.status(400);
      return renderForm(res, {
        titulo: "Editar produto",
        acao: `/admin/produtos/${existente._id}`,
        botao: "Salvar alterações",
        produto: existente,
        caracteristicas: atributosParaTexto(existente.atributos),
        erro,
      });
    }

    await produtoService.atualizar(req.params.id, produto);
    res.redirect("/admin/produtos?msg=" + encodeURIComponent("Produto atualizado com sucesso."));
  } catch (err) {
    console.error(err);
    res.redirect("/admin/produtos?msg=" + encodeURIComponent("Erro ao atualizar o produto."));
  }
});

router.post("/produtos/:id/excluir", requireAdmin, async (req, res) => {
  try {
    await produtoService.excluir(req.params.id);
    res.redirect("/admin/produtos?msg=" + encodeURIComponent("Produto excluído."));
  } catch (err) {
    console.error(err);
    res.redirect("/admin/produtos?msg=" + encodeURIComponent("Erro ao excluir o produto."));
  }
});

// ----- Pedidos -----

router.get("/pedidos", requireAdmin, async (req, res) => {
  try {
    const pedidos = await pedidoService.listar();
    res.render("admin/pedidos", { pedidos });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao carregar os pedidos.");
  }
});

router.get("/pedidos/:id", requireAdmin, async (req, res) => {
  try {
    const pedido = await pedidoService.buscarPorId(req.params.id);
    if (!pedido) return res.redirect("/admin/pedidos");

    res.render("admin/pedido", {
      pedido,
      statusLista: pedidoService.STATUS,
      msg: req.query.msg || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao carregar o pedido.");
  }
});

router.post("/pedidos/:id/status", requireAdmin, async (req, res) => {
  try {
    const ok = await pedidoService.atualizarStatus(req.params.id, req.body.status);
    const msg = ok ? "Status atualizado." : "Status inválido.";
    res.redirect(`/admin/pedidos/${req.params.id}?msg=` + encodeURIComponent(msg));
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/pedidos/${req.params.id}?msg=` + encodeURIComponent("Erro ao atualizar."));
  }
});

module.exports = router;