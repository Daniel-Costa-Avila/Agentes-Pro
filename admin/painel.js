/* Painel de conteúdo — Agentes Pro
   Vanilla JS, sem build. Uma tela por função; o estado vive em `dados`. */
(function () {
'use strict';

// ── util ────────────────────────────────────────────────

var dados = null;
var tela = 'recursos';
var contexto = {};

var $ = function (id) { return document.getElementById(id); };
var alvo = $('tela');

function esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function semAcento(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function svg(caminho, tam, traco) {
    return '<svg width="' + (tam || 16) + '" height="' + (tam || 16) + '" viewBox="0 0 24 24" fill="none" '
        + 'stroke="currentColor" stroke-width="' + (traco || 1.8) + '" stroke-linecap="round" '
        + 'stroke-linejoin="round" aria-hidden="true">' + caminho + '</svg>';
}

var ICO = {
    lapis: '<path d="M15.5 4.5 19.5 8.5 8.5 19.5 4 20.5l1-4.5z"/>',
    olho: '<path d="M3 12c0-2 4-7.1 9-7.1S21 10 21 12c0 2-4 7.1-9 7.1S3 14 3 12z"/><circle cx="12" cy="12" r="2.6"/>',
    olhoCortado: '<path d="M4 4l16 16"/><path d="M9.9 5.1A9 9 0 0 1 12 4.9c5 0 9 5.1 9 7.1a11 11 0 0 1-2.3 3.4M6.3 7.9C4.4 9.3 3 11.3 3 12c0 2 4 7.1 9 7.1 1.4 0 2.7-.4 3.8-1"/>',
    lixo: '<path d="M4.5 6.5h15M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7M6.5 6.5 7.4 20a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13.5"/>',
    mais: '<path d="M12 5.5v13M5.5 12h13"/>',
    check: '<path d="M5 12.5 10 17.5 19 7"/>',
    xis: '<path d="M6 6l12 12M18 6L6 18"/>',
    cima: '<path d="m6 15 6-6 6 6"/>',
    baixo: '<path d="m6 9 6 6 6-6"/>',
    voltar: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    alca: '<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8h.01M12 11.5v4.5"/>',
    externo: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    subir: '<path d="M12 16.5V5.5"/><path d="m7.5 10 4.5-4.5 4.5 4.5"/><path d="M4.5 15.5v3a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-3"/>',
    chave: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    girando: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>'
};

function iconeDoBotao(nome, tam) {
    var achado = null;
    (dados && dados.icones || []).forEach(function (i) { if (i.nome === nome) achado = i; });
    if (!achado) achado = (dados && dados.icones || [])[0];
    return achado ? svg(achado.svg, tam || 16, 1.7) : '';
}

function statusDe(r) {
    if (!r.ativo) return 'inativo';
    if (r.oculto) return 'oculto';
    return 'ativo';
}

var ROTULO_STATUS = { ativo: 'Ativo', oculto: 'Oculto', inativo: 'Inativo' };

function seloStatus(s) {
    return '<span class="selo selo-' + s + '"><i></i>' + ROTULO_STATUS[s] + '</span>';
}

function quando(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var hoje = new Date();
    var mesmoDia = d.toDateString() === hoje.toDateString();
    var hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (mesmoDia) return 'Hoje, ' + hora;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ', ' + hora;
}

function siglaDe(nome) {
    var p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    var a = p[0] ? p[0][0] : '';
    var b = p[1] ? p[1][0] : '';
    return (a + b).toUpperCase() || '··';
}

// ── conversa com o servidor ─────────────────────────────

function api(metodo, rota, corpo) {
    return fetch('/api/' + rota, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', 'X-Painel': '1' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }).then(function (r) {
        if (r.status === 401) { window.location.href = '/admin/entrar'; throw new Error('sessão'); }
        return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) throw new Error(j.erro || 'Falha na operação.');
            return j;
        });
    });
}

// ── avisos e confirmações ───────────────────────────────

var recadoAtual = null;
function recado(msg, ruim) {
    if (recadoAtual) recadoAtual.remove();
    var d = document.createElement('div');
    d.className = 'recado' + (ruim ? ' ruim' : '');
    d.innerHTML = svg(ruim ? ICO.info : ICO.check, 16, 2) + '<span>' + esc(msg) + '</span>';
    document.body.appendChild(d);
    recadoAtual = d;
    setTimeout(function () { if (d.parentNode) d.remove(); if (recadoAtual === d) recadoAtual = null; }, ruim ? 6000 : 3200);
}

function confirmar(titulo, texto, rotuloOk, perigoso) {
    return new Promise(function (resolve) {
        var c = document.createElement('div');
        c.className = 'cortina';
        c.innerHTML = '<div class="modal" role="dialog" aria-modal="true">'
            + '<h3>' + esc(titulo) + '</h3><p>' + esc(texto) + '</p>'
            + '<div class="modal-acoes">'
            + '<button class="btn btn-2" data-n>Cancelar</button>'
            + '<button class="btn ' + (perigoso ? 'btn-perigo' : 'btn-1') + '" data-s>' + esc(rotuloOk) + '</button>'
            + '</div></div>';
        document.body.appendChild(c);
        var fim = function (v) { c.remove(); resolve(v); };
        c.querySelector('[data-n]').onclick = function () { fim(false); };
        c.querySelector('[data-s]').onclick = function () { fim(true); };
        c.onclick = function (e) { if (e.target === c) fim(false); };
        c.querySelector('[data-s]').focus();
    });
}

function avisoSenha(senha, nome) {
    var c = document.createElement('div');
    c.className = 'cortina';
    c.innerHTML = '<div class="modal" role="dialog" aria-modal="true">'
        + '<h3>Senha provisória</h3>'
        + '<p>Entregue esta senha para <b>' + esc(nome) + '</b>. Ela será obrigada a trocar no primeiro acesso, '
        + 'e esta é a única vez que a senha aparece aqui.</p>'
        + '<div class="entrada" style="display:flex;align-items:center;font-family:ui-monospace,Consolas,monospace;'
        + 'font-size:15px;letter-spacing:0.04em;background:var(--bg-sub)">' + esc(senha) + '</div>'
        + '<div class="modal-acoes"><button class="btn btn-2" data-c>Copiar</button>'
        + '<button class="btn btn-1" data-f>Entendi</button></div></div>';
    document.body.appendChild(c);
    c.querySelector('[data-c]').onclick = function () {
        navigator.clipboard.writeText(senha).then(function () { recado('Senha copiada.'); },
            function () { recado('Copie manualmente.', true); });
    };
    c.querySelector('[data-f]').onclick = function () { c.remove(); };
}

// ── carregar ────────────────────────────────────────────

function carregar() {
    return api('GET', 'dados').then(function (j) {
        dados = j;
        $('eu-nome').textContent = j.usuario.nome;
        $('eu-papel').textContent = j.usuario.papel === 'admin' ? 'Administrador' : 'Editor';
        $('eu-sigla').textContent = siglaDe(j.usuario.nome);
        $('nav-n').textContent = j.recursos.length;
        $('nav-usuarios').style.display = j.usuario.papel === 'admin' ? '' : 'none';
        var naoLidas = (j.mensagens || []).filter(function (m) { return !m.lida; }).length;
        var selo = $('nav-msg-n');
        selo.textContent = naoLidas;
        selo.style.display = naoLidas > 0 ? '' : 'none';
        if (j.usuario.trocarSenha) telaSenhaObrigatoria();
    });
}

function recarregar() {
    return carregar().then(desenhar);
}

// ── troca de senha obrigatória ──────────────────────────

function telaSenhaObrigatoria() {
    var c = document.createElement('div');
    c.className = 'cortina';
    c.innerHTML = '<div class="modal" role="dialog" aria-modal="true">'
        + '<h3>Defina uma senha sua</h3>'
        + '<p>Este acesso ainda usa a senha provisória. Escolha uma senha com pelo menos 10 caracteres, '
        + 'misturando letras e números.</p>'
        + '<div class="campos">'
        + '<div class="campo"><label>Senha atual</label><input class="entrada" type="password" id="s-atual" autocomplete="current-password"></div>'
        + '<div class="campo"><label>Nova senha</label><input class="entrada" type="password" id="s-nova" autocomplete="new-password"></div>'
        + '<div class="campo"><label>Repita a nova senha</label><input class="entrada" type="password" id="s-rep" autocomplete="new-password">'
        + '<div class="dica" id="s-erro"></div></div>'
        + '</div><div class="modal-acoes"><button class="btn btn-1" id="s-ok">Salvar senha</button></div></div>';
    document.body.appendChild(c);

    $('s-ok').onclick = function () {
        var atual = $('s-atual').value, nova = $('s-nova').value, rep = $('s-rep').value;
        var erro = $('s-erro');
        erro.className = 'dica erro';
        if (nova !== rep) { erro.textContent = 'As duas senhas novas não batem.'; return; }
        $('s-ok').disabled = true;
        api('POST', 'senha', { atual: atual, nova: nova }).then(function () {
            c.remove();
            recado('Senha atualizada.');
            dados.usuario.trocarSenha = false;
        }).catch(function (e) {
            erro.textContent = e.message;
            $('s-ok').disabled = false;
        });
    };
}

// ═══════════════════════════════════════════════════════
//  TELA: RECURSOS
// ═══════════════════════════════════════════════════════

var filtro = { busca: '', cat: 'todos', status: 'todos' };

function recursosFiltrados() {
    var termo = semAcento(filtro.busca).trim();
    return dados.recursos.filter(function (r) {
        if (filtro.cat !== 'todos' && r.cat_slug !== filtro.cat) return false;
        if (filtro.status !== 'todos' && statusDe(r) !== filtro.status) return false;
        if (!termo) return true;
        return semAcento(r.titulo + ' ' + r.url + ' ' + r.palavras).indexOf(termo) !== -1;
    });
}

