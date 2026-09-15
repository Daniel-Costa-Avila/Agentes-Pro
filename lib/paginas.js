'use strict';

/*
 * Página de detalhes de um recurso: os blocos de conteúdo (subtítulo,
 * texto, imagem, vídeo) e o reconhecimento de links de vídeo.
 *
 * Vídeo é sempre por link — YouTube, Vimeo ou Loom, com allowlist
 * fechada. Nada de permitir qualquer domínio num <iframe>: um link
 * fora dessa lista é rejeitado com uma mensagem explicando o porquê.
 */

const fs = require('fs');
const path = require('path');
const { ErroDeDados } = require('./erros');
const { PASTA_DADOS } = require('./db');
const icones = require('./icones');

const PASTA_UPLOADS = path.join(PASTA_DADOS, 'uploads');

const TIPOS = ['titulo', 'texto', 'imagem', 'video', 'aviso', 'passos', 'botao', 'cards'];
const MAX_BLOCOS = 40;
const MAX_TEXTO = 4000;
const MAX_TITULO_BLOCO = 150;
const MAX_LEGENDA = 200;

const TONS_AVISO = ['info', 'atencao', 'ok'];
const ESTILOS_BOTAO = ['principal', 'secundario'];
const ALINHAMENTOS = ['esquerda', 'centro', 'direita'];
const MAX_PASSOS = 15;
const MAX_CARDS = 12;

// Link de botão/card: ou aponta para fora (http/https), ou é um caminho
// interno do próprio site ("/pagina/algo", "/#ancora"). Qualquer outro
// esquema — javascript:, data:, file: — é recusado, porque esse valor vai
// direto para um href renderizado na página pública.
function validarLink(bruto, ondeEstou) {
  const url = String(bruto || '').trim();
  if (!url) throw new ErroDeDados(`${ondeEstou}: informe o endereço de destino.`, 'pagina_blocos');
  if (url.startsWith('/') || url.startsWith('#')) return url.slice(0, 400);
  if (/^https?:\/\//i.test(url)) return url.slice(0, 400);
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    throw new ErroDeDados(`${ondeEstou}: use um endereço http:// ou https://.`, 'pagina_blocos');
  }
  return `https://${url}`.slice(0, 400);
}

function escolha(valor, permitidos, padrao) {
  return permitidos.includes(valor) ? valor : padrao;
}

