// Resultado represado: gravado, visivel para o organizador, invisivel para o
// publico ate ele apertar PUBLICAR.
//
// O teste que mais importa aqui e o da compatibilidade: resultado lancado ANTES
// desta mudanca nao tem a marca `pub`, e nao pode sumir do ar por causa disso.
const { chromium } = require('playwright');
const CHROME = process.env.CHROME_PATH || '';
const LARGURA = Number(process.env.LARGURA || 1280);
const BASE = process.env.BASE || 'http://127.0.0.1:8931';

const ATL = [{ id:'a1', nome:'Ana' }, { id:'a2', nome:'Bia' }, { id:'a3', nome:'Cris' }]
  .map(a => ({ ...a, categoria:'C', unidade:'M' }));
const WODS = [{ id:'w1', nome:'PROVA 1', tipo:'tempo', pub:true, ordem:1, categorias:[] }];

function estado(resultados) {
  return { nome:'T', publicado:true, sistema:'posicao', categorias:['C'], unidades:['M'],
           atletas:ATL, wods:WODS, resultados };
}

async function publico(nav, resultados) {
  const p = await nav.newPage({ viewport:{ width:LARGURA, height:900 } });
  const erros = [];
  p.on('pageerror', e => erros.push(String(e)));
  await p.addInitScript(d => {
    const doc = { onSnapshot: ok => { ok({ exists:true, data:()=>d }); return ()=>{}; } };
    window.firebase = { initializeApp:()=>{}, firestore:()=>({ collection:()=>({ doc:()=>doc }) }) };
  }, estado(resultados));
  await p.goto(BASE + '/publico/index.html');
  await p.waitForTimeout(500);
  const linhas = await p.$$eval('#tbody tr', trs => trs.map(t => {
    const td = [...t.querySelectorAll('td')];
    return { nome: td[1].childNodes[0].textContent.trim(),
             prova: td[2].textContent.trim(), total: td[td.length-1].textContent.trim() };
  }));
  await p.close();
  return { linhas, erros };
}

async function organizador(nav, resultados) {
  const p = await nav.newPage({ viewport:{ width:LARGURA, height:900 } });
  const erros = [];
  p.on('pageerror', e => erros.push(String(e)));
  await p.addInitScript(d => {
    window.__gravado = [];
    let est = d; let snap = null;
    const doc = {
      onSnapshot: ok => { snap = ok; ok({ exists:true, data:()=>est }); return ()=>{}; },
      get: async () => ({ exists:true, data:()=>({ ativo:true }) }),
      set: async (patch, opts) => { window.__gravado.push({ patch, opts });
        est = Object.assign({}, est, patch); snap && snap({ exists:true, data:()=>est }); },
    };
    window.firebase = { initializeApp:()=>{},
      auth: () => ({ setPersistence: async()=>{},
        onAuthStateChanged: cb => { window.__cb = cb; cb(null); },
        signInWithEmailAndPassword: async e => { const u={email:e,uid:'u1'};
          window.__cb(u); return { user:u }; },
        signOut: async () => window.__cb(null) }),
      firestore: () => ({ collection:()=>({ doc:()=>doc }) }) };
    window.firebase.auth.Auth = { Persistence:{ LOCAL:'local' } };
  }, estado(resultados));
  await p.goto(BASE + '/organizador.html');
  await p.waitForTimeout(400);
  await p.fill('#logEmail','organizador'); await p.fill('#logSenha','x');
  await p.click('#logBtn'); await p.waitForTimeout(400);
  await p.click('.admin-tab[data-ap="apResultados"]'); await p.waitForTimeout(300);
  return { p, erros };
}

