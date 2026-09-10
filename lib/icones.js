'use strict';

/*
 * Biblioteca de ícones dos botões dos cards.
 * Cada entrada guarda só o miolo do SVG; o invólucro é montado em render.js
 * com viewBox 0 0 24 24, stroke currentColor e traço 1.7 — igual ao que a
 * página já usava. Para acrescentar um ícone novo basta somar uma entrada
 * aqui: ele aparece sozinho na lista do painel.
 */

const ICONES = {
  link: {
    rotulo: 'Link externo',
    svg: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'
  },
  robo: {
    rotulo: 'Robô / agente',
    svg: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4.6V8M8.6 13.4h.01M15.4 13.4h.01M9.5 16.8h5"/><circle cx="12" cy="3.4" r="1.2"/>'
  },
  caminhao: {
    rotulo: 'Caminhão / frete',
    svg: '<path d="M2.5 7.5h10v9h-10z"/><path d="M12.5 11h4l3 3v2.5h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>'
  },
  kanban: {
    rotulo: 'Quadro / kanban',
    svg: '<rect x="3.5" y="4" width="5.5" height="16" rx="1.6"/><rect x="11" y="4" width="5.5" height="10" rx="1.6"/><rect x="18.5" y="4" width="2" height="7" rx="1"/>'
  },
  download: {
    rotulo: 'Download / instalador',
    svg: '<path d="M12 3.5v10.5M8 10.5l4 4 4-4"/><path d="M4.5 17.5v1.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-1.2"/>'
  },
  cadeado: {
    rotulo: 'Cadeado / acesso restrito',
    svg: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>'
  },
  conversa: {
    rotulo: 'Conversa / assistente',
    svg: '<path d="M20.5 12.5c0 4-3.8 7-8.5 7-1 0-2-.15-2.9-.42L4 20.5l1.5-3.6C4.2 15.7 3.5 14.2 3.5 12.5c0-4 3.8-7 8.5-7s8.5 3 8.5 7z"/>'
  },
  grafico: {
    rotulo: 'Gráfico / relatório',
    svg: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16.5v-5M12.5 16.5v-9M17 16.5v-6.5"/>'
  },
  planilha: {
    rotulo: 'Planilha',
    svg: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9.5 9.5v10M3.5 14.5h17"/>'
  },
  busca: {
    rotulo: 'Busca / consulta',
    svg: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>'
  },
  raio: {
    rotulo: 'Automação',
    svg: '<path d="M13.5 3 5 13.5h6L10.5 21 19 10.5h-6z"/>'
  },
  engrenagem: {
    rotulo: 'Ferramenta / configuração',
    svg: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6"/>'
  },
  documento: {
    rotulo: 'Documento',
    svg: '<path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5v5h5M9 13h6M9 16.5h4"/>'
  }
};

const PADRAO = 'link';

function existe(nome) {
  return Object.prototype.hasOwnProperty.call(ICONES, nome);
}

function miolo(nome) {
  return (ICONES[existe(nome) ? nome : PADRAO]).svg;
}

function lista() {
  return Object.keys(ICONES).map((nome) => ({
    nome,
    rotulo: ICONES[nome].rotulo,
    svg: ICONES[nome].svg
  }));
}

module.exports = { ICONES, PADRAO, existe, miolo, lista };
