'use strict';

/*
 * Agentes Pro — servidor da página pública + painel de conteúdo.
 *
 *   /                    página montada a partir do banco
 *   /admin               painel (exige sessão)
 *   /api/*               API do painel
 *   /midia/*             imagens enviadas pelo painel
 *
 * Sem dependências externas: http, fs e node:sqlite.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { db, RAIZ, PASTA_DADOS } = require('./lib/db');
const auth = require('./lib/auth');
const store = require('./lib/store');
const icones = require('./lib/icones');
const render = require('./lib/render');
const { criarLimitador } = require('./lib/limitador');
const { semear } = require('./lib/seed');

const podeContato = criarLimitador({ maxTentativas: 5, janelaMs: 3600e3 });

const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.HOST || '127.0.0.1';
const PASTA_UPLOADS = path.join(PASTA_DADOS, 'uploads');
const PASTA_ADMIN = path.join(RAIZ, 'admin');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Só estas extensões saem da raiz do projeto — mantém .tunnel_token,
// *.log, *.db e o código-fonte fora do alcance do túnel público.
const RAIZ_LIBERADA = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);
const IMAGENS_OK = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const LIMITE_UPLOAD = 3 * 1024 * 1024;

// ── respostas ───────────────────────────────────────────

function enviar(res, status, corpo, tipo, extras) {
  const cabecalhos = Object.assign({
    'Content-Type': tipo || 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  }, extras || {});
  res.writeHead(status, cabecalhos);
  res.end(corpo);
}

function json(res, status, dados, extras) {
  enviar(res, status, JSON.stringify(dados), 'application/json; charset=utf-8', extras);
}

function lerCorpo(req, limite = LIMITE_UPLOAD + 512 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on('data', (p) => {
      total += p.length;
      if (total > limite) {
        reject(Object.assign(new Error('Conteúdo grande demais.'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(p);
    });
    req.on('end', () => {
      const cru = Buffer.concat(partes).toString('utf8');
      if (!cru) return resolve({});
      try {
        resolve(JSON.parse(cru));
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function servirArquivo(res, arquivo) {
  fs.readFile(arquivo, (err, dados) => {
    if (err) return enviar(res, 404, 'Não encontrado');
    const ext = path.extname(arquivo).toLowerCase();
    enviar(res, 200, dados, MIME[ext] || 'application/octet-stream', {
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300'
    });
  });
}

function dentroDe(pasta, alvo) {
  const resolvido = path.resolve(alvo);
  return resolvido === path.resolve(pasta) || resolvido.startsWith(path.resolve(pasta) + path.sep);
}

// ── páginas do painel ───────────────────────────────────

function paginaPainel(req, res, sessao) {
  if (!sessao) {
    return enviar(res, 302, '', 'text/plain', { Location: '/admin/entrar' });
  }
  servirArquivo(res, path.join(PASTA_ADMIN, 'index.html'));
}

// ── API ─────────────────────────────────────────────────

async function api(req, res, url, sessao) {
  const rota = url.pathname.replace(/^\/api\/?/, '');
  const metodo = req.method;
  const muta = metodo !== 'GET';

  // Entrada
  if (rota === 'entrar' && metodo === 'POST') {
    const ip = auth.ipDe(req);
    const preso = auth.bloqueio(ip);
    if (preso > 0) {
      return json(res, 429, { erro: `Muitas tentativas. Tente de novo em ${preso} min.` });
    }

    const corpo = await lerCorpo(req, 8192);
    const email = String(corpo.email || '').trim().toLowerCase();
    const usuario = db.prepare('SELECT * FROM usuarios WHERE lower(email) = ? AND ativo = 1').get(email);

    const ok = usuario && auth.conferirSenha(String(corpo.senha || ''), usuario.senha_hash, usuario.senha_salt);
    if (!ok) {
      const n = auth.registrarFalha(ip);
      store.registrar(email || ip, 'tentativa de acesso negada', 'Painel', `tentativa ${n}`);
      return json(res, 401, { erro: 'E-mail ou senha incorretos.' });
    }

    auth.limparFalhas(ip);
    const { token, maxAge } = auth.criarSessao(usuario.id, ip, !!corpo.lembrar);
    db.prepare('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?').run(new Date().toISOString(), usuario.id);
    store.registrar(usuario.email, 'entrou no painel', 'Painel');

    return json(res, 200, {
      ok: true,
      trocarSenha: !!usuario.trocar_senha,
      usuario: { nome: usuario.nome, email: usuario.email, papel: usuario.papel }
    }, { 'Set-Cookie': auth.cookieSessao(req, token, maxAge) });
  }

  // Formulário público de contato ("Sugerir um agente" / "Dúvidas e
  // sugestões") — sem sessão, então precisa de freio próprio contra abuso.
  // Não envia e-mail: grava no banco e aparece na tela "Mensagens" do painel.
  if (rota === 'contato' && metodo === 'POST') {
    const ip = auth.ipDe(req);
    if (!podeContato(ip)) {
      return json(res, 429, { erro: 'Muitas mensagens em pouco tempo. Tente de novo mais tarde.' });
    }

    const corpo = await lerCorpo(req, 8192);

    // honeypot: campo escondido que só um robô preenche — finge sucesso
    // sem gravar nada.
    if (String(corpo.site || '').trim()) {
      return json(res, 200, { ok: true });
    }

    const tipo = corpo.tipo === 'sugestao' ? 'sugestao' : 'duvida';
    const nome = String(corpo.nome || '').trim().slice(0, 120);
    const emailRemetente = String(corpo.email || '').trim().slice(0, 200);
    const mensagem = String(corpo.mensagem || '').trim().slice(0, 4000);

    if (!mensagem) return json(res, 400, { erro: 'Escreva sua mensagem antes de enviar.' });
    if (emailRemetente && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRemetente)) {
      return json(res, 400, { erro: 'Informe um e-mail válido, ou deixe o campo em branco.' });
    }

    store.criarMensagem({ tipo, nome, email: emailRemetente, mensagem });
    return json(res, 200, { ok: true });
  }

  // Daqui em diante, exige sessão.
  if (!sessao) return json(res, 401, { erro: 'Sessão expirada. Entre de novo.' });

  // CSRF: navegador de terceiro não consegue mandar cabeçalho personalizado
  // numa requisição cross-site sem passar pelo preflight, que não liberamos.
  if (muta && req.headers['x-painel'] !== '1') {
    return json(res, 403, { erro: 'Requisição não reconhecida.' });
  }

  const quem = sessao.email;

  if (rota === 'sair' && metodo === 'POST') {
    auth.encerrarSessao(auth.tokenDaRequisicao(req));
    store.registrar(quem, 'saiu do painel', 'Painel');
    return json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieLimpo(req) });
  }

  if (rota === 'sessao' && metodo === 'GET') {
    return json(res, 200, { usuario: sessao });
  }

  if (rota === 'senha' && metodo === 'POST') {
    const corpo = await lerCorpo(req, 8192);
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(sessao.id);
    if (!auth.conferirSenha(String(corpo.atual || ''), u.senha_hash, u.senha_salt)) {
      return json(res, 400, { erro: 'Senha atual incorreta.' });
    }
    const problema = auth.forcaSenha(corpo.nova);
    if (problema) return json(res, 400, { erro: problema });

    const { hash, salt } = auth.criarSenha(corpo.nova);
    db.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ?, trocar_senha = 0 WHERE id = ?')
      .run(hash, salt, sessao.id);
    store.registrar(quem, 'trocou a própria senha', 'Painel');
    return json(res, 200, { ok: true });
  }

  if (rota === 'dados' && metodo === 'GET') {
    return json(res, 200, {
      usuario: sessao,
      recursos: store.listarRecursos(),
      categorias: store.listarCategorias(),
      config: store.lerConfig(),
      icones: icones.lista(),
      usuarios: sessao.papel === 'admin' ? store.listarUsuarios() : [],
      historico: store.historico(60),
      mensagens: store.listarMensagens()
    });
  }

  if (rota === 'historico' && metodo === 'GET') {
    return json(res, 200, { historico: store.historico(url.searchParams.get('limite') || 80) });
  }

  // ── mensagens do formulário público ──
  if (rota === 'mensagens' && metodo === 'GET') {
    return json(res, 200, { mensagens: store.listarMensagens() });
  }

  let mm = rota.match(/^mensagens\/(\d+)\/lida$/);
  if (mm && metodo === 'POST') {
    return json(res, 200, { mensagem: store.alternarMensagemLida(Number(mm[1])) });
  }

  mm = rota.match(/^mensagens\/(\d+)$/);
  if (mm && metodo === 'DELETE') {
    store.removerMensagem(Number(mm[1]));
    return json(res, 200, { ok: true });
  }

  // ── recursos ──
  if (rota === 'recursos' && metodo === 'POST') {
    const corpo = await lerCorpo(req);
    return json(res, 201, { recurso: store.criarRecurso(corpo, quem) });
  }

  if (rota === 'recursos/ordem' && metodo === 'POST') {
    const corpo = await lerCorpo(req);
    if (!Array.isArray(corpo.ids)) return json(res, 400, { erro: 'Lista de ordem inválida.' });
    store.reordenarRecursos(corpo.ids, quem);
    return json(res, 200, { recursos: store.listarRecursos() });
  }

  let m = rota.match(/^recursos\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (metodo === 'GET') {
      const r = store.obterRecurso(id);
      return r ? json(res, 200, { recurso: r }) : json(res, 404, { erro: 'Recurso não encontrado.' });
    }
    if (metodo === 'PUT') {
      const corpo = await lerCorpo(req);
      return json(res, 200, { recurso: store.atualizarRecurso(id, corpo, quem) });
    }
    if (metodo === 'DELETE') {
      store.removerRecurso(id, quem);
      return json(res, 200, { ok: true });
    }
  }

  m = rota.match(/^recursos\/(\d+)\/alternar$/);
  if (m && metodo === 'POST') {
    const corpo = await lerCorpo(req, 8192);
    return json(res, 200, { recurso: store.alternarRecurso(Number(m[1]), corpo.campo, quem) });
  }

  // ── categorias ──
  if (rota === 'categorias' && metodo === 'POST') {
    const corpo = await lerCorpo(req, 32768);
    return json(res, 201, { categoria: store.criarCategoria(corpo, quem) });
  }

  if (rota === 'categorias/ordem' && metodo === 'POST') {
    const corpo = await lerCorpo(req, 32768);
    if (!Array.isArray(corpo.ids)) return json(res, 400, { erro: 'Lista de ordem inválida.' });
    store.reordenarCategorias(corpo.ids, quem);
    return json(res, 200, { categorias: store.listarCategorias() });
  }

  m = rota.match(/^categorias\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (metodo === 'PUT') {
      const corpo = await lerCorpo(req, 32768);
      return json(res, 200, { categoria: store.atualizarCategoria(id, corpo, quem) });
    }
    if (metodo === 'DELETE') {
      store.removerCategoria(id, quem);
      return json(res, 200, { ok: true });
    }
  }

  // ── configuração da página ──
  if (rota === 'config' && metodo === 'PUT') {
    const corpo = await lerCorpo(req, 65536);
    const mudadas = store.gravarConfig(corpo, quem);
    return json(res, 200, { config: store.lerConfig(), mudadas });
  }

  // ── usuários (só administrador) ──
  if (rota.startsWith('usuarios')) {
    if (sessao.papel !== 'admin') return json(res, 403, { erro: 'Só administradores gerenciam usuários.' });

    if (rota === 'usuarios' && metodo === 'POST') {
      const corpo = await lerCorpo(req, 8192);
      const email = String(corpo.email || '').trim().toLowerCase();
      const nome = String(corpo.nome || '').trim();
      if (!email.includes('@')) return json(res, 400, { erro: 'Informe um e-mail válido.' });
      if (!nome) return json(res, 400, { erro: 'Informe o nome da pessoa.' });
      if (db.prepare('SELECT 1 FROM usuarios WHERE lower(email) = ?').get(email)) {
        return json(res, 400, { erro: 'Já existe um usuário com esse e-mail.' });
      }

      const senha = crypto.randomBytes(9).toString('base64url');
      const { hash, salt } = auth.criarSenha(senha);
      db.prepare(`
        INSERT INTO usuarios (email, nome, senha_hash, senha_salt, papel, ativo, trocar_senha, criado_em)
        VALUES (?, ?, ?, ?, ?, 1, 1, ?)
      `).run(email, nome, hash, salt, corpo.papel === 'admin' ? 'admin' : 'editor', new Date().toISOString());

      store.registrar(quem, 'criou usuário', nome, email);
      return json(res, 201, { senhaProvisoria: senha, usuarios: store.listarUsuarios() });
    }

    let mu = rota.match(/^usuarios\/(\d+)$/);
    if (mu && metodo === 'DELETE') {
      const id = Number(mu[1]);
      if (id === sessao.id) return json(res, 400, { erro: 'Você não pode desativar a própria conta.' });
      const alvo = db.prepare('SELECT nome, ativo FROM usuarios WHERE id = ?').get(id);
      if (!alvo) return json(res, 404, { erro: 'Usuário não encontrado.' });

      const novo = alvo.ativo ? 0 : 1;
      db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(novo, id);
      if (!novo) auth.encerrarTodasDoUsuario(id);
      store.registrar(quem, novo ? 'reativou usuário' : 'desativou usuário', alvo.nome);
      return json(res, 200, { usuarios: store.listarUsuarios() });
    }

    mu = rota.match(/^usuarios\/(\d+)\/senha$/);
    if (mu && metodo === 'POST') {
      const id = Number(mu[1]);
      const alvo = db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(id);
      if (!alvo) return json(res, 404, { erro: 'Usuário não encontrado.' });

      const senha = crypto.randomBytes(9).toString('base64url');
      const { hash, salt } = auth.criarSenha(senha);
      db.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ?, trocar_senha = 1 WHERE id = ?')
        .run(hash, salt, id);
      auth.encerrarTodasDoUsuario(id);
      store.registrar(quem, 'redefiniu a senha de', alvo.nome);
      return json(res, 200, { senhaProvisoria: senha });
    }
  }

  // ── upload de imagem ──
  if (rota === 'upload' && metodo === 'POST') {
    const corpo = await lerCorpo(req);
    const nome = String(corpo.nome || 'imagem.png');
    const ext = path.extname(nome).toLowerCase();
    if (!IMAGENS_OK.has(ext)) {
      return json(res, 400, { erro: 'Formato não aceito. Use PNG, JPG, WEBP, GIF ou SVG.' });
    }

    const base64 = String(corpo.dados || '').replace(/^data:[^;]+;base64,/, '');
    let buf;
    try {
      buf = Buffer.from(base64, 'base64');
    } catch {
      return json(res, 400, { erro: 'Arquivo ilegível.' });
    }
    if (!buf.length) return json(res, 400, { erro: 'Arquivo vazio.' });
    if (buf.length > LIMITE_UPLOAD) {
      return json(res, 413, { erro: `Imagem acima de ${Math.round(LIMITE_UPLOAD / 1024 / 1024)} MB.` });
    }

    const base = path.basename(nome, ext).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'imagem';
    const arquivo = `${base}-${crypto.randomBytes(4).toString('hex')}${ext}`;

    fs.writeFileSync(path.join(PASTA_UPLOADS, arquivo), buf);
    store.registrar(quem, 'enviou imagem', arquivo, `${Math.round(buf.length / 1024)} KB`);

    return json(res, 201, { caminho: `/midia/${arquivo}`, tamanho: buf.length });
  }

  if (rota === 'midia' && metodo === 'GET') {
    const arquivos = fs.readdirSync(PASTA_UPLOADS)
      .filter((f) => IMAGENS_OK.has(path.extname(f).toLowerCase()))
      .map((f) => {
        const st = fs.statSync(path.join(PASTA_UPLOADS, f));
        return { caminho: `/midia/${f}`, nome: f, tamanho: st.size, quando: st.mtime.toISOString() };
      })
      .sort((a, b) => b.quando.localeCompare(a.quando));
    return json(res, 200, { arquivos });
  }

  return json(res, 404, { erro: 'Rota não encontrada.' });
}

// ── roteador ────────────────────────────────────────────

const servidor = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return enviar(res, 400, 'Requisição inválida');
  }

  const caminho = decodeURIComponent(url.pathname);
  const sessao = auth.lerSessao(auth.tokenDaRequisicao(req));

  try {
    // API
    if (caminho === '/api' || caminho.startsWith('/api/')) {
      return await api(req, res, url, sessao);
    }

    // Painel
    if (caminho === '/admin' || caminho === '/admin/') {
      return paginaPainel(req, res, sessao);
    }
    if (caminho === '/admin/entrar') {
      if (sessao) return enviar(res, 302, '', 'text/plain', { Location: '/admin' });
      return servirArquivo(res, path.join(PASTA_ADMIN, 'login.html'));
    }
    if (caminho.startsWith('/admin/')) {
      const alvo = path.join(PASTA_ADMIN, caminho.slice('/admin/'.length));
      if (!dentroDe(PASTA_ADMIN, alvo)) return enviar(res, 403, 'Proibido');
      return servirArquivo(res, alvo);
    }

    // Imagens enviadas pelo painel
    if (caminho.startsWith('/midia/')) {
      const alvo = path.join(PASTA_UPLOADS, caminho.slice('/midia/'.length));
      if (!dentroDe(PASTA_UPLOADS, alvo)) return enviar(res, 403, 'Proibido');
      if (!IMAGENS_OK.has(path.extname(alvo).toLowerCase())) return enviar(res, 403, 'Proibido');
      return servirArquivo(res, alvo);
    }

    // Página pública
    if (caminho === '/' || caminho === '/index.html' || caminho === '/agentes-pro.html') {
      const html = render.montar();
      return enviar(res, 200, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
    }

    // Página de detalhes de um recurso
    if (caminho.startsWith('/pagina/')) {
      const slug = caminho.slice('/pagina/'.length).replace(/\/+$/, '');
      const recurso = slug ? store.obterRecursoPorSlugPagina(slug) : null;
      if (!recurso) {
        return enviar(res, 404, render.montarNaoEncontrada(), 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
      }
      return enviar(res, 200, render.montarPagina(recurso), 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
    }

    // Estáticos da raiz — só imagens
    const ext = path.extname(caminho).toLowerCase();
    if (RAIZ_LIBERADA.has(ext)) {
      const alvo = path.join(RAIZ, caminho);
      if (!dentroDe(RAIZ, alvo)) return enviar(res, 403, 'Proibido');
      return servirArquivo(res, alvo);
    }

    return enviar(res, 404, 'Não encontrado');
  } catch (erro) {
    if (erro && erro.ehDeDados) return json(res, 400, { erro: erro.message, campo: erro.campo });
    if (erro && erro.status) return json(res, erro.status, { erro: erro.message });
    console.error('[erro]', caminho, erro);
    if (!res.headersSent) return json(res, 500, { erro: 'Falha interna do servidor.' });
    res.end();
  }
});

// ── partida ─────────────────────────────────────────────

for (const linha of semear()) console.log(linha);
auth.limparSessoesVencidas();
setInterval(auth.limparSessoesVencidas, 3600e3).unref();

servidor.listen(PORT, HOST, () => {
  console.log(`Agentes Pro rodando em http://${HOST}:${PORT}`);
  console.log(`Painel de conteúdo em http://${HOST}:${PORT}/admin`);
});