function miniaturaHtml(r, classe) {
    var fundo = 'background:' + esc(r.thumb_fundo || '#ffffff');
    var dentro = '';
    if (r.thumb_tipo === 'svg' && r.thumb_svg) dentro = r.thumb_svg;
    else if (r.thumb_tipo === 'imagem' && r.thumb_imagem) dentro = '<img src="' + esc(r.thumb_imagem) + '" alt="">';
    else dentro = esc(siglaDe(r.titulo));
    return '<div class="' + classe + '" style="' + fundo + '">' + dentro + '</div>';
}

function telaRecursos() {
    $('migalha').textContent = 'Conteúdo';
    $('titulo').textContent = 'Recursos da página';
    $('acoes-topo').innerHTML =
        '<a class="btn btn-2" href="/" target="_blank" rel="noopener">' + svg(ICO.externo, 15, 1.7) + ' Ver a página</a>'
        + '<button class="btn btn-ok" id="novo">' + svg(ICO.mais, 16, 2.1) + ' Novo recurso</button>';
    $('novo').onclick = function () { irPara('editor', { id: null }); };

    var lista = recursosFiltrados();
    var cats = dados.categorias;

    var pilulas = ['<button class="pilula' + (filtro.cat === 'todos' ? ' on' : '') + '" data-cat="todos">Todos '
        + '<small>' + dados.recursos.length + '</small></button>'];
    cats.forEach(function (c) {
        pilulas.push('<button class="pilula' + (filtro.cat === c.slug ? ' on' : '') + '" data-cat="' + esc(c.slug) + '">'
            + esc(c.nome) + ' <small>' + c.total + '</small></button>');
    });

    var nAtivos = dados.recursos.filter(function (r) { return statusDe(r) === 'ativo'; }).length;
    var nOcultos = dados.recursos.filter(function (r) { return statusDe(r) === 'oculto'; }).length;
    var nInativos = dados.recursos.filter(function (r) { return statusDe(r) === 'inativo'; }).length;

    var linhas = lista.map(function (r, i) {
        var s = statusDe(r);
        return '<div class="linha' + (r.oculto ? ' e-oculto' : '') + '" data-id="' + r.id + '" draggable="true">'
            + '<div class="c-ordem">'
            + '<span class="alca" title="Arraste para reordenar">' + svg(ICO.alca, 14, 1.9) + '</span>'
            + '<span class="pos">' + (i + 1) + '</span>'
            + '<span class="setas">'
            + '<button class="seta" data-mover="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Subir">' + svg(ICO.cima, 9, 3) + '</button>'
            + '<button class="seta" data-mover="1" ' + (i === lista.length - 1 ? 'disabled' : '') + ' aria-label="Descer">' + svg(ICO.baixo, 9, 3) + '</button>'
            + '</span></div>'

            + '<div class="c-nome' + (r.ativo ? '' : ' apagado') + '">'
            + miniaturaHtml(r, 'mini')
            + '<div style="min-width:0">'
            + '<div class="nome-l"><span class="nome-t">' + esc(r.titulo) + '</span>'
            + (r.destaque ? '<span class="tag-dest">Destaque</span>' : '')
            + (r.selo ? '<span class="tag-dest" style="background:#eef4fc;border-color:#cfe0f7;color:#2a5298">' + esc(r.selo) + '</span>' : '')
            + '</div>'
            + '<div class="nome-u">' + esc(r.url || 'sem link') + '</div>'
            + '</div></div>'

            + '<div class="c-cat"><span class="cat-l"><i style="background:' + esc(r.cat_cor || '#c3cbd6') + '"></i>'
            + esc(r.cat_nome || 'sem categoria') + '</span></div>'

            + '<div class="c-botao"><button class="chip-botao' + (r.botao_ativo ? '' : ' off') + '" data-alternar="botao_ativo" '
            + 'title="Liga e desliga o botão de acesso">'
            + svg(r.botao_ativo ? ICO.check : ICO.xis, 12, 2)
            + (r.botao_ativo ? esc(r.botao_rotulo) : 'Desativado') + '</button></div>'

            + '<div class="c-status">' + seloStatus(s) + '</div>'

            + '<div class="c-chave"><button class="chave' + (r.ativo ? ' on' : '') + '" data-alternar="ativo" '
            + 'role="switch" aria-checked="' + r.ativo + '" aria-label="Ativar recurso"><b></b></button></div>'

            + '<div class="c-acoes">'
            + '<button class="icone-btn" data-editar title="Editar">' + svg(ICO.lapis, 15) + '</button>'
            + '<button class="icone-btn' + (r.oculto ? ' aceso' : '') + '" data-alternar="oculto" '
            + 'title="' + (r.oculto ? 'Voltar a exibir' : 'Ocultar da página') + '">'
            + svg(r.oculto ? ICO.olhoCortado : ICO.olho, 15) + '</button>'
            + '<button class="icone-btn perigo" data-excluir title="Excluir">' + svg(ICO.lixo, 15) + '</button>'
            + '</div></div>';
    }).join('');

    alvo.innerHTML =
        '<div class="ferramentas">'
        + '<label class="campo-busca"><span class="sr-only">Buscar recurso</span>'
        + svg('<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>', 16, 1.8)
        + '<input type="text" id="f-busca" placeholder="Buscar por título ou link" value="' + esc(filtro.busca) + '"></label>'
        + '<div class="filtros" id="f-cats">' + pilulas.join('') + '</div>'
        + '<div class="espaco"></div>'
        + '<select class="selecao" id="f-status" style="width:auto;min-width:150px">'
        + ['todos', 'ativo', 'oculto', 'inativo'].map(function (s) {
            return '<option value="' + s + '"' + (filtro.status === s ? ' selected' : '') + '>'
                + (s === 'todos' ? 'Todos os status' : ROTULO_STATUS[s]) + '</option>';
        }).join('')
        + '</select>'
        + '</div>'

        + '<div class="resumo">'
        + '<span class="resumo-n"><b>' + lista.length + '</b> ' + (lista.length === 1 ? 'recurso listado' : 'recursos listados') + '</span>'
        + '<span class="resumo-i"><i style="background:#1abc9c"></i>' + nAtivos + ' ativos</span>'
        + '<span class="resumo-i"><i style="background:#f0a500"></i>' + nOcultos + ' ocultos</span>'
        + '<span class="resumo-i"><i style="background:#c3cbd6"></i>' + nInativos + ' inativos</span>'
        + '</div>'

        + '<div class="quadro">'
        + '<div class="linha-cab">'
        + '<span class="c-ordem">Ordem</span><span class="c-nome">Recurso</span>'
        + '<span class="c-cat">Categoria</span><span class="c-botao">Botão</span>'
        + '<span class="c-status">Status</span><span class="c-chave">Ativo</span>'
        + '<span class="c-acoes" style="justify-content:flex-end">Ações</span>'
        + '</div>'
        + '<div id="linhas">' + (linhas || '<div class="vazio">' + svg('<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>', 30, 1.6)
            + '<h4>Nenhum recurso encontrado</h4><p>Ajuste a busca ou volte para o filtro Todos.</p></div>') + '</div>'
        + '<div class="rodape-quadro">' + svg(ICO.info, 14)
        + '<span>Arraste pela alça ou use as setas para definir a ordem dos cards na página. '
        + '<b>Oculto</b> tira o card do ar sem apagar o cadastro.</span></div>'
        + '</div>';

    // eventos
    var busca = $('f-busca');
    busca.oninput = function () {
        var pos = busca.selectionStart;
        filtro.busca = busca.value;
        desenhar();
        var novo = $('f-busca');
        novo.focus();
        try { novo.setSelectionRange(pos, pos); } catch (x) {}
    };
    $('f-status').onchange = function () { filtro.status = this.value; desenhar(); };
    $('f-cats').onclick = function (e) {
        var b = e.target.closest('[data-cat]');
        if (!b) return;
        filtro.cat = b.getAttribute('data-cat');
        desenhar();
    };

    ligarLinhas(lista);
}

function ligarLinhas(lista) {
    var caixa = $('linhas');
    if (!caixa) return;

    caixa.onclick = function (e) {
        var linha = e.target.closest('.linha');
        if (!linha) return;
        var id = Number(linha.getAttribute('data-id'));
        var r = dados.recursos.filter(function (x) { return x.id === id; })[0];

        var mover = e.target.closest('[data-mover]');
        if (mover) return moverRecurso(id, Number(mover.getAttribute('data-mover')), lista);

        var alt = e.target.closest('[data-alternar]');
        if (alt) {
            var campo = alt.getAttribute('data-alternar');
            return api('POST', 'recursos/' + id + '/alternar', { campo: campo }).then(function () {
                return recarregar();
            }).then(function () {
                var nomes = { ativo: 'Status', oculto: 'Visibilidade', botao_ativo: 'Botão' };
                recado(nomes[campo] + ' de "' + r.titulo + '" atualizado e já no ar.');
            }).catch(function (er) { recado(er.message, true); });
        }

        if (e.target.closest('[data-editar]')) return irPara('editor', { id: id });

        if (e.target.closest('[data-excluir]')) {
            return confirmar('Excluir "' + r.titulo + '"?',
                'O cadastro sai do painel e o card some da página. Não dá para desfazer — '
                + 'se a ideia é só tirar do ar por um tempo, use Ocultar.',
                'Excluir', true).then(function (ok) {
                if (!ok) return;
                return api('DELETE', 'recursos/' + id).then(recarregar).then(function () {
                    recado('"' + r.titulo + '" foi excluído.');
                });
            }).catch(function (er) { recado(er.message, true); });
        }
    };

    // arrastar para reordenar
    var arrastado = null;
    caixa.addEventListener('dragstart', function (e) {
        var l = e.target.closest('.linha');
        if (!l) return;
        arrastado = l;
        l.classList.add('arrastando');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', l.getAttribute('data-id')); } catch (x) {}
    });
    caixa.addEventListener('dragend', function () {
        if (arrastado) arrastado.classList.remove('arrastando');
        Array.prototype.forEach.call(caixa.querySelectorAll('.alvo'), function (l) { l.classList.remove('alvo'); });
        arrastado = null;
    });
    caixa.addEventListener('dragover', function (e) {
        e.preventDefault();
        var l = e.target.closest('.linha');
        if (!l || l === arrastado) return;
        Array.prototype.forEach.call(caixa.querySelectorAll('.alvo'), function (x) { x.classList.remove('alvo'); });
        l.classList.add('alvo');
    });
    caixa.addEventListener('drop', function (e) {
        e.preventDefault();
        var l = e.target.closest('.linha');
        if (!l || !arrastado || l === arrastado) return;
        var ordem = Array.prototype.map.call(caixa.querySelectorAll('.linha'), function (x) {
            return Number(x.getAttribute('data-id'));
        });
        var de = ordem.indexOf(Number(arrastado.getAttribute('data-id')));
        var para = ordem.indexOf(Number(l.getAttribute('data-id')));
        ordem.splice(para, 0, ordem.splice(de, 1)[0]);
        salvarOrdem(ordem);
    });
}

