'use strict';

/*
 * Erro de validação de dados de entrada (campo inválido, faltando etc.).
 * O servidor reconhece por `ehDeDados` e responde 400 com a mensagem.
 * Fica num arquivo à parte porque tanto store.js quanto paginas.js
 * precisam dela, sem criar dependência circular entre os dois.
 */

class ErroDeDados extends Error {
  constructor(mensagem, campo) {
    super(mensagem);
    this.campo = campo;
    this.ehDeDados = true;
  }
}

module.exports = { ErroDeDados };
