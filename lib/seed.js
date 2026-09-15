'use strict';

/*
 * Carga inicial: transfere para o banco o conteúdo que hoje está fixo
 * no agentes-pro.html. Só roda quando as tabelas estão vazias, então
 * pode ser chamada em todo boot sem risco de sobrescrever edições.
 */

const { db } = require('./db');
const { criarSenha } = require('./auth');
const crypto = require('crypto');

const agora = () => new Date().toISOString();

const CONFIG_PADRAO = {
  pagina_titulo: 'Agentes Pro',
  pagina_descricao: 'Central de agentes e automações internas da Probel e Prodormir.',
  hero_eyebrow: 'Central de agentes internos',
  hero_titulo: 'Agentes Pro',
  hero_lede: 'Todas as automações e assistentes da equipe em um só lugar. Busque pelo nome ou filtre por tipo para chegar direto na ferramenta.',
  busca_placeholder: 'Buscar agente: frete, preço, tarefas...',
  mostrar_busca: '1',
  mostrar_filtros: '1',
  aviso_texto: 'Os agentes marcados como <b>Acesso limitado</b> ainda dependem de restrições de compartilhamento definidas pela OpenAI. A liberação será avisada por e-mail.',
  mostrar_aviso: '1',
  contato_email: 'daniel.avila@colchoes.ind.br',
  link_sugestao_rotulo: 'Sugerir um agente',
  destaques_arranjo: '1',
  mostrar_guias: '1',
  guias_titulo: 'Guias e materiais',
  guias_texto: 'Passo a passo, tutoriais e materiais de apoio dos agentes.',
  menu_inicio_rotulo: 'Agentes',
  marca_1: 'Probel',
  marca_2: 'Prodormir'
};

const CATEGORIAS = [
  { slug: 'operacao', nome: 'Operação', cor: '#3b7dd8', ordem: 1 },
  { slug: 'assistentes', nome: 'Assistentes IA', cor: '#1abc9c', ordem: 2 },
  { slug: 'ferramentas', nome: 'Ferramentas', cor: '#f0a500', ordem: 3 }
];

const SVG_KANBAN = `<svg width="200" height="112" viewBox="0 0 220 100" fill="none" aria-hidden="true">
                    <rect x="20" y="20" width="80" height="60" rx="6" fill="none" stroke="#4a7fd4" stroke-width="2"/>
                    <rect x="30" y="32" width="60" height="8" rx="3" fill="#4a7fd4" opacity=".7"/>
                    <rect x="30" y="46" width="40" height="6" rx="3" fill="#4a7fd4" opacity=".4"/>
                    <rect x="30" y="58" width="50" height="6" rx="3" fill="#4a7fd4" opacity=".4"/>
                    <rect x="115" y="15" width="28" height="28" rx="5" fill="#3b7dd8" opacity=".8"/>
                    <rect x="149" y="15" width="28" height="28" rx="5" fill="#1abc9c" opacity=".6"/>
                    <rect x="115" y="50" width="28" height="28" rx="5" fill="#f0a500" opacity=".6"/>
                    <rect x="149" y="50" width="28" height="28" rx="5" fill="#e74c3c" opacity=".5"/>
                </svg>`;

const SVG_RADAR = `<svg width="168" height="112" viewBox="0 0 160 130" fill="none" aria-hidden="true">
                    <circle cx="80" cy="65" r="50" fill="none" stroke="#4a7fd4" stroke-width="1.5" opacity=".4"/>
                    <circle cx="80" cy="65" r="35" fill="none" stroke="#4a7fd4" stroke-width="1.5" opacity=".5"/>
                    <circle cx="80" cy="65" r="20" fill="none" stroke="#4a7fd4" stroke-width="1.5" opacity=".7"/>
                    <ellipse cx="80" cy="65" rx="55" ry="22" fill="none" stroke="#3b7dd8" stroke-width="1" opacity=".3"/>
                    <path d="M80 65 L112 38" stroke="#4a7fd4" stroke-width="1.5" opacity=".5"/>
                    <circle cx="80" cy="65" r="4" fill="#4a7fd4"/>
                    <circle cx="55" cy="45" r="3" fill="#f0a500" opacity=".8"/>
                    <circle cx="105" cy="55" r="2" fill="#1abc9c" opacity=".8"/>
                    <circle cx="70" cy="85" r="2.5" fill="#e74c3c" opacity=".7"/>
                </svg>`;

