-- GameBox Tech: tabelas do Supabase (PostgreSQL)
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo > Run.

-- Pedidos feitos na loja
create table if not exists public.pedidos (
  id bigint generated always as identity not null,
  cliente_nome text null,
  total numeric(10, 2) not null,
  status text not null default 'novo'::text,
  criado_em timestamp with time zone not null default now(),
  constraint pedidos_pkey primary key (id),
  constraint pedidos_status_check check (
    status = any (array['novo'::text, 'confirmado'::text, 'entregue'::text, 'cancelado'::text])
  ),
  constraint pedidos_total_check check (total >= 0::numeric)
);

-- Itens de cada pedido. O nome e o preço são uma cópia do momento da compra,
-- então mudar o preço do produto depois não altera pedidos antigos.
-- produto_id guarda o _id do MongoDB como texto (bancos diferentes, sem chave estrangeira).
create table if not exists public.itens_pedido (
  id bigint generated always as identity not null,
  pedido_id bigint not null,
  produto_id text not null,
  produto_nome text not null,
  preco_unitario numeric(10, 2) not null,
  quantidade integer not null,
  constraint itens_pedido_pkey primary key (id),
  constraint itens_pedido_pedido_id_fkey foreign key (pedido_id) references public.pedidos (id) on delete cascade,
  constraint itens_pedido_preco_unitario_check check (preco_unitario >= 0::numeric),
  constraint itens_pedido_quantidade_check check (quantidade > 0)
);

create index if not exists itens_pedido_pedido_id_idx on public.itens_pedido using btree (pedido_id);

-- Segurança: RLS ligado e nenhuma política criada.
-- Assim a chave pública (anon) não lê nem grava nada nestas tabelas;
-- só o servidor, com a chave service_role, acessa os pedidos.
alter table public.pedidos enable row level security;
alter table public.itens_pedido enable row level security;
