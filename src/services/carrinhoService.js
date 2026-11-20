// Serviço do carrinho - Tudo fica na sessão do visitante, só ids e quantidades.
// Preço e estoque sempre são lidos do MongoDB na hora de mostrar ou comprar
const produtoService = require("./produtoService");

// O carrinho é um objeto { idDoProduto: quantidade }
function obter(session) {
  if (!session.carrinho) session.carrinho = {};
  return session.carrinho;
}

async function adicionar(session, id) {
  const produto = await produtoService.buscarPorId(id);
  if (!produto) return false;

  const carrinho = obter(session);
  const atual = carrinho[id] || 0;
  if (atual < produto.estoque) {
    carrinho[id] = atual + 1; // nunca passa do estoque
  }
  return true;
}

function diminuir(session, id) {
  const carrinho = obter(session);
  if (!carrinho[id]) return;
  carrinho[id] -= 1;
  if (carrinho[id] <= 0) delete carrinho[id];
}

function remover(session, id) {
  delete obter(session)[id];
}

// Junta o carrinho com os dados atuais do MongoDB e calcula os totais
// Dinheiro é calculado em centavos (inteiros) e convertido para reais no final
async function detalhar(session) {
  const carrinho = obter(session);
  const produtos = await produtoService.buscarPorIds(Object.keys(carrinho));

  // Remove do carrinho os produtos que não existem mais (foram excluídos)
  const idsExistentes = new Set(produtos.map((p) => String(p._id)));
  for (const id of Object.keys(carrinho)) {
    if (!idsExistentes.has(id)) delete carrinho[id];
  }

  let totalCentavos = 0;
  const itens = [];

  for (const produto of produtos) {
    const id = String(produto._id);
    const qtd = Math.min(carrinho[id], produto.estoque);

    // Sem estoque: sai do carrinho
    if (qtd <= 0) {
      delete carrinho[id];
      continue;
    }

    carrinho[id] = qtd; // ajusta se o estoque diminuiu
    const subtotalCentavos = Math.round(produto.preco * 100) * qtd;
    totalCentavos += subtotalCentavos;
    itens.push({ produto, qtd, subtotal: subtotalCentavos / 100 });
  }

  return { itens, total: totalCentavos / 100 };
}

function formatarReais(valor) {
  return valor
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/\u00A0/g, " "); // troca o espaço "invisível" por um espaço normal
}

// Monta o link do WhatsApp com a mensagem pronta (wa.me).
// O número de destino vem do .env (WHATSAPP_NUMERO)
function montarLinkWhatsApp(itens, total, numeroPedido) {
  const lista = itens.map(({ qtd, produto }) => {
    const detalhes = [produto.plataforma, produto.versao, produto.modelo]
      .filter(Boolean)
      .join(" / ");

    const nome = detalhes ? `${produto.nome} (${detalhes})` : produto.nome;
    const totalItem = qtd * produto.preco;

    return `• ${qtd} × ${nome} — ${formatarReais(totalItem)}`;
  });

  const linhas = [
    "Olá! Gostaria de finalizar meu pedido pelo WhatsApp. Seguem os itens que selecionei no site.",
    "",
    "*Itens do carrinho*",
    ...lista,
    "",
    `*Subtotal dos produtos* — ${formatarReais(total)}`,
  ];

  if (numeroPedido) {
    linhas.push(`*Pedido nº ${numeroPedido}*`);
  }

  const texto = linhas.join("\n");
  // encodeURIComponent deixa acentos, quebras de linha e símbolos seguros na URL
  return `https://wa.me/${process.env.WHATSAPP_NUMERO}?text=${encodeURIComponent(texto)}`;
}

module.exports = {
  adicionar,
  diminuir,
  remover,
  detalhar,
  formatarReais,
  montarLinkWhatsApp,
};