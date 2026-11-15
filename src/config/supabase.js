// Cliente do Supabase com a chave pública (anon). É usado só para conferir o
// login do administrador (Supabase Auth). Esta chave não acessa as tabelas de pedidos,
// porque elas têm RLS ligado e nenhuma política
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  // O servidor não guarda a sessão do Supabase: quem lembra do login é o express-session
  { auth: { persistSession: false, autoRefreshToken: false } }
);

module.exports = supabase;