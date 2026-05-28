require('dotenv').config();
const express = require("express");
const path = require("path");
const fs = require('fs');
const session = require('express-session');
const sqlite3 = require("sqlite3").verbose();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const bcrypt = require('bcryptjs');
const https = require('https');
const authRoutes = require('./routes/auth');

const app = express();
const port = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
  res.locals.req = req;
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'site-final-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.get("/", (req, res) => {
  if (req.session && req.session.userId) {
    db.get("SELECT id, name, email, phone, profile_picture, addresses, createdAt, cliente_rating, cliente_total_avaliacoes FROM usuarios WHERE id = ?", [req.session.userId], (err, user) => {
      let addresses = [];
      let enderecoAtual = null;
      if (user) {
        try { addresses = JSON.parse(user.addresses || '[]'); } catch(e) {}
        if (req.session.enderecoAtualId) {
          enderecoAtual = addresses.find(function(a) { return a.id == req.session.enderecoAtualId; }) || null;
        }
        if (!enderecoAtual && addresses.length > 0) {
          enderecoAtual = addresses[0];
        }
      }
      res.render('index', { user: user ? { ...user, addresses, enderecoAtual } : null });
    });
  } else {
    res.render('index', { user: null });
  }
});

const db = new sqlite3.Database("database.db", (err) => {
  if (err) {
    console.error("Erro ao conectar ao banco:", err);
  } else {
    console.log("Banco SQLite conectado!");
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS estabelecimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    tipo TEXT,
    latitude REAL,
    longitude REAL
  )
`);

db.run(`
  ALTER TABLE usuarios ADD COLUMN profile_picture TEXT DEFAULT NULL
`, () => {});
db.run(`
  ALTER TABLE usuarios ADD COLUMN phone TEXT DEFAULT NULL
`, () => {});
db.run(`
  ALTER TABLE usuarios ADD COLUMN addresses TEXT DEFAULT '[]'
`, () => {});
db.run(`
  ALTER TABLE usuarios ADD COLUMN payment_methods TEXT DEFAULT '[]'
`, () => {});
db.run(`
  ALTER TABLE usuarios ADD COLUMN settings TEXT DEFAULT '{}'
`, () => {});

db.run(`
  CREATE TABLE IF NOT EXISTS order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    description TEXT,
    value REAL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES usuarios(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rating INTEGER,
    comment TEXT,
    establishment_name TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES usuarios(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    password TEXT NOT NULL,
    profile_picture TEXT DEFAULT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    description TEXT,
    city TEXT,
    state TEXT,
    address TEXT,
    whatsapp TEXT,
    instagram TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`ALTER TABLE colaboradores ADD COLUMN approved INTEGER DEFAULT 0`, () => {});
db.run(`ALTER TABLE colaboradores ADD COLUMN rating REAL DEFAULT 0`, () => {});
db.run(`ALTER TABLE colaboradores ADD COLUMN working_hours TEXT`, () => {});
db.run(`ALTER TABLE colaboradores ADD COLUMN banner TEXT DEFAULT NULL`, () => {});

db.run(`
  CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    preco REAL NOT NULL,
    descricao TEXT,
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    colaborador_id INTEGER NOT NULL,
    servicos TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pendente',
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES usuarios(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS avaliacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    colaborador_id INTEGER NOT NULL,
    pedido_id INTEGER,
    nota INTEGER NOT NULL CHECK(nota >= 1 AND nota <= 5),
    comentario TEXT,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES usuarios(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  )
`);

db.run(`ALTER TABLE pedidos ADD COLUMN payment_method TEXT DEFAULT NULL`, () => {});
db.run(`ALTER TABLE pedidos ADD COLUMN codigo_confirmacao TEXT DEFAULT NULL`, () => {});
db.run(`ALTER TABLE pedidos ADD COLUMN user_concluido INTEGER DEFAULT 0`, () => {});
db.run(`ALTER TABLE pedidos ADD COLUMN colab_concluido INTEGER DEFAULT 0`, () => {});

db.run(`
  CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    remetente_id INTEGER NOT NULL,
    tipo_remetente TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  )
`);

db.run(`ALTER TABLE usuarios ADD COLUMN cliente_rating REAL DEFAULT 0`, () => {});
db.run(`ALTER TABLE usuarios ADD COLUMN cliente_total_avaliacoes INTEGER DEFAULT 0`, () => {});

db.run(`
  CREATE TABLE IF NOT EXISTS avaliacoes_clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    pedido_id INTEGER,
    nota INTEGER NOT NULL CHECK(nota >= 1 AND nota <= 5),
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
    FOREIGN KEY (cliente_id) REFERENCES usuarios(id),
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  )
`);

const multerColab = require('multer');
const colabStorage = multerColab.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const uploadColab = multerColab({
  storage: colabStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Apenas imagens são permitidas.'));
  }
});

const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';

function isAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.query.senha === ADMIN_PASS) { req.session.isAdmin = true; return next(); }
  res.redirect('/admin/login');
}

