// O time cap nao pode interferir no resultado que o organizador digita.
//
// Existe por causa de um bug real no meio do campeonato: o organizador corrigia
// o cap de 20:00 para 12:00, lancava o resultado seguinte e o campo do cap
// pulava de volta para 20:00. A grade e remontada a cada resultado salvo, e ela
// reescrevia o campo com o valor que ainda nao tinha voltado do servidor.
const { chromium } = require('playwright');
const CHROME = process.env.CHROME_PATH || '';
const LARGURA = Number(process.env.LARGURA || 1280);
const BASE = process.env.BASE || 'http://127.0.0.1:8931';

// atrasoEco simula a rede: o snapshot so devolve a gravacao depois de N ms.
async function abrir(nav, cfg) {
  const pag = await nav.newPage({ viewport: { width: LARGURA, height: 900 } });
  const erros = [];
  pag.on('pageerror', e => erros.push(String(e)));
  await pag.addInitScript(c => {
    window.__gravado = [];
    let estado = {
      nome: 'T', publicado: true, sistema: 'posicao',
      categorias: ['Master 45+ Feminino'], unidades: ['Moema'],
      atletas: [{ id:'a1', nome:'Ana', categoria:'Master 45+ Feminino', unidade:'Moema' },
                { id:'a2', nome:'Bia', categoria:'Master 45+ Feminino', unidade:'Moema' }],
      wods: [{ id:'w3', nome:'WOD 3', tipo:'tempo', cap:c.cap, pub:true, ordem:3, categorias:[] },
             { id:'w4', nome:'WOD 4', tipo:'tempo', cap:300,   pub:true, ordem:4, categorias:[] }],
      resultados: c.resultados || {},
    };
    let avisarSnap = null;
    const doc = {
      onSnapshot: (ok) => { avisarSnap = ok; ok({ exists:true, data:()=>estado }); return ()=>{}; },
      get: async () => ({ exists:true, data:()=>({ ativo:true }) }),
      set: async (patch, opts) => {
        window.__gravado.push({ patch, opts });
        const aplicar = () => {
          estado = Object.assign({}, estado, patch);
          avisarSnap && avisarSnap({ exists:true, data:()=>estado });
        };
        if (c.atrasoEco) setTimeout(aplicar, c.atrasoEco); else aplicar();
      },
    };
    window.firebase = {
      initializeApp: () => {},
      auth: () => ({
        setPersistence: async () => {},
        onAuthStateChanged: cb => { window.__authCb = cb; cb(null); },
        signInWithEmailAndPassword: async (email) => {
          const u = { email, uid:'u1' }; window.__authCb(u); return { user:u };
        },
        signOut: async () => window.__authCb(null),
      }),
      firestore: () => ({ collection: () => ({ doc: () => doc }) }),
    };
    window.firebase.auth.Auth = { Persistence: { LOCAL:'local' } };
  }, cfg);
  await pag.goto(BASE + '/organizador.html');
  await pag.waitForTimeout(400);
  await pag.fill('#logEmail', 'organizador');
  await pag.fill('#logSenha', 'x');
  await pag.click('#logBtn');
  await pag.waitForTimeout(400);
  await pag.click('.admin-tab[data-ap="apResultados"]');
  await pag.waitForTimeout(300);
  return { pag, erros };
}

