'use strict';

/*
 * Freio simples por chave (normalmente um IP): no máximo N eventos numa
 * janela de tempo. Fica em memória — reseta se o servidor reiniciar,
 * o que é aceitável aqui: isto é um freio contra abuso de um formulário
 * público, não um controle de segurança sensível (esse é o de login,
 * em auth.js, que é gravado no banco de propósito).
 */

function criarLimitador({ maxTentativas, janelaMs }) {
  const registros = new Map();

  return function permitido(chave) {
    const agora = Date.now();
    const r = registros.get(chave);

    if (!r || agora - r.desde > janelaMs) {
      registros.set(chave, { n: 1, desde: agora });
      return true;
    }
    if (r.n >= maxTentativas) return false;
    r.n++;
    return true;
  };
}

module.exports = { criarLimitador };