(async () => {
  const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const res = [];
  const ok = (n, c, x='') => res.push([n, !!c, x]);

  // 1) COMPATIBILIDADE: resultado antigo, sem a marca pub, continua publico
  let r = await publico(nav, {
    a1: { w1: { v: 300, faltou: null } },              // como era gravado antes
    a2: { w1: { v: 400, faltou: null } },
  });
  const porNome = Object.fromEntries(r.linhas.map(l => [l.nome, l]));
  ok('resultado sem a marca pub continua visivel para o publico',
     (porNome['Ana'] || {}).prova.startsWith('5:00'), JSON.stringify(r.linhas));
  ok('e continua pontuando', (porNome['Ana'] || {}).total === '1', JSON.stringify(r.linhas));
  ok('sem erro de JS', r.erros.length === 0, JSON.stringify(r.erros));

  // 2) resultado represado nao aparece para o publico
  r = await publico(nav, {
    a1: { w1: { v: 300, faltou: null } },              // publicado
    a2: { w1: { v: 400, faltou: null, pub: false } },  // represado
  });
  const p2 = Object.fromEntries(r.linhas.map(l => [l.nome, l]));
  ok('resultado represado NAO aparece para o publico',
     p2['Bia'].prova === '—' || p2['Bia'].prova === '', JSON.stringify(r.linhas));
  ok('e o represado nao entra na conta do publico',
     p2['Ana'].total === '1' && p2['Ana'].prova.startsWith('5:00'), JSON.stringify(r.linhas));
  ok('o publicado do mesmo wod continua valendo', p2['Ana'].prova.startsWith('5:00'));

  // 3) o organizador VE o represado
  let { p, erros } = await organizador(nav, {
    a1: { w1: { v: 300, faltou: null } },
    a2: { w1: { v: 400, faltou: null, pub: false } },
  });
  ok('a faixa de aviso aparece', await p.isVisible('#rRepresados'));
  ok('e diz quantos sao', (await p.textContent('#rRepresadosN')).trim() === '1',
     await p.textContent('#rRepresadosN'));
  ok('a linha represada e marcada na grade',
     (await p.locator('#rGrid tr.represada').count()) === 1);
  // o leaderboard nao fica na tela do painel, entao pergunta ao motor: para o
  // organizador (isAdmin) o represado TEM de contar.
  const noAdmin = await p.evaluate(() => {
    const c = calcularRanking('C');
    return c.linhas.map(l => [l.atleta.nome, l.pos, l.total,
                              l.provas.w1.res ? l.provas.w1.res.v : null]);
  });
  ok('para o organizador o represado conta no ranking',
     noAdmin.some(l => l[0] === 'Bia' && l[3] === 400), JSON.stringify(noAdmin));
  ok('e ele fica na frente de quem nao tem resultado',
     (noAdmin.find(l => l[0] === 'Bia') || [])[2] === 2 &&
     (noAdmin.find(l => l[0] === 'Cris') || [])[2] === 3, JSON.stringify(noAdmin));

  // 4) PUBLICAR solta e nao mexe em valor nenhum
  await p.evaluate(() => { window.__gravado = []; });
  await p.click('#rRepresados button:has-text("PUBLICAR")');
  await p.waitForTimeout(400);
  const g = await p.evaluate(() => window.__gravado[window.__gravado.length - 1]);
  ok('publicar grava os resultados', !!(g && g.patch.resultados), JSON.stringify(g && Object.keys(g.patch)));
  ok('publicar tira a marca do represado',
     g && g.patch.resultados.a2.w1.pub === undefined, JSON.stringify(g && g.patch.resultados.a2));
  ok('publicar NAO mexe no valor', g && g.patch.resultados.a2.w1.v === 400 &&
     g.patch.resultados.a1.w1.v === 300, JSON.stringify(g && g.patch.resultados));
  // depois de publicar nao ha mais represado, mas a faixa continua — agora
  // avisando que o publico JA VE esses resultados. E o estado normal do dia.
  ok('depois de publicar a faixa avisa que o publico ja ve',
     /JÁ VÊ/.test(await p.textContent('#rRepresados')), await p.textContent('#rRepresados'));
  ok('e nao mostra mais nenhum represado',
     (await p.locator('#rGrid tr.represada').count()) === 0);
  ok('sem erro de JS no organizador', erros.length === 0, JSON.stringify(erros));
  await p.close();

  // 5) SEGURAR ESTA PROVA recolhe o que ja estava publico
  //    (resultado lancado antes desta funcionalidade nao tem a marca)
  ({ p, erros } = await organizador(nav, {
    a1: { w1: { v: 300, faltou: null } },              // publico, sem marca
    a2: { w1: { v: 400, faltou: null } },              // publico, sem marca
  }));
  ok('a faixa avisa que o publico ja ve resultados desta prova',
     /JÁ VÊ/.test(await p.textContent('#rRepresados')) &&
     (await p.textContent('#rRepresadosN')).trim() === '2',
     (await p.textContent('#rRepresados')).replace(/\s+/g, ' ').trim());
  p.on('dialog', d => d.accept());
  await p.evaluate(() => { window.__gravado = []; });
  await p.click('button:has-text("SEGURAR ESTA PROVA")');
  await p.waitForTimeout(400);
  const gs = await p.evaluate(() => {
    const x = window.__gravado.filter(y => y.patch.resultados);
    return x.length ? x[x.length-1].patch.resultados : null;
  });
  ok('segurar marca os dois como represados',
     gs && gs.a1.w1.pub === false && gs.a2.w1.pub === false, JSON.stringify(gs));
  ok('segurar NAO mexe no valor',
     gs && gs.a1.w1.v === 300 && gs.a2.w1.v === 400, JSON.stringify(gs));
  const sumiu = await p.evaluate(() => {
    // o publico deixa de ver: simula isAdmin falso no motor
    const antes = window.isAdmin;
    return { comAdmin: calcularRanking('C').linhas.filter(l => l.pontuou).length };
  });
  ok('o organizador continua vendo os dois', sumiu.comAdmin === 2, JSON.stringify(sumiu));
  await p.close();

  // 6) lancar um resultado novo nasce represado
  ({ p, erros } = await organizador(nav, {}));
  await p.fill('#rGrid input[data-f="v"][data-at="a1"]', '5:00');
  await p.press('#rGrid input[data-f="v"][data-at="a1"]', 'Enter');
  await p.waitForTimeout(400);
  const gn = await p.evaluate(() => {
    const x = window.__gravado.filter(y => y.patch.resultados);
    return x.length ? x[x.length-1].patch.resultados.a1.w1 : null;
  });
  ok('resultado lancado agora nasce represado',
     gn && gn.pub === false && gn.v === 300, JSON.stringify(gn));
  ok('e a faixa aparece na hora', await p.isVisible('#rRepresados'));
  await p.close();

  await nav.close();
  let falhas = 0;
  for (const [n, c, x] of res) { if (!c) falhas++; console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x ? '  [' + x + ']' : ''}`); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})();
