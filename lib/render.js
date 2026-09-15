'use strict';

/*
 * Monta o agentes-pro.html a partir do banco.
 *
 * O <head> (com todo o CSS) e o <script> de busca/filtro são lidos de
 * templates/ exatamente como estavam na página original — o visual não muda.
 * Só o miolo do <body> passa a ser gerado.
 *
 * Escape: tudo que veio de campo de texto sai por esc(). Os dois campos que
 * saem como HTML cru — a ilustração SVG do card e o texto do aviso — são
 * editáveis apenas por quem tem sessão no painel, e estão marcados abaixo.
 */

const fs = require('fs');
const path = require('path');
const icones = require('./icones');
const { conteudoPublico, lerConfig } = require('./store');

const TEMPLATES = path.join(__dirname, '..', 'templates');

function lerTemplate(nome) {
  return fs.readFileSync(path.join(TEMPLATES, nome), 'utf8');
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAtributo(v) {
  return esc(v).replace(/'/g, '&#39;');
}

function semAcento(txt) {
  return String(txt ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const DOT = { operacao: 'dot-op', assistentes: 'dot-ia', ferramentas: 'dot-fer' };

function corDaCategoria(r) {
  // Categorias antigas têm classe própria no CSS; as novas recebem cor inline.
  const classe = DOT[r.cat_slug];
  if (classe) return `<span class="dot ${classe}"></span>`;
  return `<span class="dot" style="background:${escAtributo(r.cat_cor || '#3b7dd8')}"></span>`;
}

function iconeBotao(nome, tamanho = 16) {
  return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icones.miolo(nome)}</svg>`;
}

function iconeCadeado() {
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/></svg>';
}

function miniatura(r, classe) {
  const fundo = `style="background:${escAtributo(r.thumb_fundo || '#ffffff')}"`;

  if (r.thumb_tipo === 'svg' && r.thumb_svg) {
    // HTML cru: ilustração cadastrada por quem administra o painel.
    return `<div class="${classe}" ${fundo}>${r.thumb_svg}</div>`;
  }
  if (r.thumb_tipo === 'imagem' && r.thumb_imagem) {
    return `<div class="${classe}" ${fundo}>`
      + `<img src="${escAtributo(r.thumb_imagem)}" alt="${escAtributo(r.titulo)}" loading="lazy"></div>`;
  }
  return `<div class="${classe}" ${fundo}></div>`;
}

function botao(r, largo) {
  if (r.botao_ativo && r.url) {
    const alvo = r.nova_aba ? ' target="_blank" rel="noopener"' : '';
    return `<a class="btn${largo ? ' btn-wide' : ''}" href="${escAtributo(r.url)}"${alvo}>`
      + `${iconeBotao(r.botao_icone)} ${esc(r.botao_rotulo)}</a>`;
  }
  return `<span class="btn-off">${iconeCadeado()} ${esc(r.botao_off || 'Em breve')}</span>`;
}

function linkPagina(r) {
  // O caminho é decorado em store.conteudoPublico a partir da página
  // publicada que aponta para este recurso.
  if (!r.pagina_link) return '';
  return `<a class="link-saiba-mais" href="${escAtributo(r.pagina_link)}">Ver tutorial e detalhes `
    + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/>'
    + '<path d="m12.5 5.5 6.5 6.5-6.5 6.5"/></svg></a>';
}

function anfitriao(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

function atributosBusca(r) {
  const kw = semAcento(`${r.palavras || ''}`).toLowerCase();
  return `data-agente data-cat="${escAtributo(r.cat_slug || '')}" data-kw="${escAtributo(kw)}"`;
}

function cardDestaque(r, variante) {
  const selo = r.selo
    ? ` &middot; ${esc(r.selo)}`
    : '';
  return `
    <article class="featured${variante ? ' ' + variante : ''}" ${atributosBusca(r)}>
        ${miniatura(r, 'feat-thumb')}
        <div class="feat-body">
            <span class="cat">${corDaCategoria(r)}${esc(r.cat_nome || '')}${selo}</span>
            <h3>${esc(r.titulo)}</h3>
            <p>${esc(r.descricao)}</p>
            <div class="feat-actions">
                ${botao(r, true)}
                ${r.botao_ativo && r.url ? `<span class="feat-url">${esc(anfitriao(r.url))}</span>` : ''}
                ${linkPagina(r)}
            </div>
        </div>
    </article>`;
}

function card(r) {
  const selo = r.selo ? `\n                    <span class="pill">${esc(r.selo)}</span>` : '';
  return `
        <article class="card" ${atributosBusca(r)}>
            ${miniatura(r, 'thumb')}
            <div class="cbody">
                <div class="cmeta">
                    <span class="cat">${corDaCategoria(r)}${esc(r.cat_nome || '')}</span>${selo}
                </div>
                <h3>${esc(r.titulo)}</h3>
                <p>${esc(r.descricao)}</p>
                ${botao(r, false)}
                ${linkPagina(r)}
            </div>
        </article>`;
}

// Um destaque ocupa uma faixa larga; dois ficam lado a lado; três viram
// um principal com dois menores ao lado. A classe no contêiner é o que o
// CSS usa para decidir o arranjo.
function destaquesHtml(destaques) {
  if (!destaques || !destaques.length) return '';
  const n = Math.min(destaques.length, 3);

  if (n === 1) {
    return `\n    <section class="destaques destaques-1">${cardDestaque(destaques[0])}\n    </section>`;
  }
  if (n === 2) {
    return `\n    <section class="destaques destaques-2">`
      + destaques.slice(0, 2).map((r) => cardDestaque(r, 'feat-meio')).join('')
      + `\n    </section>`;
  }
  return `\n    <section class="destaques destaques-3">`
    + cardDestaque(destaques[0], 'feat-principal')
    + `\n        <div class="destaques-lado">`
    + destaques.slice(1, 3).map((r) => cardDestaque(r, 'feat-curto')).join('')
    + `\n        </div>`
    + `\n    </section>`;
}

// Lista "Guias e materiais" no pé da página inicial: cada card leva para
// uma página criada no painel.
function guiasHtml(cfg, guias) {
  if (cfg.mostrar_guias !== '1' || !guias || !guias.length) return '';

  const cards = guias.map((pg) => {
    const etiqueta = pg.etiqueta ? `<span class="guia-etiqueta">${esc(pg.etiqueta)}</span>` : '';
    const resumo = pg.resumo ? `<p>${esc(pg.resumo)}</p>` : '';
    return `
            <a class="guia-card" href="${escAtributo(pg.caminho)}">
                <span class="guia-icone">${iconeBotao(pg.icone, 18)}</span>
                <span class="guia-corpo">
                    <span class="guia-tit">${esc(pg.titulo)}${etiqueta}</span>
                    ${resumo}
                </span>
                <svg class="guia-seta" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/><path d="m12.5 5.5 6.5 6.5-6.5 6.5"/></svg>
            </a>`;
  }).join('');

  const texto = cfg.guias_texto ? `<p class="guias-lede">${esc(cfg.guias_texto)}</p>` : '';

  return `
    <section class="guias">
        <h2 class="guias-h2">${esc(cfg.guias_titulo || 'Guias e materiais')}</h2>
        ${texto}
        <div class="guias-grid">${cards}
        </div>
    </section>`;
}

function chips(dados, listados) {
  const contar = (slug) => listados.filter((r) => r.cat_slug === slug).length;

  const partes = [
    `<button class="chip is-on" type="button" data-filtro="todos" aria-pressed="true">Todos `
      + `<span class="chip-n">${listados.length}</span></button>`
  ];

  for (const c of dados.categorias) {
    const n = contar(c.slug);
    if (n === 0) continue;
    partes.push(
      `<button class="chip" type="button" data-filtro="${escAtributo(c.slug)}" aria-pressed="false">`
      + `${esc(c.nome)} <span class="chip-n">${n}</span></button>`
    );
  }
  return partes.join('\n            ');
}

function menuHtml(menu, atual, inicio) {
  if (!menu || !menu.length) return '';
  const itens = [`<a class="menu-link${atual ? '' : ' on'}" href="/">${esc(inicio)}</a>`]
    .concat(menu.map((pg) => {
      const aqui = atual && atual === pg.slug;
      return `<a class="menu-link${aqui ? ' on' : ''}" href="${escAtributo(pg.caminho)}"`
        + `${aqui ? ' aria-current="page"' : ''}>${esc(pg.rotulo_menu)}</a>`;
    }))
    .join('\n            ');

  return `
        <nav class="menu" aria-label="Seções do site">
            ${itens}
        </nav>`;
}

function topbarHtml(cfg, menu, atual) {
  return `<header class="topbar">
    <div class="topbar-in">
        <div class="wordmark">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#2a5298"/>
                <path d="M8 16.5V9a2 2 0 0 1 2-2h1.6a2.6 2.6 0 0 1 0 5.2H8" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="16.4" cy="15.6" r="1.5" fill="#1abc9c"/>
            </svg>
            <div>
                <div class="wordmark-txt">${esc(cfg.hero_titulo || 'Agentes Pro')}</div>
                <div class="wordmark-sub">${esc(cfg.marca_1 || '')} &middot; ${esc(cfg.marca_2 || '')}</div>
            </div>
        </div>
${menuHtml(menu, atual, cfg.menu_inicio_rotulo || 'Agentes')}
        <button class="top-link" type="button" data-abrir-contato="duvida">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/>
                <path d="M3 7l9 6 9-6"/>
            </svg>
            <span>Dúvidas e sugestões</span>
        </button>
    </div>
</header>`;
}

function footerHtml(cfg) {
  const email = cfg.contato_email || '';
  return `<footer>
    <div class="footer-in">
        <p>Dúvidas ou sugestões: <a href="mailto:${escAtributo(email)}">${esc(email)}</a></p>
        <div class="brands">
            <span class="brand-probel">${esc(cfg.marca_1 || '')}</span>
            <span class="brand-prodormir">${esc(cfg.marca_2 || '')}</span>
        </div>
    </div>
</footer>`;
}

function modalContatoHtml() {
  return `<div class="modal-cortina" id="contato-cortina">
    <div class="modal-caixa" role="dialog" aria-modal="true" aria-labelledby="contato-titulo">
        <button class="modal-fechar" type="button" id="contato-fechar" aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
        </button>
        <h3 id="contato-titulo">Dúvidas e sugestões</h3>
        <p class="modal-sub" id="contato-sub">Escreva sua dúvida ou sugestão.</p>

        <form id="contato-form">
            <label class="hp" for="contato-hp">Deixe em branco</label>
            <input type="text" id="contato-hp" name="site" class="hp" tabindex="-1" autocomplete="off">

            <div class="campo-modal">
                <label for="contato-nome">Seu nome (opcional)</label>
                <input type="text" id="contato-nome" name="nome" maxlength="120" autocomplete="name">
            </div>
            <div class="campo-modal">
                <label for="contato-email">Seu e-mail (opcional, para respondermos)</label>
                <input type="email" id="contato-email" name="email" maxlength="200" autocomplete="email">
            </div>
            <div class="campo-modal">
                <label for="contato-mensagem" id="contato-mensagem-rotulo">Sua mensagem</label>
                <textarea id="contato-mensagem" name="mensagem" required maxlength="4000" rows="5"></textarea>
            </div>
            <div class="modal-erro" id="contato-erro"></div>
            <button class="btn btn-wide" type="submit" id="contato-enviar">Enviar</button>
        </form>

        <div class="modal-sucesso" id="contato-sucesso">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9"/>
            </svg>
            <p>Mensagem enviada! Assim que possível, respondemos por e-mail.</p>
        </div>
    </div>
</div>`;
}

function montar() {
  const dados = conteudoPublico();
  const cfg = dados.config;
  const listados = [...dados.destaques, ...dados.grade];

  let cabeca = lerTemplate('cabeca.html')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(cfg.pagina_titulo || 'Agentes Pro')}</title>`)
    .replace(/<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escAtributo(cfg.pagina_descricao || '')}">`);

  const script = lerTemplate('script.html');

  const blocoBusca = cfg.mostrar_busca === '1' ? `
        <div class="search">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"/>
                <path d="M16.5 16.5L21 21"/>
            </svg>
            <label class="sr-only" for="busca">Buscar agente</label>
            <input type="text" id="busca" placeholder="${escAtributo(cfg.busca_placeholder || '')}" autocomplete="off">
            <button class="btn-clear" id="limpar" type="button" aria-label="Limpar busca">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18"/>
                </svg>
            </button>
        </div>` : '';

  const blocoChips = cfg.mostrar_filtros === '1' ? `
        <div class="chips" role="group" aria-label="Filtrar por tipo">
            ${chips(dados, listados)}
        </div>` : '';

  // HTML cru: aviso escrito por quem administra o painel (aceita <b>, <a>).
  const blocoAviso = cfg.mostrar_aviso === '1' && (cfg.aviso_texto || '').trim() ? `
    <p class="footnote">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f0a500" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 8h.01M12 11.5v4.5"/>
        </svg>
        <span>${cfg.aviso_texto}</span>
    </p>` : '';

  const corpo = `<body>

<!-- ─── TOPBAR ─── -->
${topbarHtml(cfg, dados.menu, '')}

<!-- ─── HERO ─── -->
<section class="hero">
    <div class="hero-mesh"></div>
    <div class="container hero-in">
        <p class="eyebrow">${esc(cfg.hero_eyebrow || '')}</p>
        <h1>${esc(cfg.hero_titulo || '')}</h1>
        <p class="lede">${esc(cfg.hero_lede || '')}</p>
${blocoBusca}${blocoChips}
    </div>
</section>

<!-- ─── CONTEÚDO ─── -->
<main class="container main">

    <div class="resultbar">
        <p class="count" aria-live="polite"><b id="contador">${listados.length}</b> <span id="contador-txt">${listados.length === 1 ? 'agente disponível' : 'agentes disponíveis'}</span></p>
        <button class="link-soft" type="button" data-abrir-contato="sugestao">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14"/>
            </svg>
            ${esc(cfg.link_sugestao_rotulo || 'Sugerir um agente')}
        </button>
    </div>
${destaquesHtml(dados.destaques)}

    <div class="grid" id="grid">
${dados.grade.map(card).join('\n')}
    </div>

    <div class="empty" id="vazio">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c3cbd6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/>
            <path d="M16.5 16.5L21 21"/>
        </svg>
        <h4>Nenhum agente encontrado</h4>
        <p>Tente outro termo ou volte para o filtro Todos.</p>
    </div>
${blocoAviso}
${guiasHtml(cfg, dados.guias)}

</main>

<!-- ─── FOOTER ─── -->
${footerHtml(cfg)}

${modalContatoHtml()}

${script}
${lerTemplate('script-contato.html')}
</body>
</html>
`;

  return cabeca + corpo;
}

// ─── PÁGINA DE DETALHES DE UM RECURSO ──────────────────────

function blocoHtml(b) {
  if (b.tipo === 'titulo') return `<h2 class="pg-h2">${esc(b.texto)}</h2>`;

  if (b.tipo === 'texto') {
    return String(b.texto || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
      .join('\n');
  }

  if (b.tipo === 'imagem') {
    const legenda = b.legenda ? `<figcaption>${esc(b.legenda)}</figcaption>` : '';
    return `<figure class="pg-figure"><img src="${escAtributo(b.url)}" alt="${escAtributo(b.legenda || '')}" loading="lazy">${legenda}</figure>`;
  }

  if (b.tipo === 'aviso') {
    const tons = {
      info: { classe: 'aviso-info', cor: '#3b7dd8' },
      atencao: { classe: 'aviso-atencao', cor: '#f0a500' },
      ok: { classe: 'aviso-ok', cor: '#1abc9c' }
    };
    const t = tons[b.tom] || tons.info;
    return `<div class="pg-aviso ${t.classe}">`
      + `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${t.cor}" stroke-width="1.8" `
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/>'
      + '<path d="M12 8h.01M12 11.5v4.5"/></svg>'
      + `<p>${esc(b.texto)}</p></div>`;
  }

  if (b.tipo === 'passos') {
    const titulo = b.titulo ? `<h3 class="pg-passos-h">${esc(b.titulo)}</h3>` : '';
    const itens = (b.itens || []).map((t) => `<li>${esc(t)}</li>`).join('\n            ');
    return `<div class="pg-passos">${titulo}<ol>\n            ${itens}\n        </ol></div>`;
  }

  if (b.tipo === 'botao') {
    const alvo = b.nova_aba === false ? '' : ' target="_blank" rel="noopener"';
    const externo = /^https?:/i.test(b.url || '');
    return `<div class="pg-botao pg-botao-${escAtributo(b.alinhamento || 'esquerda')}">`
      + `<a class="btn${b.estilo === 'secundario' ? ' btn-sec' : ''}" href="${escAtributo(b.url)}"`
      + `${externo ? alvo : ''}>${iconeBotao(b.icone)} ${esc(b.rotulo)}</a></div>`;
  }

  if (b.tipo === 'cards') {
    const titulo = b.titulo ? `<h3 class="pg-cards-h">${esc(b.titulo)}</h3>` : '';
    const itens = (b.itens || []).map((c) => {
      const externo = /^https?:/i.test(c.url || '');
      const alvo = externo ? ' target="_blank" rel="noopener"' : '';
      const texto = c.texto ? `<span class="pg-card-txt">${esc(c.texto)}</span>` : '';
      return `
            <a class="pg-card" href="${escAtributo(c.url)}"${alvo}>
                <span class="pg-card-ic">${iconeBotao(c.icone, 17)}</span>
                <span class="pg-card-corpo"><span class="pg-card-tit">${esc(c.titulo)}</span>${texto}</span>
            </a>`;
    }).join('');
    return `<div class="pg-cards">${titulo}<div class="pg-cards-grid">${itens}\n        </div></div>`;
  }

  if (b.tipo === 'video') {
    const legenda = b.legenda ? `<figcaption>${esc(b.legenda)}</figcaption>` : '';
    return `<figure class="pg-figure"><div class="video-caixa"><iframe src="${escAtributo(b.embed)}" `
      + `title="${escAtributo(b.legenda || 'Vídeo')}" loading="lazy" `
      + 'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
      + `allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${legenda}</figure>`;
  }

  return '';
}

function montarPagina(pagina, recurso, menu) {
  const cfg = lerConfig();
  const tituloPagina = pagina.titulo;

  let cabeca = lerTemplate('cabeca.html')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(tituloPagina)} · ${esc(cfg.pagina_titulo || 'Agentes Pro')}</title>`)
    .replace(/<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escAtributo(pagina.resumo || '')}">`);

  const blocos = (pagina.blocos || []).map(blocoHtml).join('\n');
  const resumo = pagina.resumo ? `<p class="pg-resumo">${esc(pagina.resumo)}</p>` : '';

  const corpo = `<body>

${topbarHtml(cfg, menu, pagina.slug)}

<main class="container pg-main">
    <a class="pg-voltar" href="/">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>
        Voltar para os agentes
    </a>
    <article>
        <p class="pg-eyebrow">${esc(pagina.etiqueta || (recurso && recurso.cat_nome) || cfg.guias_titulo || 'Agentes Pro')}</p>
        <h1 class="pg-h1">${esc(tituloPagina)}</h1>
        ${resumo}
        <div class="pg-corpo">
${blocos}
        </div>
${recurso ? `        <div class="pg-cta">
            ${botao(recurso, true)}
        </div>` : ''}
    </article>
</main>

${footerHtml(cfg)}

${modalContatoHtml()}

${lerTemplate('script-contato.html')}
</body>
</html>
`;

  return cabeca + corpo;
}

function montarNaoEncontrada(menu) {
  const cfg = lerConfig();
  const cabeca = lerTemplate('cabeca.html')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>Página não encontrada · ${esc(cfg.pagina_titulo || 'Agentes Pro')}</title>`);

  const corpo = `<body>

${topbarHtml(cfg, menu, "")}

<main class="container pg-main">
    <div class="empty" style="margin-top:40px">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c3cbd6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/>
            <path d="M16.5 16.5L21 21"/>
        </svg>
        <h4>Página não encontrada</h4>
        <p>Ela pode ter sido ocultada, desativada ou nunca existiu. <a href="/">Voltar para os agentes</a>.</p>
    </div>
</main>

${footerHtml(cfg)}

${modalContatoHtml()}

${lerTemplate('script-contato.html')}
</body>
</html>
`;

  return cabeca + corpo;
}

module.exports = {
  montar,
  montarPagina,
  montarNaoEncontrada,
  esc,
  escAtributo
};
