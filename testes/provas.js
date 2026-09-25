// Prova por categoria: o leaderboard publico so pode mostrar, e so pode contar,
// as provas da categoria aberta. Uma prova do Elite entrando no total do Scaled
// bagunçaria a classificacao inteira sem dar erro nenhum.
const { chromium } = require('playwright');
// Caminho do Chromium. Vazio = deixa o Playwright achar o dele.
const CHROME = process.env.CHROME_PATH || '';
// Largura da janela. 390 = celular; o padrao roda como desktop.
const LARGURA = Number(process.env.LARGURA || 1280);
const JANELA = { viewport: { width: LARGURA, height: 900 } };
const PAGINA = process.env.PAGINA || require('path').resolve(__dirname, '..', 'publico', 'index.html');

const ATLETAS = [
  { id: 'e1', nome: 'Elite Um',   categoria: 'Elite Masculino',  unidade: 'Moema' },
  { id: 'e2', nome: 'Elite Dois',  categoria: 'Elite Masculino',  unidade: 'Moema' },
  { id: 's1', nome: 'Scaled Um',   categoria: 'Scaled Masculino', unidade: 'Itaim' },
  { id: 's2', nome: 'Scaled Dois', categoria: 'Scaled Masculino', unidade: 'Itaim' },
];

const WODS = [
  // vale para todo mundo (sem categorias definidas)
  { id: 'wg', nome: 'WOD Geral', tipo: 'tempo', pub: true, ordem: 1, categorias: [] },
  // so Elite, masculino e feminino
  { id: 'we', nome: 'WOD do Elite', tipo: 'tempo', pub: true, ordem: 2,
    categorias: ['Elite Masculino', 'Elite Feminino'], desc: 'Snatch 60kg / 40kg' },
  // so Scaled
  { id: 'ws', nome: 'WOD do Scaled', tipo: 'reps', pub: true, ordem: 3,
    categorias: ['Scaled Masculino', 'Scaled Feminino'], desc: 'AMRAP 10 min' },
];

const RESULTADOS = {
  e1: { wg: { v: 300, cap: null }, we: { v: 100, cap: null } },
  e2: { wg: { v: 400, cap: null }, we: { v: 90,  cap: null } },
  s1: { wg: { v: 500, cap: null }, ws: { v: 80,  cap: null } },
  s2: { wg: { v: 600, cap: null }, ws: { v: 95,  cap: null } },
};

(async () => {
  const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const pag = await nav.newPage(JANELA);
  const erros = [];
  pag.on('pageerror', e => erros.push('pageerror: ' + e));
  pag.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/ERR_TUNNEL|ERR_CERT|fonts\.g/.test(t)) erros.push('console: ' + t);
  });

  await pag.addInitScript(d => {
    const doc = {
      onSnapshot: (ok) => { ok({ exists: true, data: () => d }); return () => {}; },
    };
    window.firebase = {
      initializeApp: () => {},
      firestore: () => ({ collection: () => ({ doc: () => doc }) }),
    };
  }, {
    nome: 'Blacksheep Invitational', data: 'Setembro 2026', local: 'São Paulo',
    publicado: true, sistema: 'posicao', p1: 100, dec: 5,
    categorias: ['Elite Masculino', 'Elite Feminino', 'Scaled Masculino', 'Scaled Feminino'],
    unidades: ['Moema', 'Itaim'],
    atletas: ATLETAS, wods: WODS, resultados: RESULTADOS,
  });

  await pag.goto('file://' + PAGINA);
  await pag.waitForTimeout(600);

  const res = [];
  const ok = (n, c, x = '') => res.push([n, !!c, x]);
  const colunas = () => pag.$$eval('#thead th', ths => ths.map(t => t.textContent.trim()));
  const cards = () => pag.$$eval('.wod-card h3', hs => hs.map(h => h.textContent.trim()));

  // ---- Elite ----
  await pag.selectOption('#seletorCat', 'Elite Masculino');
  await pag.waitForTimeout(300);
  let col = await colunas();
  ok('Elite ve a prova geral', col.some(c => /GERAL/i.test(c)), JSON.stringify(col));
  ok('Elite ve a prova dele', col.some(c => /^WOD do Eli/i.test(c)), JSON.stringify(col));
  ok('Elite NAO ve a prova do Scaled', !col.some(c => /^WOD do Sca/i.test(c)), JSON.stringify(col));

  let c = await cards();
  ok('legenda do Elite tem as 2 provas dele', c.length === 2 && c.includes('WOD do Elite'), JSON.stringify(c));
  ok('legenda do Elite nao traz a do Scaled', !c.includes('WOD do Scaled'), JSON.stringify(c));

  // Elite Um: 1o no geral (300s), 2o no dele (100 > 90) = 1 + 2 = 3
  // Elite Dois: 2o no geral, 1o no dele = 2 + 1 = 3  -> empate, desempate por posicoes
  let linhas = await pag.$$eval('#tbody tr', trs =>
    trs.map(t => [...t.querySelectorAll('td')].map(d => d.textContent.trim())));
  ok('Elite: 2 atletas na tabela', linhas.length === 2, `n=${linhas.length}`);
  const totalElite = linhas.map(l => l[l.length - 1]);
  ok('Elite: total conta so as 2 provas dele', totalElite.every(t => t === '3'), JSON.stringify(totalElite));

  // ---- Scaled ----
  await pag.selectOption('#seletorCat', 'Scaled Masculino');
  await pag.waitForTimeout(300);
  col = await colunas();
  ok('Scaled ve a prova geral', col.some(x => /GERAL/i.test(x)), JSON.stringify(col));
  ok('Scaled ve a prova dele', col.some(x => /^WOD do Sca/i.test(x)), JSON.stringify(col));
  ok('Scaled NAO ve a prova do Elite', !col.some(x => /^WOD do Eli/i.test(x)), JSON.stringify(col));

  // Scaled Um: 1o no geral (500s), 2o no dele (80 reps < 95) = 1 + 2 = 3
  // Scaled Dois: 2o no geral, 1o no dele = 3
  linhas = await pag.$$eval('#tbody tr', trs =>
    trs.map(t => [...t.querySelectorAll('td')].map(d => d.textContent.trim())));
  const totalScaled = linhas.map(l => l[l.length - 1]);
  ok('Scaled: total conta so as 2 provas dele', totalScaled.every(t => t === '3'), JSON.stringify(totalScaled));
  ok('Scaled: ninguem levou penalidade por prova de outra categoria',
     !totalScaled.some(t => Number(t) > 3), JSON.stringify(totalScaled));

  let falhas = 0;
  for (const [n, c2, x] of res) { if (!c2) falhas++; console.log(`${c2 ? 'ok    ' : 'FALHOU'} ${n}${x ? '  [' + x + ']' : ''}`); }
  if (erros.length) { falhas++; console.log('\nERROS DE JS:'); [...new Set(erros)].forEach(e => console.log('  ' + e)); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  await nav.close();
  process.exit(falhas ? 1 : 0);
})();
