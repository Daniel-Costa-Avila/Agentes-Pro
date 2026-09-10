'use strict';

/*
 * Camada de dados. Todo caminho de escrita passa por aqui, e é aqui que o
 * registro de alterações é gravado — por isso o histórico do painel nunca
 * fica desatualizado em relação ao que foi salvo.
 */

const { db } = require('./db');
const icones = require('./icones');
const paginas = require('./paginas');
const { ErroDeDados } = require('./erros');

const agora = () => new Date().toISOString();
const texto = (v, padrao = '') => (typeof v === 'string' ? v.trim() : padrao);
const bit = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

// ── registro de alterações ──────────────────────────────

function registrar(usuario, acao, alvo, detalhe = '') {
  db.prepare('INSERT INTO log (quando, usuario, acao, alvo, detalhe) VALUES (?, ?, ?, ?, ?)')
    .run(agora(), usuario || 'sistema', acao, alvo, detalhe);
}

function historico(limite = 80) {
  return db.prepare('SELECT id, quando, usuario, acao, alvo, detalhe FROM log ORDER BY id DESC LIMIT ?')
    .all(Math.min(Number(limite) || 80, 300));
}

// ── configuração da página ──────────────────────────────

function lerConfig() {
  const saida = {};
  for (const linha of db.prepare('SELECT chave, valor FROM config').all()) saida[linha.chave] = linha.valor;
  return saida;
}

function gravarConfig(valores, usuario) {
  const permitidas = new Set(Object.keys(lerConfig()));
  const ins = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?');
  const mudadas = [];

  const atual = lerConfig();
  for (const [chave, valor] of Object.entries(valores || {})) {
    if (!permitidas.has(chave)) continue;
    const v = String(valor ?? '');
    if (atual[chave] === v) continue;
    ins.run(chave, v, v);
    mudadas.push(chave);
  }

  if (mudadas.length) {
    registrar(usuario, 'editou', 'Página inicial', mudadas.join(', '));
  }
  return mudadas;
}

// ── categorias ──────────────────────────────────────────

function listarCategorias() {
  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM recursos r WHERE r.categoria_id = c.id) AS total
    FROM categorias c ORDER BY c.ordem, c.id
  `).all();
}

function gerarSlug(nome, reserva = 'item') {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || reserva;
}

function criarCategoria(dados, usuario) {
  const nome = texto(dados.nome);
  if (!nome) throw new ErroDeDados('Informe o nome da categoria.', 'nome');

  let slug = texto(dados.slug) || gerarSlug(nome, 'categoria');
  let n = 2;
  while (db.prepare('SELECT 1 FROM categorias WHERE slug = ?').get(slug)) slug = `${gerarSlug(nome, 'categoria')}-${n++}`;

  const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), 0) AS m FROM categorias').get().m) + 1;
  const info = db.prepare('INSERT INTO categorias (slug, nome, cor, ordem, visivel) VALUES (?, ?, ?, ?, ?)')
    .run(slug, nome, texto(dados.cor) || '#3b7dd8', ordem, bit(dados.visivel ?? 1));

  registrar(usuario, 'criou', `Categoria ${nome}`);
  return db.prepare('SELECT * FROM categorias WHERE id = ?').get(info.lastInsertRowid);
}

function atualizarCategoria(id, dados, usuario) {
  const atual = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Categoria não encontrada.');

  const nome = texto(dados.nome) || atual.nome;
  db.prepare('UPDATE categorias SET nome = ?, cor = ?, visivel = ? WHERE id = ?')
    .run(nome, texto(dados.cor) || atual.cor, bit(dados.visivel ?? atual.visivel), id);

  registrar(usuario, 'editou', `Categoria ${nome}`);
  return db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
}

function removerCategoria(id, usuario) {
  const atual = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Categoria não encontrada.');

  const usados = db.prepare('SELECT COUNT(*) AS n FROM recursos WHERE categoria_id = ?').get(id).n;
  if (usados > 0) {
    throw new ErroDeDados(`Ainda há ${usados} recurso(s) nesta categoria. Mova-os antes de excluir.`);
  }

  db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
  registrar(usuario, 'excluiu', `Categoria ${atual.nome}`);
}

function reordenarCategorias(ids, usuario) {
  const upd = db.prepare('UPDATE categorias SET ordem = ? WHERE id = ?');
  ids.forEach((id, i) => upd.run(i + 1, Number(id)));
  registrar(usuario, 'reordenou', 'Categorias');
}

// ── recursos ────────────────────────────────────────────

const SELECT_RECURSO = `
  SELECT r.*, c.slug AS cat_slug, c.nome AS cat_nome, c.cor AS cat_cor, c.visivel AS cat_visivel
  FROM recursos r LEFT JOIN categorias c ON c.id = r.categoria_id
