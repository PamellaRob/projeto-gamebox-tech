# Lista de testes: GameBox Tech

Marque `[x]` em cada item depois de testar. Se algum falhar, anote o que apareceu ao lado.
Use `npm start` (e não `npm run dev`) para testar, para o servidor não reiniciar sozinho.

**Preparação**
- [ ] `.env` preenchido (Supabase, MongoDB, Redis, WhatsApp, sessão)
- [ ] `npm start` abre sem erros no terminal
- [ ] Terminal mostra a conexão com MongoDB e Redis
- [ ] Existem pelo menos 14 produtos (para testar a paginação), de jogos e eletrônicos
- [ ] Existe um usuário administrador criado no Supabase (Authentication > Users)

---

## 1. Loja: página inicial (`/`)

- [ ] A home abre e mostra a vitrine com os 8 produtos mais recentes
- [ ] Os cards têm o mesmo tamanho e o preço fica alinhado na base
- [ ] O botão "Ver todos os produtos" leva para `/produtos`
- [ ] O logo no topo volta para a home
- [ ] Com o banco sem produtos, a home mostra uma mensagem amigável (sem quebrar)
- [ ] Abrir um produto e voltar para a home: aparece o bloco "Vistos recentemente"
- [ ] O bloco "Mais vistos" aparece depois de algumas visualizações
- [ ] No celular (ou janela estreita) não aparece rolagem horizontal

## 2. Loja: lista de produtos, busca e filtros (`/produtos`)

- [ ] A lista mostra 12 produtos por página
- [ ] A paginação aparece e os botões Anterior/Próxima funcionam
- [ ] Na página 2, os produtos são diferentes dos da página 1 (sem repetição)
- [ ] Buscar por parte do nome (ex.: "mou") encontra "Mouse"
- [ ] Buscar por maiúsculas e minúsculas diferentes dá o mesmo resultado
- [ ] Buscar `.*` ou `(` não quebra a página (a busca trata como texto)
- [ ] Buscar algo que não existe mostra mensagem de "nenhum produto"
- [ ] Filtro de categoria "Jogos" mostra só jogos; "Eletrônicos" só eletrônicos
- [ ] Filtro de plataforma "PS5" traz produtos com PS5
- [ ] Um jogo com várias plataformas (ex.: "PlayStation 4, Xbox One e PC") aparece ao filtrar por "Xbox One"
- [ ] A lista de plataformas não repete nomes
- [ ] Ordenação por menor preço, maior preço, nome e mais recentes funciona
- [ ] Combinar busca + categoria + ordem funciona junto
- [ ] Ao mudar de página, os filtros continuam aplicados
- [ ] O botão de limpar filtros volta para a lista completa

## 3. Loja: página do produto (`/produto/:id`)

- [ ] Mostra imagem, nome, descrição, preço, estoque e características
- [ ] "Adicionar ao carrinho" aumenta o contador do carrinho
- [ ] Produto sem estoque não pode ser adicionado (botão desativado ou aviso)
- [ ] Um id inventado (`/produto/abc`) mostra erro tratado, não a tela de erro do servidor
- [ ] Atualizar a página várias vezes **não** aumenta as visualizações (proteção de 1 hora)

## 4. Carrinho (`/carrinho`)

- [ ] Carrinho vazio mostra mensagem e link para a loja
- [ ] Adicionar o mesmo produto duas vezes aumenta a quantidade (não duplica a linha)
- [ ] Botões de mais e menos mudam a quantidade e o subtotal
- [ ] Diminuir até 0 remove o item
- [ ] Remover um item atualiza o total
- [ ] O total bate com a soma dos subtotais (confira com a calculadora)
- [ ] Valores aparecem em reais, com vírgula (R$ 1.234,56)
- [ ] O carrinho continua ao navegar por outras páginas
- [ ] Excluir pelo admin um produto que está no carrinho: o item some do carrinho e o contador se ajusta

## 5. Compra com WhatsApp

- [ ] "Comprar" abre o WhatsApp (ou WhatsApp Web) com a mensagem pronta
- [ ] O número de destino está correto (o do `.env`)
- [ ] A mensagem lista cada produto, quantidade e valor
- [ ] A mensagem mostra o total e termina com `Pedido nº X`
- [ ] Acentos e símbolos aparecem corretos na mensagem
- [ ] Nome digitado pelo cliente aparece no pedido (no admin)
- [ ] Depois da compra, o carrinho fica vazio
- [ ] O pedido aparece em `/admin/pedidos` com o mesmo número da mensagem
- [ ] Tentar comprar com o carrinho vazio volta para o carrinho

## 6. Admin: login e segurança (`/admin`)

- [ ] `/admin` sem login mostra a tela de login
- [ ] `/admin/produtos` e `/admin/pedidos` sem login redirecionam para o login
- [ ] E-mail certo + senha errada mostra mensagem de erro
- [ ] E-mail inexistente mostra a mesma mensagem de erro
- [ ] Campos vazios não enviam o formulário
- [ ] Login correto abre o painel direto (sem precisar atualizar)
- [ ] O e-mail do administrador aparece no topo
- [ ] "Sair" encerra a sessão e volta para o login
- [ ] Depois de sair, o botão Voltar do navegador não deixa ver o painel
- [ ] A senha não aparece em nenhum lugar da página nem do terminal

## 7. Admin: painel (`/admin`)

