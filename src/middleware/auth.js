// Middleware de proteção: só deixa passar quem fez login (req.session.admin é preenchido
// no login). Nas rotas do admin vem antes da função da rota, assim:
//   router.get("/produtos", requireAdmin, ...)
function requireAdmin(req, res, next) {
  if (req.session.admin) {
    return next(); // pode passar
  }
  res.redirect("/admin/login"); // barrado
}

module.exports = requireAdmin;