function moverRecurso(id, passo, lista) {
    var ordem = lista.map(function (r) { return r.id; });
    var i = ordem.indexOf(id);
    var j = i + passo;
    if (i === -1 || j < 0 || j >= ordem.length) return;
    var t = ordem[i]; ordem[i] = ordem[j]; ordem[j] = t;
    salvarOrdem(ordem);
}

function salvarOrdem(ordem) {
    // A lista visível pode estar filtrada: reordena só o trecho visível
    // e mantém os demais nas posições que já ocupavam.
    var completa = dados.recursos.map(function (r) { return r.id; });
    var visiveis = completa.filter(function (id) { return ordem.indexOf(id) !== -1; });
    var fila = ordem.slice();
    var final = completa.map(function (id) {
        return visiveis.indexOf(id) !== -1 ? fila.shift() : id;
    });

    api('POST', 'recursos/ordem', { ids: final }).then(recarregar).then(function () {
        recado('Nova ordem publicada.');
    }).catch(function (e) { recado(e.message, true); });
}

// ═══════════════════════════════════════════════════════
//  TELA: EDITOR DE RECURSO
// ═══════════════════════════════════════════════════════

var rascunho = null;

function vazio() {
    return {
        id: null, titulo: '', descricao: '', categoria_id: (dados.categorias[0] || {}).id || null,
        url: '', botao_rotulo: 'Acesso Direto', botao_icone: 'link', botao_ativo: true,
        botao_off: 'Em breve', nova_aba: true, selo: '', palavras: '',
        thumb_tipo: 'imagem', thumb_imagem: '', thumb_svg: '', thumb_fundo: '#ffffff',
        destaque: false, ativo: true, oculto: false,
        pagina_ativa: false, pagina_slug: '', pagina_titulo: '', pagina_resumo: '', pagina_blocos: []
    };
}

// ─── blocos da página de detalhes ───────────────────────

var ROTULO_BLOCO = { titulo: 'Subtítulo', texto: 'Texto', imagem: 'Imagem', video: 'Vídeo' };
var blocoUploadPendente = null;

// Espelho simples, só para feedback imediato — a validação de verdade
// é sempre a do servidor (lib/paginas.js), que é quem decide de fato.
function analisarVideoCliente(url) {
    var u;
    try { u = new URL(String(url || '').trim()); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    var host = u.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
        if (u.pathname === '/watch' && u.searchParams.get('v')) return { provedor: 'YouTube' };
        if (/^\/(embed|shorts)\/[a-zA-Z0-9_-]{6,}/.test(u.pathname)) return { provedor: 'YouTube' };
    }
    if (host === 'youtu.be' && u.pathname.length > 1) return { provedor: 'YouTube' };
    if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return { provedor: 'Vimeo' };
    if (host === 'player.vimeo.com' && /^\/video\/\d+/.test(u.pathname)) return { provedor: 'Vimeo' };
    if (host === 'loom.com' && /^\/(share|embed)\/[a-zA-Z0-9]+/.test(u.pathname)) return { provedor: 'Loom' };
    return null;
}

function corpoBloco(b) {
    if (b.tipo === 'titulo') {
        return '<input class="entrada" data-bloco-campo="texto" value="' + esc(b.texto || '') + '" maxlength="150" placeholder="Subtítulo da seção">';
    }
    if (b.tipo === 'texto') {
        return '<textarea class="area" data-bloco-campo="texto" maxlength="4000" placeholder="Texto do parágrafo. Deixe uma linha em branco para separar parágrafos.">' + esc(b.texto || '') + '</textarea>';
    }
    if (b.tipo === 'imagem') {
        return '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'
            + '<div class="imagem-previa" style="width:96px;height:64px' + (b.url ? '' : ';background:var(--bg-sub)') + '">'
            + (b.url ? '<img src="' + esc(b.url) + '" alt="">' : svg('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.7"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>', 22, 1.6))
            + '</div>'
            + '<div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px">'
            + '<button type="button" class="btn btn-2 btn-mini" data-bloco-upload>' + svg(ICO.subir, 13, 1.8) + (b.url ? ' Trocar imagem' : ' Enviar imagem') + '</button>'
            + '<input class="entrada" data-bloco-campo="legenda" value="' + esc(b.legenda || '') + '" placeholder="Legenda (opcional)" maxlength="200">'
            + '</div></div>';
    }
    // vídeo
    var info = b.url ? analisarVideoCliente(b.url) : null;
    return '<div class="campo">'
        + '<input class="entrada" data-bloco-campo="url" value="' + esc(b.url || '') + '" placeholder="Link do YouTube, Vimeo ou Loom">'
        + '<div class="dica' + (b.url && !info ? ' erro' : '') + '">'
        + (b.url ? (info ? 'Reconhecido: ' + info.provedor : 'Link não reconhecido — use YouTube, Vimeo ou Loom.') : 'Cole o link do vídeo já publicado.')
        + '</div>'
        + '<input class="entrada" data-bloco-campo="legenda" value="' + esc(b.legenda || '') + '" placeholder="Legenda (opcional)" maxlength="200" style="margin-top:4px">'
        + '</div>';
}

function renderizarBlocos(lista) {
    if (!lista.length) {
        return '<div class="dica" style="padding:6px 0">Nenhum bloco ainda. Use os botões abaixo para montar o conteúdo da página.</div>';
    }
    return lista.map(function (b, i) {
        return '<div class="bloco-item" data-bloco="' + i + '">'
            + '<div class="bloco-item-cab">'
            + '<span class="bloco-tipo-selo">' + esc(ROTULO_BLOCO[b.tipo] || b.tipo) + '</span>'
            + '<div style="flex:1"></div>'
            + '<button type="button" class="seta" data-bloco-mover="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Mover para cima">' + svg(ICO.cima, 9, 3) + '</button>'
            + '<button type="button" class="seta" data-bloco-mover="1" ' + (i === lista.length - 1 ? 'disabled' : '') + ' aria-label="Mover para baixo">' + svg(ICO.baixo, 9, 3) + '</button>'
            + '<button type="button" class="icone-btn perigo" data-bloco-excluir title="Excluir bloco" aria-label="Excluir bloco">' + svg(ICO.lixo, 13) + '</button>'
            + '</div>'
            + '<div class="bloco-item-corpo">' + corpoBloco(b) + '</div>'
            + '</div>';
    }).join('');
}

function redesenharBlocos() {
    var caixa = $('blocos-lista');
    if (caixa) caixa.innerHTML = renderizarBlocos(rascunho.pagina_blocos);
}

function novoBloco(tipo) {
    if (tipo === 'imagem') return { tipo: tipo, url: '', legenda: '' };
    if (tipo === 'video') return { tipo: tipo, url: '', legenda: '' };
    return { tipo: tipo, texto: '' };
}

