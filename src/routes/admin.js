const express = require("express");
const supabase = require("../config/supabase");
const requireAdmin = require("../middleware/auth");
const produtoService = require("../services/produtoService");
const pedidoService = require("../services/pedidoService");
const cache = require("../services/cacheService");
const carrinhoService = require("../services/carrinhoService");

// Rotas do painel administrativo (/admin). Quase todas passam pelo "requireAdmin",
// que só deixa entrar quem fez login no Supabase
const router = express.Router();
// Impede o navegador de guardar páginas do admin (botão Voltar após o logout)
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Valores fixos usados nas telas e nas validações
const CATEGORIAS = ["jogos", "eletronicos"];
// Produtos com 5 unidades ou menos aparecem em "Atenção ao estoque"
const ESTOQUE_BAIXO = 5;
const STATUS_PEDIDOS = pedidoService.STATUS;

const ROTULOS_STATUS = {
  novo: "Novo",
  confirmado: "Confirmado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

// Datas sempre no horário de Fortaleza/Teresina, mesmo que o servidor esteja em outro fuso
const formatadorData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Fortaleza",
});

// ----- Funções auxiliares -----

// Formata números como dinheiro (R$ 1.234,56)
function brl(valor) {
  return carrinhoService.formatarReais(Number(valor));
}

function rotuloStatus(status) {
  return ROTULOS_STATUS[status] || status;
}

function dataHora(valor) {
  const data = new Date(valor);
  return valor && Number.isFinite(data.getTime())
    ? formatadorData.format(data)
    : "—";
}

// Conta quantos pedidos existem em cada status (alimenta a barra do painel)
function contarPorStatus(pedidos) {
  const porStatus = Object.fromEntries(
    STATUS_PEDIDOS.map((status) => [status, 0])
  );

  for (const pedido of pedidos) {
    if (Object.hasOwn(porStatus, pedido.status)) {
      porStatus[pedido.status] += 1;
    }
  }

  return porStatus;
}

// Valida o formulário de produto no servidor. Devolve { erro } ou { produto }
// Aceita "249,90", "249.90", "1.299,90" e "R$ 1.299,90"
function lerPreco(valor) {
  let texto = String(valor ?? "").replace(/R\$|\s/g, "");
  if (texto === "") return NaN;

  if (texto.includes(",")) {
    // Com vírgula: os pontos são separadores de milhar e a vírgula é o decimal
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    // Só pontos no formato 1.299 ou 1.299.000: também é milhar
    texto = texto.replace(/\./g, "");
  }
  return Number(texto);
}

function lerFormulario(body) {
  const nome = (body.nome || "").trim();
  const descricao = (body.descricao || "").trim();
  const imagem = (body.imagem || "").trim();
  const categoria = body.categoria;
  const preco = lerPreco(body.preco);
  const estoque = Number(body.estoque);

  if (!nome || !Number.isFinite(preco) || preco < 0 ||
      !Number.isInteger(estoque) || estoque < 0) {
    return { erro: "Confira o nome, o preço e o estoque." };
  }

  if (!CATEGORIAS.includes(categoria)) {
    return { erro: "Categoria inválida." };
  }

  // Transforma as linhas "chave: valor" em um objeto. Esses atributos livres
  // são a vantagem do MongoDB: cada produto pode ter características diferentes
  const atributos = Object.fromEntries(
    (body.caracteristicas || "")
      .split("\n")
      .map((linha) => linha.split(":"))
      .filter((partes) => partes.length >= 2 && partes[0].trim())
      .map((partes) => [
        partes[0].trim().toLowerCase(),
        partes.slice(1).join(":").trim(),
      ])
  );

  return { produto: { nome, descricao, preco, imagem, categoria, estoque, atributos } };
}

// Faz o caminho contrário, para preencher o formulário ao editar
function atributosParaTexto(atributos) {
  return Object.entries(atributos || {})
    .map(([chave, valor]) => `${chave}: ${valor}`)
    .join("\n");
}

// Mostra o formulário de produto (cadastro ou edição) com valores padrão
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

// ----- Login: a senha é conferida pelo Supabase Auth, nunca guardada aqui -----
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

// Encerra a sessão e volta para o login
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

router.use((req, res, next) => {
  // Deixa estes dados disponíveis em todas as telas do admin (a partir daqui)
  res.locals.admin = req.session.admin;
  res.locals.brl = brl;
  res.locals.statusLista = STATUS_PEDIDOS;
  res.locals.rotuloStatus = rotuloStatus;
  res.locals.dataHora = dataHora;
  res.locals.ESTOQUE_BAIXO = ESTOQUE_BAIXO;
  next();
});

// ----- Painel -----

