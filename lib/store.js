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

  // As colunas pagina_* do recurso são herança de quando a página de
  // detalhes morava dentro do recurso. O conteúdo vive na tabela `paginas`
  // desde a migração, então aqui elas só são repassadas como estão: nada
  // que chegue no payload do recurso altera uma página.
  const paginaAtiva = bit(base.pagina_ativa ?? 0);
  const paginaTitulo = base.pagina_titulo || '';
  const paginaResumo = base.pagina_resumo || '';
  const paginaBlocosStr = base.pagina_blocos || '[]';
  const paginaSlugCandidato = base.pagina_slug || '';

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

const MAX_DESTAQUES = 3;

// A home aceita até três destaques. Marcar um recurso como destaque pelo
// editor do recurso só o coloca na fila; se as três vagas já estiverem
// ocupadas a marcação é recusada com uma mensagem, em vez de derrubar em
// silêncio o destaque de outra pessoa.
function garantirDestaque(id) {
  const atuais = db.prepare('SELECT id FROM recursos WHERE destaque = 1 AND id <> ? ORDER BY destaque_ordem, id').all(id);
  if (atuais.length >= MAX_DESTAQUES) {
    throw new ErroDeDados(
      `A página inicial já tem ${MAX_DESTAQUES} destaques. Tire um deles na tela Destaques antes de marcar mais um.`,
      'destaque'
    );
  }
  db.prepare('UPDATE recursos SET destaque = 1, destaque_ordem = ? WHERE id = ?').run(atuais.length + 1, id);
}

function tirarDestaque(id) {
  db.prepare('UPDATE recursos SET destaque = 0, destaque_ordem = 0 WHERE id = ?').run(id);
}

function listarDestaques() {
  return db.prepare(`${SELECT_RECURSO} WHERE r.destaque = 1 ORDER BY r.destaque_ordem, r.id`).all().map(enfeitar);
}

// Substitui a lista inteira de destaques de uma vez — é o que a tela
// "Destaques" do painel manda ao salvar (ordem incluída).
function definirDestaques(ids, usuario) {
  if (!Array.isArray(ids)) throw new ErroDeDados('Lista de destaques inválida.', 'destaques');
  if (ids.length > MAX_DESTAQUES) {
    throw new ErroDeDados(`No máximo ${MAX_DESTAQUES} destaques na página inicial.`, 'destaques');
  }

  const limpos = [];
  for (const bruto of ids) {
    const id = Number(bruto);
    const r = db.prepare('SELECT id, titulo FROM recursos WHERE id = ?').get(id);
    if (!r) throw new ErroDeDados('Um dos recursos escolhidos não existe mais.', 'destaques');
    if (!limpos.some((x) => x.id === id)) limpos.push(r);
  }

  db.exec('UPDATE recursos SET destaque = 0, destaque_ordem = 0');
  const marca = db.prepare('UPDATE recursos SET destaque = 1, destaque_ordem = ? WHERE id = ?');
  limpos.forEach((r, i) => marca.run(i + 1, r.id));

  registrar(usuario, 'definiu os destaques', 'Página inicial',
    limpos.length ? limpos.map((r) => r.titulo).join(', ') : 'nenhum destaque');
  return listarDestaques();
}

// Garante que o slug da página seja único entre os recursos — igual ao
// slug de categoria, mas guardado por resource. `idAtual` ausente (caso
// de um recurso ainda não criado) faz qualquer slug já usado contar
// como ocupado, que é o comportamento certo para uma criação.
function slugPaginaUnico(candidato, idAtual) {
  if (!candidato) return '';
  const base = candidato;
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
  if (v.destaque) garantirDestaque(id);

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

  if (v.destaque && !atual.destaque) garantirDestaque(id);
  if (!v.destaque && atual.destaque) tirarDestaque(id);

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

  if (campo === 'destaque') {
    // garantirDestaque recusa a marcação quando as três vagas estão
    // ocupadas, então a checagem vem antes de gravar qualquer coisa.
    if (novo) garantirDestaque(id); else tirarDestaque(id);
    db.prepare('UPDATE recursos SET alterado_em = ? WHERE id = ?').run(agora(), id);
  } else {
    db.prepare(`UPDATE recursos SET ${campo} = ?, alterado_em = ? WHERE id = ?`).run(novo, agora(), id);
  }

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

  // Quantos destaques a home mostra é escolha do painel (tela Destaques):
  // 1 = faixa larga, 2 = lado a lado, 3 = principal + dois. Se sobrarem
  // recursos marcados além desse número, eles voltam para a grade em vez
  // de sumir da página.
  const arranjo = Math.min(Math.max(Number(config.destaques_arranjo || 1) || 1, 1), MAX_DESTAQUES);
  const destaques = listados
    .filter((r) => r.destaque)
    .sort((a, b) => (a.destaque_ordem || 99) - (b.destaque_ordem || 99))
    .slice(0, arranjo);
  const emDestaque = new Set(destaques.map((r) => r.id));

  // Páginas publicadas: as do menu do topo, as da lista "Guias e materiais"
  // e o link de cada recurso que tem uma página ligada a ele.
  const publicadas = listarPaginas().filter((pg) => pg.publicada && pg.blocos.length);
  const porRecurso = new Map();
  for (const pg of publicadas) {
    if (pg.recurso_id && !porRecurso.has(pg.recurso_id)) porRecurso.set(pg.recurso_id, pg);
  }

  const comPagina = (r) => {
    const pg = porRecurso.get(r.id);
    return pg ? Object.assign({}, r, { pagina_link: pg.caminho, pagina_rotulo: pg.titulo }) : r;
  };

  return {
    config,
    categorias,
    destaques: destaques.map(comPagina),
    grade: listados.filter((r) => !emDestaque.has(r.id)).map(comPagina),
    menu: publicadas.filter((pg) => pg.no_menu).sort((a, b) => a.ordem - b.ordem),
    guias: publicadas.filter((pg) => pg.em_guias).sort((a, b) => a.ordem - b.ordem),
    total: listados.length
  };
}

