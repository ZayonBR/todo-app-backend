const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

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

// Middleware para verificar se o usuário está logado
function verificaJWT(req, res, next) {
  const token = req.headers['id-token'];
  if (!token) return res.status(401).json({ auth: false, message: 'Token não fornecido' });

  jwt.verify(token, 'segredo', function (err, decoded) {
    if (err) return res.status(500).json({ auth: false, message: 'Falha na autenticação do token!' });
    req.usuarioId = decoded.id;
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

// Atualizar usuário (Apenas ADM) - SEM CRIPTOGRAFIA
router.patch('/usuario/:id', verificaADM, async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Se a senha foi enviada vazia, remove para não substituir no banco
    if (!updateData.senha) {
      delete updateData.senha; 
    }

    const result = await Usuario.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ROTA DE REGISTRO - SEM CRIPTOGRAFIA
router.post('/register', async (req, res) => {
  try {
    const { nome, senha, role } = req.body;

    const totalUsuarios = await Usuario.countDocuments();
    const roleDefinida = totalUsuarios === 0 ? 'adm' : (role || 'user');

    const novoUsuario = new Usuario({
      nome,
      senha, // Salvando a senha em texto puro
      role: roleDefinida
    });

    await novoUsuario.save();
    res.status(201).json({ message: "Usuário criado!" });
  } catch (error) {
    res.status(400).json({ message: "Erro ao registrar usuário" });
  }
});

// ROTA DE LOGIN - SEM CRIPTOGRAFIA
router.post('/login', async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ nome: req.body.nome });
    if (!usuario) return res.status(401).json({ message: 'Usuário não encontrado' });

    // Comparação direta da senha em texto puro
    if (usuario.senha !== req.body.senha) {
      return res.status(401).json({ message: 'Senha incorreta' });
    }

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


// ROTA PARA CRIAR TAREFA
router.post('/post', verificaJWT, async (req, res) => {
  const objetoTarefa = new modeloTarefa({
    descricao: req.body.descricao,
    statusRealizada: req.body.statusRealizada,
    owner: req.usuarioId, // Mantemos o owner apenas para saber quem criou
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

// ROTA PARA BUSCAR TODAS AS TAREFAS (VISÍVEL PARA TODOS)
router.get('/getAll', verificaJWT, async (req, res) => {
  try {
    // Retirado o filtro { owner: req.usuarioId }
    const resultados = await modeloTarefa.find({});
    res.json(resultados);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ROTA PARA DELETAR TAREFA (QUALQUER UM PODE DELETAR)
router.delete('/delete/:id', verificaJWT, async (req, res) => {
  try {
    // Usando findByIdAndDelete para não exigir que o usuário seja o dono
    const resultado = await modeloTarefa.findByIdAndDelete(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ROTA PARA ATUALIZAR TAREFA (QUALQUER UM PODE EDITAR)
router.patch('/update/:id', verificaJWT, async (req, res) => {
  try {
    // Usando findByIdAndUpdate para não exigir que o usuário seja o dono
    const result = await modeloTarefa.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PROMOVER USUÁRIO (Apenas ADM)
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

module.exports = router;