// ----- Painel: junta dados dos três bancos -----
// Pedidos vêm do Supabase, produtos do MongoDB e visualizações do Redis
router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const [listaPedidos, produtos, visualizacoes] = await Promise.all([
      pedidoService.listar(),
      produtoService.listar(),
      cache.obterVisualizacoes(),
    ]);

    // Dinheiro é somado em centavos (inteiros) para evitar erros de arredondamento
    let faturamentoCentavos = 0;

    for (const pedido of listaPedidos) {
      if (pedido.status !== "cancelado") {
        faturamentoCentavos += Math.round(Number(pedido.total) * 100);
      }
    }

    const pedidos = {
      total: listaPedidos.length,
      faturamento: faturamentoCentavos / 100,
      porStatus: contarPorStatus(listaPedidos),
      recentes: listaPedidos.slice(0, 5),
    };

    let unidades = 0;
    let valorEstoqueCentavos = 0;

    for (const produto of produtos) {
      unidades += produto.estoque;
      valorEstoqueCentavos += Math.round(produto.preco * 100) * produto.estoque;
    }

    const estoque = {
      total: produtos.length,
      unidades,
      valor: valorEstoqueCentavos / 100,
      atencao: produtos
        .filter((produto) => produto.estoque <= ESTOQUE_BAIXO)
        .sort((a, b) => a.estoque - b.estoque),
    };

    // O Redis informa as visualizações; os dados dos produtos vêm do MongoDB
    const maisVistos = produtos
      .map((produto) => ({
        ...produto,
        visualizacoes: visualizacoes[String(produto._id)] || 0,
      }))
      .filter((produto) => produto.visualizacoes > 0)
      .sort((a, b) => b.visualizacoes - a.visualizacoes)
      .slice(0, 4);

    const totalVisualizacoes = Object.values(visualizacoes)
      .reduce((soma, quantidade) => soma + quantidade, 0);

    res.render("admin/painel", {
      pedidos,
      estoque,
      maisVistos,
      totalVisualizacoes,
    });
  } catch (erro) {
    next(erro);
  }
});

// ----- Produtos -----

// ----- Produtos: lista com abas (todos, estoque baixo, esgotados) -----
router.get("/produtos", requireAdmin, async (req, res, next) => {
  try {
    const filtro = ["baixo", "esgotado"].includes(req.query.filtro)
      ? req.query.filtro
      : "todos";

    const [todos, visualizacoes] = await Promise.all([
      produtoService.listar(),
      cache.obterVisualizacoes(),
    ]);

    const baixo = todos.filter(
      (produto) => produto.estoque > 0 && produto.estoque <= ESTOQUE_BAIXO
    );
    const esgotado = todos.filter((produto) => produto.estoque <= 0);
    const listas = { todos, baixo, esgotado };

    res.render("admin/produtos", {
      produtos: listas[filtro],
      filtro,
      contagem: {
        todos: todos.length,
        baixo: baixo.length,
        esgotado: esgotado.length,
      },
      visualizacoes,
      msg: req.query.msg || null,
    });
  } catch (erro) {
    next(erro);
  }
});

router.get("/produtos/novo", requireAdmin, (req, res) => {
  renderForm(res);
});

// Cadastro: valida, salva no MongoDB e limpa o cache da vitrine (a loja atualiza na hora)
router.post("/produtos", requireAdmin, async (req, res) => {
  try {
    const { erro, produto } = lerFormulario(req.body);

    if (erro) {
      res.status(400);
      return renderForm(res, { erro });
    }

    await produtoService.criar(produto);
    renderForm(res, { sucesso: "Produto cadastrado com sucesso!" });
  } catch (erro) {
    console.error(erro);
    res.status(500);
    renderForm(res, { erro: "Não foi possível cadastrar o produto." });
  }
});

router.get("/produtos/:id/editar", requireAdmin, async (req, res, next) => {
  try {
    const produto = await produtoService.buscarPorId(req.params.id);
    if (!produto) return res.redirect("/admin/produtos");

    renderForm(res, {
      titulo: "Editar produto",
      acao: `/admin/produtos/${produto._id}`,
      botao: "Salvar alterações",
      produto,
      caracteristicas: atributosParaTexto(produto.atributos),
    });
  } catch (erro) {
    next(erro);
  }
});

// Edição: se a validação falhar, mostra o formulário de novo com o erro
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
  } catch (erro) {
    console.error(erro);
    res.redirect("/admin/produtos?msg=" + encodeURIComponent("Erro ao atualizar o produto."));
  }
});

// Exclusão: também remove o produto do ranking de mais vistos no Redis
router.post("/produtos/:id/excluir", requireAdmin, async (req, res) => {
  try {
    await produtoService.excluir(req.params.id);
    res.redirect("/admin/produtos?msg=" + encodeURIComponent("Produto excluído."));
  } catch (erro) {
    console.error(erro);
    res.redirect("/admin/produtos?msg=" + encodeURIComponent("Erro ao excluir o produto."));
  }
});

// ----- Pedidos -----

// ----- Pedidos (Supabase): lista com filtro por status -----
router.get("/pedidos", requireAdmin, async (req, res, next) => {
  try {
    const todos = await pedidoService.listar();
    const status = STATUS_PEDIDOS.includes(req.query.status)
      ? req.query.status
      : "";

    const pedidos = status
      ? todos.filter((pedido) => pedido.status === status)
      : todos;

    res.render("admin/pedidos", {
      pedidos,
      status,
      resumo: {
        total: todos.length,
        porStatus: contarPorStatus(todos),
      },
    });
  } catch (erro) {
    next(erro);
  }
});

router.get("/pedidos/:id", requireAdmin, async (req, res, next) => {
  try {
    const pedido = await pedidoService.buscarPorId(req.params.id);
    if (!pedido) return res.redirect("/admin/pedidos");

    res.render("admin/pedido", {
      pedido,
      msg: req.query.msg || null,
    });
  } catch (erro) {
    next(erro);
  }
});

// Atualiza o status. O servidor só aceita os quatro valores da lista STATUS
router.post("/pedidos/:id/status", requireAdmin, async (req, res) => {
  try {
    const ok = await pedidoService.atualizarStatus(req.params.id, req.body.status);
    const msg = ok ? "Status atualizado." : "Status inválido.";
    res.redirect(`/admin/pedidos/${req.params.id}?msg=` + encodeURIComponent(msg));
  } catch (erro) {
    console.error(erro);
    res.redirect(`/admin/pedidos/${req.params.id}?msg=` + encodeURIComponent("Erro ao atualizar."));
  }
});

module.exports = router;