`;

function statusDe(r) {
  if (!r.ativo) return 'inativo';
  if (r.oculto) return 'oculto';
  return 'ativo';
}

function enfeitar(r) {
  if (!r) return null;
  let blocos = [];
  try {
    const lida = JSON.parse(r.pagina_blocos || '[]');
    if (Array.isArray(lida)) blocos = lida;
  } catch { /* conteúdo corrompido: trata como página vazia em vez de derrubar a tela */ }

  return Object.assign({}, r, {
    ativo: !!r.ativo,
    oculto: !!r.oculto,
    destaque: !!r.destaque,
    botao_ativo: !!r.botao_ativo,
    nova_aba: !!r.nova_aba,
    pagina_ativa: !!r.pagina_ativa,
    pagina_blocos: blocos,
    status: statusDe(r)
  });
}

function listarRecursos() {
  return db.prepare(`${SELECT_RECURSO} ORDER BY r.destaque DESC, r.ordem, r.id`).all().map(enfeitar);
}

function obterRecurso(id) {
  return enfeitar(db.prepare(`${SELECT_RECURSO} WHERE r.id = ?`).get(id));
}

function obterRecursoPorSlugPagina(slug) {
  return enfeitar(db.prepare(`
    ${SELECT_RECURSO} WHERE r.pagina_slug = ? AND r.pagina_ativa = 1 AND r.ativo = 1 AND r.oculto = 0
  `).get(slug));
}

function validarUrl(url) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/')) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    throw new ErroDeDados('Use um endereço http:// ou https://.', 'url');
  }
  return `https://${url}`;
}

