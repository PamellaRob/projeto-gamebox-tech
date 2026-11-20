// Cliente do Supabase com a chave de serviço (service_role). Ela ignora o RLS e tem
// acesso total, por isso só pode ser usada aqui no servidor. É usada para gravar e ler os pedidos
const { createClient } = require("@supabase/supabase-js");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  // Sem sessão própria: este cliente só executa operações de banco
  { auth: { persistSession: false, autoRefreshToken: false } }
);

module.exports = supabaseAdmin;