// ── páginas ─────────────────────────────────────────────
// Página é conteúdo próprio: pode estar ligada a um recurso (e aí o card
// do recurso ganha o link "Ver tutorial e detalhes") ou ser livre, criada
// do zero pelo painel. Quem decide onde ela aparece — menu do topo, lista
// "Guias e materiais", ou nenhum dos dois — é o próprio registro.

const SELECT_PAGINA = `
  SELECT p.*, r.titulo AS recurso_titulo, r.ativo AS recurso_ativo, r.oculto AS recurso_oculto
  FROM paginas p LEFT JOIN recursos r ON r.id = p.recurso_id
`;

function enfeitarPagina(p) {
  if (!p) return null;
  let blocos = [];
  try {
    const lida = JSON.parse(p.blocos || '[]');
    if (Array.isArray(lida)) blocos = lida;
  } catch { /* conteúdo corrompido: trata como página vazia em vez de derrubar a tela */ }

  return Object.assign({}, p, {
    blocos,
    no_menu: !!p.no_menu,
    em_guias: !!p.em_guias,
    publicada: !!p.publicada,
    rotulo_menu: (p.menu_rotulo || '').trim() || p.titulo,
    caminho: `/pagina/${p.slug}`,
    status: p.publicada ? (blocos.length ? 'ativo' : 'oculto') : 'rascunho'
  });
}

function listarPaginas() {
  return db.prepare(`${SELECT_PAGINA} ORDER BY p.ordem, p.id`).all().map(enfeitarPagina);
}

function obterPagina(id) {
  return enfeitarPagina(db.prepare(`${SELECT_PAGINA} WHERE p.id = ?`).get(id));
}

function obterPaginaPorSlug(slug) {
  return enfeitarPagina(db.prepare(`${SELECT_PAGINA} WHERE p.slug = ? AND p.publicada = 1`).get(slug));
}

function slugPaginaUnicoNovo(candidato, idAtual) {
  const base = candidato || 'pagina';
  const ocupado = (slug) => {
    const linha = db.prepare('SELECT id FROM paginas WHERE slug = ?').get(slug);
    return !!linha && linha.id !== idAtual;
  };
  let sl = base;
  let n = 2;
  while (ocupado(sl)) sl = `${base}-${n++}`;
  return sl;
}

function normalizarPagina(dados, base = {}) {
  const titulo = texto(dados.titulo, base.titulo);
  if (!titulo) throw new ErroDeDados('Informe o título da página.', 'titulo');

  const blocosNovos = paginas.normalizarBlocos(dados.blocos);
  const blocosStr = blocosNovos === undefined ? (base.blocos || '[]') : JSON.stringify(blocosNovos);

  const publicada = bit(dados.publicada ?? base.publicada ?? 0);
  if (publicada && blocosStr === '[]') {
    throw new ErroDeDados('Adicione pelo menos um bloco de conteúdo antes de publicar a página.', 'blocos');
  }

  // Slug pegajoso, pela mesma razão de sempre: link já compartilhado não
  // pode mudar sozinho quando alguém ajusta o título.
  const slugDigitado = texto(dados.slug, '');
  const slugCandidato = slugDigitado ? gerarSlug(slugDigitado) : (base.slug || gerarSlug(titulo, 'pagina'));

  let recursoId = null;
  if (dados.recurso_id !== undefined) {
    recursoId = dados.recurso_id ? Number(dados.recurso_id) : null;
  } else if (base.recurso_id) {
    recursoId = base.recurso_id;
  }
  if (recursoId && !db.prepare('SELECT 1 FROM recursos WHERE id = ?').get(recursoId)) {
    throw new ErroDeDados('O agente escolhido não existe mais.', 'recurso_id');
  }

  const icone = texto(dados.icone, base.icone || 'link');

  return {
    titulo,
    resumo: texto(dados.resumo, base.resumo || ''),
    blocos: blocosStr,
    recurso_id: recursoId,
    no_menu: bit(dados.no_menu ?? base.no_menu ?? 0),
    menu_rotulo: texto(dados.menu_rotulo, base.menu_rotulo || '').slice(0, 40),
    em_guias: bit(dados.em_guias ?? base.em_guias ?? 0),
    icone: icones.existe(icone) ? icone : icones.PADRAO,
    etiqueta: texto(dados.etiqueta, base.etiqueta || '').slice(0, 30),
    publicada,
    slug_candidato: slugCandidato
  };
}