function telaEditor() {
    var novo = contexto.id == null;
    if (!rascunho) {
        rascunho = novo ? vazio() : JSON.parse(JSON.stringify(
            dados.recursos.filter(function (r) { return r.id === contexto.id; })[0] || vazio()));
    }
    var r = rascunho;

    $('migalha').textContent = novo ? 'Recursos · Novo' : 'Recursos · Editando';
    $('titulo').textContent = r.titulo || (novo ? 'Novo recurso' : '—');
    $('acoes-topo').innerHTML =
        '<button class="btn btn-2" id="cancelar">Cancelar</button>'
        + '<button class="btn btn-1" id="salvar">' + svg(ICO.check, 15, 2) + ' Salvar e publicar</button>';

    var opCats = dados.categorias.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === r.categoria_id ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
    }).join('');

    var opIcones = dados.icones.map(function (i) {
        return '<button type="button" class="icone-op' + (i.nome === r.botao_icone ? ' on' : '') + '" '
            + 'data-icone="' + esc(i.nome) + '" title="' + esc(i.rotulo) + '">' + svg(i.svg, 20, 1.7) + '</button>';
    }).join('');

    var status = statusDe(r);
    var segs = ['ativo', 'oculto', 'inativo'].map(function (s) {
        var cor = { ativo: '#1abc9c', oculto: '#f0a500', inativo: '#c3cbd6' }[s];
        return '<button type="button" class="seg v-' + s + (status === s ? ' on' : '') + '" data-status="' + s + '">'
            + '<i style="background:' + cor + '"></i>' + ROTULO_STATUS[s] + '</button>';
    }).join('');

    var tags = (r.palavras || '').split(/\s+/).filter(Boolean).map(function (p) {
        return '<span class="tag">' + esc(p) + '<button type="button" data-tag="' + esc(p) + '" aria-label="Remover">'
            + svg(ICO.xis, 10, 2.6) + '</button></span>';
    }).join('');

    alvo.innerHTML =
    '<div class="colunas"><div class="pilha">'

    + '<section class="bloco"><div class="bloco-tit"><span>Identificação</span></div><div class="campos">'
    + '<div class="campo"><label for="e-titulo">Título do card</label>'
    + '<input class="entrada" id="e-titulo" data-campo="titulo" value="' + esc(r.titulo) + '" maxlength="80"></div>'
    + '<div class="campo"><label for="e-desc">Descrição</label>'
    + '<textarea class="area" id="e-desc" data-campo="descricao" maxlength="400">' + esc(r.descricao) + '</textarea>'
    + '<div class="dica"><span id="e-conta">' + (r.descricao || '').length + '</span> caracteres · o card fica mais equilibrado entre 120 e 200.</div></div>'
    + '<div class="duplo">'
    + '<div class="campo"><label for="e-cat">Categoria</label><select class="selecao" id="e-cat" data-campo="categoria_id">' + opCats + '</select></div>'
    + '<div class="campo"><label for="e-selo">Etiqueta (opcional)</label>'
    + '<input class="entrada" id="e-selo" data-campo="selo" value="' + esc(r.selo) + '" placeholder="Ex.: Acesso limitado" maxlength="30"></div>'
    + '</div>'
    + '<div class="campo"><label for="e-tag">Palavras-chave da busca</label>'
    + '<div class="tags" id="e-tags">' + tags
    + '<input id="e-tag" placeholder="Digite e pressione Enter…"></div>'
    + '<div class="dica">Ajudam quem busca na página a achar o card por outros termos.</div></div>'
    + '</div></section>'

    + '<section class="bloco"><div class="bloco-tit"><span>Link e botão de acesso</span></div><div class="campos">'
    + '<div class="duplo">'
    + '<div class="campo"><label for="e-url">Endereço de destino</label>'
    + '<input class="entrada" id="e-url" data-campo="url" value="' + esc(r.url) + '" placeholder="https://…"></div>'
    + '<div class="campo"><label for="e-rot">Texto do botão</label>'
    + '<input class="entrada" id="e-rot" data-campo="botao_rotulo" value="' + esc(r.botao_rotulo) + '" maxlength="30"></div>'
    + '</div>'
    + '<div class="campo"><label>Ícone do botão</label><div class="grade-icones" id="e-icones">' + opIcones + '</div></div>'
    + '<div class="opcao"><div><div class="opcao-t">Botão habilitado</div>'
    + '<div class="opcao-d">Desligado, o card continua na página com o botão cinza e sem link — usado enquanto o acesso não é liberado.</div></div>'
    + '<button type="button" class="chave g' + (r.botao_ativo ? ' on' : '') + '" data-chave="botao_ativo" role="switch" aria-checked="' + r.botao_ativo + '"><b></b></button></div>'
    + '<div class="campo" id="e-off-cx"' + (r.botao_ativo ? ' style="display:none"' : '') + '>'
    + '<label for="e-off">Texto do botão desligado</label>'
    + '<input class="entrada" id="e-off" data-campo="botao_off" value="' + esc(r.botao_off) + '" maxlength="30"></div>'
    + '<div class="opcao"><div><div class="opcao-t">Abrir em nova aba</div>'
    + '<div class="opcao-d">Mantém a página do portal aberta ao acessar o agente.</div></div>'
    + '<button type="button" class="chave g' + (r.nova_aba ? ' on' : '') + '" data-chave="nova_aba" role="switch" aria-checked="' + r.nova_aba + '"><b></b></button></div>'
    + '</div></section>'

    + '<section class="bloco"><div class="bloco-tit"><span>Imagem do card</span></div>'
    + '<div class="imagem-linha">'
    + '<div class="imagem-previa" id="e-img-previa" style="background:' + esc(r.thumb_fundo) + '"></div>'
    + '<div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:10px">'
    + '<div class="dica" id="e-img-nome">' + esc(r.thumb_imagem || (r.thumb_tipo === 'svg' ? 'Ilustração vetorial cadastrada' : 'Nenhuma imagem')) + '</div>'
    + '<div class="dica">PNG, JPG, WEBP ou SVG até 3 MB. Proporção 16:9 ou logo com fundo transparente.</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button type="button" class="btn btn-2 btn-mini" id="e-enviar">' + svg(ICO.subir, 14, 1.8) + ' Enviar imagem</button>'
    + '<button type="button" class="btn btn-2 btn-mini" id="e-limpar-img">Remover</button>'
    + '<input type="file" id="e-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>'
    + '</div></div>'
    + '<div class="campo" style="width:190px"><label for="e-fundo">Cor de fundo</label>'
    + '<input class="entrada" id="e-fundo" data-campo="thumb_fundo" value="' + esc(r.thumb_fundo) + '"></div>'
    + '</div></section>'

    + '<section class="bloco"><div class="bloco-tit"><span>Exibição na página</span></div><div class="campos">'
    + '<div class="campo"><label>Status</label><div class="segmentado" id="e-status">' + segs + '</div>'
    + '<div class="dica" id="e-status-txt"></div></div>'
    + '<div class="opcao"><div><div class="opcao-t">Card em destaque</div>'
    + '<div class="opcao-d">Ocupa a faixa larga acima da grade. Só um recurso pode estar em destaque por vez.</div></div>'
    + '<button type="button" class="chave g' + (r.destaque ? ' on' : '') + '" data-chave="destaque" role="switch" aria-checked="' + r.destaque + '"><b></b></button></div>'
    + '</div></section>'

    + '<section class="bloco"><div class="bloco-tit"><span>Página de detalhes</span></div>'
    + '<div class="opcao"><div><div class="opcao-t">Ativar página com tutorial</div>'
    + '<div class="opcao-d">Cria uma página própria dentro do site, com texto, imagens e vídeos, além do link do botão. Some junto se o recurso for ocultado ou desativado.</div></div>'
    + '<button type="button" class="chave g' + (r.pagina_ativa ? ' on' : '') + '" data-chave="pagina_ativa" role="switch" aria-checked="' + r.pagina_ativa + '"><b></b></button></div>'
    + '<div id="pg-campos" style="margin-top:14px' + (r.pagina_ativa ? '' : ';display:none') + '">'
    + '<div class="duplo">'
    + '<div class="campo"><label for="pg-titulo">Título da página</label>'
    + '<input class="entrada" id="pg-titulo" data-pg-campo="pagina_titulo" value="' + esc(r.pagina_titulo) + '" placeholder="' + esc(r.titulo || 'Título') + '" maxlength="150"></div>'
    + '<div class="campo"><label for="pg-slug">Endereço</label>'
    + '<div style="display:flex;align-items:center;gap:6px">'
    + '<span style="font-size:12.5px;color:var(--text-soft);white-space:nowrap">/pagina/</span>'
    + '<input class="entrada" id="pg-slug" data-pg-campo="pagina_slug" value="' + esc(r.pagina_slug) + '" placeholder="gerado automaticamente"></div>'
    + '<div class="dica">Muda só se você mexer aqui — editar o título não move um endereço já publicado.</div></div>'
    + '</div>'
    + '<div class="campo"><label for="pg-resumo">Resumo (aparece no topo da página)</label>'
    + '<textarea class="area" id="pg-resumo" data-pg-campo="pagina_resumo" maxlength="300">' + esc(r.pagina_resumo) + '</textarea></div>'
    + '<div class="campo"><label>Conteúdo da página</label>'
    + '<div id="blocos-lista">' + renderizarBlocos(r.pagina_blocos) + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'
    + '<button type="button" class="btn btn-2 btn-mini" data-add-bloco="titulo">' + svg(ICO.mais, 13, 2.2) + ' Subtítulo</button>'
    + '<button type="button" class="btn btn-2 btn-mini" data-add-bloco="texto">' + svg(ICO.mais, 13, 2.2) + ' Texto</button>'
    + '<button type="button" class="btn btn-2 btn-mini" data-add-bloco="imagem">' + svg(ICO.mais, 13, 2.2) + ' Imagem</button>'
    + '<button type="button" class="btn btn-2 btn-mini" data-add-bloco="video">' + svg(ICO.mais, 13, 2.2) + ' Vídeo</button>'
    + '</div></div>'
    + '<input type="file" id="bloco-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>'
    + '</div></section>'

    + '</div>'

    + '<aside class="pilha" style="position:sticky;top:88px">'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<span class="bloco-tit" style="margin:0"><span>Como vai aparecer</span></span>'
    + '<div style="flex:1"></div><span id="e-selo-status">' + seloStatus(status) + '</span></div>'
    + '<div class="previa-caixa"><div class="previa-card" id="e-previa"></div></div>'
    + '<div class="nota">' + svg(ICO.info, 15) + '<span id="e-nota"></span></div>'
    + '</aside></div>';

    ligarEditor();
    desenharPrevia();
}

var TEXTO_STATUS = {
    ativo: 'Publicado: o card aparece na página e conta nos filtros do topo.',
    oculto: 'Fora do ar temporariamente: o cadastro fica salvo, mas o card não é montado na página nem aparece na busca.',
    inativo: 'Desativado: sai da página e do índice de busca. Continua no painel para ser reativado quando quiser.'
};