app.get('/admin/login', (req, res) => {
  res.render('admin_login', { error: null });
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin_login', { error: 'Senha incorreta.' });
});

app.get('/admin', isAdmin, (req, res) => {
  db.all("SELECT * FROM colaboradores ORDER BY id DESC", [], (err, rows) => {
    res.render('admin', { colaboradores: rows || [] });
  });
});

app.post('/admin/aprovar/:id', isAdmin, (req, res) => {
  db.run("UPDATE colaboradores SET approved = 1 WHERE id = ?", [req.params.id], () => {
    res.redirect('/admin');
  });
});

app.post('/admin/reprovar/:id', isAdmin, (req, res) => {
  db.run("DELETE FROM colaboradores WHERE id = ?", [req.params.id], () => {
    res.redirect('/admin');
  });
});

app.get('/admin/usuarios', isAdmin, (req, res) => {
  db.all("SELECT * FROM usuarios ORDER BY id DESC", [], (err, rows) => {
    res.render('admin_usuarios', { usuarios: rows || [] });
  });
});

app.get('/colaborador/login', (req, res) => {
  res.render('colab_login', { error: null });
});

app.post('/colaborador/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.render('colab_login', { error: 'Preencha todos os campos.' });
  db.get("SELECT * FROM colaboradores WHERE email = ?", [email], (err, colab) => {
    if (!colab) return res.render('colab_login', { error: 'Email ou senha inválidos.' });
    bcrypt.compare(password, colab.password, (err, match) => {
      if (!match) return res.render('colab_login', { error: 'Email ou senha inválidos.' });
      req.session.colabId = colab.id;
      res.redirect('/colaborador/dashboard');
    });
  });
});

function isColab(req, res, next) {
  if (req.session && req.session.colabId) return next();
  res.redirect('/colaborador/login');
}

app.get('/colaborador/dashboard', isColab, (req, res) => {
  db.get("SELECT * FROM colaboradores WHERE id = ?", [req.session.colabId], (err, colab) => {
    if (!colab) { req.session.destroy(); return res.redirect('/colaborador/login'); }
    db.all("SELECT * FROM servicos WHERE colaborador_id = ?", [req.session.colabId], (err, servicos) => {
      res.render('colab_dashboard', { colab, servicos: servicos || [], success: null, error: null });
    });
  });
});

app.post('/colaborador/dashboard', isColab, (req, res) => {
  uploadColab.fields([{ name: 'profile_picture', maxCount: 1 }, { name: 'banner', maxCount: 1 }])(req, res, function(uploadErr) {
    if (uploadErr) {
      console.error('MULTER ERROR:', uploadErr);
      return res.render('colab_dashboard', { colab: {}, servicos: [], success: null, error: 'Upload: ' + uploadErr.message });
    }
    const { name, phone, category, subcategory, description, city, state, address, whatsapp, instagram, working_hours } = req.body || {};
    db.get("SELECT * FROM colaboradores WHERE id = ?", [req.session.colabId], (err, colab) => {
      if (err || !colab) return res.redirect('/colaborador/login');
      db.all("SELECT * FROM servicos WHERE colaborador_id = ?", [req.session.colabId], (err, servicos) => {
        let profile_picture = colab.profile_picture;
        let fotoSalva = null;
        if (req.files && req.files['profile_picture'] && req.files['profile_picture'][0]) {
          profile_picture = '/uploads/' + req.files['profile_picture'][0].filename;
          fotoSalva = profile_picture;
        }
        let banner = colab.banner;
        let bannerSalvo = null;
        if (req.files && req.files['banner'] && req.files['banner'][0]) {
          banner = '/uploads/' + req.files['banner'][0].filename;
          bannerSalvo = banner;
        }
        db.run(
          `UPDATE colaboradores SET name=?, phone=?, category=?, subcategory=?, description=?, city=?, state=?, address=?, whatsapp=?, instagram=?, profile_picture=?, working_hours=?, banner=? WHERE id=?`,
          [name || colab.name, phone || colab.phone, category || colab.category, subcategory || null, description || null, city || null, state || null, address || null, whatsapp || null, instagram || null, profile_picture, working_hours || null, banner, req.session.colabId],
          (err) => {
            if (err) console.error('DB UPDATE ERROR:', err);
            const colabAtualizado = {
              ...colab,
              name: name || colab.name,
              phone: phone || colab.phone,
              category: category || colab.category,
              subcategory: subcategory || null,
              description: description || null,
              city: city || null,
              state: state || null,
              address: address || null,
              whatsapp: whatsapp || null,
              instagram: instagram || null,
              profile_picture,
              working_hours: working_hours || null,
              banner
            };
            res.render('colab_dashboard', {
              colab: colabAtualizado,
              servicos: servicos || [],
              success: err ? null : 'Perfil atualizado com sucesso!' + (fotoSalva ? ' Foto: ' + fotoSalva : '') + (bannerSalvo ? ' Banner: ' + bannerSalvo : ''),
              error: err ? 'Erro ao salvar no banco.' : null
            });
          }
        );
      });
    });
  });
});

