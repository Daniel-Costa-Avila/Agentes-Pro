'use strict';

/*
 * Autenticação do painel: senha com scrypt + sal por usuário, sessão em
 * cookie HttpOnly com o token guardado só como hash, e freio de tentativas
 * por IP. Sem dependências externas — tudo em node:crypto.
 */

const crypto = require('crypto');
const { db } = require('./db');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const COOKIE = 'painel_sessao';
const HORAS_PADRAO = 12;
const DIAS_LEMBRAR = 30;

const MAX_FALHAS = 8;
const BLOQUEIO_MIN = 15;

const agora = () => new Date().toISOString();

// ── senhas ──────────────────────────────────────────────

function derivar(senha, salt) {
  return crypto.scryptSync(senha, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
}

function criarSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { hash: derivar(senha, salt), salt };
}

function conferirSenha(senha, hash, salt) {
  let calculado;
  try {
    calculado = derivar(senha, salt);
  } catch {
    return false;
  }
  const a = Buffer.from(calculado, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function forcaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 10) {
    return 'A senha precisa ter pelo menos 10 caracteres.';
  }
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
    return 'A senha precisa misturar letras e números.';
  }
  return null;
}

// ── sessões ─────────────────────────────────────────────

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function criarSessao(usuarioId, ip, lembrar) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ms = lembrar ? DIAS_LEMBRAR * 24 * 3600e3 : HORAS_PADRAO * 3600e3;
  const expira = new Date(Date.now() + ms).toISOString();
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, criada_em, expira_em, ip) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(token), usuarioId, agora(), expira, ip || '');
  return { token, expira, maxAge: Math.floor(ms / 1000) };
}

function lerSessao(token) {
  if (!token) return null;
  const linha = db.prepare(`
    SELECT s.expira_em, u.id, u.email, u.nome, u.papel, u.ativo, u.trocar_senha
    FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ?
  `).get(hashToken(token));

  if (!linha) return null;
  if (linha.expira_em <= agora()) {
    encerrarSessao(token);
    return null;
  }
  if (!linha.ativo) return null;

  return {
    id: linha.id,
    email: linha.email,
    nome: linha.nome,
    papel: linha.papel,
    trocarSenha: !!linha.trocar_senha
  };
}

function encerrarSessao(token) {
  if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
}

function encerrarTodasDoUsuario(usuarioId) {
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);
}

function limparSessoesVencidas() {
  db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(agora());
}

// ── freio de tentativas ─────────────────────────────────

function bloqueio(ip) {
  const t = db.prepare('SELECT n, ate FROM tentativas WHERE ip = ?').get(ip);
  if (!t || !t.ate) return 0;
  const restante = new Date(t.ate).getTime() - Date.now();
  return restante > 0 ? Math.ceil(restante / 60000) : 0;
}

function registrarFalha(ip) {
  const t = db.prepare('SELECT n FROM tentativas WHERE ip = ?').get(ip);
  const n = (t ? t.n : 0) + 1;
  const ate = n >= MAX_FALHAS ? new Date(Date.now() + BLOQUEIO_MIN * 60000).toISOString() : null;
  db.prepare('INSERT INTO tentativas (ip, n, ate) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET n = ?, ate = ?')
    .run(ip, n, ate, n, ate);
  return n;
}

function limparFalhas(ip) {
  db.prepare('DELETE FROM tentativas WHERE ip = ?').run(ip);
}

// ── cookies ─────────────────────────────────────────────

function lerCookies(req) {
  const cru = req.headers.cookie || '';
  const saida = {};
  for (const parte of cru.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    saida[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return saida;
}

function tokenDaRequisicao(req) {
  return lerCookies(req)[COOKIE] || null;
}

function seguro(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function cookieSessao(req, token, maxAge) {
  const partes = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (seguro(req)) partes.push('Secure');
  return partes.join('; ');
}

function cookieLimpo(req) {
  const partes = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (seguro(req)) partes.push('Secure');
  return partes.join('; ');
}

function ipDe(req) {
  const enc = req.headers['x-forwarded-for'];
  if (enc) return String(enc).split(',')[0].trim();
  return req.socket.remoteAddress || 'desconhecido';
}

module.exports = {
  COOKIE,
  criarSenha,
  conferirSenha,
  forcaSenha,
  criarSessao,
  lerSessao,
  encerrarSessao,
  encerrarTodasDoUsuario,
  limparSessoesVencidas,
  bloqueio,
  registrarFalha,
  limparFalhas,
  lerCookies,
  tokenDaRequisicao,
  cookieSessao,
  cookieLimpo,
  ipDe
};