function ligarEditor() {
    var r = rascunho;

    $('cancelar').onclick = function () {
        confirmar('Descartar as alterações?', 'O que você mudou nesta tela não será salvo.', 'Descartar', true)
            .then(function (ok) { if (ok) { rascunho = null; irPara('recursos', {}); } });
    };
    $('salvar').onclick = salvarRecurso;

    alvo.oninput = (function (e) {
        var campoBloco = e.target.getAttribute && e.target.getAttribute('data-bloco-campo');
        if (campoBloco) {
            var item = e.target.closest('[data-bloco]');
            var idx = Number(item.getAttribute('data-bloco'));
            r.pagina_blocos[idx][campoBloco] = e.target.value;
            if (campoBloco === 'url' && r.pagina_blocos[idx].tipo === 'video') {
                var dica = item.querySelector('.dica');
                var info = analisarVideoCliente(e.target.value);
                if (dica) {
                    dica.textContent = e.target.value
                        ? (info ? 'Reconhecido: ' + info.provedor : 'Link não reconhecido — use YouTube, Vimeo ou Loom.')
                        : 'Cole o link do vídeo já publicado.';
                    dica.classList.toggle('erro', !!(e.target.value && !info));
                }
            }
            return;
        }

        var campoPg = e.target.getAttribute && e.target.getAttribute('data-pg-campo');
        if (campoPg) { r[campoPg] = e.target.value; return; }

        var campo = e.target.getAttribute && e.target.getAttribute('data-campo');
        if (!campo) return;
        r[campo] = campo === 'categoria_id' ? Number(e.target.value) : e.target.value;
        if (campo === 'descricao') $('e-conta').textContent = e.target.value.length;
        if (campo === 'titulo') $('titulo').textContent = e.target.value || 'Novo recurso';
        if (campo === 'thumb_fundo') {
            $('e-img-previa').style.background = e.target.value;
        }
        desenharPrevia();
    });
    alvo.onchange = (function (e) {
        var campo = e.target.getAttribute && e.target.getAttribute('data-campo');
        if (campo === 'categoria_id') { r.categoria_id = Number(e.target.value); desenharPrevia(); }
    });

    alvo.onclick = (function (e) {
        var ch = e.target.closest('[data-chave]');
        if (ch) {
            var c = ch.getAttribute('data-chave');
            r[c] = !r[c];
            ch.classList.toggle('on', !!r[c]);
            ch.setAttribute('aria-checked', String(!!r[c]));
            if (c === 'botao_ativo') $('e-off-cx').style.display = r.botao_ativo ? 'none' : '';
            if (c === 'pagina_ativa') {
                var campos = $('pg-campos');
                if (campos) campos.style.display = r.pagina_ativa ? '' : 'none';
            }
            return desenharPrevia();
        }

        var bi = e.target.closest('[data-bloco]');
        if (bi) {
            var idxB = Number(bi.getAttribute('data-bloco'));

            var mv = e.target.closest('[data-bloco-mover]');
            if (mv) {
                var passo = Number(mv.getAttribute('data-bloco-mover'));
                var alvoIdx = idxB + passo;
                if (alvoIdx >= 0 && alvoIdx < r.pagina_blocos.length) {
                    var tmp = r.pagina_blocos[idxB];
                    r.pagina_blocos[idxB] = r.pagina_blocos[alvoIdx];
                    r.pagina_blocos[alvoIdx] = tmp;
                    redesenharBlocos();
                }
                return;
            }
            if (e.target.closest('[data-bloco-excluir]')) {
                r.pagina_blocos.splice(idxB, 1);
                redesenharBlocos();
                return;
            }
            if (e.target.closest('[data-bloco-upload]')) {
                blocoUploadPendente = idxB;
                $('bloco-file').click();
                return;
            }
            return;
        }

        var addB = e.target.closest('[data-add-bloco]');
        if (addB) {
            r.pagina_blocos.push(novoBloco(addB.getAttribute('data-add-bloco')));
            redesenharBlocos();
            return;
        }

        var ic = e.target.closest('[data-icone]');
        if (ic) {
            r.botao_icone = ic.getAttribute('data-icone');
            Array.prototype.forEach.call(alvo.querySelectorAll('[data-icone]'), function (b) {
                b.classList.toggle('on', b === ic);
            });
            return desenharPrevia();
        }

        var st = e.target.closest('[data-status]');
        if (st) {
            var s = st.getAttribute('data-status');
            r.ativo = s !== 'inativo';
            r.oculto = s === 'oculto';
            Array.prototype.forEach.call(alvo.querySelectorAll('[data-status]'), function (b) {
                b.classList.toggle('on', b === st);
            });
            $('e-selo-status').innerHTML = seloStatus(s);
            return desenharPrevia();
        }

        var tg = e.target.closest('[data-tag]');
        if (tg) {
            var p = tg.getAttribute('data-tag');
            r.palavras = (r.palavras || '').split(/\s+/).filter(function (x) { return x && x !== p; }).join(' ');
            tg.parentNode.remove();
            return;
        }
    });

    var entradaTag = $('e-tag');
    entradaTag.onkeydown = function (e) {
        if (e.key !== 'Enter' && e.key !== ',') return;
        e.preventDefault();
        var v = semAcento(entradaTag.value.trim()).replace(/[^a-z0-9-]/g, '');
        if (!v) return;
        var atuais = (r.palavras || '').split(/\s+/).filter(Boolean);
        if (atuais.indexOf(v) === -1) {
            atuais.push(v);
            r.palavras = atuais.join(' ');
            var s = document.createElement('span');
            s.className = 'tag';
            s.innerHTML = esc(v) + '<button type="button" data-tag="' + esc(v) + '" aria-label="Remover">' + svg(ICO.xis, 10, 2.6) + '</button>';
            entradaTag.parentNode.insertBefore(s, entradaTag);
        }
        entradaTag.value = '';
    };

    $('e-enviar').onclick = function () { $('e-file').click(); };
    $('e-file').onchange = function () {
        var f = this.files[0];
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) return recado('Imagem acima de 3 MB. Reduza antes de enviar.', true);
        var fr = new FileReader();
        fr.onload = function () {
            api('POST', 'upload', { nome: f.name, dados: String(fr.result) }).then(function (j) {
                r.thumb_tipo = 'imagem';
                r.thumb_imagem = j.caminho;
                r.thumb_svg = '';
                $('e-img-nome').textContent = j.caminho + ' · ' + Math.round(j.tamanho / 1024) + ' KB';
                desenharPrevia();
                recado('Imagem enviada.');
            }).catch(function (e) { recado(e.message, true); });
        };
        fr.readAsDataURL(f);
        this.value = '';
    };
    $('e-limpar-img').onclick = function () {
        r.thumb_imagem = ''; r.thumb_svg = ''; r.thumb_tipo = 'nenhum';
        $('e-img-nome').textContent = 'Nenhuma imagem';
        desenharPrevia();
    };

    var arquivoBloco = $('bloco-file');
    if (arquivoBloco) {
        arquivoBloco.onchange = function () {
            var f = this.files[0];
            this.value = '';
            if (!f || blocoUploadPendente == null) return;
            if (f.size > 3 * 1024 * 1024) return recado('Imagem acima de 3 MB. Reduza antes de enviar.', true);
            var idx = blocoUploadPendente;
            var fr = new FileReader();
            fr.onload = function () {
                api('POST', 'upload', { nome: f.name, dados: String(fr.result) }).then(function (j) {
                    r.pagina_blocos[idx].url = j.caminho;
                    redesenharBlocos();
                    recado('Imagem enviada.');
                }).catch(function (e) { recado(e.message, true); });
            };
            fr.readAsDataURL(f);
        };
    }
}

function desenharPrevia() {
    var r = rascunho;
    var cat = dados.categorias.filter(function (c) { return c.id === r.categoria_id; })[0];
    var s = statusDe(r);

    var dentro = '';
    if (r.thumb_tipo === 'svg' && r.thumb_svg) dentro = r.thumb_svg;
    else if (r.thumb_tipo === 'imagem' && r.thumb_imagem) dentro = '<img src="' + esc(r.thumb_imagem) + '" alt="">';
    else dentro = esc(siglaDe(r.titulo || 'AP'));

    $('e-previa').innerHTML =
        '<div class="previa-thumb" style="background:' + esc(r.thumb_fundo || '#fff') + '">' + dentro + '</div>'
        + '<div class="previa-corpo">'
        + '<div class="previa-meta">'
        + '<span class="cat-l"><i style="background:' + esc(cat ? cat.cor : '#c3cbd6') + '"></i>' + esc(cat ? cat.nome : 'sem categoria') + '</span>'
        + (r.selo ? '<span class="previa-pill">' + esc(r.selo) + '</span>' : '')
        + '</div>'
        + '<div class="previa-h">' + esc(r.titulo || 'Título do recurso') + '</div>'
        + '<div class="previa-p">' + esc(r.descricao || 'A descrição aparece aqui, com duas ou três linhas explicando o que o agente faz.') + '</div>'
        + '<div class="previa-btn' + (r.botao_ativo && r.url ? '' : ' off') + '">'
        + (r.botao_ativo && r.url ? iconeDoBotao(r.botao_icone, 16) + esc(r.botao_rotulo)
            : svg(ICO.chave, 15, 1.8) + esc(r.botao_off || 'Em breve'))
        + '</div>'
        + (r.pagina_ativa ? '<div style="text-align:center;margin-top:8px;font-size:11.5px;color:var(--text-muted)">+ link "Ver tutorial e detalhes" abaixo do botão</div>' : '')
        + '</div>';

    var previaImg = $('e-img-previa');
    if (previaImg) previaImg.innerHTML = dentro;

    $('e-nota').textContent = TEXTO_STATUS[s]
        + (r.botao_ativo && !r.url ? ' Atenção: o botão está habilitado mas o endereço está vazio — ele vai aparecer desligado.' : '');
    var txt = $('e-status-txt');
    if (txt) txt.textContent = TEXTO_STATUS[s];
}

