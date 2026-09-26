// O total e a soma das colocacoes — e so isso.
//
// Existe porque uma prova ainda nao lancada entrava na conta: todo mundo ficava
// empatado em ultimo nela e levava a mesma media. Com 4 atletas isso dava 2,5
// pontos cada, e seis provas por lancar viravam 15 pontos fixos no total de
// todo mundo — o primeiro colocado aparecia com 16 em vez de 1. A ordem ficava
// certa, mas o numero nao queria dizer nada.
const { chromium } = require('playwright');
const CHROME = process.env.CHROME_PATH || '';
const LARGURA = Number(process.env.LARGURA || 1280);
const PAGINA = process.env.PAGINA || require('path').resolve(__dirname, '..', 'publico', 'index.html');

const ATLETAS = [
  { id: 'a1', nome: 'Atleta Um',    categoria: 'Elite Masculino', unidade: 'Moema' },
  { id: 'a2', nome: 'Atleta Dois',  categoria: 'Elite Masculino', unidade: 'Moema' },
  { id: 'a3', nome: 'Atleta Tres',  categoria: 'Elite Masculino', unidade: 'Itaim' },
  { id: 'a4', nome: 'Atleta Quatro',categoria: 'Elite Masculino', unidade: 'Itaim' },
];
const WODS = [1,2,3,4,5,6,7].map(n => ({
  id: 'p' + n, nome: 'PROVA ' + n, tipo: 'tempo', pub: true, ordem: n, categorias: [],
}));

function base(resultados) {
  return { nome:'Teste', publicado:true, sistema:'posicao', p1:100, dec:5,
           categorias:['Elite Masculino'], unidades:['Moema','Itaim'],
           atletas:ATLETAS, wods:WODS, resultados };
}

async function totais(nav, resultados) {
  const pag = await nav.newPage({ viewport: { width: LARGURA, height: 900 } });
  const erros = [];
  pag.on('pageerror', e => erros.push(String(e)));
  await pag.addInitScript(d => {
    const doc = { onSnapshot: (ok) => { ok({ exists:true, data: () => d }); return () => {}; } };
    window.firebase = { initializeApp: () => {}, firestore: () => ({ collection: () => ({ doc: () => doc }) }) };
  }, base(resultados));
  await pag.goto('file://' + PAGINA);
  await pag.waitForTimeout(600);
  const fora = await pag.$$eval('#tbody tr', trs => trs.map(t => {
    const td = [...t.querySelectorAll('td')];
    return { nome: td[1].childNodes[0].textContent.trim(), total: td[td.length-1].textContent.trim() };
  }));
  const legenda = (await pag.textContent('#legend')).replace(/\s+/g,' ');
  await pag.close();
  return { fora, legenda, erros };
}

