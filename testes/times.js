// Campeonato de times: o competidor e o time, e os tres nomes aparecem embaixo
// do nome dele. O motor de pontuacao e o mesmo de sempre — o que muda e o
// rotulo na tela e o campo `integrantes`. Este teste existe porque "atleta"
// estava escrito em quinze lugares diferentes: um leaderboard de times com
// "Atleta" no cabecalho e "11 atletas" no topo passa como bug de verdade.
const { chromium } = require('playwright');
// Caminho do Chromium. Vazio = deixa o Playwright achar o dele.
const CHROME = process.env.CHROME_PATH || '';
// Largura da janela. 390 = celular; o padrao roda como desktop.
const LARGURA = Number(process.env.LARGURA || 1280);
const JANELA = { viewport: { width: LARGURA, height: 900 } };
const path = require('path');
const PUBLICO = process.env.PAGINA || path.resolve(__dirname, '..', 'publico', 'index.html');
const ORG = process.env.PAGINA_ORG || path.resolve(__dirname, '..', 'organizador.html');

const TIMES = [
  { id: 't1', nome: 'XURIS',          categoria: 'RX', unidade: '', integrantes: 'João Paulo, Karina, Vini Melo' },
  { id: 't2', nome: 'Team Turista',   categoria: 'RX', unidade: '', integrantes: 'André, Janaína, Rafaela' },
  { id: 't3', nome: '3x mais cansados', categoria: 'RX', unidade: '', integrantes: 'Juliane, Jonathan, Aline' },
];
const WODS = [{ id: 'w1', nome: 'PROVA 1', tipo: 'tempo', pub: true, ordem: 1, categorias: [] }];
// t3 fica sem resultado de proposito: e o que faz a grade do organizador
// mostrar a contagem de pendentes, que tambem precisa falar em time.
const RESULTADOS = { t1: { w1: { v: 300 } }, t2: { w1: { v: 400 } } };

const BASE_DADOS = {
  nome: 'CT Storm Championship', data: 'Março 2027', local: 'CT Storm',
  publicado: true, sistema: 'posicao', p1: 100, dec: 5,
  categorias: ['RX', 'Scale'], unidades: [],
  atletas: TIMES, wods: WODS, resultados: RESULTADOS,
};

const res = [];
const ok = (n, c, x = '') => res.push([n, !!c, x]);

function dublê(pag, dados) {
  return pag.addInitScript(d => {
    let estado = d;
    let avisarSnap = null;
    const doc = {
      onSnapshot: (cb) => { avisarSnap = cb; cb({ exists: true, data: () => estado }); return () => {}; },
      get: async () => ({ exists: true, data: () => ({ ativo: true }) }),
      set: async (patch) => {
        estado = { ...estado, ...patch };
        avisarSnap && avisarSnap({ exists: true, data: () => estado });
      },
    };
    window.firebase = {
      initializeApp: () => {},
      auth: () => ({
        setPersistence: async () => {},
        onAuthStateChanged: (cb) => { window.__authCb = cb; cb(null); },
        signInWithEmailAndPassword: async (email) => {
          const user = { email, uid: 'u1' }; window.__authCb(user); return { user };
        },
        signOut: async () => window.__authCb(null),
      }),
      firestore: () => ({ collection: () => ({ doc: () => doc }) }),
    };
    window.firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
  }, dados);
}