function salvarRecurso() {
    var r = rascunho;
    if (!r.titulo.trim()) {
        recado('Informe o título do recurso.', true);
        var t = $('e-titulo'); t.classList.add('ruim'); t.focus();
        return;
    }

    var b = $('salvar');
    b.disabled = true;
    b.innerHTML = svg(ICO.girando, 15, 2).replace('<svg', '<svg class="girando"') + ' Salvando…';

    var novo = r.id == null;
    var p = novo ? api('POST', 'recursos', r) : api('PUT', 'recursos/' + r.id, r);

    p.then(function () {
        rascunho = null;
        return carregar();
    }).then(function () {
        irPara('recursos', {});
        recado(novo ? 'Recurso criado e publicado.' : 'Alterações publicadas na página.');
    }).catch(function (e) {
        b.disabled = false;
        b.innerHTML = svg(ICO.check, 15, 2) + ' Salvar e publicar';
        recado(e.message, true);
    });
}

// ═══════════════════════════════════════════════════════
//  TELA: PÁGINA INICIAL
// ═══════════════════════════════════════════════════════

var cfgRascunho = null;

function telaPagina() {
    if (!cfgRascunho) cfgRascunho = Object.assign({}, dados.config);
    var c = cfgRascunho;

    $('migalha').textContent = 'Conteúdo';
    $('titulo').textContent = 'Página inicial';
    $('acoes-topo').innerHTML =
        '<button class="btn btn-2" id="p-desfazer">Descartar</button>'
        + '<button class="btn btn-1" id="p-salvar">' + svg(ICO.check, 15, 2) + ' Salvar e publicar</button>';

    var cats = dados.categorias.map(function (cat) {
        return '<div class="cat-linha' + (cat.visivel ? '' : ' desligada') + '" data-cat="' + cat.id + '" draggable="true">'
            + '<span class="alca">' + svg(ICO.alca, 13, 1.9) + '</span>'
            + '<span class="ponto-cor" style="background:' + esc(cat.cor) + '"></span>'
            + '<div class="cat-info"><div class="cat-nome">' + esc(cat.nome) + '</div>'
            + '<div class="cat-det">' + cat.total + (cat.total === 1 ? ' recurso' : ' recursos')
            + (cat.visivel ? '' : ' · oculta no topo') + '</div></div>'
            + '<button class="chave' + (cat.visivel ? ' on' : '') + '" data-cat-chave role="switch" '
            + 'aria-checked="' + !!cat.visivel + '" aria-label="Exibir categoria"><b></b></button>'
            + '<button class="icone-btn" data-cat-editar title="Renomear">' + svg(ICO.lapis, 14) + '</button>'
            + '<button class="icone-btn perigo" data-cat-excluir title="Excluir">' + svg(ICO.lixo, 14) + '</button>'
            + '</div>';
    }).join('');

    alvo.innerHTML =
    '<div class="pilha">'

    + '<div><div class="bloco-tit"><span>Pré-visualização do topo</span></div>'
    + '<div class="hero-previa"><div class="hero-in" id="p-hero"></div></div></div>'

    + '<div class="colunas" style="grid-template-columns:repeat(2,minmax(0,1fr))">'

    + '<section class="bloco"><div class="bloco-tit"><span>Textos do topo</span></div><div class="campos">'
    + '<div class="campo"><label for="p-eyebrow">Linha de apoio</label>'
    + '<input class="entrada" id="p-eyebrow" data-cfg="hero_eyebrow" value="' + esc(c.hero_eyebrow) + '" maxlength="60"></div>'
    + '<div class="campo"><label for="p-titulo">Título principal</label>'
    + '<input class="entrada" id="p-titulo" data-cfg="hero_titulo" value="' + esc(c.hero_titulo) + '" maxlength="60"></div>'
    + '<div class="campo"><label for="p-lede">Texto de apoio</label>'
    + '<textarea class="area" id="p-lede" data-cfg="hero_lede" maxlength="300">' + esc(c.hero_lede) + '</textarea></div>'
    + '<div class="campo"><label for="p-ph">Texto do campo de busca</label>'
    + '<input class="entrada" id="p-ph" data-cfg="busca_placeholder" value="' + esc(c.busca_placeholder) + '" maxlength="80"></div>'
    + '<div class="opcao"><div><div class="opcao-t">Mostrar campo de busca</div>'
    + '<div class="opcao-d">Desligue para deixar apenas os filtros por categoria.</div></div>'
    + '<button type="button" class="chave g' + (c.mostrar_busca === '1' ? ' on' : '') + '" data-cfg-chave="mostrar_busca" role="switch"><b></b></button></div>'
    + '<div class="opcao"><div><div class="opcao-t">Mostrar filtros por categoria</div>'
    + '<div class="opcao-d">As pílulas coloridas logo abaixo da busca.</div></div>'
    + '<button type="button" class="chave g' + (c.mostrar_filtros === '1' ? ' on' : '') + '" data-cfg-chave="mostrar_filtros" role="switch"><b></b></button></div>'
    + '</div></section>'

    + '<section class="bloco"><div class="bloco-tit"><span>Categorias e filtros</span>'
    + '<button class="btn btn-2 btn-mini" id="p-nova-cat">' + svg(ICO.mais, 13, 2.2) + ' Nova categoria</button></div>'
    + '<div class="campos" id="p-cats">' + cats + '</div>'
    + '<div class="nota" style="border:0;box-shadow:none;padding:14px 0 0;background:transparent">' + svg(ICO.info, 14)
    + '<span>Uma categoria desligada some do topo da página, e os recursos dela passam a aparecer só no filtro '
    + '<b style="color:var(--text-body)">Todos</b>. Categorias com recursos não podem ser excluídas.</span></div>'
    + '</section>'

    + '</div>'

    + '<section class="bloco"><div class="bloco-tit"><span>Aviso e rodapé</span></div>'
    + '<div class="colunas" style="grid-template-columns:repeat(2,minmax(0,1fr))">'
    + '<div class="campos">'
    + '<div class="campo"><label for="p-aviso">Aviso no fim da lista</label>'
    + '<textarea class="area" id="p-aviso" data-cfg="aviso_texto" maxlength="400">' + esc(c.aviso_texto) + '</textarea>'
    + '<div class="dica">Aceita <b>&lt;b&gt;</b> para negrito e links em &lt;a href=""&gt;.</div></div>'
    + '<div class="opcao"><div><div class="opcao-t">Exibir o aviso</div>'
    + '<div class="opcao-d">Some da página quando não houver mais nada pendente de liberação.</div></div>'
    + '<button type="button" class="chave g' + (c.mostrar_aviso === '1' ? ' on' : '') + '" data-cfg-chave="mostrar_aviso" role="switch"><b></b></button></div>'
    + '</div>'
    + '<div class="campos">'
    + '<div class="campo"><label for="p-email">E-mail de contato do rodapé</label>'
    + '<input class="entrada" id="p-email" data-cfg="contato_email" value="' + esc(c.contato_email) + '"></div>'
    + '<div class="duplo">'
    + '<div class="campo"><label for="p-m1">Marca 1</label><input class="entrada" id="p-m1" data-cfg="marca_1" value="' + esc(c.marca_1) + '" maxlength="24"></div>'
    + '<div class="campo"><label for="p-m2">Marca 2</label><input class="entrada" id="p-m2" data-cfg="marca_2" value="' + esc(c.marca_2) + '" maxlength="24"></div>'
    + '</div>'
    + '<div class="campo"><label for="p-sug">Texto do link "sugerir"</label>'
    + '<input class="entrada" id="p-sug" data-cfg="link_sugestao_rotulo" value="' + esc(c.link_sugestao_rotulo) + '" maxlength="40"></div>'
    + '<div class="campo"><label for="p-meta">Descrição para buscadores</label>'
    + '<input class="entrada" id="p-meta" data-cfg="pagina_descricao" value="' + esc(c.pagina_descricao) + '" maxlength="180"></div>'
    + '</div></div></section>'

    + '</div>';

    desenharHero();

    alvo.oninput = (function (e) {
        var k = e.target.getAttribute && e.target.getAttribute('data-cfg');
        if (!k) return;
        c[k] = e.target.value;
        desenharHero();
    });

    alvo.onclick = (function (e) {
        var ch = e.target.closest('[data-cfg-chave]');
        if (ch) {
            var k = ch.getAttribute('data-cfg-chave');
            c[k] = c[k] === '1' ? '0' : '1';
            ch.classList.toggle('on', c[k] === '1');
            return desenharHero();
        }
    });

    $('p-salvar').onclick = function () {
        var b = this;
        b.disabled = true;
        api('PUT', 'config', c).then(function () {
            cfgRascunho = null;
            return recarregar();
        }).then(function () { recado('Página inicial atualizada.'); })
          .catch(function (er) { b.disabled = false; recado(er.message, true); });
    };
    $('p-desfazer').onclick = function () {
        cfgRascunho = null;
        desenhar();
        recado('Alterações descartadas.');
    };

    ligarCategorias();
}

function desenharHero() {
    var c = cfgRascunho;
    var lista = dados.recursos.filter(function (r) { return statusDe(r) === 'ativo'; });
    var chips = '<span class="hero-chip on">Todos <small>' + lista.length + '</small></span>';
    dados.categorias.forEach(function (cat) {
        if (!cat.visivel) return;
        var n = lista.filter(function (r) { return r.cat_slug === cat.slug; }).length;
        if (!n) return;
        chips += '<span class="hero-chip">' + esc(cat.nome) + ' <small>' + n + '</small></span>';
    });

    $('p-hero').innerHTML =
        '<div class="hero-eyebrow">' + esc(c.hero_eyebrow) + '</div>'
        + '<div class="hero-h">' + esc(c.hero_titulo) + '</div>'
        + '<div class="hero-lede">' + esc(c.hero_lede) + '</div>'
        + (c.mostrar_busca === '1' ? '<div class="hero-busca">'
            + svg('<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>', 16, 1.8)
            + esc(c.busca_placeholder) + '</div>' : '')
        + (c.mostrar_filtros === '1' ? '<div class="hero-chips">' + chips + '</div>' : '');
}