(async () => {
  const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const res = [];
  const ok = (n, c, x = '') => res.push([n, !!c, x]);
  const tempo = (s) => ({ v: s, cap: null });

  // 1) nenhuma prova lancada: ninguem pontuou, total zero
  let r = await totais(nav, {});
  ok('nada lancado: todo mundo com total 0',
     r.fora.every(l => l.total === '0'), JSON.stringify(r.fora.map(l => l.total)));

  // 2) so a PROVA 1 lancada: o total e a colocacao nela
  r = await totais(nav, {
    a1: { p1: tempo(600) }, a2: { p1: tempo(610) }, a3: { p1: tempo(620) }, a4: { p1: tempo(630) },
  });
  ok('1 de 7 lancada: total = colocacao na prova 1',
     r.fora.map(l => l.total).join(',') === '1,2,3,4', JSON.stringify(r.fora));
  ok('a legenda diz quantas ja foram lancadas',
     /1 de 7 pontuação\(ões\) já lançada/.test(r.legenda), r.legenda.slice(-140));
  ok('a legenda avisa que as outras nao contam',
     /não entram no total/.test(r.legenda));

  // 3) duas lancadas: soma das duas colocacoes
  r = await totais(nav, {
    a1: { p1: tempo(600), p2: tempo(630) },   // 1o + 4o = 5
    a2: { p1: tempo(610), p2: tempo(620) },   // 2o + 3o = 5
    a3: { p1: tempo(620), p2: tempo(610) },   // 3o + 2o = 5
    a4: { p1: tempo(630), p2: tempo(600) },   // 4o + 1o = 5
  });
  ok('2 de 7 lancadas: todos somam 5',
     r.fora.every(l => l.total === '5'), JSON.stringify(r.fora.map(l => l.total)));

  // 4) prova lancada so para parte dos atletas: quem falta fica em ultimo NELA
  r = await totais(nav, {
    a1: { p1: tempo(600) }, a2: { p1: tempo(610) },
    a3: { p1: tempo(620) }, a4: { p1: tempo(630) },
    // na p2 so dois lancaram
    ...{ a1: { p1: tempo(600), p2: tempo(500) }, a2: { p1: tempo(610), p2: tempo(510) } },
  });
  // a1: 1o + 1o = 2 | a2: 2o + 2o = 4 | a3 e a4 empatam em 3o na p2 (3 pts cada,
  // nao 3,5): 3+3 = 6 e 4+3 = 7.
  const t = r.fora.map(l => l.total);
  ok('prova parcial: quem nao lancou fica em ultimo nela',
     t.join(',') === '2,4,6,7', JSON.stringify(r.fora));
  ok('prova parcial: nenhum total quebrado',
     t.every(v => /^\d+$/.test(v)), JSON.stringify(t));

  // 5) todas as 7 lancadas: soma das 7 colocacoes
  const todas = {};
  ATLETAS.forEach((a, i) => {
    todas[a.id] = {};
    WODS.forEach(w => { todas[a.id][w.id] = tempo(600 + i * 10); });
  });
  r = await totais(nav, todas);
  ok('7 de 7 lancadas: total = 7x a colocacao',
     r.fora.map(l => l.total).join(',') === '7,14,21,28', JSON.stringify(r.fora.map(l => l.total)));
  ok('sem erro de JS em nenhum caso', r.erros.length === 0, JSON.stringify(r.erros));

  // ---------- empate ----------
  // Empate e empate: os empatados ficam com a MESMA colocacao e a MESMA
  // pontuacao inteira, e o proximo pula as posicoes ocupadas. Antes daqui saia
  // 8.5 / 11.5, porque o bloco empatado dividia os pontos das posicoes.
  r = await totais(nav, {
    a1: { p1: tempo(600) },   // 1o sozinho
    a2: { p1: tempo(610) },   // empata em 2o
    a3: { p1: tempo(610) },   // empata em 2o
    a4: { p1: tempo(620) },   // pula o 3o e cai em 4o
  });
  const emp = r.fora.map(l => l.total);
  ok('empate nao gera ponto quebrado',
     emp.every(v => /^\d+$/.test(v)), JSON.stringify(emp));
  ok('empatados ficam com a mesma pontuacao e o proximo pula a posicao',
     emp.join(',') === '1,2,2,4', JSON.stringify(r.fora));
  ok('a legenda explica que empate e empate',
     /mesma colocação e mesmos pontos/.test(r.legenda), r.legenda.slice(0, 200));

  // tres empatados no meio, e o resto da tabela segue inteiro
  r = await totais(nav, {
    a1: { p1: tempo(600) }, a2: { p1: tempo(600) },
    a3: { p1: tempo(600) }, a4: { p1: tempo(900) },
  });
  ok('tres empatados: todos com 1 e o proximo em 4o',
     r.fora.map(l => l.total).join(',') === '1,1,1,4',
     JSON.stringify(r.fora.map(l => l.total)));

  // ninguem lancou na prova: todos empatados em ultimo, ainda inteiro
  r = await totais(nav, { a1: { p1: tempo(600) }, a2: { p1: tempo(610) } });
  ok('empatados em ultimo tambem ficam inteiros',
     r.fora.map(l => l.total).every(v => /^\d+$/.test(v)),
     JSON.stringify(r.fora.map(l => l.total)));

  // ---------- confronto direto ----------
  // Mesma pontuacao: os dois MANTEM o total, mas fica na frente quem venceu o
  // outro em mais provas.
  const ordem = (r) => r.fora.map(l => l.nome.replace('Atleta ', '')).join(',');

  // a2 e a3 empatam em 8: a2 = 2+6, a3 = 6+2... com 4 atletas fica assim:
  //   p1: a1 1o, a2 2o, a3 3o, a4 4o
  //   p2: a1 1o, a2 3o, a3 2o, a4 4o
  // a2 = 2+3 = 5, a3 = 3+2 = 5 -> empate. a2 ganhou a p1, a3 ganhou a p2: 1 a 1,
  // confronto direto empatado, cai nas melhores colocacoes (a2 tem um 2o, a3
  // tambem) -> segue empatado de verdade.
  r = await totais(nav, {
    a1: { p1: tempo(600), p2: tempo(600) },
    a2: { p1: tempo(610), p2: tempo(630) },
    a3: { p1: tempo(620), p2: tempo(620) },
    a4: { p1: tempo(630), p2: tempo(640) },
  });
  ok('confronto direto 1 a 1: continua empate de verdade',
     r.fora[1].total === r.fora[2].total, JSON.stringify(r.fora.map(l => l.total)));

  // Agora um empate com confronto direto DECIDIDO: 3 provas.
  //   p1: a2 melhor que a3 | p2: a2 melhor que a3 | p3: a3 melhor que a2
  // a2 = 2+2+4 = 8 ... montando para dar o mesmo total e 2x1 para a2.
  const WODS3 = [1,2,3].map(n => ({ id:'p'+n, nome:'PROVA '+n, tipo:'tempo', pub:true, ordem:n, categorias:[] }));
  const tresProvas = async (resultados) => {
    const pag = await nav.newPage({ viewport: { width: LARGURA, height: 900 } });
    await pag.addInitScript(d => {
      const doc = { onSnapshot: (ok) => { ok({ exists:true, data: () => d }); return () => {}; } };
      window.firebase = { initializeApp: () => {}, firestore: () => ({ collection: () => ({ doc: () => doc }) }) };
    }, { nome:'Teste', publicado:true, sistema:'posicao', p1:100, dec:5,
         categorias:['Elite Masculino'], unidades:['Moema','Itaim'],
         atletas:ATLETAS, wods:WODS3, resultados });
    await pag.goto('file://' + PAGINA);
    await pag.waitForTimeout(600);
    const fora = await pag.$$eval('#tbody tr', trs => trs.map(t => {
      const td = [...t.querySelectorAll('td')];
      return { nome: td[1].childNodes[0].textContent.trim(),
               pos: td[0].textContent.trim(), total: td[td.length-1].textContent.trim() };
    }));
    await pag.close();
    return fora;
  };

  // a2: 2o, 2o, 4o = 8 | a3: 3o, 3o, 2o = 8 -> empate em 8.
  // a2 ganhou de a3 na p1 e na p2, a3 ganhou na p3: 2 a 1 para a2.
  let f = await tresProvas({
    a1: { p1: tempo(600), p2: tempo(600), p3: tempo(630) },
    a2: { p1: tempo(610), p2: tempo(610), p3: tempo(640) },
    a3: { p1: tempo(620), p2: tempo(620), p3: tempo(610) },
    a4: { p1: tempo(630), p2: tempo(630), p3: tempo(600) },
  });
  const byName = Object.fromEntries(f.map(l => [l.nome, l]));
  ok('confronto direto: os empatados mantem a MESMA pontuacao',
     byName['Atleta Dois'].total === byName['Atleta Tres'].total,
     JSON.stringify(f));
  ok('confronto direto: quem ganhou 2 a 1 fica na frente',
     f.findIndex(l => l.nome === 'Atleta Dois') < f.findIndex(l => l.nome === 'Atleta Tres'),
     JSON.stringify(f.map(l => l.nome)));
  ok('confronto direto decidido: a colocacao geral NAO e compartilhada',
     byName['Atleta Dois'].pos !== byName['Atleta Tres'].pos,
     JSON.stringify(f.map(l => [l.nome, l.pos])));

  // Caso circular com 3: A>B, B>C, C>A. Ninguem vence o confronto direto.
  // p1: a1 a2 a3 | p2: a2 a3 a1 | p3: a3 a1 a2  -> todos com 1+2+3 = 6.
  f = await tresProvas({
    a1: { p1: tempo(600), p2: tempo(620), p3: tempo(610) },
    a2: { p1: tempo(610), p2: tempo(600), p3: tempo(620) },
    a3: { p1: tempo(620), p2: tempo(610), p3: tempo(600) },
    a4: { p1: tempo(900), p2: tempo(900), p3: tempo(900) },
  });
  const tres = f.filter(l => l.nome !== 'Atleta Quatro');
  ok('empate circular: os tres ficam com o mesmo total',
     new Set(tres.map(l => l.total)).size === 1, JSON.stringify(tres));
  ok('empate circular: o confronto direto nao decide, os tres dividem a colocacao',
     new Set(tres.map(l => l.pos)).size === 1, JSON.stringify(tres.map(l => [l.nome, l.pos])));
  ok('empate circular: nenhum total quebrado',
     tres.every(l => /^\d+$/.test(l.total)), JSON.stringify(tres.map(l => l.total)));

  ok('a legenda explica o confronto direto',
     /venceu o outro em mais provas/.test(r.legenda), r.legenda.slice(-300));

  // ---------- time cap ----------
  // Quem nao finaliza fica com o tempo do cap mais as reps que faltaram, e entre
  // os que estouraram ganha quem faltou menos.
  const comCap = async (resultados) => {
    const pag = await nav.newPage({ viewport: { width: LARGURA, height: 900 } });
    await pag.addInitScript(d => {
      const doc = { onSnapshot: (ok) => { ok({ exists:true, data: () => d }); return () => {}; } };
      window.firebase = { initializeApp: () => {}, firestore: () => ({ collection: () => ({ doc: () => doc }) }) };
    }, { nome:'Teste', publicado:true, sistema:'posicao', p1:100, dec:5,
         categorias:['Elite Masculino'], unidades:['Moema','Itaim'], atletas:ATLETAS,
         wods:[{ id:'p1', nome:'PROVA 1', tipo:'tempo', cap:15*60, pub:true, ordem:1, categorias:[] }],
         resultados });
    await pag.goto('file://' + PAGINA);
    await pag.waitForTimeout(600);
    const fora = await pag.$$eval('#tbody tr', trs => trs.map(t => {
      const td = [...t.querySelectorAll('td')];
      return { nome: td[1].childNodes[0].textContent.trim(),
               prova: td[2].textContent.trim(), total: td[td.length-1].textContent.trim() };
    }));
    await pag.close();
    return fora;
  };

  const capado = await comCap({
    a1: { p1: { v: 700,  faltou: null } },   // finalizou 11:40
    a2: { p1: { v: 800,  faltou: null } },   // finalizou 13:20
    a3: { p1: { v: null, faltou: 2 } },      // estourou, faltaram 2
    a4: { p1: { v: null, faltou: 10 } },     // estourou, faltaram 10
  });
  ok('quem finalizou vem antes de quem estourou o cap',
     capado.map(l => l.nome).join('|') === 'Atleta Um|Atleta Dois|Atleta Tres|Atleta Quatro',
     JSON.stringify(capado.map(l => l.nome)));
  ok('entre os que estouraram, ganha quem faltou menos',
     capado[2].total === '3' && capado[3].total === '4', JSON.stringify(capado.map(l => l.total)));
  ok('cap de 15 min com 10 faltando aparece como 15:10',
     capado[3].prova.startsWith('15:10'), capado[3].prova);
  ok('cap de 15 min com 2 faltando aparece como 15:2',
     capado[2].prova.startsWith('15:2'), capado[2].prova);

  // prova por tempo sem cap cadastrado: nao inventa um tempo
  const semCap = await (async () => {
    const pag = await nav.newPage({ viewport: { width: LARGURA, height: 900 } });
    await pag.addInitScript(d => {
      const doc = { onSnapshot: (ok) => { ok({ exists:true, data: () => d }); return () => {}; } };
      window.firebase = { initializeApp: () => {}, firestore: () => ({ collection: () => ({ doc: () => doc }) }) };
    }, { nome:'Teste', publicado:true, sistema:'posicao', p1:100, dec:5,
         categorias:['Elite Masculino'], unidades:['Moema'], atletas:ATLETAS,
         wods:[{ id:'p1', nome:'PROVA 1', tipo:'tempo', pub:true, ordem:1, categorias:[] }],
         resultados:{ a1:{ p1:{ v:700, faltou:null } }, a2:{ p1:{ v:null, faltou:5 } } } });
    await pag.goto('file://' + PAGINA);
    await pag.waitForTimeout(600);
    const t = await pag.$$eval('#tbody tr', trs => trs.map(x =>
      [...x.querySelectorAll('td')][2].textContent.trim()));
    await pag.close();
    return t;
  })();
  ok('prova por tempo sem cap cadastrado mostra só as reps que faltaram',
     semCap.some(v => v.startsWith('+5')), JSON.stringify(semCap));

  let falhas = 0;
  for (const [n, c, x] of res) { if (!c) falhas++; console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x ? '  [' + x + ']' : ''}`); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  await nav.close();
  process.exit(falhas ? 1 : 0);
})();
