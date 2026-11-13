const express = require("express");
const produtoService = require("../services/produtoService");
const carrinhoService = require("../services/carrinhoService");
const cache = require("../services/cacheService");
const pedidoService = require("../services/pedidoService");

const router = express.Router();

// ----- Catálogo e produto -----

router.get("/", async (req, res) => {
  const produtos = await produtoService.listarComCache();
  const idsVistos = await cache.listarVistos(req.sessionID);
  const vistos = await produtoService.buscarPorIds(idsVistos);

  res.render("catalogo", { titulo: "GameBox Tech", produtos, vistos });
});

router.get("/produto/:id", async (req, res) => {
  const produto = await produtoService.buscarPorId(req.params.id);
  if (!produto) {
    return res.status(404).send("Produto não encontrado.");
  }

  req.session.visitante = true;
  await cache.registrarVisto(req.sessionID, String(produto._id));

  res.render("produto", { titulo: produto.nome, produto });
});

// ----- Carrinho -----

router.get("/carrinho", async (req, res) => {
  const { itens, total } = await carrinhoService.detalhar(req.session);
  res.render("carrinho", {
    titulo: "Meu carrinho",
    itens,
    total,
    brl: carrinhoService.formatarReais,
  });
});

router.post("/carrinho/adicionar/:id", async (req, res) => {
  await carrinhoService.adicionar(req.session, req.params.id);
  res.redirect(req.get("Referer") || "/carrinho");
});

router.post("/carrinho/diminuir/:id", (req, res) => {
  carrinhoService.diminuir(req.session, req.params.id);
  res.redirect(req.get("Referer") || "/carrinho");
});

router.post("/carrinho/remover/:id", (req, res) => {
  carrinhoService.remover(req.session, req.params.id);
  res.redirect(req.get("Referer") || "/carrinho");
});

// Botão Comprar: monta a mensagem e manda o cliente para o WhatsApp
router.post("/carrinho/finalizar", async (req, res) => {
  const { itens, total } = await carrinhoService.detalhar(req.session);
  if (itens.length === 0) return res.redirect("/carrinho");

  let numeroPedido = null;
  try {
    const pedido = await pedidoService.criar({
      itens,
      total: Number(total.toFixed(2)),
      clienteNome: (req.body.nome || "").trim().slice(0, 80),
    });
    numeroPedido = pedido.id;
    req.session.carrinho = {}; // pedido registrado: esvazia o carrinho
  } catch (err) {
    // Se o registro falhar, o cliente não é prejudicado: segue para o WhatsApp
    console.error("Falha ao salvar o pedido no Supabase:", err.message);
  }

  res.redirect(carrinhoService.montarLinkWhatsApp(itens, total, numeroPedido));
});

module.exports = router;