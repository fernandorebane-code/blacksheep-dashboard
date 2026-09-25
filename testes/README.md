# Testes

Opcionais, para quem for mexer no código. O evento não depende deles.

Eles abrem as páginas geradas num Chromium e trocam o Firebase por um dublê, então
rodam sem tocar no Firestore de verdade e sem precisar de login.

```
npm install playwright          # uma vez
python3 build-paginas.py        # gerar as páginas a partir da fonte
python3 -m http.server 8931 &   # painel.js precisa de HTTP: cargaInicial() faz fetch
node testes/login.js
node testes/painel.js
node testes/provas.js
```

`login.js` cobre o mapeamento usuário → e-mail e as mensagens de erro.
`provas.js` cobre a prova por categoria no leaderboard público. `painel.js` cobre o caminho de uso real: entrar, lançar resultados (inclusive um
WOD de duas partes pontuadas), salvar, importar a lista oficial e salvar a
configuração — e falha se o JS estourar em qualquer ponto.

Por que eles existem: o `build-paginas.py` monta as páginas recortando trechos da
fonte. Uma edição na fonte pode deixar o organizador quebrado sem que nada acuse
— já aconteceu. O `troca()` no build pega o corte que não casa; estes testes pegam
o que quebra depois disso.