function ligarCategorias() {
    var caixa = $('p-cats');

    $('p-nova-cat').onclick = function () {
        var nome = prompt('Nome da nova categoria:');
        if (!nome || !nome.trim()) return;
        api('POST', 'categorias', { nome: nome.trim(), cor: '#3b7dd8', visivel: 1 })
            .then(recarregar).then(function () { recado('Categoria criada.'); })
            .catch(function (e) { recado(e.message, true); });
    };

    caixa.onclick = function (e) {
        var linha = e.target.closest('[data-cat]');
        if (!linha) return;
        var id = Number(linha.getAttribute('data-cat'));
        var cat = dados.categorias.filter(function (c) { return c.id === id; })[0];

        if (e.target.closest('[data-cat-chave]')) {
            return api('PUT', 'categorias/' + id, { visivel: cat.visivel ? 0 : 1 })
                .then(recarregar).then(function () {
                    recado('Categoria "' + cat.nome + '" ' + (cat.visivel ? 'oculta' : 'visível') + ' no topo.');
                }).catch(function (er) { recado(er.message, true); });
        }

        if (e.target.closest('[data-cat-editar]')) {
            var nome = prompt('Nome da categoria:', cat.nome);
            if (nome === null) return;
            var cor = prompt('Cor do ponto (hex):', cat.cor);
            if (cor === null) return;
            return api('PUT', 'categorias/' + id, { nome: nome.trim(), cor: cor.trim(), visivel: cat.visivel })
                .then(recarregar).then(function () { recado('Categoria atualizada.'); })
                .catch(function (er) { recado(er.message, true); });
        }

        if (e.target.closest('[data-cat-excluir]')) {
            return confirmar('Excluir "' + cat.nome + '"?',
                cat.total > 0
                    ? 'Esta categoria ainda tem ' + cat.total + ' recurso(s). Mova-os para outra antes de excluir.'
                    : 'A categoria some do topo da página. Não dá para desfazer.',
                'Excluir', true).then(function (ok) {
                if (!ok) return;
                return api('DELETE', 'categorias/' + id).then(recarregar)
                    .then(function () { recado('Categoria excluída.'); });
            }).catch(function (er) { recado(er.message, true); });
        }
    };

    var arr = null;
    caixa.addEventListener('dragstart', function (e) {
        var l = e.target.closest('[data-cat]');
        if (l) { arr = l; l.style.opacity = '0.4'; }
    });
    caixa.addEventListener('dragend', function () { if (arr) arr.style.opacity = ''; arr = null; });
    caixa.addEventListener('dragover', function (e) { e.preventDefault(); });
    caixa.addEventListener('drop', function (e) {
        e.preventDefault();
        var l = e.target.closest('[data-cat]');
        if (!l || !arr || l === arr) return;
        var ids = Array.prototype.map.call(caixa.querySelectorAll('[data-cat]'), function (x) {
            return Number(x.getAttribute('data-cat'));
        });
        var de = ids.indexOf(Number(arr.getAttribute('data-cat')));
        var para = ids.indexOf(Number(l.getAttribute('data-cat')));
        ids.splice(para, 0, ids.splice(de, 1)[0]);
        api('POST', 'categorias/ordem', { ids: ids }).then(recarregar)
            .then(function () { recado('Ordem das categorias atualizada.'); })
            .catch(function (er) { recado(er.message, true); });
    });
}

// ═══════════════════════════════════════════════════════
//  TELA: IMAGENS
// ═══════════════════════════════════════════════════════

function telaMidia() {
    $('migalha').textContent = 'Conteúdo';
    $('titulo').textContent = 'Imagens';
    $('acoes-topo').innerHTML = '<button class="btn btn-ok" id="m-enviar">' + svg(ICO.subir, 15, 1.8) + ' Enviar imagem</button>'
        + '<input type="file" id="m-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>';

    alvo.innerHTML = '<div class="carregando">' + svg(ICO.girando, 18, 2).replace('<svg', '<svg class="girando"') + ' Carregando imagens…</div>';

    $('m-enviar').onclick = function () { $('m-file').click(); };
    $('m-file').onchange = function () {
        var f = this.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
            api('POST', 'upload', { nome: f.name, dados: String(fr.result) })
                .then(function () { recado('Imagem enviada.'); desenhar(); })
                .catch(function (e) { recado(e.message, true); });
        };
        fr.readAsDataURL(f);
        this.value = '';
    };

    api('GET', 'midia').then(function (j) {
        if (tela !== 'midia') return;
        var usos = {};
        dados.recursos.forEach(function (r) { if (r.thumb_imagem) usos[r.thumb_imagem] = r.titulo; });

        if (!j.arquivos.length) {
            alvo.innerHTML = '<div class="quadro"><div class="vazio">'
                + svg('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.7"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>', 30, 1.6)
                + '<h4>Nenhuma imagem enviada ainda</h4>'
                + '<p>As imagens enviadas pelo editor de recursos aparecem aqui.</p></div></div>';
            return;
        }

        alvo.innerHTML = '<div class="quadro"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;padding:20px">'
            + j.arquivos.map(function (a) {
                return '<div style="border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg-sub)">'
                    + '<div style="height:120px;display:flex;align-items:center;justify-content:center;background:#fff;border-bottom:1px solid var(--line)">'
                    + '<img src="' + esc(a.caminho) + '" alt="" style="max-width:82%;max-height:82%;object-fit:contain"></div>'
                    + '<div style="padding:11px 13px">'
                    + '<div style="font-size:12px;font-weight:600;color:var(--text-body);word-break:break-all;line-height:1.4">' + esc(a.nome) + '</div>'
                    + '<div style="font-size:11px;color:var(--text-soft);margin-top:3px">' + Math.round(a.tamanho / 1024) + ' KB · ' + quando(a.quando) + '</div>'
                    + (usos[a.caminho]
                        ? '<div style="font-size:11px;color:var(--ok-fg);margin-top:6px;font-weight:500">Em uso: ' + esc(usos[a.caminho]) + '</div>'
                        : '<div style="font-size:11px;color:var(--text-soft);margin-top:6px">Sem uso</div>')
                    + '</div></div>';
            }).join('')
            + '</div></div>';
    }).catch(function (e) { recado(e.message, true); });
}

// ═══════════════════════════════════════════════════════
//  TELA: USUÁRIOS
// ═══════════════════════════════════════════════════════

function telaUsuarios() {
    $('migalha').textContent = 'Administração';
    $('titulo').textContent = 'Usuários e acessos';
    $('acoes-topo').innerHTML = '<button class="btn btn-ok" id="u-novo">' + svg(ICO.mais, 16, 2.1) + ' Novo usuário</button>';

    var linhas = (dados.usuarios || []).map(function (u) {
        return '<div class="linha" data-u="' + u.id + '">'
            + '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0' + (u.ativo ? '' : ';opacity:0.55') + '">'
            + '<div class="avatar" style="background:' + (u.papel === 'admin' ? '#2a5298;color:#fff' : '#eef1f5;color:#7a8899') + '">'
            + esc(siglaDe(u.nome)) + '</div>'
            + '<div style="min-width:0"><div class="nome-t">' + esc(u.nome) + '</div>'
            + '<div class="nome-u">' + esc(u.email) + '</div></div></div>'
            + '<div style="width:130px;flex-shrink:0"><span class="cat-l">' + (u.papel === 'admin' ? 'Administrador' : 'Editor') + '</span></div>'
            + '<div style="width:160px;flex-shrink:0;font-size:12px;color:var(--text-muted)">'
            + (u.ultimo_acesso ? 'Último acesso ' + quando(u.ultimo_acesso) : 'Nunca entrou') + '</div>'
            + '<div style="width:108px;flex-shrink:0">'
            + (u.ativo ? '<span class="selo selo-ativo"><i></i>Ativo</span>' : '<span class="selo selo-inativo"><i></i>Inativo</span>')
            + '</div>'
            + '<div class="c-acoes" style="width:130px">'
            + '<button class="btn btn-2 btn-mini" data-u-senha>Redefinir senha</button>'
            + '<button class="icone-btn' + (u.ativo ? ' perigo' : '') + '" data-u-ativo title="'
            + (u.ativo ? 'Desativar acesso' : 'Reativar acesso') + '">'
            + svg(u.ativo ? ICO.olhoCortado : ICO.check, 15) + '</button>'
            + '</div></div>';
    }).join('');

    alvo.innerHTML = '<div class="quadro"><div id="u-linhas">' + linhas + '</div>'
        + '<div class="rodape-quadro">' + svg(ICO.info, 14)
        + '<span>Desativar encerra as sessões abertas da pessoa na hora. Redefinir a senha gera uma provisória, '
        + 'que ela é obrigada a trocar no primeiro acesso.</span></div></div>'
        + '<div class="bloco" style="margin-top:18px;max-width:520px">'
        + '<div class="bloco-tit"><span>Minha senha</span></div>'
        + '<div class="campos">'
        + '<div class="campo"><label for="u-atual">Senha atual</label><input class="entrada" type="password" id="u-atual" autocomplete="current-password"></div>'
        + '<div class="duplo">'
        + '<div class="campo"><label for="u-nova">Nova senha</label><input class="entrada" type="password" id="u-nova" autocomplete="new-password"></div>'
        + '<div class="campo"><label for="u-rep">Repetir</label><input class="entrada" type="password" id="u-rep" autocomplete="new-password"></div>'
        + '</div>'
        + '<div class="dica" id="u-erro">Mínimo de 10 caracteres, misturando letras e números.</div>'
        + '<div><button class="btn btn-1" id="u-trocar">Trocar minha senha</button></div>'
        + '</div></div>';

    $('u-novo').onclick = function () {
        var nome = prompt('Nome da pessoa:');
        if (!nome || !nome.trim()) return;
        var email = prompt('E-mail corporativo:');
        if (!email || !email.trim()) return;
        var admin = confirm('Dar permissão de administrador?\n\nOK = administrador (gerencia usuários)\nCancelar = editor (só conteúdo)');
        api('POST', 'usuarios', { nome: nome.trim(), email: email.trim(), papel: admin ? 'admin' : 'editor' })
            .then(function (j) {
                avisoSenha(j.senhaProvisoria, nome.trim());
                return recarregar();
            }).catch(function (e) { recado(e.message, true); });
    };

    $('u-linhas').onclick = function (e) {
        var linha = e.target.closest('[data-u]');
        if (!linha) return;
        var id = Number(linha.getAttribute('data-u'));
        var u = dados.usuarios.filter(function (x) { return x.id === id; })[0];

        if (e.target.closest('[data-u-senha]')) {
            return confirmar('Redefinir a senha de ' + u.nome + '?',
                'A senha atual deixa de funcionar na hora e as sessões abertas são encerradas.',
                'Redefinir').then(function (ok) {
                if (!ok) return;
                return api('POST', 'usuarios/' + id + '/senha').then(function (j) {
                    avisoSenha(j.senhaProvisoria, u.nome);
                    return recarregar();
                });
            }).catch(function (er) { recado(er.message, true); });
        }

        if (e.target.closest('[data-u-ativo]')) {
            return confirmar((u.ativo ? 'Desativar ' : 'Reativar ') + u.nome + '?',
                u.ativo ? 'A pessoa perde o acesso ao painel imediatamente.' : 'A pessoa volta a poder entrar com a senha atual.',
                u.ativo ? 'Desativar' : 'Reativar', u.ativo).then(function (ok) {
                if (!ok) return;
                return api('DELETE', 'usuarios/' + id).then(recarregar)
                    .then(function () { recado('Acesso atualizado.'); });
            }).catch(function (er) { recado(er.message, true); });
        }
    };

    $('u-trocar').onclick = function () {
        var erro = $('u-erro');
        if ($('u-nova').value !== $('u-rep').value) {
            erro.className = 'dica erro';
            erro.textContent = 'As duas senhas novas não batem.';
            return;
        }
        var b = this;
        b.disabled = true;
        api('POST', 'senha', { atual: $('u-atual').value, nova: $('u-nova').value }).then(function () {
            recado('Sua senha foi trocada.');
            desenhar();
        }).catch(function (e) {
            b.disabled = false;
            erro.className = 'dica erro';
            erro.textContent = e.message;
        });
    };
}