function normalizar(dados, base = {}) {
  const titulo = texto(dados.titulo, base.titulo);
  if (!titulo) throw new ErroDeDados('Informe o título do recurso.', 'titulo');

  const thumbTipo = ['imagem', 'svg', 'nenhum'].includes(dados.thumb_tipo)
    ? dados.thumb_tipo
    : (base.thumb_tipo || 'imagem');

  const icone = texto(dados.botao_icone, base.botao_icone || 'link');

  // Página de detalhes: blocos só são reprocessados se vierem no payload
  // (normalizarBlocos devolve undefined quando o campo não foi enviado),
  // senão o que já estava salvo é preservado.
  const paginaAtiva = bit(dados.pagina_ativa ?? base.pagina_ativa ?? 0);
  const paginaTitulo = texto(dados.pagina_titulo, base.pagina_titulo || '');
  const paginaResumo = texto(dados.pagina_resumo, base.pagina_resumo || '');
  const blocosNovos = paginas.normalizarBlocos(dados.pagina_blocos);
  const paginaBlocosStr = blocosNovos === undefined ? (base.pagina_blocos || '[]') : JSON.stringify(blocosNovos);

  // O slug é "pegajoso": só muda quando o campo de slug é editado de
  // propósito (ou limpo, o que pede uma nova geração). Deixar um slug já
  // publicado seguir o título automaticamente quebraria links compartilhados
  // toda vez que alguém ajustasse o texto do título da página.
  const slugDigitado = texto(dados.pagina_slug, '');
  const paginaSlugCandidato = slugDigitado
    ? gerarSlug(slugDigitado)
    : (base.pagina_slug || gerarSlug(paginaTitulo || titulo));

  if (paginaAtiva && paginaBlocosStr === '[]') {
    throw new ErroDeDados('Adicione pelo menos um bloco de conteúdo antes de ativar a página.', 'pagina_blocos');
  }

  return {
    titulo,
    descricao: texto(dados.descricao, base.descricao || ''),
    categoria_id: dados.categoria_id ? Number(dados.categoria_id) : (base.categoria_id ?? null),
    url: validarUrl(texto(dados.url, base.url || '')),
    botao_rotulo: texto(dados.botao_rotulo, base.botao_rotulo || 'Acesso Direto') || 'Acesso Direto',
    botao_icone: icones.existe(icone) ? icone : icones.PADRAO,
    botao_ativo: bit(dados.botao_ativo ?? base.botao_ativo ?? 1),
    botao_off: texto(dados.botao_off, base.botao_off || 'Em breve') || 'Em breve',
    nova_aba: bit(dados.nova_aba ?? base.nova_aba ?? 1),
    selo: texto(dados.selo, base.selo || ''),
    palavras: texto(dados.palavras, base.palavras || ''),
    thumb_tipo: thumbTipo,
    thumb_imagem: texto(dados.thumb_imagem, base.thumb_imagem || ''),
    thumb_svg: typeof dados.thumb_svg === 'string' ? dados.thumb_svg : (base.thumb_svg || ''),
    thumb_fundo: texto(dados.thumb_fundo, base.thumb_fundo || '#ffffff') || '#ffffff',
    destaque: bit(dados.destaque ?? base.destaque ?? 0),
    ativo: bit(dados.ativo ?? base.ativo ?? 1),
    oculto: bit(dados.oculto ?? base.oculto ?? 0),
    pagina_ativa: paginaAtiva,
    pagina_slug_candidato: paginaSlugCandidato,
    pagina_titulo: paginaTitulo,
    pagina_resumo: paginaResumo,
    pagina_blocos: paginaBlocosStr
  };
}

function soUmDestaque(idMantido) {
  db.prepare('UPDATE recursos SET destaque = 0 WHERE id <> ?').run(idMantido);
}

// Garante que o slug da página seja único entre os recursos — igual ao
// slug de categoria, mas guardado por resource. `idAtual` ausente (caso
// de um recurso ainda não criado) faz qualquer slug já usado contar
// como ocupado, que é o comportamento certo para uma criação.
function slugPaginaUnico(candidato, idAtual) {
  const base = candidato || 'pagina';
  const ocupado = (slug) => {
    const linha = db.prepare("SELECT id FROM recursos WHERE pagina_slug = ? AND pagina_slug <> ''").get(slug);
    return !!linha && linha.id !== idAtual;
  };
  let s = base;
  let n = 2;
  while (ocupado(s)) s = `${base}-${n++}`;
  return s;
}