function analisarVideo(url) {
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;

  const host = u.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      if (id) return { provedor: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    const m = u.pathname.match(/^\/(embed|shorts)\/([a-zA-Z0-9_-]{6,})/);
    if (m) return { provedor: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${m[2]}` };
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) return { provedor: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return { provedor: 'vimeo', embed: `https://player.vimeo.com/video/${m[1]}` };
  }
  if (host === 'player.vimeo.com') {
    const m = u.pathname.match(/^\/video\/(\d+)/);
    if (m) return { provedor: 'vimeo', embed: `https://player.vimeo.com/video/${m[1]}` };
  }
  if (host === 'loom.com') {
    const m = u.pathname.match(/^\/(share|embed)\/([a-zA-Z0-9]+)/);
    if (m) return { provedor: 'loom', embed: `https://www.loom.com/embed/${m[2]}` };
  }
  return null;
}

// Referência do formato de imagem aceito: mesma pasta /midia/ que o
// upload de recursos já usa — nenhum caminho arbitrário é aceito aqui.
const IMAGEM_MIDIA = /^\/midia\/[a-z0-9][a-z0-9._-]*\.(png|jpe?g|gif|webp|svg)$/i;

// `brutos === undefined` = o chamador não mandou blocos nesta gravação
// (por exemplo, só mudou o título do recurso) — quem chama decide manter
// o conteúdo anterior. `null`/outro tipo é erro de verdade.
function normalizarBlocos(brutos) {
  if (brutos === undefined) return undefined;
  if (!Array.isArray(brutos)) throw new ErroDeDados('Lista de blocos inválida.', 'pagina_blocos');
  if (brutos.length > MAX_BLOCOS) {
    throw new ErroDeDados(`Máximo de ${MAX_BLOCOS} blocos por página.`, 'pagina_blocos');
  }

  return brutos.map((b, i) => {
    const n = i + 1;
    const tipo = b && b.tipo;
    if (!TIPOS.includes(tipo)) throw new ErroDeDados(`Bloco ${n}: tipo de conteúdo inválido.`, 'pagina_blocos');

    if (tipo === 'titulo') {
      const t = String(b.texto || '').trim().slice(0, MAX_TITULO_BLOCO);
      if (!t) throw new ErroDeDados(`Bloco ${n} (subtítulo): escreva o texto ou exclua o bloco.`, 'pagina_blocos');
      return { tipo, texto: t };
    }

    if (tipo === 'texto') {
      const t = String(b.texto || '').trim().slice(0, MAX_TEXTO);
      if (!t) throw new ErroDeDados(`Bloco ${n} (texto): escreva o conteúdo ou exclua o bloco.`, 'pagina_blocos');
      return { tipo, texto: t };
    }

    if (tipo === 'imagem') {
      const url = String(b.url || '').trim();
      if (!IMAGEM_MIDIA.test(url)) {
        throw new ErroDeDados(`Bloco ${n} (imagem): envie uma imagem ou exclua o bloco.`, 'pagina_blocos');
      }
      // Confere que o arquivo existe de verdade em /midia/ — o padrão do
      // nome sozinho não garante que alguém realmente fez o upload.
      const arquivo = path.join(PASTA_UPLOADS, url.slice('/midia/'.length));
      if (!fs.existsSync(arquivo)) {
        throw new ErroDeDados(`Bloco ${n} (imagem): a imagem enviada não foi encontrada. Envie de novo.`, 'pagina_blocos');
      }
      return { tipo, url, legenda: String(b.legenda || '').trim().slice(0, MAX_LEGENDA) };
    }

    if (tipo === 'aviso') {
      const t = String(b.texto || '').trim().slice(0, 600);
      if (!t) throw new ErroDeDados(`Bloco ${n} (aviso): escreva o texto ou exclua o bloco.`, 'pagina_blocos');
      return { tipo, texto: t, tom: escolha(b.tom, TONS_AVISO, 'info') };
    }

    if (tipo === 'passos') {
      const brutosItens = Array.isArray(b.itens) ? b.itens : [];
      const itens = brutosItens
        .map((i) => String((i && i.texto) ?? i ?? '').trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, MAX_PASSOS);
      if (!itens.length) {
        throw new ErroDeDados(`Bloco ${n} (passos): escreva pelo menos um passo ou exclua o bloco.`, 'pagina_blocos');
      }
      return { tipo, titulo: String(b.titulo || '').trim().slice(0, MAX_TITULO_BLOCO), itens };
    }

    if (tipo === 'botao') {
      const rotulo = String(b.rotulo || '').trim().slice(0, 60);
      if (!rotulo) throw new ErroDeDados(`Bloco ${n} (botão): escreva o texto do botão.`, 'pagina_blocos');
      const icone = String(b.icone || 'link').trim();
      return {
        tipo,
        rotulo,
        url: validarLink(b.url, `Bloco ${n} (botão)`),
        icone: icones.existe(icone) ? icone : icones.PADRAO,
        estilo: escolha(b.estilo, ESTILOS_BOTAO, 'principal'),
        alinhamento: escolha(b.alinhamento, ALINHAMENTOS, 'esquerda'),
        nova_aba: b.nova_aba === false ? false : true
      };
    }

    if (tipo === 'cards') {
      const brutosItens = Array.isArray(b.itens) ? b.itens : [];
      const itens = brutosItens.slice(0, MAX_CARDS).map((c, j) => {
        const titulo = String((c && c.titulo) || '').trim().slice(0, 90);
        if (!titulo) {
          throw new ErroDeDados(`Bloco ${n} (cards de links), card ${j + 1}: escreva o título.`, 'pagina_blocos');
        }
        const ic = String((c && c.icone) || 'link').trim();
        return {
          titulo,
          texto: String((c && c.texto) || '').trim().slice(0, 200),
          url: validarLink(c && c.url, `Bloco ${n} (cards de links), card ${j + 1}`),
          icone: icones.existe(ic) ? ic : icones.PADRAO
        };
      });
      if (!itens.length) {
        throw new ErroDeDados(`Bloco ${n} (cards de links): adicione pelo menos um card ou exclua o bloco.`, 'pagina_blocos');
      }
      return { tipo, titulo: String(b.titulo || '').trim().slice(0, MAX_TITULO_BLOCO), itens };
    }

    // vídeo
    const url = String(b.url || '').trim();
    const info = analisarVideo(url);
    if (!info) {
      throw new ErroDeDados(
        `Bloco ${n} (vídeo): link não reconhecido. Use um link do YouTube, Vimeo ou Loom.`,
        'pagina_blocos'
      );
    }
    return {
      tipo, url, provedor: info.provedor, embed: info.embed,
      legenda: String(b.legenda || '').trim().slice(0, MAX_LEGENDA)
    };
  });
}

module.exports = { TIPOS, MAX_BLOCOS, MAX_PASSOS, MAX_CARDS, analisarVideo, normalizarBlocos, validarLink };
