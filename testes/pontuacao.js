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
  // a1: 1o + 1o = 2 | a2: 2o + 2o = 4 | a3 e a4: 3o/4o + empate em ultimo (3,5) = 6,5 e 7,5
  const t = r.fora.map(l => l.total);
  ok('prova parcial: quem nao lancou fica em ultimo nela',
     t[0] === '2' && t[1] === '4', JSON.stringify(r.fora));

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
