module.exports = {
  isAuthenticated: (req, res, next) => {
    if (req.session && req.session.userId) {
      return next();
    }
    return res.redirect('/login');
  },

  isNotAuthenticated: (req, res, next) => {
    if (req.session && req.session.userId) {
      return res.redirect('/dashboard');
    }
    return next();
  }
};