app.post('/colaborador/servicos', isColab, (req, res) => {
  const { nome, preco, descricao } = req.body;
  if (!nome || !preco) return res.json({ error: 'Nome e preço obrigatórios.' });
  db.run("INSERT INTO servicos (colaborador_id, nome, preco, descricao) VALUES (?, ?, ?, ?)",
    [req.session.colabId, nome, parseFloat(preco), descricao || null],
    function(err) {
      if (err) return res.json({ error: 'Erro ao adicionar.' });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.delete('/colaborador/servicos/:id', isColab, (req, res) => {
  db.run("DELETE FROM servicos WHERE id = ? AND colaborador_id = ?", [req.params.id, req.session.colabId], () => {
    res.json({ success: true });
  });
});

app.get('/colaborador/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/colaborador/login');
});

app.get('/api/colaboradores', (req, res) => {
  const { categoria } = req.query;
  let sql = "SELECT id, name, profile_picture, category, subcategory, description, city, state, whatsapp, instagram, rating, working_hours FROM colaboradores WHERE approved = 1";
  const params = [];
  if (categoria) { sql += " AND category = ?"; params.push(categoria); }
  db.all(sql, params, (err, rows) => { res.json(rows || []); });
});

app.get('/buscar', (req, res) => {
  const q = req.query.q;
  if (!q || q.trim() === '') return res.redirect('/');
  const term = '%' + q.trim() + '%';
  db.all("SELECT id, name, profile_picture, category, subcategory, description, city, state, whatsapp, instagram, rating FROM colaboradores WHERE approved = 1 AND (name LIKE ? OR category LIKE ? OR subcategory LIKE ? OR description LIKE ? OR city LIKE ?)", [term, term, term, term, term], (err, rows) => {
    const allCategories = ['Moda e Beleza', 'Assistência Técnica', 'Saúde', 'Reformas e Serviços', 'Serviços Domésticos', 'Outros'];
    const slugRev = { 'Moda e Beleza': 'moda-e-beleza', 'Assistência Técnica': 'assistencia-tecnica', 'Saúde': 'saude', 'Reformas e Serviços': 'reformas', 'Serviços Domésticos': 'servicos-domesticos', 'Outros': 'outros' };
    const categorias = allCategories.filter(c => c.toLowerCase().includes(q.trim().toLowerCase())).map(c => ({ nome: c, slug: slugRev[c] }));
    res.render('busca', { query: q.trim(), colaboradores: rows || [], categorias });
  });
});

const slugMap = {
  'moda-e-beleza': 'Moda e Beleza',
  'assistencia-tecnica': 'Assistência Técnica',
  'saude': 'Saúde',
  'reformas': 'Reformas e Serviços',
  'servicos-domesticos': 'Serviços Domésticos',
  'outros': 'Outros'
};

app.get('/categoria/:slug', (req, res) => {
  const categoria = slugMap[req.params.slug];
  if (!categoria) return res.redirect('/');

  db.all("SELECT id, name, profile_picture, category, subcategory, description, city, state, whatsapp, instagram, rating, working_hours FROM colaboradores WHERE approved = 1 AND category = ?", [categoria], (err, rows) => {
    res.render('categoria', { categoria, colaboradores: rows || [] });
  });
});

app.get('/colaborador/:id/perfil', (req, res) => {
  console.log('ROUTE HIT: /colaborador/:id/perfil with id=', req.params.id);
  db.get("SELECT * FROM colaboradores WHERE id = ? AND approved = 1", [req.params.id], (err, colab) => {
    if (!colab) return res.redirect('/');
    db.all("SELECT * FROM servicos WHERE colaborador_id = ?", [req.params.id], (err, servicos) => {
      db.all("SELECT AVG(nota) as media, COUNT(*) as total FROM avaliacoes WHERE colaborador_id = ?", [req.params.id], (err, ratingResult) => {
        db.all("SELECT a.*, u.name as user_name FROM avaliacoes a LEFT JOIN usuarios u ON a.user_id = u.id WHERE a.colaborador_id = ? ORDER BY a.data DESC", [req.params.id], (err, avaliacoes) => {
          const media = ratingResult && ratingResult[0] && ratingResult[0].media ? Math.round(ratingResult[0].media * 10) / 10 : colab.rating || 0;
          const totalAvaliacoes = ratingResult && ratingResult[0] ? ratingResult[0].total : 0;
          res.render('colaborador_perfil', { colab, servicos: servicos || [], media, totalAvaliacoes, avaliacoes: avaliacoes || [] });
        });
      });
    });
  });
});

app.post('/colaborador/:id/avaliar', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Faça login para avaliar.' });
  const { nota, comentario } = req.body;
  if (!nota || nota < 1 || nota > 5) return res.status(400).json({ error: 'Nota inválida.' });
  db.run("INSERT INTO avaliacoes (user_id, colaborador_id, nota, comentario) VALUES (?, ?, ?, ?)",
    [req.session.userId, req.params.id, nota, comentario || null],
    function(err) {
      if (err) return res.status(500).json({ error: 'Erro ao salvar avaliação.' });
      db.run("UPDATE colaboradores SET rating = (SELECT ROUND(AVG(nota), 1) FROM avaliacoes WHERE colaborador_id = ?) WHERE id = ?",
        [req.params.id, req.params.id]);
      res.json({ success: true });
    }
  );
});

app.get('/api/colaborador/:id/servicos', (req, res) => {
  db.all("SELECT * FROM servicos WHERE colaborador_id = ?", [req.params.id], (err, rows) => {
    res.json(rows || []);
  });
});

function gerarCodigoConfirmacao() {
  const nums = '0123456789';
  const lets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 2; i++) code += nums[Math.floor(Math.random() * nums.length)];
  for (let i = 0; i < 2; i++) code += lets[Math.floor(Math.random() * lets.length)];
  return code;
}

