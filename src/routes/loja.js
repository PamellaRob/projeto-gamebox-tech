const express = require("express");
const produtoService = require("../services/produtoService");
const carrinhoService = require("../services/carrinhoService");
const pedidoService = require("../services/pedidoService");
const cache = require("../services/cacheService");

const router = express.Router();

async function carregarPreviaCarrinho(req, res, next) {
  try {
    const { itens, total } = await carrinhoService.detalhar(req.session);

    res.locals.itensCarrinho = itens;
    res.locals.subtotalCarrinho = total;
    res.locals.formatarReais = carrinhoService.formatarReais;
    res.locals.qtdCarrinho = itens.reduce((soma, item) => soma + item.qtd, 0);

    next();
  } catch (erro) {
    next(erro);
  }
}

const POR_PAGINA = 12; // produtos por página na lista completa

// ----- Funções auxiliares -----

const texto = (valor) => (typeof valor === "string" ? valor.trim() : "");

// Lê os filtros da URL, garantindo que sejam textos simples
function lerFiltros(query) {
  return {
    q: texto(query.q).slice(0, 60),
    categoria: texto(query.categoria),
    plataforma: texto(query.plataforma),
    ordem: texto(query.ordem) || "recentes",
  };
}

// ----- Home: só uma vitrine, sem o catálogo inteiro -----

router.get("/", carregarPreviaCarrinho, async (req, res) => {
  const produtos = await produtoService.listarVitrine();

  const idsVistos = await cache.listarVistos(req.sessionID);
  const vistos = await produtoService.buscarPorIds(idsVistos);

  // Ranking: o Redis dá os ids e as pontuações; o Mongo dá os dados dos produtos
  const ranking = await cache.listarMaisVistos(4);
  const docs = await produtoService.buscarPorIds(ranking.map((r) => r.id));
  const maisVistos = docs.map((d) => ({
    ...d,
    visualizacoes: ranking.find((r) => r.id === String(d._id)).visualizacoes,
  }));

  res.render("catalogo", { titulo: "GameBox Tech", produtos, vistos, maisVistos });
});

// ----- Lista completa: busca, filtros e paginação -----

router.get("/produtos", carregarPreviaCarrinho, async (req, res) => {
  const filtros = lerFiltros(req.query);
  const pagina = parseInt(req.query.pagina, 10) || 1;

  const temFiltro = Boolean(
    filtros.q || filtros.categoria || filtros.plataforma || filtros.ordem !== "recentes"
  );
  if (temFiltro) console.log("Busca filtrada vinda do MongoDB");

  const resultado = await produtoService.listarFiltrado(filtros, {
    pagina,
    porPagina: POR_PAGINA,
  });
  const plataformas = await produtoService.listarPlataformas();

  // Monta o link de cada página mantendo os filtros escolhidos
  const linkPagina = (n) => {
    const params = new URLSearchParams();
    if (filtros.q) params.set("q", filtros.q);
    if (filtros.categoria) params.set("categoria", filtros.categoria);
    if (filtros.plataforma) params.set("plataforma", filtros.plataforma);
    if (filtros.ordem !== "recentes") params.set("ordem", filtros.ordem);
    if (n > 1) params.set("pagina", n);
    const consulta = params.toString();
    return "/produtos" + (consulta ? "?" + consulta : "");
  };

  res.render("produtos", {
    titulo: "Produtos",
    filtros,
    plataformas,
    temFiltro,
    linkPagina,
    ...resultado, // produtos, total, pagina, totalPaginas
  });
});

// ----- Produto -----

router.get("/produto/:id", carregarPreviaCarrinho, async (req, res) => {
  const produto = await produtoService.buscarPorId(req.params.id);
  if (!produto) {
    return res.status(404).send("Produto não encontrado.");
  }

  req.session.visitante = true; // faz a sessão ser salva e o ID do visitante se manter
  await cache.registrarVisto(req.sessionID, String(produto._id));
  await cache.registrarVisualizacao(req.sessionID, String(produto._id));

  res.render("produto", { titulo: produto.nome, produto });
});

// ----- Carrinho -----

router.get("/carrinho", carregarPreviaCarrinho, (req, res) => {
  const { itensCarrinho, subtotalCarrinho, formatarReais } = res.locals;

  res.render("carrinho", {
    titulo: "Meu carrinho",
    itens: itensCarrinho,
    total: subtotalCarrinho,
    brl: formatarReais,
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

// Botão Comprar: salva o pedido no Supabase e manda o cliente para o WhatsApp
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