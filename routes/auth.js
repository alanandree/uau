const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { isAuthenticated, isNotAuthenticated } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

module.exports = function(db) {
  router.get('/login', isNotAuthenticated, (req, res) => {
    res.render('login', { error: null, email: '' });
  });

  router.get('/register', isNotAuthenticated, (req, res) => {
    res.render('register', { error: null, name: '', email: '' });
  });

  router.get('/dashboard', isAuthenticated, (req, res) => {
    db.get(
      `SELECT id, name, email, phone, profile_picture, addresses, payment_methods, settings, createdAt, cliente_rating, cliente_total_avaliacoes
       FROM usuarios WHERE id = ?`,
      [req.session.userId],
      (err, user) => {
        if (err || !user) {
          req.session.destroy();
          return res.redirect('/login');
        }

        db.all("SELECT * FROM order_history WHERE user_id = ? ORDER BY date DESC", [req.session.userId], (err, orders) => {
          db.all("SELECT * FROM reviews WHERE user_id = ? ORDER BY date DESC", [req.session.userId], (err, reviews) => {
            let addresses = [];
            let paymentMethods = [];
            let settings = {};
            try { addresses = JSON.parse(user.addresses || '[]'); } catch(e) {}
            try { paymentMethods = JSON.parse(user.payment_methods || '[]'); } catch(e) {}
            try { settings = JSON.parse(user.settings || '{}'); } catch(e) {}

            res.render('perfil', {
              user: {
                ...user,
                addresses,
                paymentMethods,
                settings
              },
              orders: orders || [],
              reviews: reviews || [],
              success: null,
              error: null
            });
          });
        });
      }
    );
  });

  router.get('/perfil', isAuthenticated, (req, res) => {
    res.redirect('/dashboard');
  });

  router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) console.error(err);
      res.redirect('/login');
    });
  });

  router.post('/perfil/atualizar', isAuthenticated, upload.single('profile_picture'), (req, res) => {
    const { name, phone } = req.body;

    db.get("SELECT * FROM usuarios WHERE id = ?", [req.session.userId], (err, user) => {
      if (err || !user) {
        return res.redirect('/login');
      }

      let profile_picture = user.profile_picture;
      if (req.file) {
        profile_picture = '/uploads/' + req.file.filename;
      }

      db.run(
        "UPDATE usuarios SET name = ?, phone = ?, profile_picture = ? WHERE id = ?",
        [name || user.name, phone || user.phone, profile_picture, req.session.userId],
        (err) => {
          if (err) {
            console.error(err);
            return res.redirect('/perfil');
          }
          res.redirect('/perfil');
        }
      );
    });
  });

  router.post('/perfil/endereco', isAuthenticated, (req, res) => {
    const { label, address } = req.body;

    db.get("SELECT addresses FROM usuarios WHERE id = ?", [req.session.userId], (err, row) => {
      let addresses = [];
      try { addresses = JSON.parse(row.addresses || '[]'); } catch(e) {}
      addresses.push({ id: Date.now(), label, address });
      db.run("UPDATE usuarios SET addresses = ? WHERE id = ?", [JSON.stringify(addresses), req.session.userId], (err) => {
        res.redirect('/perfil');
      });
    });
  });

  router.post('/perfil/endereco/excluir', isAuthenticated, (req, res) => {
    const { id } = req.body;
    db.get("SELECT addresses FROM usuarios WHERE id = ?", [req.session.userId], (err, row) => {
      let addresses = [];
      try { addresses = JSON.parse(row.addresses || '[]'); } catch(e) {}
      addresses = addresses.filter(a => a.id != id);
      db.run("UPDATE usuarios SET addresses = ? WHERE id = ?", [JSON.stringify(addresses), req.session.userId], (err) => {
        res.redirect('/perfil');
      });
    });
  });

  router.post('/perfil/pagamento', isAuthenticated, (req, res) => {
    const { type, info } = req.body;
    db.get("SELECT payment_methods FROM usuarios WHERE id = ?", [req.session.userId], (err, row) => {
      let methods = [];
      try { methods = JSON.parse(row.payment_methods || '[]'); } catch(e) {}
      methods.push({ id: Date.now(), type, info });
      db.run("UPDATE usuarios SET payment_methods = ? WHERE id = ?", [JSON.stringify(methods), req.session.userId], (err) => {
        res.redirect('/perfil');
      });
    });
  });

  router.post('/perfil/pagamento/excluir', isAuthenticated, (req, res) => {
    const { id } = req.body;
    db.get("SELECT payment_methods FROM usuarios WHERE id = ?", [req.session.userId], (err, row) => {
      let methods = [];
      try { methods = JSON.parse(row.payment_methods || '[]'); } catch(e) {}
      methods = methods.filter(m => m.id != id);
      db.run("UPDATE usuarios SET payment_methods = ? WHERE id = ?", [JSON.stringify(methods), req.session.userId], (err) => {
        res.redirect('/perfil');
      });
    });
  });

  router.post('/register', isNotAuthenticated, (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.render('register', {
        error: 'Preencha todos os campos.',
        name: name || '', email: email || ''
      });
    }

    if (password !== confirmPassword) {
      return res.render('register', {
        error: 'As senhas não conferem.',
        name: name || '', email: email || ''
      });
    }

    if (password.length < 6) {
      return res.render('register', {
        error: 'A senha deve ter no mínimo 6 caracteres.',
        name: name || '', email: email || ''
      });
    }

    db.get("SELECT id FROM usuarios WHERE email = ?", [email], (err, row) => {
      if (err) {
        console.error(err);
        return res.render('register', {
          error: 'Erro interno do servidor.',
          name: '', email: ''
        });
      }

      if (row) {
        return res.render('register', {
          error: 'Este email já está cadastrado.',
          name, email
        });
      }

      bcrypt.hash(password, 12, (err, hashedPassword) => {
        if (err) {
          console.error(err);
          return res.render('register', {
            error: 'Erro interno do servidor.',
            name: '', email: ''
          });
        }

        db.run(
          "INSERT INTO usuarios (name, email, password, createdAt) VALUES (?, ?, ?, datetime('now'))",
          [name, email, hashedPassword],
          function(err) {
            if (err) {
              console.error(err);
              return res.render('register', {
                error: 'Erro interno do servidor.',
                name: '', email: ''
              });
            }

            req.session.userId = this.lastID;
            return res.redirect('/dashboard');
          }
        );
      });
    });
  });

  router.post('/login', isNotAuthenticated, (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('login', {
        error: 'Preencha todos os campos.',
        email: email || ''
      });
    }

    db.get("SELECT * FROM usuarios WHERE email = ?", [email], (err, user) => {
      if (err) {
        console.error(err);
        return res.render('login', {
          error: 'Erro interno do servidor.',
          email: ''
        });
      }

      if (!user) {
        return res.render('login', {
          error: 'Email ou senha inválidos.',
          email
        });
      }

      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err) {
          console.error(err);
          return res.render('login', {
            error: 'Erro interno do servidor.',
            email: ''
          });
        }

        if (!isMatch) {
          return res.render('login', {
            error: 'Email ou senha inválidos.',
            email
          });
        }

        req.session.userId = user.id;
        return res.redirect('/dashboard');
      });
    });
  });

  return router;
};