const SVG_PROFESSOR = `<svg width="168" height="112" viewBox="0 0 160 130" fill="none" aria-hidden="true">
                    <circle cx="80" cy="58" r="30" fill="#1e3a5f" stroke="#4a7fd4" stroke-width="1.5"/>
                    <circle cx="80" cy="49" r="12" fill="#4a7fd4" opacity=".7"/>
                    <path d="M55 77 Q80 98 105 77" fill="#1e3a5f" stroke="#4a7fd4" stroke-width="1.5"/>
                    <circle cx="65" cy="56" r="3" fill="#f0a500"/>
                    <circle cx="95" cy="56" r="3" fill="#f0a500"/>
                    <path d="M72 66 Q80 72 88 66" stroke="#f0a500" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <circle cx="42" cy="36" r="5" fill="#f0a500" opacity=".4"/>
                    <circle cx="118" cy="40" r="4" fill="#1abc9c" opacity=".4"/>
                </svg>`;

const SVG_DESIGNER = `<svg width="168" height="112" viewBox="0 0 160 130" fill="none" aria-hidden="true">
                    <circle cx="80" cy="62" r="40" fill="#1a0500" stroke="#c9a227" stroke-width="2"/>
                    <path d="M80 30 L80 94 M52 62 L108 62" stroke="#c9a227" stroke-width="1.5" opacity=".3"/>
                    <path d="M60 40 L100 84 M100 40 L60 84" stroke="#c9a227" stroke-width="1" opacity=".2"/>
                    <circle cx="80" cy="62" r="19" fill="#2d1000" stroke="#c9a227" stroke-width="1.5"/>
                    <path d="M73 53 L73 71 L88 62 Z" fill="#c9a227"/>
                    <circle cx="80" cy="62" r="5" fill="#f0a500" opacity=".6"/>
                </svg>`;

const RECURSOS = [
  {
    titulo: 'Busca Preço',
    descricao: 'Coleta e compara preços de produtos automaticamente em diferentes fontes e entrega uma planilha pronta de resultados para análise e tomada de decisão.',
    cat: 'operacao',
    url: 'https://buscapreco.promarketing.ind.br/',
    botao_rotulo: 'Acesso Direto',
    botao_icone: 'robo',
    botao_ativo: 1,
    palavras: 'coleta comparacao concorrencia valores planilha',
    thumb_tipo: 'imagem',
    thumb_imagem: 'logo-busca-preco.png',
    thumb_fundo: 'linear-gradient(135deg, #1a1a2e, #16213e)',
    destaque: 1,
    ordem: 0
  },
  {
    titulo: 'Busca Frete',
    descricao: 'Automatiza testes de frete no site, simulando produtos e CEPs, e gera uma planilha com valores e prazos para análise.',
    cat: 'operacao',
    url: 'https://buscafrete.promarketing.ind.br/',
    botao_rotulo: 'Acesso Direto',
    botao_icone: 'caminhao',
    botao_ativo: 1,
    palavras: 'cep transporte prazo entrega simulacao envio planilha',
    thumb_tipo: 'imagem',
    thumb_imagem: 'logo-busca-frete.png',
    thumb_fundo: '#ffffff',
    ordem: 1
  },
  {
    titulo: 'Gerenciador de Tarefas',
    descricao: 'Kanban personalizado para gestão de tarefas, no espírito do Jira e do Trello, adaptado à rotina e aos processos da empresa.',
    cat: 'operacao',
    url: 'https://gerenciador.promarketing.ind.br/',
    botao_rotulo: 'Acesso Direto',
    botao_icone: 'kanban',
    botao_ativo: 1,
    palavras: 'kanban jira trello gestao projetos quadro',
    thumb_tipo: 'svg',
    thumb_svg: SVG_KANBAN,
    thumb_fundo: 'linear-gradient(135deg, #0f3460, #16213e)',
    ordem: 2
  },
  {
    titulo: 'Tampermonkey',
    descricao: 'Extensão de navegador para adicionar e executar scripts personalizados que modificam o funcionamento de sites.',
    cat: 'ferramentas',
    url: 'https://www.tampermonkey.net/',
    botao_rotulo: 'Acesso ao Instalador',
    botao_icone: 'download',
    botao_ativo: 1,
    palavras: 'extensao navegador script javascript userscript instalador',
    thumb_tipo: 'imagem',
    thumb_imagem: 'logo-tampermonkey.png',
    thumb_fundo: '#ffffff',
    ordem: 3
  },
  {
    titulo: 'Radar Global de IA',
    descricao: 'Resumo objetivo dos principais acontecimentos e tendências em Inteligência Artificial, com lançamentos e impactos no mercado.',
    cat: 'assistentes',
    url: '',
    botao_rotulo: 'Acesso Direto',
    botao_icone: 'conversa',
    botao_ativo: 0,
    botao_off: 'Em liberação',
    selo: 'Acesso limitado',
    palavras: 'inteligencia artificial noticias tendencias mercado lancamentos',
    thumb_tipo: 'svg',
    thumb_svg: SVG_RADAR,
    thumb_fundo: 'linear-gradient(160deg, #060d24, #0a1940)',
    ordem: 4
  },
  {
    titulo: 'Professor IA',
    descricao: 'Ensina Inteligência Artificial de forma progressiva, com linguagem acessível, exemplos do dia a dia e aplicações práticas.',
    cat: 'assistentes',
    url: '',
    botao_rotulo: 'Acesso Direto',
    botao_icone: 'conversa',
    botao_ativo: 0,
    botao_off: 'Em liberação',
    selo: 'Acesso limitado',
    palavras: 'inteligencia artificial ensino aula aprendizado curso treinamento',
    thumb_tipo: 'svg',
    thumb_svg: SVG_PROFESSOR,
    thumb_fundo: 'linear-gradient(160deg, #0d1b2a, #1b2838)',
    ordem: 5
  },
  {
    titulo: 'Designer Visual Profissional',
    descricao: 'Criação e edição de imagens com integração ao Photoshop e ao Canva, para materiais visuais com qualidade profissional.',
    cat: 'assistentes',
    url: '',
    botao_rotulo: 'Acesso Direto',
    botao_icone: 'conversa',
    botao_ativo: 0,
    botao_off: 'Em liberação',
    selo: 'Acesso limitado',
    palavras: 'imagens photoshop canva criacao edicao arte material',
    thumb_tipo: 'svg',
    thumb_svg: SVG_DESIGNER,
    thumb_fundo: 'linear-gradient(160deg, #1a0a00, #2d1500)',
    ordem: 6
  }
];

