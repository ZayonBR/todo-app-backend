const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router()
module.exports = router;
const modeloTarefa = require('../models/tarefa');
const Usuario = require('../models/usuario');

// Middleware para verificar se é ADM
function verificaADM(req, res, next) {
  const token = req.headers['id-token'];
  jwt.verify(token, 'segredo', function (err, decoded) {
    if (err || decoded.role !== 'adm') {
      return res.status(403).json({ message: 'Acesso restrito a administradores' });
    }
    next();
  });
}

// Listar todos os usuários (Apenas ADM)
router.get('/usuarios', verificaADM, async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, '-senha').lean();
    const usuariosComTarefas = await Promise.all(usuarios.map(async (user) => {
      const tarefas = await modeloTarefa.find({ owner: user._id });
      return { ...user, tarefas };
    }));
    res.json(usuariosComTarefas);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Deletar usuário (Apenas ADM)
router.delete('/usuario/:id', verificaADM, async (req, res) => {
  await Usuario.findByIdAndDelete(req.params.id);
  res.json({ message: 'Usuário removido' });
});

// Atualizar usuário (Apenas ADM)
router.patch('/usuario/:id', verificaADM, async (req, res) => {
  const result = await Usuario.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(result);
});

// ROTA DE REGISTRO
router.post('/register', async (req, res) => {
  try {
    const { nome, senha, role } = req.body;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
    const senhaHash = `${salt}:${hash}`;

    const totalUsuarios = await Usuario.countDocuments();
    const roleDefinida = totalUsuarios === 0 ? 'adm' : (role || 'user');

    const novoUsuario = new Usuario({
      nome,
      senha: senhaHash,
      role: roleDefinida
    });

    await novoUsuario.save();
    res.status(201).json({ message: "Usuário criado!" });
  } catch (error) {
    res.status(400).json({ message: "Erro ao registrar usuário" });
  }
});

router.post('/login', async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.body.nome });
    if (!usuario) return res.status(401).json({ message: 'Usuário não encontrado' });

    let senhaValida = false;
    if (usuario.senha && usuario.senha.includes(':')) {
      const [salt, hash] = usuario.senha.split(':');
      const hashVerificar = crypto.scryptSync(req.body.senha, salt, 64).toString('hex');
      senhaValida = hash === hashVerificar;
    }

    if (!senhaValida) return res.status(401).json({ message: 'Senha incorreta' });

    const token = jwt.sign(
      { id: usuario._id, role: usuario.role },
      'segredo',
      { expiresIn: '1h' }
    );

    res.json({
      auth: true,
      token: token,
      role: usuario.role
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

function verificaJWT(req, res, next) {
  const token = req.headers['id-token'];
  if (!token) return res.status(401).json({ auth: false, message: 'Token nao fornecido' });

  jwt.verify(token, 'segredo', function (err, decoded) {
    if (err) return res.status(500).json({ auth: false, message: 'Falha !' });
    req.usuarioId = decoded.id;
    next();
  });
}

router.post('/post', verificaJWT, async (req, res) => {
  const objetoTarefa = new modeloTarefa({
    descricao: req.body.descricao,
    statusRealizada: req.body.statusRealizada,
    owner: req.usuarioId,
    prioridade: req.body.prioridade || 'Baixa',
    subTarefas: req.body.subTarefas || []
  });
  try {
    const tarefaSalva = await objetoTarefa.save();
    res.status(200).json(tarefaSalva);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/getAll', verificaJWT, async (req, res) => {
  try {
    const resultados = await modeloTarefa.find({ owner: req.usuarioId });
    res.json(resultados);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/delete/:id', verificaJWT, async (req, res) => {
  try {
    const resultado = await modeloTarefa.findOneAndDelete({
      _id: req.params.id,
      owner: req.usuarioId
    });
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/update/:id', verificaJWT, async (req, res) => {
  try {
    const result = await modeloTarefa.findOneAndUpdate(
      { _id: req.params.id, owner: req.usuarioId },
      req.body,
      { new: true }
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/usuario/promover/:id', verificaADM, async (req, res) => {
  try {
    const result = await Usuario.findByIdAndUpdate(
      req.params.id, 
      { role: 'adm' },
      { new: true }
    );
    if (!result) return res.status(404).json({ message: 'Usuário não encontrado' });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
