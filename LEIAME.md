# Agentes Pro — painel de conteúdo

A página deixou de ser um HTML fixo. Agora o conteúdo mora num banco
SQLite e o servidor monta a página a cada acesso. Tudo se administra
pela tela, em `/admin`.

## Rodar

Nada mudou no jeito de subir: `run.cmd` continua valendo (ele reinicia
o Node sozinho a cada 3 s se o processo cair).

```
run.cmd            servidor na porta 8090
run_tunnel.cmd     túnel Cloudflare
```

**Para aplicar uma alteração no código**, encerre o processo do Node —
o `run.cmd` sobe de novo já com o código novo:

```
taskkill /F /IM node.exe
```

## Endereços

| Endereço        | O que é                                        |
|-----------------|------------------------------------------------|
| `/`             | a página pública, montada a partir do banco    |
| `/admin`        | o painel (exige sessão)                        |
| `/admin/entrar` | tela de acesso                                 |
| `/midia/…`      | imagens enviadas pelo painel                   |

## Primeiro acesso

Na primeira vez que o servidor sobe com o banco vazio, ele imprime no
console (e portanto em `server-out.log`) o e-mail e uma **senha
provisória**. O painel obriga a trocá-la no primeiro login.

Perdeu a senha e não há outro administrador? Apague `data/conteudo.db`
e suba de novo — o banco é recriado com o conteúdo inicial e uma nova
senha provisória. **Isso apaga as edições feitas pelo painel.**

## Onde fica cada coisa

```
server.js              rotas: página, painel, API
lib/db.js              conexão e esquema do SQLite
lib/seed.js            carga inicial (o conteúdo que estava no HTML)
lib/auth.js            senhas (scrypt), sessões, freio de tentativas
lib/store.js           leitura e escrita dos dados + registro de alterações
lib/render.js          monta o HTML da página pública
lib/icones.js          biblioteca de ícones dos botões
templates/cabeca.html  <head> com todo o CSS, extraído da página original
templates/script.html  o JS de busca e filtro, extraído da página original
admin/                 o painel (HTML, CSS e JS, sem build)
data/conteudo.db       o banco  ← faça backup deste arquivo
data/uploads/          imagens enviadas pelo painel
backup/                cópias do server.js e do agentes-pro.html originais
```

## Backup

O que importa preservar é `data/conteudo.db` e `data/uploads/`. Copiar
esses dois é o backup completo do conteúdo.

## Os três status de um recurso

- **Ativo** — no ar: o card é montado na página, entra na contagem do
  filtro e responde à busca.
- **Oculto** — fora do ar por enquanto: o cadastro fica inteiro no
  painel e volta com um clique.
- **Inativo** — desligado: sai da página e do índice de busca, mas não
  é apagado.

Separado disso existe o **botão habilitado**: desligá-lo deixa o card
na página com o botão cinza e sem link (é o que a página já fazia com
os agentes "Em liberação"), sem tirar o card do ar.

## Alterar o CSS da página pública

O visual da página vem de `templates/cabeca.html`. Editar o CSS ali
muda a página; o painel tem folha própria em `admin/painel.css`.

## Dois campos aceitam HTML

Por escolha, não são escapados — servem justamente para marcação:

- o **aviso** no fim da lista (aceita `<b>`, `<a href>`);
- a **ilustração vetorial** de um card (`thumb_svg`), usada pelos
  quatro cards que hoje têm desenho em vez de logo.

Só quem tem sessão no painel escreve nesses campos. Todo o resto —
títulos, descrições, links, etiquetas — sai escapado.