app.post('/pedido/criar', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Faça login para contratar.' });
  const { colaborador_id, servicos, payment_method } = req.body;
  if (!colaborador_id || !servicos || !servicos.length) return res.status(400).json({ error: 'Selecione pelo menos um serviço.' });
  const servicosStr = JSON.stringify(servicos);
  const total = servicos.reduce((sum, s) => sum + (parseFloat(s.preco) || 0), 0);
  const codigo = payment_method === 'dinheiro' ? gerarCodigoConfirmacao() : null;
  db.run("INSERT INTO pedidos (user_id, colaborador_id, servicos, total, payment_method, codigo_confirmacao) VALUES (?, ?, ?, ?, ?, ?)",
    [req.session.userId, colaborador_id, servicosStr, total, payment_method || null, codigo],
    function(err) {
      if (err) return res.status(500).json({ error: 'Erro ao criar pedido.' });
      res.json({ pedido_id: this.lastID, codigo_confirmacao: codigo });
    }
  );
});

app.get('/pedido/:id/pagamento', (req, res) => {
  db.get("SELECT p.*, c.name as colab_name, c.whatsapp as colab_wpp FROM pedidos p JOIN colaboradores c ON p.colaborador_id = c.id WHERE p.id = ?", [req.params.id], (err, pedido) => {
    if (!pedido) return res.redirect('/');
    let servicos = [];
    try { servicos = JSON.parse(pedido.servicos); } catch(e) {}
    res.render('pagamento', { pedido, servicos });
  });
});

app.post('/pedido/:id/confirmar', (req, res) => {
  db.run("UPDATE pedidos SET status = 'confirmado' WHERE id = ?", [req.params.id], () => {
    res.json({ success: true });
  });
});

app.get('/pedido/:id/confirmacao', (req, res) => {
  db.get("SELECT p.*, c.name as colab_name FROM pedidos p JOIN colaboradores c ON p.colaborador_id = c.id WHERE p.id = ?", [req.params.id], (err, pedido) => {
    if (!pedido) return res.redirect('/');
    res.render('confirmacao', { pedido });
  });
});

app.get('/api/pedidos/colaborador', isColab, (req, res) => {
  db.all(`SELECT p.*, u.name as cliente_nome, u.phone as cliente_phone
    FROM pedidos p JOIN usuarios u ON p.user_id = u.id WHERE p.colaborador_id = ? ORDER BY p.data DESC`, [req.session.colabId], (err, pedidos) => {
    if (err) { console.error(err); return res.status(500).json([]); }
    pedidos.forEach(p => {
      try { p.servicos = JSON.parse(p.servicos); } catch(e) { p.servicos = []; }
    });
    res.json(pedidos);
  });
});

app.get('/api/pedidos/cliente', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Não autorizado.' });
  db.all(`SELECT p.*, c.name as colab_nome, c.profile_picture as colab_foto, c.whatsapp as colab_wpp, c.id as colab_id2
    FROM pedidos p JOIN colaboradores c ON p.colaborador_id = c.id WHERE p.user_id = ? ORDER BY p.data DESC`, [req.session.userId], (err, pedidos) => {
    if (err) { console.error(err); return res.status(500).json([]); }
    pedidos.forEach(p => {
      try { p.servicos = JSON.parse(p.servicos); } catch(e) { p.servicos = []; }
    });
    res.json(pedidos);
  });
});

app.post('/api/pedido/:id/status', isColab, (req, res) => {
  const { status } = req.body;
  db.run("UPDATE pedidos SET status = ? WHERE id = ? AND colaborador_id = ?", [status, req.params.id, req.session.colabId], () => {
    res.json({ success: true });
  });
});