function criarRecurso(dados, usuario) {
  const v = normalizar(dados);
  const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), 0) AS m FROM recursos').get().m) + 1;
  const t = agora();
  const slugPagina = slugPaginaUnico(v.pagina_slug_candidato);

  const info = db.prepare(`
    INSERT INTO recursos
      (titulo, descricao, categoria_id, url, botao_rotulo, botao_icone, botao_ativo, botao_off,
       nova_aba, selo, palavras, thumb_tipo, thumb_imagem, thumb_svg, thumb_fundo,
       destaque, ativo, oculto, pagina_ativa, pagina_slug, pagina_titulo, pagina_resumo, pagina_blocos,
       ordem, criado_em, alterado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    v.titulo, v.descricao, v.categoria_id, v.url, v.botao_rotulo, v.botao_icone, v.botao_ativo, v.botao_off,
    v.nova_aba, v.selo, v.palavras, v.thumb_tipo, v.thumb_imagem, v.thumb_svg, v.thumb_fundo,
    v.destaque, v.ativo, v.oculto, v.pagina_ativa, slugPagina, v.pagina_titulo, v.pagina_resumo, v.pagina_blocos,
    ordem, t, t
  );

  const id = Number(info.lastInsertRowid);
  if (v.destaque) soUmDestaque(id);

  registrar(usuario, 'criou', v.titulo);
  return obterRecurso(id);
}

function atualizarRecurso(id, dados, usuario) {
  const atual = db.prepare('SELECT * FROM recursos WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Recurso não encontrado.');

  const v = normalizar(dados, atual);
  const slugPagina = slugPaginaUnico(v.pagina_slug_candidato, id);

  db.prepare(`
    UPDATE recursos SET
      titulo = ?, descricao = ?, categoria_id = ?, url = ?, botao_rotulo = ?, botao_icone = ?,
      botao_ativo = ?, botao_off = ?, nova_aba = ?, selo = ?, palavras = ?, thumb_tipo = ?,
      thumb_imagem = ?, thumb_svg = ?, thumb_fundo = ?, destaque = ?, ativo = ?, oculto = ?,
      pagina_ativa = ?, pagina_slug = ?, pagina_titulo = ?, pagina_resumo = ?, pagina_blocos = ?,
      alterado_em = ?
    WHERE id = ?
  `).run(
    v.titulo, v.descricao, v.categoria_id, v.url, v.botao_rotulo, v.botao_icone,
    v.botao_ativo, v.botao_off, v.nova_aba, v.selo, v.palavras, v.thumb_tipo,
    v.thumb_imagem, v.thumb_svg, v.thumb_fundo, v.destaque, v.ativo, v.oculto,
    v.pagina_ativa, slugPagina, v.pagina_titulo, v.pagina_resumo, v.pagina_blocos,
    agora(), id
  );

  if (v.destaque) soUmDestaque(id);

  registrar(usuario, 'editou', v.titulo, descreverMudanca(atual, v));
  return obterRecurso(id);
}

function descreverMudanca(antes, depois) {
  const rotulos = {
    titulo: 'título', descricao: 'descrição', url: 'link', botao_rotulo: 'texto do botão',
    botao_icone: 'ícone', botao_ativo: 'botão', selo: 'etiqueta', palavras: 'palavras-chave',
    thumb_imagem: 'imagem', thumb_svg: 'ilustração', thumb_fundo: 'fundo',
    destaque: 'destaque', ativo: 'status', oculto: 'visibilidade', categoria_id: 'categoria',
    pagina_ativa: 'página de detalhes', pagina_titulo: 'título da página',
    pagina_resumo: 'resumo da página', pagina_blocos: 'conteúdo da página'
  };
  const mudou = [];
  for (const [campo, rotulo] of Object.entries(rotulos)) {
    if (String(antes[campo] ?? '') !== String(depois[campo] ?? '')) mudou.push(rotulo);
  }
  return mudou.join(', ');
}

function alternarRecurso(id, campo, usuario) {
  if (!['ativo', 'oculto', 'botao_ativo', 'destaque'].includes(campo)) {
    throw new ErroDeDados('Campo não permitido.');
  }
  const atual = db.prepare('SELECT * FROM recursos WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Recurso não encontrado.');

  const novo = atual[campo] ? 0 : 1;
  db.prepare(`UPDATE recursos SET ${campo} = ?, alterado_em = ? WHERE id = ?`).run(novo, agora(), id);
  if (campo === 'destaque' && novo) soUmDestaque(id);

  const frases = {
    ativo: novo ? 'ativou' : 'desativou',
    oculto: novo ? 'ocultou' : 'exibiu',
    botao_ativo: novo ? 'habilitou o botão de' : 'desabilitou o botão de',
    destaque: novo ? 'destacou' : 'tirou o destaque de'
  };
  registrar(usuario, frases[campo], atual.titulo);
  return obterRecurso(id);
}

function removerRecurso(id, usuario) {
  const atual = db.prepare('SELECT titulo FROM recursos WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Recurso não encontrado.');
  db.prepare('DELETE FROM recursos WHERE id = ?').run(id);
  registrar(usuario, 'excluiu', atual.titulo);
}

function reordenarRecursos(ids, usuario) {
  const upd = db.prepare('UPDATE recursos SET ordem = ?, alterado_em = ? WHERE id = ?');
  const t = agora();
  ids.forEach((id, i) => upd.run(i, t, Number(id)));
  registrar(usuario, 'reordenou', 'Recursos da página');
}

// ── recorte público ─────────────────────────────────────

function conteudoPublico() {
  const config = lerConfig();
  const categorias = listarCategorias().filter((c) => c.visivel);
  const recursos = db.prepare(`${SELECT_RECURSO} WHERE r.ativo = 1 AND r.oculto = 0 ORDER BY r.ordem, r.id`)
    .all().map(enfeitar);

  const slugsVisiveis = new Set(categorias.map((c) => c.slug));
  const listados = recursos.filter((r) => !r.cat_slug || slugsVisiveis.has(r.cat_slug));

  return {
    config,
    categorias,
    destaque: listados.find((r) => r.destaque) || null,
    grade: listados.filter((r) => !r.destaque),
    total: listados.length
  };
}

// ── usuários ────────────────────────────────────────────

function listarUsuarios() {
  return db.prepare('SELECT id, email, nome, papel, ativo, trocar_senha, criado_em, ultimo_acesso FROM usuarios ORDER BY nome')
    .all().map((u) => Object.assign({}, u, { ativo: !!u.ativo, trocar_senha: !!u.trocar_senha }));
}

// ── mensagens do formulário público ──────────────────────
// "Sugerir um agente" e "Dúvidas e sugestões" não enviam e-mail — a
// mensagem fica guardada aqui e aparece na tela "Mensagens" do painel.

function criarMensagem({ tipo, nome, email, mensagem }) {
  const t = agora();
  const info = db.prepare(`
    INSERT INTO mensagens (tipo, nome, email, mensagem, lida, criado_em) VALUES (?, ?, ?, ?, 0, ?)
  `).run(tipo, nome || '', email || '', mensagem, t);
  return { id: Number(info.lastInsertRowid), tipo, nome: nome || '', email: email || '', mensagem, lida: false, criado_em: t };
}

function listarMensagens() {
  return db.prepare('SELECT * FROM mensagens ORDER BY id DESC').all()
    .map((m) => Object.assign({}, m, { lida: !!m.lida }));
}

function alternarMensagemLida(id) {
  const atual = db.prepare('SELECT * FROM mensagens WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Mensagem não encontrada.');
  const novo = atual.lida ? 0 : 1;
  db.prepare('UPDATE mensagens SET lida = ? WHERE id = ?').run(novo, id);
  return Object.assign({}, atual, { lida: !!novo });
}

function removerMensagem(id) {
  const atual = db.prepare('SELECT id FROM mensagens WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Mensagem não encontrada.');
  db.prepare('DELETE FROM mensagens WHERE id = ?').run(id);
}

module.exports = {
  ErroDeDados,
  registrar,
  historico,
  lerConfig,
  gravarConfig,
  listarCategorias,
  criarCategoria,
  atualizarCategoria,
  removerCategoria,
  reordenarCategorias,
  listarRecursos,
  obterRecurso,
  obterRecursoPorSlugPagina,
  criarRecurso,
  atualizarRecurso,
  alternarRecurso,
  removerRecurso,
  reordenarRecursos,
  conteudoPublico,
  listarUsuarios,
  criarMensagem,
  listarMensagens,
  alternarMensagemLida,
  removerMensagem
};
