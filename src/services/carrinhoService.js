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
async function detalhar(session) {
  const carrinho = obter(session);
  const produtos = await produtoService.buscarPorIds(Object.keys(carrinho));

  let totalCentavos = 0;
  const itens = [];

  for (const produto of produtos) {
    const qtd = Math.min(carrinho[String(produto._id)], produto.estoque);
    if (qtd <= 0) continue;

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

function montarLinkWhatsApp(itens, total) {
  const lista = itens.map((i) => `${i.qtd}x ${i.produto.nome}`).join(", ");
  const texto = `Olá, gostaria de pedir: ${lista}. Total: ${formatarReais(total)}`;
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