(async () => {
  const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const erros = [];
  const vigiar = pag => {
    pag.on('pageerror', e => erros.push('pageerror: ' + e));
    pag.on('console', m => {
      const t = m.text();
      if (m.type() === 'error' && !/ERR_TUNNEL|ERR_CERT|fonts\.g/.test(t)) erros.push('console: ' + t);
    });
  };

  // ---------- PUBLICO, MODO TIME ----------
  let pag = await nav.newPage(JANELA);
  vigiar(pag);
  await dublê(pag, { ...BASE_DADOS, competidor: 'time' });
  await pag.goto('file://' + PUBLICO);
  await pag.waitForTimeout(600);

  const colunas = await pag.$$eval('#thead th', ths => ths.map(t => t.textContent.trim()));
  ok('cabecalho da tabela diz Time', colunas[1] === 'Time', JSON.stringify(colunas));
  ok('o topo conta times, nao atletas',
     /times/.test(await pag.textContent('#hAtletas')), await pag.textContent('#hAtletas'));
  ok('a busca procura time',
     (await pag.getAttribute('#busca', 'placeholder')).includes('time'),
     await pag.getAttribute('#busca', 'placeholder'));
  const unidades = await pag.$$eval('#tbody td.atleta .unit', es => es.map(e => e.textContent.trim()));
  ok('os integrantes aparecem embaixo do nome do time',
     unidades[0] === 'João Paulo, Karina, Vini Melo', JSON.stringify(unidades[0]));
  const legenda = await pag.textContent('#legend');
  ok('a legenda fala em time', /time\(s\) na categoria/.test(legenda) && !/atleta/.test(legenda),
     legenda.slice(-90));

  // o detalhe tambem: os integrantes entram no subtitulo
  await pag.click('#tbody tr:first-child');
  await pag.waitForTimeout(250);
  const sub = await pag.textContent('#aSub');
  ok('o detalhe do time mostra os integrantes', sub.includes('João Paulo'), sub);

  // ---------- PUBLICO, MODO ATLETA (o de sempre, sem competidor) ----------
  await pag.close();
  pag = await nav.newPage(JANELA);
  vigiar(pag);
  await dublê(pag, BASE_DADOS);        // sem `competidor`
  await pag.goto('file://' + PUBLICO);
  await pag.waitForTimeout(600);
  const col2 = await pag.$$eval('#thead th', ths => ths.map(t => t.textContent.trim()));
  ok('sem a marca de time, continua Atleta', col2[1] === 'Atleta', JSON.stringify(col2));
  ok('sem a marca de time, o topo conta atletas',
     /atletas/.test(await pag.textContent('#hAtletas')), await pag.textContent('#hAtletas'));
  // e o campo integrantes, se existir, ainda aparece — e so um rotulo que muda
  const u2 = await pag.$$eval('#tbody td.atleta .unit', es => es.map(e => e.textContent.trim()));
  ok('o campo integrantes nao depende do modo', u2[0] === 'João Paulo, Karina, Vini Melo', JSON.stringify(u2[0]));

  // ---------- ORGANIZADOR, MODO TIME ----------
  await pag.close();
  pag = await nav.newPage(JANELA);
  vigiar(pag);
  await dublê(pag, { ...BASE_DADOS, competidor: 'time' });
  await pag.goto('file://' + ORG);
  await pag.waitForTimeout(400);
  await pag.fill('#logEmail', 'organizador');
  await pag.fill('#logSenha', 'x');
  await pag.click('#logBtn');
  await pag.waitForTimeout(500);
  ok('entrou no painel', await pag.isVisible('#telaPainel'));

  ok('a configuracao abre em Times', (await pag.inputValue('#cCompetidor')) === 'time');
  await pag.click('.admin-tab[data-ap="apAtletas"]');
  await pag.waitForTimeout(200);
  ok('o campo de integrantes aparece', await pag.isVisible('#atInt'));
  ok('o cadastro pede nome do time',
     (await pag.getAttribute('#atNome', 'placeholder')) === 'Nome do time',
     await pag.getAttribute('#atNome', 'placeholder'));
  ok('a dica do colar em massa pede os integrantes',
     (await pag.textContent('#atDica')).includes('Integrantes'), await pag.textContent('#atDica'));
  ok('a lista conta times', (await pag.textContent('#atConta')).includes('times'),
     await pag.textContent('#atConta'));
  const linhaUm = await pag.textContent('#atLista .list-item:first-child');
  ok('a lista deixa editar os integrantes',
     await pag.locator('#atLista .list-item:first-child input[aria-label="Integrantes do time"]').count() === 1,
     linhaUm.trim().slice(0, 40));

  // a grade de lancamento
  await pag.click('.admin-tab[data-ap="apResultados"]');
  await pag.waitForTimeout(250);
  await pag.selectOption('#rWod', 'w1');
  await pag.selectOption('#rCat', 'RX');
  await pag.waitForTimeout(250);
  ok('a grade de resultado diz Time',
     (await pag.textContent('#rGrid thead')).trim().startsWith('Time'),
     (await pag.textContent('#rGrid thead')).trim());
  const naGrade = await pag.$$eval('#rGrid td.atl .unit', es => es.map(e => e.textContent.trim()));
  ok('a grade mostra os integrantes embaixo do time',
     naGrade.some(u => u.includes('Karina')), JSON.stringify(naGrade[0] || ''));
  ok('a contagem de pendentes fala em time',
     /time\(s\) ainda sem resultado/.test(await pag.textContent('#rContagem')),
     await pag.textContent('#rContagem'));

  // trocar para atleta esconde o campo, sem precisar salvar
  await pag.click('.admin-tab[data-ap="apConfig"]');
  await pag.selectOption('#cCompetidor', 'atleta');
  await pag.waitForTimeout(200);
  await pag.click('.admin-tab[data-ap="apAtletas"]');
  await pag.waitForTimeout(200);
  ok('voltando para atleta, o campo de integrantes some', !(await pag.isVisible('#atInt')));

  // ---------- CELULAR: a linha extra nao pode vazar da tela ----------
  await pag.close();
  pag = await nav.newPage({ viewport: { width: 390, height: 900 } });
  vigiar(pag);
  await dublê(pag, { ...BASE_DADOS, competidor: 'time' });
  await pag.goto('file://' + ORG);
  await pag.waitForTimeout(400);
  await pag.fill('#logEmail', 'organizador');
  await pag.fill('#logSenha', 'x');
  await pag.click('#logBtn');
  await pag.waitForTimeout(500);
  await pag.click('.admin-tab[data-ap="apAtletas"]');
  await pag.waitForTimeout(300);
  const vazou = await pag.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  ok('no celular a lista de times nao vaza para o lado', vazou <= 0, `sobra=${vazou}px`);

  let falhas = 0;
  for (const [n, c, x] of res) { if (!c) falhas++; console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x ? '  [' + x + ']' : ''}`); }
  if (erros.length) { falhas++; console.log('\nERROS DE JS:'); [...new Set(erros)].forEach(e => console.log('  ' + e)); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  await nav.close();
  process.exit(falhas ? 1 : 0);
})();
