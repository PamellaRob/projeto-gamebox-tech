const express = require("express");
const produtoService = require("../services/produtoService");
const carrinhoService = require("../services/carrinhoService");
const pedidoService = require("../services/pedidoService");
const cache = require("../services/cacheService");

// Rotas públicas da loja: home, lista de produtos, produto, carrinho e compra
const router = express.Router();

// Middleware: calcula o carrinho antes da tela abrir e deixa os valores
// prontos para o topo da página (contador de itens)
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

// Quantos produtos aparecem em cada página da lista completa
const POR_PAGINA = 12; // produtos por página na lista completa

// ----- Funções auxiliares -----

// Garante que o valor veio como texto simples (a URL pode trazer listas ou objetos)
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

// Home: vitrine (vem do Redis quando possível), vistos recentemente e mais vistos
router.get("/", carregarPreviaCarrinho, async (req, res) => {
  const produtos = await produtoService.listarVitrine();

  // Redis guarda só os ids; o MongoDB devolve os dados completos dos produtos
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

// Lista completa: a busca, os filtros e a paginação são feitos pelo MongoDB
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
  // Função enviada para a tela, que monta os links da paginação sem perder os filtros
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

// Página de um produto. Cada visita atualiza o "vistos recentemente" e o ranking no Redis
router.get("/produto/:id", carregarPreviaCarrinho, async (req, res) => {
  const produto = await produtoService.buscarPorId(req.params.id);
  if (!produto) {
    return res.status(404).render("404");
  }

  req.session.visitante = true; // faz a sessão ser salva e o ID do visitante se manter
  await cache.registrarVisto(req.sessionID, String(produto._id));
  await cache.registrarVisualizacao(req.sessionID, String(produto._id));

  res.render("produto", { titulo: produto.nome, produto });
});

// ----- Carrinho -----

// O carrinho fica na sessão do visitante: só guarda o id e a quantidade.
// O preço sempre é lido do MongoDB, nunca do navegador
router.get("/carrinho", carregarPreviaCarrinho, (req, res) => {
  const { itensCarrinho, subtotalCarrinho, formatarReais } = res.locals;

  res.render("carrinho", {
    titulo: "Meu carrinho",
    itens: itensCarrinho,
    total: subtotalCarrinho,
    brl: formatarReais,
  });
});

// Ações do carrinho usam POST porque alteram dados (GET só para consultar)
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