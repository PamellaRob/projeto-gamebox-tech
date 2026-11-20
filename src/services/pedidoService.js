// Serviço de pedidos (Supabase) - Usa a chave de serviço, que só existe no servidor:
// as tabelas têm RLS ligado e nenhuma política, então o navegador não acessa direto
const db = require("../config/supabaseAdmin");

// Status possíveis de um pedido (o banco só recebe valores desta lista)
const STATUS = ["novo", "confirmado", "entregue", "cancelado"];

// Grava o pedido e os itens em duas etapas. Não é uma transação: se a segunda falhar,
// o pedido é apagado manualmente (limitação conhecida do projeto)
async function criar({ itens, total, clienteNome }) {
  // 1) cria o pedido
  const { data: pedido, error } = await db
    .from("pedidos")
    .insert({ cliente_nome: clienteNome || null, total })
    .select()
    .single();
  if (error) throw error;

  // 2) cria os itens, guardando uma cópia do nome e do preço
  const linhas = itens.map((i) => ({
    pedido_id: pedido.id,
    produto_id: String(i.produto._id),
    produto_nome: i.produto.nome,
    preco_unitario: i.produto.preco,
    quantidade: i.qtd,
  }));

  const { error: erroItens } = await db.from("itens_pedido").insert(linhas);
  if (erroItens) {
    await db.from("pedidos").delete().eq("id", pedido.id); // desfaz o pedido
    throw erroItens;
  }

  return pedido;
}

// Pedidos do mais novo para o mais antigo
async function listar() {
  const { data, error } = await db
    .from("pedidos")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data;
}

// Aceita só números, para não consultar o banco com texto inválido
async function buscarPorId(id) {
  if (!/^\d+$/.test(String(id))) return null;

  const { data, error } = await db
    .from("pedidos")
    .select("*, itens_pedido(*)") // traz o pedido junto com seus itens
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function atualizarStatus(id, status) {
  if (!STATUS.includes(status)) return false;

  const { error } = await db.from("pedidos").update({ status }).eq("id", id);
  if (error) throw error;
  return true;
}

module.exports = { STATUS, criar, listar, buscarPorId, atualizarStatus };