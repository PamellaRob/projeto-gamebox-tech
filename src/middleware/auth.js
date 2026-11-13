function requireAdmin(req, res, next) {
  if (req.session.admin) {
    return next(); // pode passar
  }
  res.redirect("/admin/login"); // barrado
}

module.exports = requireAdmin;