(async () => {
  const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const res = [];
  const ok = (n, c, x = '') => res.push([n, !!c, x]);
  const capsGravados = p => p.evaluate(() =>
    window.__gravado.filter(g => g.patch.wods).map(g => g.patch.wods[0].cap));

  // 1) A REGRESSAO: corrigir o cap e lancar um resultado logo em seguida.
  let { pag, erros } = await abrir(nav, { cap: 1200, atrasoEco: 900 });
  ok('o cap velho aparece formatado', (await pag.inputValue('#rCap')) === '20:00',
     await pag.inputValue('#rCap'));

  await pag.fill('#rCap', '12:00');
  await pag.press('#rCap', 'Tab');
  await pag.waitForTimeout(80);                       // o eco ainda nao chegou
  ok('o campo aceita o cap novo', (await pag.inputValue('#rCap')) === '12:00',
     await pag.inputValue('#rCap'));

  await pag.fill('#rGrid input[data-f="v"][data-at="a1"]', '1030');
  await pag.press('#rGrid input[data-f="v"][data-at="a1"]', 'Enter');
  await pag.waitForTimeout(200);
  ok('lancar um resultado NAO faz o cap voltar para o valor antigo',
     (await pag.inputValue('#rCap')) === '12:00', await pag.inputValue('#rCap'));

  await pag.waitForTimeout(1200);                     // eco chega
  ok('depois do eco o cap continua o novo',
     (await pag.inputValue('#rCap')) === '12:00', await pag.inputValue('#rCap'));
  ok('so um cap foi gravado, e o certo', JSON.stringify(await capsGravados(pag)) === '[720]',
     JSON.stringify(await capsGravados(pag)));

  // o resultado digitado chegou intacto: o cap nao mexe nele
  const gravRes = await pag.evaluate(() => {
    const g = window.__gravado.filter(x => x.patch.resultados);
    return g.length ? g[g.length - 1].patch.resultados.a1.w3 : null;
  });
  ok('o tempo digitado e gravado sem o cap encostar nele',
     gravRes && gravRes.v === 10 * 60 + 30 && gravRes.faltou === null, JSON.stringify(gravRes));
  ok('sem erro de JS', erros.length === 0, JSON.stringify(erros));
  await pag.close();

  // 2) trocar de prova mostra o cap da prova certa (o pendente nao vaza)
  ({ pag } = await abrir(nav, { cap: 1200, atrasoEco: 900 }));
  await pag.fill('#rCap', '12:00');
  await pag.press('#rCap', 'Tab');
  await pag.waitForTimeout(80);
  await pag.selectOption('#rWod', 'w4');
  await pag.waitForTimeout(250);
  ok('trocar de prova mostra o cap da outra prova, nao o pendente',
     (await pag.inputValue('#rCap')) === '5:00', await pag.inputValue('#rCap'));
  await pag.close();

  // 3) cap so com os digitos
  ({ pag } = await abrir(nav, { cap: null }));
  await pag.fill('#rCap', '1200');
  await pag.press('#rCap', 'Tab');
  await pag.waitForTimeout(350);
  ok('1200 no cap vira 12:00', JSON.stringify(await capsGravados(pag)) === '[720]',
     JSON.stringify(await capsGravados(pag)));
  ok('e o campo mostra formatado', (await pag.inputValue('#rCap')) === '12:00',
     await pag.inputValue('#rCap'));

  // 4) cap invalido nao grava
  await pag.evaluate(() => { window.__gravado = []; });
  await pag.fill('#rCap', 'abc');
  await pag.press('#rCap', 'Tab');
  await pag.waitForTimeout(300);
  ok('cap invalido nao grava', (await capsGravados(pag)).length === 0);
  await pag.close();

  // 5) no leaderboard, o cap so encosta no resultado de quem NAO terminou
  const publico = async (cap) => {
    const p2 = await nav.newPage({ viewport: { width: LARGURA, height: 900 } });
    await p2.addInitScript(d => {
      const doc = { onSnapshot: (ok) => { ok({ exists:true, data: () => d }); return () => {}; } };
      window.firebase = { initializeApp: () => {},
        firestore: () => ({ collection: () => ({ doc: () => doc }) }) };
    }, { nome:'T', publicado:true, sistema:'posicao',
         categorias:['Master 45+ Feminino'], unidades:['Moema'],
         atletas:[{ id:'a1', nome:'Ana', categoria:'Master 45+ Feminino', unidade:'Moema' },
                  { id:'a2', nome:'Bia', categoria:'Master 45+ Feminino', unidade:'Moema' }],
         wods:[{ id:'w3', nome:'WOD 3', tipo:'tempo', cap, pub:true, ordem:3, categorias:[] }],
         resultados:{ a1:{ w3:{ v: 10*60+30, faltou: null } },   // terminou
                      a2:{ w3:{ v: null, faltou: 5 } } } });     // estourou o cap
    await p2.goto(BASE + '/publico/index.html');
    await p2.waitForTimeout(600);
    const fora = await p2.$$eval('#tbody tr', trs => trs.map(t => {
      const td = [...t.querySelectorAll('td')];
      return [td[1].childNodes[0].textContent.trim(), td[2].textContent.trim()];
    }));
    await p2.close();
    return Object.fromEntries(fora);
  };

  let tela = await publico(720);
  ok('quem terminou mostra o proprio tempo',
     (tela['Ana'] || '').startsWith('10:30'), JSON.stringify(tela));
  ok('quem estourou mostra o cap mais as reps que faltaram',
     (tela['Bia'] || '').startsWith('12:5'), JSON.stringify(tela));

  // o cap muda: o tempo de quem TERMINOU tem de ficar igual
  tela = await publico(1200);
  ok('trocar o cap nao mexe no tempo de quem terminou',
     (tela['Ana'] || '').startsWith('10:30'), JSON.stringify(tela));
  ok('so o resultado de quem estourou acompanha o cap',
     (tela['Bia'] || '').startsWith('20:5'), JSON.stringify(tela));

  await nav.close();
  let falhas = 0;
  for (const [n, c, x] of res) { if (!c) falhas++; console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x ? '  [' + x + ']' : ''}`); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})();