function criarPagina(dados, usuario) {
  const v = normalizarPagina(dados);
  const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), 0) AS m FROM paginas').get().m) + 1;
  const t = agora();
  const slug = slugPaginaUnicoNovo(v.slug_candidato);

  const info = db.prepare(`
    INSERT INTO paginas
      (slug, titulo, resumo, blocos, recurso_id, no_menu, menu_rotulo, em_guias,
       icone, etiqueta, publicada, ordem, criado_em, alterado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, v.titulo, v.resumo, v.blocos, v.recurso_id, v.no_menu, v.menu_rotulo, v.em_guias,
    v.icone, v.etiqueta, v.publicada, ordem, t, t);

  registrar(usuario, 'criou página', v.titulo, `/pagina/${slug}`);
  return obterPagina(Number(info.lastInsertRowid));
}

function atualizarPagina(id, dados, usuario) {
  const atual = db.prepare('SELECT * FROM paginas WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Página não encontrada.');

  const v = normalizarPagina(dados, atual);
  const slug = slugPaginaUnicoNovo(v.slug_candidato, id);

  db.prepare(`
    UPDATE paginas SET
      slug = ?, titulo = ?, resumo = ?, blocos = ?, recurso_id = ?, no_menu = ?,
      menu_rotulo = ?, em_guias = ?, icone = ?, etiqueta = ?, publicada = ?, alterado_em = ?
    WHERE id = ?
  `).run(slug, v.titulo, v.resumo, v.blocos, v.recurso_id, v.no_menu,
    v.menu_rotulo, v.em_guias, v.icone, v.etiqueta, v.publicada, agora(), id);

  registrar(usuario, 'editou página', v.titulo, slug !== atual.slug ? `endereço: ${atual.slug} → ${slug}` : '');
  return obterPagina(id);
}

function alternarPagina(id, campo, usuario) {
  if (!['publicada', 'no_menu', 'em_guias'].includes(campo)) {
    throw new ErroDeDados('Campo não permitido.');
  }
  const atual = db.prepare('SELECT * FROM paginas WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Página não encontrada.');

  const novo = atual[campo] ? 0 : 1;
  if (campo === 'publicada' && novo && (atual.blocos || '[]') === '[]') {
    throw new ErroDeDados('Adicione pelo menos um bloco de conteúdo antes de publicar a página.', 'blocos');
  }

  db.prepare(`UPDATE paginas SET ${campo} = ?, alterado_em = ? WHERE id = ?`).run(novo, agora(), id);

  const frases = {
    publicada: novo ? 'publicou a página' : 'despublicou a página',
    no_menu: novo ? 'pôs no menu a página' : 'tirou do menu a página',
    em_guias: novo ? 'pôs em Guias a página' : 'tirou de Guias a página'
  };
  registrar(usuario, frases[campo], atual.titulo);
  return obterPagina(id);
}

function removerPagina(id, usuario) {
  const atual = db.prepare('SELECT titulo FROM paginas WHERE id = ?').get(id);
  if (!atual) throw new ErroDeDados('Página não encontrada.');
  db.prepare('DELETE FROM paginas WHERE id = ?').run(id);
  registrar(usuario, 'excluiu página', atual.titulo);
}

// Menu do topo — usado também pelas páginas internas e pela 404, que não
// montam o conteúdo público inteiro só para saber os itens do menu.
function menuPublico() {
  return listarPaginas()
    .filter((pg) => pg.publicada && pg.no_menu && pg.blocos.length)
    .sort((a, b) => a.ordem - b.ordem);
}

function reordenarPaginas(ids, usuario) {
  const up = db.prepare('UPDATE paginas SET ordem = ? WHERE id = ?');
  ids.forEach((id, i) => up.run(i + 1, Number(id)));
  registrar(usuario, 'reordenou', 'Páginas do site');
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
  criarRecurso,
  atualizarRecurso,
  alternarRecurso,
  removerRecurso,
  reordenarRecursos,
  conteudoPublico,
  MAX_DESTAQUES,
  listarDestaques,
  definirDestaques,
  listarPaginas,
  obterPagina,
  obterPaginaPorSlug,
  criarPagina,
  atualizarPagina,
  alternarPagina,
  removerPagina,
  reordenarPaginas,
  menuPublico,
  listarUsuarios,
  criarMensagem,
  listarMensagens,
  alternarMensagemLida,
  removerMensagem
};