app.post('/api/pedido/:id/concluir', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Não autorizado.' });
  db.run("UPDATE pedidos SET user_concluido = 1 WHERE id = ? AND user_id = ?", [req.params.id, req.session.userId], function(err) {
    if (err) return res.status(500).json({ error: 'Erro ao concluir.' });
    db.run("UPDATE pedidos SET status = 'concluido' WHERE id = ? AND user_concluido = 1 AND colab_concluido = 1", [req.params.id], () => {
      res.json({ success: true });
    });
  });
});

app.post('/api/pedido/:id/concluir-colab', isColab, (req, res) => {
  db.run("UPDATE pedidos SET colab_concluido = 1 WHERE id = ? AND colaborador_id = ?", [req.params.id, req.session.colabId], function(err) {
    if (err) return res.status(500).json({ error: 'Erro ao concluir.' });
    db.run("UPDATE pedidos SET status = 'concluido' WHERE id = ? AND user_concluido = 1 AND colab_concluido = 1", [req.params.id], () => {
      res.json({ success: true });
    });
  });
});

app.get('/api/cliente/:id/perfil', isColab, (req, res) => {
  db.get("SELECT id, name, email, phone, profile_picture, createdAt, cliente_rating, cliente_total_avaliacoes FROM usuarios WHERE id = ?",
    [req.params.id],
    (err, user) => {
      if (err || !user) return res.status(404).json({ error: 'Cliente nao encontrado.' });
      db.get("SELECT COUNT(*) as total_pedidos FROM pedidos WHERE user_id = ? AND colaborador_id = ?",
        [req.params.id, req.session.colabId],
        (err, row) => {
          if (!row || row.total_pedidos === 0) return res.status(403).json({ error: 'Sem vinculo com este cliente.' });
          res.json(user);
        }
      );
    }
  );
});

app.post('/api/avaliar/cliente', isColab, (req, res) => {
  const { pedido_id, cliente_id, nota } = req.body;
  if (!pedido_id || !cliente_id || !nota || nota < 1 || nota > 5) return res.status(400).json({ error: 'Dados inválidos.' });
  db.run("INSERT INTO avaliacoes_clientes (colaborador_id, cliente_id, pedido_id, nota) VALUES (?, ?, ?, ?)",
    [req.session.colabId, cliente_id, pedido_id, nota],
    function(err) {
      if (err) return res.status(500).json({ error: 'Erro ao salvar.' });
      db.run("UPDATE usuarios SET cliente_rating = (SELECT ROUND(AVG(nota), 1) FROM avaliacoes_clientes WHERE cliente_id = ?), cliente_total_avaliacoes = (SELECT COUNT(*) FROM avaliacoes_clientes WHERE cliente_id = ?) WHERE id = ?",
        [cliente_id, cliente_id, cliente_id]);
      res.json({ success: true });
    }
  );
});

app.get('/api/chat/:pedido_id', (req, res) => {
  db.all("SELECT m.*, CASE WHEN m.tipo_remetente = 'colaborador' THEN c.name WHEN m.tipo_remetente = 'cliente' THEN u.name END as nome_remetente FROM mensagens m LEFT JOIN colaboradores c ON m.remetente_id = c.id AND m.tipo_remetente = 'colaborador' LEFT JOIN usuarios u ON m.remetente_id = u.id AND m.tipo_remetente = 'cliente' WHERE m.pedido_id = ? ORDER BY m.data ASC", [req.params.pedido_id], (err, msgs) => {
    res.json(msgs || []);
  });
});