// ═══════════════════════════════════════════════════════
//  TELA: MENSAGENS
// ═══════════════════════════════════════════════════════

var ROTULO_TIPO_MSG = { sugestao: 'Sugestão', duvida: 'Dúvida' };

function telaMensagens() {
    $('migalha').textContent = 'Conteúdo';
    $('titulo').textContent = 'Mensagens';
    $('acoes-topo').innerHTML = '';

    var lista = dados.mensagens || [];
    var naoLidas = lista.filter(function (m) { return !m.lida; }).length;

    var itens = lista.map(function (m) {
        var quem = m.nome && m.email ? (m.nome + ' <' + m.email + '>')
            : (m.nome || m.email || 'Visitante anônimo');
        return '<div class="msg-item' + (m.lida ? ' lida' : '') + '" data-msg="' + m.id + '">'
            + '<div class="msg-cab">'
            + '<span class="selo selo-' + m.tipo + '"><i></i>' + (ROTULO_TIPO_MSG[m.tipo] || m.tipo) + '</span>'
            + '<span class="msg-quem">' + esc(quem) + '</span>'
            + '<span class="msg-quando">' + quando(m.criado_em) + '</span>'
            + '<div style="flex:1"></div>'
            + '<button class="icone-btn' + (m.lida ? '' : ' aceso') + '" data-msg-lida title="' + (m.lida ? 'Marcar como não lida' : 'Marcar como lida') + '">'
            + svg(m.lida ? ICO.olho : ICO.check, 14) + '</button>'
            + '<button class="icone-btn perigo" data-msg-excluir title="Excluir">' + svg(ICO.lixo, 14) + '</button>'
            + '</div>'
            + '<p class="msg-corpo">' + esc(m.mensagem) + '</p>'
            + (m.email ? '<a class="msg-responder" href="mailto:' + esc(m.email) + '?subject=' + encodeURIComponent('Re: sua mensagem no Agentes Pro') + '">'
                + svg(ICO.externo, 12, 1.8) + ' Responder por e-mail</a>' : '')
            + '</div>';
    }).join('');

    alvo.innerHTML =
        '<div class="resumo" style="margin-bottom:16px">'
        + '<span class="resumo-n"><b>' + lista.length + '</b> ' + (lista.length === 1 ? 'mensagem recebida' : 'mensagens recebidas') + '</span>'
        + (naoLidas > 0 ? '<span class="resumo-i"><i style="background:#3b7dd8"></i>' + naoLidas + (naoLidas === 1 ? ' não lida' : ' não lidas') + '</span>' : '')
        + '</div>'
        + (itens || '<div class="quadro"><div class="vazio">' + svg('<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M3 7l9 6 9-6"/>', 30, 1.6)
            + '<h4>Nenhuma mensagem ainda</h4><p>Mensagens enviadas pelos links "Sugerir um agente" e "Dúvidas e sugestões" do site aparecem aqui.</p></div></div>');

    alvo.onclick = function (e) {
        var item = e.target.closest('[data-msg]');
        if (!item) return;
        var id = Number(item.getAttribute('data-msg'));

        if (e.target.closest('[data-msg-lida]')) {
            return api('POST', 'mensagens/' + id + '/lida').then(recarregar).catch(function (er) { recado(er.message, true); });
        }
        if (e.target.closest('[data-msg-excluir]')) {
            return confirmar('Excluir esta mensagem?', 'Não dá para desfazer.', 'Excluir', true).then(function (ok) {
                if (!ok) return;
                return api('DELETE', 'mensagens/' + id).then(recarregar).then(function () { recado('Mensagem excluída.'); });
            }).catch(function (er) { recado(er.message, true); });
        }
    };
}

// ═══════════════════════════════════════════════════════
//  TELA: HISTÓRICO
// ═══════════════════════════════════════════════════════

function telaHistorico() {
    $('migalha').textContent = 'Administração';
    $('titulo').textContent = 'Registro de alterações';
    $('acoes-topo').innerHTML = '';

    var linhas = dados.historico.map(function (l) {
        return '<div class="log-linha">'
            + '<span class="log-quando">' + quando(l.quando) + '</span>'
            + '<span class="log-quem">' + esc(l.usuario) + '</span>'
            + '<span class="log-txt">' + esc(l.acao) + ' <b>' + esc(l.alvo) + '</b>'
            + (l.detalhe ? ' <small>· ' + esc(l.detalhe) + '</small>' : '') + '</span>'
            + '</div>';
    }).join('');

    alvo.innerHTML = '<div class="quadro" style="padding:8px 20px">'
        + (linhas || '<div class="vazio"><h4>Nada registrado ainda</h4><p>Cada publicação aparece aqui com autor e horário.</p></div>')
        + '</div>';
}

// ═══════════════════════════════════════════════════════
//  NAVEGAÇÃO
// ═══════════════════════════════════════════════════════

var TELAS = {
    recursos: telaRecursos,
    editor: telaEditor,
    pagina: telaPagina,
    mensagens: telaMensagens,
    midia: telaMidia,
    usuarios: telaUsuarios,
    historico: telaHistorico
};

function irPara(nome, ctx) {
    tela = nome;
    contexto = ctx || {};
    if (nome !== 'editor') rascunho = null;
    if (nome !== 'pagina') cfgRascunho = null;

    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (b) {
        var t = b.getAttribute('data-tela');
        b.classList.toggle('on', t === nome || (nome === 'editor' && t === 'recursos'));
    });
    $('lateral').classList.remove('aberta');
    window.scrollTo(0, 0);
    desenhar();
}

function desenhar() {
    if (!dados) return;
    // Cada tela religa o que precisa; zerar aqui evita que um handler
    // de uma tela continue pendurado em <main> depois da troca.
    alvo.oninput = null;
    alvo.onchange = null;
    alvo.onclick = null;
    (TELAS[tela] || telaRecursos)();
}

// ── partida ─────────────────────────────────────────────

$('nav').onclick = function (e) {
    var b = e.target.closest('[data-tela]');
    if (b) irPara(b.getAttribute('data-tela'), {});
};

$('sair').onclick = function () {
    confirmar('Sair do painel?', 'Você precisará entrar de novo com e-mail e senha.', 'Sair')
        .then(function (ok) {
            if (!ok) return;
            api('POST', 'sair').then(function () { window.location.href = '/admin/entrar'; });
        });
};

$('menu').onclick = function () { $('lateral').classList.toggle('aberta'); };

function ajustarMenu() {
    $('menu').style.display = window.innerWidth <= 900 ? 'inline-flex' : 'none';
}
window.addEventListener('resize', ajustarMenu);
ajustarMenu();

carregar().then(desenhar).catch(function (e) {
    if (e.message === 'sessão') return;
    alvo.innerHTML = '<div class="vazio"><h4>Não foi possível carregar o painel</h4><p>' + esc(e.message) + '</p></div>';
});

})();