- [ ] Faturamento = soma dos pedidos não cancelados
- [ ] Total de pedidos e quantos estão "novos" conferem
- [ ] Total de produtos, unidades e valor em estoque conferem (confira com a lista)
- [ ] Visualizações = soma do ranking do Redis
- [ ] A barra "Pedidos por status" tem proporção parecida com a legenda
- [ ] "Pedidos recentes" mostra os mais novos primeiro e o link do número abre o pedido
- [ ] "Mais vistos" bate com o que você visitou na loja
- [ ] "Atenção ao estoque" mostra produtos com estoque baixo ou zerado

## 8. Admin: produtos

- [ ] A lista mostra todos os produtos com imagem, categoria, preço, estoque e visualizações
- [ ] As abas "Todos", "Estoque baixo" e "Esgotados" filtram e as contagens conferem
- [ ] Cadastrar produto completo: aparece na lista do admin
- [ ] **Esse novo produto aparece imediatamente na home da loja** (cena do vídeo)
- [ ] Preço com vírgula (`249,90`) é aceito e salvo como 249.90
- [ ] Preço inválido (`abc`, negativo) mostra erro e não salva
- [ ] Campo obrigatório vazio mostra erro e mantém o que foi digitado
- [ ] Estoque negativo ou decimal é rejeitado
- [ ] Características `plataforma: PS5` e `genero: Esporte` ficam salvas
- [ ] Editar um produto: os dados atuais aparecem preenchidos
- [ ] Salvar a edição atualiza a lista e a loja
- [ ] Mudar o preço pelo admin **não** altera o valor de pedidos antigos
- [ ] Excluir pede confirmação; cancelar não exclui
- [ ] Excluir de verdade remove da lista, da loja e do ranking de mais vistos

## 9. Admin: pedidos

- [ ] A lista mostra número, data, cliente, total e status
- [ ] As abas por status filtram e as contagens conferem
- [ ] O detalhe mostra itens, preço unitário, quantidade, subtotal e total
- [ ] O total do detalhe bate com a soma dos itens
- [ ] Mudar o status (novo, confirmado, entregue, cancelado) salva e mostra a mensagem
- [ ] A mudança aparece na lista e no painel (faturamento ignora cancelados)
- [ ] Abrir `/admin/pedidos/99999` não quebra o servidor

## 10. Bancos de dados

**Supabase**
- [ ] Authentication > Users tem o administrador
- [ ] Table Editor: tabelas `pedidos` e `itens_pedido` com as linhas do pedido feito
- [ ] O preço e o nome do produto ficam gravados no item (cópia da hora da compra)
- [ ] RLS está ligado nas duas tabelas
- [ ] A chave `service_role` só existe no `.env` do servidor (não no código nem no GitHub)

**MongoDB Atlas**
- [ ] Coleção `produtos` com os documentos e `criadoEm` preenchido
- [ ] Índices: `_id_`, `categoria_1`, `criadoEm_-1` e `atributos.plataforma_1`
- [ ] O usuário do banco tem só as permissões necessárias

**Redis**
- [ ] `catalogo:produtos` aparece depois de abrir a home (e some ao criar, editar ou excluir produto)
- [ ] O terminal mostra "cache HIT" na segunda visita e "cache MISS" depois de alterar um produto
- [ ] `vistos:<id da sessão>` guarda os últimos produtos vistos
- [ ] `ranking:visualizacoes` aumenta quando você abre produtos
- [ ] Com o Redis desligado ou com a senha errada, o site continua funcionando (só sem cache)
- [ ] Nunca usar `FLUSHALL` ou `FLUSHDB` (o banco é compartilhado com outro projeto)

## 11. Casos de erro e limites

- [ ] Uma rota que não existe (`/qualquer-coisa`) mostra erro tratado
- [ ] Aspas, `<`, `>` e `&` no nome do produto aparecem como texto (não quebram a página)
- [ ] Nome muito longo não quebra o layout dos cards nem das tabelas
- [ ] URL de imagem quebrada não derruba a página
- [ ] Servidor sem internet ou com banco indisponível: o terminal mostra o erro sem travar tudo
- [ ] Dois navegadores diferentes têm carrinhos e "vistos recentemente" separados

## 12. Visual e responsividade

- [ ] Loja e admin sem emojis (só ícones)
- [ ] Logo e favicon aparecem na aba do navegador (loja e admin)
- [ ] Celular (390px): loja, carrinho, admin e login sem rolagem horizontal
- [ ] Tabelas do admin rolam lateralmente no celular em vez de quebrar
- [ ] Menu lateral do admin vira barra superior em tela estreita
- [ ] Item do menu selecionado fica roxo, e passar o mouse mostra o roxo suave

## 13. Antes de gravar o vídeo e de entregar

- [ ] Clonar o repositório numa pasta nova, rodar `npm install` e `npm start` seguindo só o README (testa se o passo a passo funciona)
- [ ] `.env` **não** está no GitHub; `.env.example` está (só com os nomes das variáveis)
- [ ] `node_modules` não está no GitHub
- [ ] README com instruções do Supabase, MongoDB, Redis e WhatsApp
- [ ] Apagar apenas `ranking:visualizacoes` e `contou:*` do Redis se quiser o ranking zerado
- [ ] Usar `npm start` na gravação e não editar código durante ela
- [ ] Vídeo de 5 a 10 minutos mostrando: login do admin, produto novo aparecendo na loja, compra com a mensagem do WhatsApp
- [ ] Link do repositório e o vídeo enviados na Plataforma A até 26/11/2026