app.post('/api/chat/:pedido_id', (req, res) => {
  const { mensagem, tipo } = req.body;
  console.log('CHAT POST: pedido=' + req.params.pedido_id + ' tipo=' + tipo + ' session.colabId=' + req.session?.colabId + ' session.userId=' + req.session?.userId);
  if (!mensagem || !mensagem.trim()) return res.status(400).json({ error: 'Mensagem vazia.' });

  let userId = null;
  let tipoRemetente = null;

  if (tipo === 'colaborador' && req.session && req.session.colabId) {
    userId = req.session.colabId;
    tipoRemetente = 'colaborador';
  } else if (req.session && req.session.userId) {
    userId = req.session.userId;
    tipoRemetente = 'cliente';
  }

  console.log('CHAT: userId=' + userId + ' tipoRemetente=' + tipoRemetente);

  if (!userId || !tipoRemetente) return res.status(401).json({ error: 'Não autorizado.' });

  db.run("INSERT INTO mensagens (pedido_id, remetente_id, tipo_remetente, mensagem) VALUES (?, ?, ?, ?)",
    [req.params.pedido_id, userId, tipoRemetente, mensagem.trim()],
    function(err) {
      if (err) { console.error('CHAT INSERT ERROR:', err); return res.status(500).json({ error: 'Erro ao enviar.' }); }
      console.log('CHAT: inserted id=' + this.lastID);
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.get('/colaborador', (req, res) => {
  res.render('colaborador', { error: null, success: null });
});

app.post('/colaborador', uploadColab.single('profile_picture'), (req, res) => {
  const { name, cpf, email, phone, password, category, subcategory, description, city, state, address, whatsapp, instagram } = req.body;

  if (!name || !cpf || !email || !phone || !password || !category) {
    return res.render('colaborador', { error: 'Preencha todos os campos obrigatórios.', success: null });
  }

  if (password.length < 6) {
    return res.render('colaborador', { error: 'A senha deve ter no mínimo 6 caracteres.', success: null });
  }

  db.get("SELECT id FROM colaboradores WHERE cpf = ?", [cpf], (err, row) => {
    if (row) return res.render('colaborador', { error: 'Este CPF já está cadastrado.', success: null });

    const bcrypt = require('bcryptjs');
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return res.render('colaborador', { error: 'Erro ao processar senha.', success: null });

      const profilePic = req.file ? '/uploads/' + req.file.filename : null;

      db.run(
        `INSERT INTO colaboradores (name, cpf, email, phone, password, profile_picture, category, subcategory, description, city, state, address, whatsapp, instagram) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, cpf, email, phone, hash, profilePic, category, subcategory || null, description || null, city || null, state || null, address || null, whatsapp || null, instagram || null],
        (err) => {
          if (err) return res.render('colaborador', { error: 'Erro ao cadastrar. Tente novamente.', success: null });
          res.render('colaborador', { error: null, success: 'Cadastro realizado com sucesso! Faça login em <a href="/colaborador/login" style="color:#3b82f6;font-weight:600">Login Colaborador</a> para gerenciar seu perfil. 😊' });
        }
      );
    });
  });
});

app.get("/teste", (req, res) => {
  res.send("Servidor funcionando!");
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const respostas = [
  { palavras: ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'eai', 'e aí'], resposta: 'Olá! 😊 Sou o Bitto, assistente do Fixoo. Como posso ajudar você hoje?' },
  { palavras: ['serviço', 'servicos', 'categoria', 'faz', 'oferece', 'tipos'], resposta: 'No Fixoo você encontra: Moda e Beleza (barbearia, cabeleireiro, manicure, maquiagem), Assistência Técnica, Saúde, Reformas e Serviços (encanador, eletricista, pintor, pedreiro), Serviços Domésticos (faxina, personal, jardinagem, motorista) e Outros. Qual você precisa?' },
  { palavras: ['barbeiro', 'barbearia', 'corte', 'barba'], resposta: 'Temos várias barbearias disponíveis! ✂️ A Barbearia Estilo tem avaliação 4.9 e fica na Rua dos Cortes, 123 - Centro. Quer ver os serviços deles?' },
  { palavras: ['cabeleireiro', 'cabelo', 'corte feminino', 'escova', 'hidratação'], resposta: 'O Studio Beleza Pura é uma ótima opção! 💇‍♀️ Cortes femininos, coloração e hidratação com produtos premium. Avaliação 4.8!' },
  { palavras: ['manicure', 'unha', 'esmaltação', 'unhas'], resposta: 'A Manicure da Ju tem avaliação 4.7! 💅 Unhas artísticas e esmaltação em gel. Atende em domicílio também!' },
  { palavras: ['eletricista', 'encanador', 'pintor', 'pedreiro', 'marceneiro', 'reforma'], resposta: 'Na categoria Reformas e Serviços temos profissionais como eletricistas, encanadores, pintores, pedreiros e marceneiros. Todos verificados e com avaliações! 🔧' },
  { palavras: ['faxina', 'faxineira', 'domestico', 'doméstico', 'limpeza'], resposta: 'Temos profissionais de serviços domésticos disponíveis: faxina, personal trainer, jardinagem, motorista e cuidador de idosos. 🏡' },
  { palavras: ['personal', 'trainer', 'academia', 'exercicio'], resposta: 'Personal trainers parceiros do Fixoo estão prontos para te ajudar com treinos personalizados! 💪' },
  { palavras: ['jardinagem', 'jardim', 'jardineiro', 'plantas'], resposta: 'Jardineiros profissionais disponíveis para cuidar do seu jardim! 🌿' },
  { palavras: ['pagar', 'pagamento', 'pagamentos', 'pix', 'cartao', 'cartão', 'credito', 'crédito', 'debito', 'débito', 'dinheiro'], resposta: 'Aceitamos várias formas de pagamento: PIX, cartão de crédito, cartão de débito e dinheiro na entrega. Qual prefere?' },
  { palavras: ['avaliar', 'avaliacao', 'avaliação', 'estrela', 'nota'], resposta: 'Você pode avaliar os profissionais com estrelas ⭐ e deixar um comentário depois de cada serviço. Assim ajuda outros clientes!' },
  { palavras: ['agendar', 'agendamento', 'marcar', 'reservar', 'contratar'], resposta: 'Para agendar, escolha o profissional desejado, selecione os serviços e confirme. Após a confirmação, você recebe um resumo do pedido!' },
  { palavras: ['endereco', 'endereço', 'enderecos', 'endereços'], resposta: 'Você pode salvar seus endereços no perfil! Vai em Meu Perfil > Endereços e adiciona seus locais favoritos (Casa, Trabalho, etc.).' },
  { palavras: ['perfil', 'conta', 'cadastro', 'login', 'logar', 'entrar', 'registrar'], resposta: 'Para criar uma conta, clique em Cadastre-se no Fixoo. Com sua conta você pode agendar serviços, salvar endereços, formas de pagamento e avaliar profissionais!' },
  { palavras: ['bitto', 'chat', 'bot', 'voce', 'você', 'quem'], resposta: 'Eu sou o Bitto 🤖 o assistente virtual do Fixoo! Estou aqui para ajudar você a encontrar profissionais, agendar serviços e tirar dúvidas sobre a plataforma.' },
  { palavras: ['fixoo', 'site', 'plataforma', 'app', 'sobre'], resposta: 'O Fixoo é uma plataforma que conecta clientes a profissionais de serviços. 🤝 Trabalhamos com diversas categorias como Beleza, Saúde, Reformas, Serviços Domésticos e muito mais! Nossas cores são azul (#3b82f6) e branco.' },
  { palavras: ['profissional', 'profissionais', 'trabalhador', 'parceiro'], resposta: 'Todos os profissionais do Fixoo passam por verificação. Você pode ver avaliações, fotos, localização e horários de cada um antes de contratar!' },
  { palavras: ['obrigado', 'obrigada', 'valeu', 'brigado', 'brigada', 'thanks'], resposta: 'Por nada! 😊 Conte sempre comigo. Precisa de mais alguma coisa?' },
  { palavras: ['tchau', 'ate', 'até', 'xau', 'adeus', 'flw', 'falou'], resposta: 'Até logo! 😊 Volte sempre que precisar. O Fixoo está aqui pra ajudar!' }
];

function buscarResposta(msg) {
  const m = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const item of respostas) {
    for (const palavra of item.palavras) {
      if (m.includes(palavra)) return item.resposta;
    }
  }
  return null;
}

app.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ reply: 'Mensagem vazia.' });

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'sua-chave-aqui') {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `Você é o Bitto, assistente virtual do Fixoo. Responda de forma simpática, breve e útil.

INFORMAÇÕES SOBRE O FIXOO:
- Fixoo é uma plataforma que conecta clientes a profissionais de serviços.
- Categorias: Moda e Beleza, Assistência Técnica, Saúde, Reformas e Serviços, Serviços Domésticos, Outros.
- Clientes podem criar conta, agendar serviços, avaliar profissionais, salvar endereços e formas de pagamento.
- Pagamentos: PIX, cartão de crédito/débito, dinheiro na entrega.
- Cores da marca: azul (#3b82f6) e branco.

Usuário: ${message}` }] }]
      });
      const reply = result.response.text();
      return res.json({ reply });
    } catch {}
  }

  const local = buscarResposta(message);
  if (local) return res.json({ reply: local });

  res.json({ reply: 'Entendi! 😊 Pode me perguntar sobre os serviços do Fixoo, categorias, profissionais, agendamentos, pagamentos ou sua conta. Ou diga "oi" pra começarmos!' });
});

app.use(authRoutes(db));

app.post("/estabelecimentos", (req, res) => {
  const { nome, tipo, latitude, longitude } = req.body;

  if (!nome || !latitude || !longitude) {
    return res.status(400).json({
      message: "Dados incompletos"
    });
  }

  db.run(
    "INSERT INTO estabelecimentos (nome, tipo, latitude, longitude) VALUES (?, ?, ?, ?)",
    [nome, tipo, latitude, longitude],
    function (err) {
      if (err) {
        return res.status(500).json({
          message: "Erro ao salvar local"
        });
      }

      res.json({
        message: "Estabelecimento cadastrado!"
      });
    }
  );
});

app.get("/estabelecimentos", (req, res) => {
  db.all("SELECT * FROM estabelecimentos", [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        message: "Erro ao buscar locais"
      });
    }

    res.json(rows);
  });
});

let ultimaNominatim = 0;

function fetchJson(url) {
  return new Promise(function(resolve, reject) {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'FixooApp/1.0 (contato@fixoo.com)'
      },
      rejectUnauthorized: false
    };
    const req = https.get(options, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function() { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchNominatim(url) {
  const agora = Date.now();
  const diff = agora - ultimaNominatim;
  if (diff < 1200) {
    await new Promise(function(r) { setTimeout(r, 1200 - diff); });
  }
  ultimaNominatim = Date.now();
  return fetchJson(url);
}

app.get('/api/cep/:cep', async (req, res) => {
  const cep = req.params.cep.replace(/\D/g, '');
  if (cep.length !== 8) return res.json({ erro: true });

  try {
    const data = await fetchJson('https://viacep.com.br/ws/' + cep + '/json/');
    if (data.erro) return res.json({ erro: true });

    const result = {
      cep: data.cep,
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
      uf: data.uf,
      localidade: data.localidade,
      lat: null,
      lon: null
    };

    // Busca coordenadas no Nominatim
    try {
      const geoData = await fetchNominatim('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(data.logradouro + ', ' + (data.bairro || '') + ', ' + data.localidade + ', ' + data.uf) + '&limit=1');
      if (geoData && geoData.length > 0) {
        result.lat = parseFloat(geoData[0].lat);
        result.lon = parseFloat(geoData[0].lon);
      }
    } catch(e) {}

    res.json(result);
  } catch(e) {
    res.json({ erro: true });
  }
});

app.get('/api/buscar-endereco', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 5) return res.json([]);

  try {
    const data = await fetchNominatim('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=5&addressdetails=1');
    const results = (data || []).map(function(item) {
      const addr = item.address || {};
      return {
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
        logradouro: (addr.road || addr.pedestrian || addr.street || ''),
        bairro: (addr.neighbourhood || addr.suburb || addr.district || ''),
        cidade: (addr.city || addr.town || addr.village || addr.municipality || ''),
        estado: (addr.state || ''),
        cep: (addr.postcode || '')
      };
    });
    res.json(results);
  } catch(e) {
    res.json([]);
  }
});

app.get('/api/geocode-reverso', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.json({});

  try {
    const data = await fetchNominatim('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&addressdetails=1');
    const addr = data.address || {};
    res.json({
      display_name: data.display_name || '',
      logradouro: (addr.road || addr.pedestrian || addr.street || data.display_name || ''),
      bairro: (addr.neighbourhood || addr.suburb || addr.district || ''),
      cidade: (addr.city || addr.town || addr.village || addr.municipality || ''),
      estado: (addr.state || ''),
      cep: (addr.postcode || ''),
      lat: lat,
      lon: lon
    });
  } catch(e) {
    res.json({});
  }
});

app.post('/api/endereco/salvar', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Faça login para salvar endereços.' });

  const { label, cep, logradouro, bairro, cidade, estado, numero, complemento, lat, lon } = req.body;
  if (!label || !logradouro) return res.status(400).json({ error: 'Nome e logradouro obrigatórios.' });

  db.get("SELECT addresses FROM usuarios WHERE id = ?", [req.session.userId], (err, row) => {
    let addresses = [];
    try { addresses = JSON.parse(row.addresses || '[]'); } catch(e) {}

    const novoEndereco = {
      id: Date.now(),
      label: label,
      cep: cep || '',
      logradouro: logradouro,
      bairro: bairro || '',
      cidade: cidade || '',
      estado: estado || '',
      numero: numero || '',
      complemento: complemento || '',
      lat: lat || null,
      lon: lon || null
    };

    addresses.push(novoEndereco);
    db.run("UPDATE usuarios SET addresses = ? WHERE id = ?", [JSON.stringify(addresses), req.session.userId], (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar endereço.' });
      req.session.enderecoAtualId = novoEndereco.id;
      res.json({ success: true, id: novoEndereco.id, endereco: novoEndereco });
    });
  });
});

app.post('/api/endereco/excluir', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Não autorizado.' });
  const { id } = req.body;

  db.get("SELECT addresses FROM usuarios WHERE id = ?", [req.session.userId], (err, row) => {
    let addresses = [];
    try { addresses = JSON.parse(row.addresses || '[]'); } catch(e) {}
    addresses = addresses.filter(function(a) { return a.id != id; });
    db.run("UPDATE usuarios SET addresses = ? WHERE id = ?", [JSON.stringify(addresses), req.session.userId], (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao excluir.' });
      if (req.session.enderecoAtualId == id) {
        req.session.enderecoAtualId = addresses.length > 0 ? addresses[0].id : null;
      }
      res.json({ success: true });
    });
  });
});

app.post('/api/endereco/definir', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Não autorizado.' });
  const { id } = req.body;

  db.get("SELECT addresses FROM usuarios WHERE id = ?", [req.session.userId], (err, row) => {
    let addresses = [];
    try { addresses = JSON.parse(row.addresses || '[]'); } catch(e) {}
    const endereco = addresses.find(function(a) { return a.id == id; });
    if (!endereco) return res.status(404).json({ error: 'Endereço não encontrado.' });

    req.session.enderecoAtualId = id;
    res.json({ success: true, endereco: endereco });
  });
});

app.get('/api/enderecos', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json([]);
  db.get("SELECT addresses FROM usuarios WHERE id = ?", [req.session.userId], (err, row) => {
    let addresses = [];
    try { addresses = JSON.parse(row.addresses || '[]'); } catch(e) {}
    res.json(addresses);
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
