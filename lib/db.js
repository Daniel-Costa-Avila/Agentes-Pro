'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');
const PASTA_DADOS = path.join(RAIZ, 'data');
// Override só para testes isolados (ex.: validar uma migração numa cópia
// do banco antes de deixar rodar contra o arquivo de produção); em uso
// normal a variável não existe e o caminho é sempre o de sempre.
const ARQUIVO = process.env.AGENTES_DB_PATH || path.join(PASTA_DADOS, 'conteudo.db');

fs.mkdirSync(path.join(PASTA_DADOS, 'uploads'), { recursive: true });

const db = new DatabaseSync(ARQUIVO);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categorias (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug     TEXT NOT NULL UNIQUE,
  nome     TEXT NOT NULL,
  cor      TEXT NOT NULL DEFAULT '#3b7dd8',
  ordem    INTEGER NOT NULL DEFAULT 0,
  visivel  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recursos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo        TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  categoria_id  INTEGER REFERENCES categorias(id),
  url           TEXT NOT NULL DEFAULT '',
  botao_rotulo  TEXT NOT NULL DEFAULT 'Acesso Direto',
  botao_icone   TEXT NOT NULL DEFAULT 'link',
  botao_ativo   INTEGER NOT NULL DEFAULT 1,
  botao_off     TEXT NOT NULL DEFAULT 'Em breve',
  nova_aba      INTEGER NOT NULL DEFAULT 1,
  selo          TEXT NOT NULL DEFAULT '',
  palavras      TEXT NOT NULL DEFAULT '',
  thumb_tipo    TEXT NOT NULL DEFAULT 'imagem',
  thumb_imagem  TEXT NOT NULL DEFAULT '',
  thumb_svg     TEXT NOT NULL DEFAULT '',
  thumb_fundo   TEXT NOT NULL DEFAULT '#ffffff',
  destaque      INTEGER NOT NULL DEFAULT 0,
  ativo         INTEGER NOT NULL DEFAULT 1,
  oculto        INTEGER NOT NULL DEFAULT 0,
  ordem         INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT NOT NULL,
  alterado_em   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  nome          TEXT NOT NULL,
  senha_hash    TEXT NOT NULL,
  senha_salt    TEXT NOT NULL,
  papel         TEXT NOT NULL DEFAULT 'editor',
  ativo         INTEGER NOT NULL DEFAULT 1,
  trocar_senha  INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT NOT NULL,
  ultimo_acesso TEXT
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash  TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criada_em   TEXT NOT NULL,
  expira_em   TEXT NOT NULL,
  ip          TEXT
);

CREATE TABLE IF NOT EXISTS log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  quando   TEXT NOT NULL,
  usuario  TEXT NOT NULL,
  acao     TEXT NOT NULL,
  alvo     TEXT NOT NULL,
  detalhe  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tentativas (
  ip     TEXT PRIMARY KEY,
  n      INTEGER NOT NULL DEFAULT 0,
  ate    TEXT
);

CREATE TABLE IF NOT EXISTS mensagens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo       TEXT NOT NULL DEFAULT 'duvida',
  nome       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  mensagem   TEXT NOT NULL,
  lida       INTEGER NOT NULL DEFAULT 0,
  criado_em  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recursos_ordem ON recursos(ordem);
CREATE INDEX IF NOT EXISTS idx_log_quando ON log(quando DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_criado ON mensagens(criado_em DESC);
`);

// ── migrações ────────────────────────────────────────────
// ALTER TABLE ADD COLUMN não tem "IF NOT EXISTS" no SQLite, então
// checamos antes de cada uma — assim o boot é seguro tanto num banco
// novo (as colunas já nascem no CREATE TABLE acima) quanto num banco
// existente que ainda não tinha a página de detalhes dos recursos.
function colunaExiste(tabela, coluna) {
  return db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
}

const COLUNAS_PAGINA = [
  ['pagina_ativa', "INTEGER NOT NULL DEFAULT 0"],
  ['pagina_slug', "TEXT NOT NULL DEFAULT ''"],
  ['pagina_titulo', "TEXT NOT NULL DEFAULT ''"],
  ['pagina_resumo', "TEXT NOT NULL DEFAULT ''"],
  ['pagina_blocos', "TEXT NOT NULL DEFAULT '[]'"]
];

for (const [coluna, definicao] of COLUNAS_PAGINA) {
  if (!colunaExiste('recursos', coluna)) {
    db.exec(`ALTER TABLE recursos ADD COLUMN ${coluna} ${definicao}`);
  }
}

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_recursos_pagina_slug
  ON recursos(pagina_slug) WHERE pagina_slug <> '';
`);

module.exports = { db, RAIZ, PASTA_DADOS, ARQUIVO };