function contar(tabela) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n;
}

function semear() {
  const avisos = [];

  // ── config ────────────────────────────────────────────
  const insConfig = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
  for (const [chave, valor] of Object.entries(CONFIG_PADRAO)) insConfig.run(chave, valor);

  // ── categorias ────────────────────────────────────────
  if (contar('categorias') === 0) {
    const ins = db.prepare('INSERT INTO categorias (slug, nome, cor, ordem, visivel) VALUES (?, ?, ?, ?, 1)');
    for (const c of CATEGORIAS) ins.run(c.slug, c.nome, c.cor, c.ordem);
  }

  // ── recursos ──────────────────────────────────────────
  if (contar('recursos') === 0) {
    const idPorSlug = {};
    for (const c of db.prepare('SELECT id, slug FROM categorias').all()) idPorSlug[c.slug] = c.id;

    const ins = db.prepare(`
      INSERT INTO recursos
        (titulo, descricao, categoria_id, url, botao_rotulo, botao_icone, botao_ativo, botao_off,
         nova_aba, selo, palavras, thumb_tipo, thumb_imagem, thumb_svg, thumb_fundo,
         destaque, ativo, oculto, ordem, criado_em, alterado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
    `);

    const t = agora();
    for (const r of RECURSOS) {
      ins.run(
        r.titulo, r.descricao, idPorSlug[r.cat] ?? null, r.url || '',
        r.botao_rotulo, r.botao_icone, r.botao_ativo, r.botao_off || 'Em breve',
        r.selo || '', r.palavras || '',
        r.thumb_tipo, r.thumb_imagem || '', r.thumb_svg || '', r.thumb_fundo,
        r.destaque || 0, r.ordem, t, t
      );
    }
    avisos.push(`${RECURSOS.length} recursos carregados a partir do agentes-pro.html`);
  }

  // ── primeiro usuário ──────────────────────────────────
  if (contar('usuarios') === 0) {
    const email = CONFIG_PADRAO.contato_email;
    const senha = crypto.randomBytes(9).toString('base64url');
    const { hash, salt } = criarSenha(senha);
    db.prepare(`
      INSERT INTO usuarios (email, nome, senha_hash, senha_salt, papel, ativo, trocar_senha, criado_em)
      VALUES (?, ?, ?, ?, 'admin', 1, 1, ?)
    `).run(email, 'Daniel Ávila', hash, salt, agora());

    avisos.push('');
    avisos.push('┌───────────────────────────────────────────────────────────┐');
    avisos.push('│  ACESSO INICIAL DO PAINEL — anote e troque no 1º login    │');
    avisos.push('└───────────────────────────────────────────────────────────┘');
    avisos.push(`   Endereço: /admin`);
    avisos.push(`   E-mail:   ${email}`);
    avisos.push(`   Senha:    ${senha}`);
    avisos.push('');
  }

  return avisos;
}

module.exports = { semear, CONFIG_PADRAO };
