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
node testes/pontuacao.js
node testes/cap.js
node testes/celular.js
```

Os três primeiros aceitam `LARGURA` para rodar numa janela estreita:

```
LARGURA=390 node testes/painel.js
```

`login.js` cobre o mapeamento usuário → e-mail e as mensagens de erro.
`celular.js` percorre os 11 estados das duas páginas numa tela de 390px e falha
se algo vazar para fora da tela, se um alvo de toque ficar abaixo de 36px ou se
algum texto visível ficar abaixo de 10px. Só roda abaixo de 700px — acima disso
vale o desenho de desktop. Existe porque esses defeitos não aparecem em teste de
comportamento: a página funciona, só que ilegível.
`provas.js` cobre a prova por categoria no leaderboard público. `painel.js` cobre o caminho de uso real: entrar, lançar resultados (inclusive um
WOD de duas partes pontuadas), salvar, importar a lista oficial e salvar a
configuração — e falha se o JS estourar em qualquer ponto.
`cap.js` cobre o time cap, e o dublê dele atrasa o eco do snapshot para simular a
rede. Existe por causa de um bug no meio do campeonato: corrigir o cap de 20:00
para 12:00 e lançar o resultado seguinte fazia o campo pular de volta para 20:00,
porque a grade remonta a cada resultado salvo e reescrevia o campo com o valor que
ainda não tinha voltado do servidor. Também fixa a regra que o organizador pediu:
o cap não encosta no tempo de quem terminou, só compõe o resultado de quem
estourou.

Por que eles existem: o `build-paginas.py` monta as páginas recortando trechos da
fonte. Uma edição na fonte pode deixar o organizador quebrado sem que nada acuse
— já aconteceu. O `troca()` no build pega o corte que não casa; estes testes pegam
o que quebra depois disso.
