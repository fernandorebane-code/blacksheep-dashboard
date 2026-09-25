// Smoke test do painel do organizador, cobrindo o caminho de uso real:
// entrar, lancar resultados (inclusive WOD de duas partes), salvar, importar a
// lista oficial e mexer na configuracao. Falha se o JS estourar em qualquer ponto.
const { chromium } = require('playwright');
// Caminho do Chromium. Vazio = deixa o Playwright achar o dele.
const CHROME = process.env.CHROME_PATH || '';
// Largura da janela. 390 = celular; o padrao roda como desktop.
const LARGURA = Number(process.env.LARGURA || 1280);
const JANELA = { viewport: { width: LARGURA, height: 900 } };
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const DADOS = JSON.parse(fs.readFileSync(require('path').resolve(__dirname, '..', 'dados', 'campeonato-inicial.json'), 'utf8'));

const WODS = [
  { id: 'w1', nome: 'WOD 1 — Remo + For Time', pub: true,
    partes: [ { id: 'p1', nome: '1k remo', tipo: 'tempo' },
              { id: 'p2', nome: 'For time', tipo: 'tempo' } ] },
  { id: 'w2', nome: 'WOD 2 — Snatch', pub: true, tipo: 'carga' },
];

(async () => {
  const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const pag = await nav.newPage(JANELA);
  const erros = [];
  pag.on('pageerror', e => erros.push('pageerror: ' + e));
  pag.on('console', m => {
    const t = m.text();
    // o proxy desta sessao bloqueia o CDN de fontes; isso nao e bug da pagina
    if (m.type() === 'error' && !/ERR_TUNNEL|ERR_CERT|fonts\.g/.test(t)) erros.push('console: ' + t);
  });

  await pag.addInitScript(({ dados, wods }) => {
    window.__gravado = [];
    let estado = {
      ...dados.config, publicado: true,
      categorias: dados.categorias, unidades: dados.unidades,
      atletas: dados.atletas, wods, resultados: {},
    };
    let avisarSnap = null;
    const doc = {
      onSnapshot: (ok) => { avisarSnap = ok; ok({ exists: true, data: () => estado }); return () => {}; },
      get: async () => ({ exists: true, data: () => ({ ativo: true }) }),
      set: async (patch, opts) => {
        window.__gravado.push({ patch, opts });
        estado = { ...estado, ...patch };           // o Firestore devolveria isso no snapshot
        avisarSnap && avisarSnap({ exists: true, data: () => estado });
      },
    };
    window.firebase = {
      initializeApp: () => {},
      auth: () => ({
        setPersistence: async () => {},
        onAuthStateChanged: (cb) => { window.__authCb = cb; cb(null); },
        signInWithEmailAndPassword: async (email) => {
          const user = { email, uid: 'u1' };
          window.__authCb(user); return { user };
        },
        signOut: async () => window.__authCb(null),
      }),
      firestore: () => ({ collection: () => ({ doc: () => doc }) }),
    };
    window.firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
    // planta estado como se viesse do Firestore (D nao e acessivel de fora)
    window.__plantar = (patch) => {
      estado = { ...estado, ...patch };
      avisarSnap && avisarSnap({ exists: true, data: () => estado });
    };
  }, { dados: DADOS, wods: WODS });

  await pag.goto(BASE + '/organizador.html');
  await pag.waitForTimeout(400);

  const res = [];
  const ok = (n, c, x = '') => { res.push([n, !!c, x]); };
  const ultimo = () => pag.evaluate(() => window.__gravado[window.__gravado.length - 1]);
  const limpar = () => pag.evaluate(() => { window.__gravado = []; });

  ok('login aparece sem auth', await pag.isVisible('#telaLogin'));
  await pag.fill('#logEmail', 'organizador');
  await pag.fill('#logSenha', 'x');
  await pag.click('#logBtn');
  await pag.waitForTimeout(500);
  ok('entrou', await pag.isVisible('#telaPainel'));

  // ---------- ENVIO DOS RESULTADOS ----------
  await pag.click('.admin-tab[data-ap="apResultados"]');
  await pag.waitForTimeout(200);

  const itens = await pag.$$eval('#rWod option', os => os.map(o => ({ v: o.value, t: o.textContent })));
  ok('WOD de 2 partes vira 2 itens pontuados', itens.length === 3, JSON.stringify(itens.map(i => i.v)));

  // parte A do WOD 1: tempo
  await pag.selectOption('#rWod', 'w1::p1');
  await pag.selectOption('#rCat', 'Elite Masculino');
  await pag.waitForTimeout(250);
  const campos = await pag.locator('#rGrid input').count();
  ok('grade abre com os atletas da categoria', campos >= 4, `inputs=${campos}`);

  await limpar();
  const ids = await pag.$$eval('#rGrid input[data-f="v"]', es => es.map(e => e.dataset.at));
  await pag.fill(`#rGrid input[data-f="v"][data-at="${ids[0]}"]`, '3:42');
  await pag.fill(`#rGrid input[data-f="v"][data-at="${ids[1]}"]`, '3:58');
  await pag.click('button:has-text("SALVAR RESULTADOS")');
  await pag.waitForTimeout(400);
  let g = await ultimo();
  ok('salvou resultados da parte A', g && g.patch.resultados &&
     g.patch.resultados[ids[0]]['w1::p1'].v === 222, JSON.stringify(g && g.patch.resultados[ids[0]]));
  ok('3:42 virou 222 segundos', g && g.patch.resultados[ids[0]]['w1::p1'].v === 222);
  ok('salvamento usa mergeFields', g && g.opts && Array.isArray(g.opts.mergeFields) &&
     g.opts.mergeFields.includes('resultados'), JSON.stringify(g && g.opts));

  // tempo invalido nao pode gravar
  await limpar();
  await pag.fill(`#rGrid input[data-f="v"][data-at="${ids[0]}"]`, 'nao é tempo');
  await pag.click('button:has-text("SALVAR RESULTADOS")');
  await pag.waitForTimeout(300);
  const nGravou = await pag.evaluate(() => window.__gravado.length);
  const msgInv = (await pag.textContent('#rMsg')).trim();
  ok('tempo invalido bloqueia o salvamento', nGravou === 0, `gravou=${nGravou}`);
  ok('e avisa qual campo', /inv[aá]lido/i.test(msgInv), msgInv);
  await pag.fill(`#rGrid input[data-f="v"][data-at="${ids[0]}"]`, '3:42');

  // parte B do mesmo WOD: pontuacao separada
  await limpar();
  await pag.selectOption('#rWod', 'w1::p2');
  await pag.waitForTimeout(250);
  const idsB = await pag.$$eval('#rGrid input[data-f="v"]', es => es.map(e => e.dataset.at));
  await pag.fill(`#rGrid input[data-f="v"][data-at="${idsB[0]}"]`, '8:10');
  await pag.click('button:has-text("SALVAR RESULTADOS")');
  await pag.waitForTimeout(400);
  g = await ultimo();
  ok('parte B salva sem apagar a parte A',
     g && g.patch.resultados[ids[0]]['w1::p1'] && g.patch.resultados[idsB[0]]['w1::p2'],
     JSON.stringify(g && g.patch.resultados[ids[0]]));

  // WOD de carga
  await limpar();
  await pag.selectOption('#rWod', 'w2');
  await pag.waitForTimeout(250);
  const idsC = await pag.$$eval('#rGrid input[data-f="v"]', es => es.map(e => e.dataset.at));
  await pag.fill(`#rGrid input[data-f="v"][data-at="${idsC[0]}"]`, '85,5');
  await pag.click('button:has-text("SALVAR RESULTADOS")');
  await pag.waitForTimeout(400);
  g = await ultimo();
  ok('carga aceita virgula decimal', g && g.patch.resultados[idsC[0]].w2.v === 85.5,
     JSON.stringify(g && g.patch.resultados[idsC[0]]));

  // ---------- SUBIR A LISTA DOS ATLETAS ----------
  await pag.click('.admin-tab[data-ap="apAtletas"]');
  await pag.waitForTimeout(300);
  const itensLista = await pag.locator('#atLista .list-item').count();
  ok('lista mostra os 121', itensLista === 121, `itens=${itensLista}`);
  ok('quem nao tem unidade aparece como "sem unidade"',
     (await pag.textContent('#atLista')).includes('sem unidade'));

  // ---------- PROVAS: cada uma com dono ----------
  await pag.click('.admin-tab[data-ap="apWods"]');
  await pag.waitForTimeout(250);

  const niveisNoSelect = await pag.$$eval('#wNivel option', os => os.map(o => o.textContent.trim()));
  ok('o select de nivel agrupa masc e fem', niveisNoSelect.length === 6 &&
     niveisNoSelect.includes('Elite') && niveisNoSelect.includes('Master 45+') &&
     !niveisNoSelect.some(n => /Masculino|Feminino/.test(n)), JSON.stringify(niveisNoSelect));

  // Elite, masculino e feminino
  await limpar();
  await pag.fill('#wNome', 'WOD do Elite');
  await pag.selectOption('#wNivel', 'Elite');
  await pag.selectOption('#wGenero', '');
  await pag.click('#apWods button:has-text("ADICIONAR")');
  await pag.waitForTimeout(400);
  g = await ultimo();
  let nova = g && g.patch.wods && g.patch.wods.find(w => w.nome === 'WOD do Elite');
  ok('nivel Elite + masc e fem vira 2 categorias',
     nova && nova.categorias.length === 2 &&
     nova.categorias.includes('Elite Masculino') && nova.categorias.includes('Elite Feminino'),
     JSON.stringify(nova && nova.categorias));

  // so feminino
  await limpar();
  await pag.fill('#wNome', 'WOD so Fem');
  await pag.selectOption('#wNivel', 'Scaled');
  await pag.selectOption('#wGenero', 'Feminino');
  await pag.click('#apWods button:has-text("ADICIONAR")');
  await pag.waitForTimeout(400);
  g = await ultimo();
  nova = g && g.patch.wods.find(w => w.nome === 'WOD so Fem');
  ok('nivel + so feminino vira 1 categoria',
     nova && nova.categorias.length === 1 && nova.categorias[0] === 'Scaled Feminino',
     JSON.stringify(nova && nova.categorias));

  // todas
  await limpar();
  await pag.fill('#wNome', 'WOD Geral');
  await pag.selectOption('#wNivel', '');
  await pag.click('#apWods button:has-text("ADICIONAR")');
  await pag.waitForTimeout(400);
  g = await ultimo();
  nova = g && g.patch.wods.find(w => w.nome === 'WOD Geral');
  ok('sem nivel vale para todas', nova && nova.categorias.length === 0,
     JSON.stringify(nova && nova.categorias));

  // a lista diz de quem e cada prova
  const textoLista = await pag.textContent('#wLista');
  ok('a lista mostra o dono da prova', /Elite · masculino e feminino/.test(textoLista) &&
     /Scaled · feminino/.test(textoLista) && /todas as categorias/.test(textoLista),
     textoLista.replace(/\s+/g, ' ').slice(0, 200));

  // trocar o dono pela propria lista
  await limpar();
  const linhaElite = pag.locator('#wLista .list-item').filter({ hasText: 'WOD do Elite' }).first();
  await linhaElite.locator('select[aria-label="Quem faz esta prova"]').selectOption('RX|Masculino');
  await pag.waitForTimeout(400);
  g = await ultimo();
  nova = g && g.patch.wods.find(w => w.nome === 'WOD do Elite');
  ok('trocar o dono pela lista grava',
     nova && nova.categorias.length === 1 && nova.categorias[0] === 'RX Masculino',
     JSON.stringify(nova && nova.categorias));

  // o lancamento de resultados so oferece as provas da categoria
  await pag.click('.admin-tab[data-ap="apResultados"]');
  await pag.waitForTimeout(250);
  await pag.selectOption('#rCat', 'Scaled Feminino');
  await pag.waitForTimeout(300);
  let provasOferecidas = await pag.$$eval('#rWod option', os => os.map(o => o.textContent.trim()));
  ok('Scaled Feminino ve a prova dela e a geral',
     provasOferecidas.includes('WOD so Fem') && provasOferecidas.includes('WOD Geral'),
     JSON.stringify(provasOferecidas));
  ok('Scaled Feminino nao ve a prova do RX',
     !provasOferecidas.includes('WOD do Elite'), JSON.stringify(provasOferecidas));

  await pag.selectOption('#rCat', 'RX Masculino');
  await pag.waitForTimeout(300);
  provasOferecidas = await pag.$$eval('#rWod option', os => os.map(o => o.textContent.trim()));
  ok('RX Masculino ve a prova que passou para ele',
     provasOferecidas.includes('WOD do Elite') && !provasOferecidas.includes('WOD so Fem'),
     JSON.stringify(provasOferecidas));

  await pag.click('.admin-tab[data-ap="apAtletas"]');
  await pag.waitForTimeout(250);

  // filtrar a lista: achar uma pessoa entre 121
  const conta = () => pag.locator('#atLista .list-item').count();
  ok('sem filtro mostra todos', (await conta()) === 121);
  ok('contador mostra o total', (await pag.textContent('#atConta')).includes('121'));

  await pag.selectOption('#fltCat', 'Elite Masculino');
  await pag.waitForTimeout(200);
  ok('filtro por categoria', (await conta()) === 4, `n=${await conta()}`);
  ok('contador diz quantos de quantos', /mostrando 4 de 121/.test(await pag.textContent('#atConta')),
     (await pag.textContent('#atConta')).trim());

  await pag.selectOption('#fltCat', '');
  await pag.selectOption('#fltUni', 'Moema');
  await pag.waitForTimeout(200);
  const nMoema = await conta();
  ok('filtro por unidade', nMoema > 0 && nMoema < 121, `n=${nMoema}`);

  await pag.selectOption('#fltUni', '— sem unidade —');
  await pag.waitForTimeout(200);
  ok('filtro pega os 8 sem unidade', (await conta()) === 8, `n=${await conta()}`);

  await pag.selectOption('#fltUni', '');
  await pag.fill('#fltNome', 'joao');
  await pag.waitForTimeout(200);
  const achados = await pag.locator('#atLista .nm-edit').evaluateAll(es => es.map(e => e.value));
  ok('busca sem acento acha com acento', achados.some(n => /João/.test(n)), JSON.stringify(achados));

  // categoria + nome ao mesmo tempo
  await pag.fill('#fltNome', 'a');
  await pag.selectOption('#fltCat', 'Scaled Feminino');
  await pag.waitForTimeout(200);
  const cats = await pag.locator('#atLista .list-item select[aria-label="Categoria"]').evaluateAll(
    es => [...new Set(es.map(e => e.value))]);
  ok('filtros se combinam', cats.length === 1 && cats[0] === 'Scaled Feminino', JSON.stringify(cats));

  await pag.fill('#fltNome', 'zzzzz');
  await pag.waitForTimeout(200);
  ok('filtro sem resultado avisa', /Nenhum atleta com esse filtro/.test(await pag.textContent('#atLista')));

  await pag.click('button:has-text("LIMPAR")');
  await pag.waitForTimeout(200);
  ok('limpar volta a lista inteira', (await conta()) === 121, `n=${await conta()}`);

  // o uso real: filtrar para achar alguem, editar, e a lista re-renderiza.
  // se o filtro se perdesse a cada gravacao, ele nao serviria para nada.
  await pag.selectOption('#fltUni', '— sem unidade —');
  await pag.waitForTimeout(200);
  const primeiro = pag.locator('#atLista .list-item').first();
  await primeiro.locator('select[aria-label="Unidade"]').selectOption('Itaim');
  await pag.waitForTimeout(500);
  ok('filtro sobrevive a gravacao', (await pag.inputValue('#fltUni')) === '— sem unidade —',
     await pag.inputValue('#fltUni'));
  ok('quem ganhou unidade sai do filtro na hora', (await conta()) === 7, `n=${await conta()}`);
  await pag.click('button:has-text("LIMPAR")');
  await pag.waitForTimeout(200);

  // editar nome, categoria e unidade na propria linha, sem excluir e recadastrar
  await limpar();
  const linha = pag.locator('#atLista .list-item').first();
  const idAntes = await pag.evaluate(() => window.__D ? null : null);
  const nomeAntes = await linha.locator('.nm-edit').inputValue();
  await linha.locator('.nm-edit').fill(nomeAntes + ' Corrigido');
  await linha.locator('.nm-edit').blur();
  await pag.waitForTimeout(400);
  g = await ultimo();
  const editado = g && g.patch.atletas && g.patch.atletas.find(a => a.nome === nomeAntes + ' Corrigido');
  ok('editar nome na linha grava', !!editado, JSON.stringify(editado));

  // o id tem de sobreviver: e ele que amarra os resultados ja lancados
  const idsDepois = g ? g.patch.atletas.map(a => a.id) : [];
  ok('editar nome preserva o id (e os resultados)', editado && idsDepois.filter(i => i === editado.id).length === 1,
     editado && editado.id);
  ok('editar nome nao mexe na contagem', idsDepois.length === 121, `n=${idsDepois.length}`);

  // nome em branco nao pode passar
  await limpar();
  await linha.locator('.nm-edit').fill('   ');
  await linha.locator('.nm-edit').blur();
  await pag.waitForTimeout(400);
  ok('nome em branco nao grava', (await pag.evaluate(() => window.__gravado.length)) === 0);

  // unidade: e assim que os 8 sem unidade vao ser preenchidos
  await limpar();
  const semUni = pag.locator('#atLista .list-item').filter({ has: pag.locator('select[aria-label="Unidade"] option[value=""][selected]') }).first();
  const alvo = (await semUni.count()) ? semUni : linha;
  await alvo.locator('select[aria-label="Unidade"]').selectOption('Moema');
  await pag.waitForTimeout(400);
  g = await ultimo();
  ok('editar unidade na linha grava', g && g.patch.atletas && g.patch.atletas.some(a => a.unidade === 'Moema'));

  // categoria continua editavel
  await limpar();
  await linha.locator('select[aria-label="Categoria"]').selectOption('Scaled Masculino');
  await pag.waitForTimeout(400);
  g = await ultimo();
  ok('editar categoria na linha grava', g && g.patch.atletas &&
     g.patch.atletas.some(a => a.categoria === 'Scaled Masculino'));

  await limpar();
  pag.once('dialog', d => d.accept());        // o confirm de substituicao
  await pag.click('button:has-text("IMPORTAR LISTA OFICIAL")');
  await pag.waitForTimeout(900);
  g = await ultimo();
  ok('carga inicial buscou e gravou', g && Array.isArray(g.patch.atletas), JSON.stringify(g && Object.keys(g.patch || {})));
  ok('carga inicial subiu 121 atletas', g && g.patch.atletas.length === 121, `n=${g && g.patch.atletas && g.patch.atletas.length}`);
  ok('carga inicial manda categorias e unidades', g && g.patch.categorias && g.patch.unidades);
  const msgCarga = (await pag.textContent('#cargaMsg')).trim();
  ok('carga avisa o que fez', /121/.test(msgCarga), msgCarga);

  // ---------- TIME CAP, NA TELA DE LANCAMENTO ----------
  // O cap pertence a prova, mas se define aqui: quem lanca o resultado e quem
  // sabe qual foi o cap, e e olhando para esta tela que ele precisa dele.
  await pag.click('.admin-tab[data-ap="apResultados"]');
  await pag.waitForTimeout(300);
  await pag.selectOption('#rCat', 'Elite Masculino');
  await pag.waitForTimeout(300);

  const porTipo = await pag.$$eval('#rWod option', os => os.map(o => o.value));
  await pag.selectOption('#rWod', porTipo[0]);   // WOD 1 parte A, por tempo
  await pag.waitForTimeout(300);
  ok('prova por tempo mostra o campo de time cap', await pag.isVisible('#rCapLinha'));

  // um valor diferente do que ja esta la, senao o change nem dispara
  const idItem = await pag.inputValue('#rWod');
  const [idWod, idParte] = idItem.split('::');
  await limpar();
  await pag.fill('#rCap', '12:34');
  await pag.locator('#rCap').blur();
  await pag.waitForTimeout(500);
  g = await ultimo();
  const gravada = g && g.patch.wods && g.patch.wods.find(w => w.id === idWod);
  const capGravado = !gravada ? null
    : idParte ? (gravada.partes.find(x => x.id === idParte) || {}).cap
              : gravada.cap;
  ok('o cap grava na prova (ou na parte) selecionada', capGravado === 754,
     'item=' + idItem + ' cap=' + capGravado);

  await limpar();
  await pag.fill('#rCap', 'abacaxi');
  await pag.locator('#rCap').blur();
  await pag.waitForTimeout(400);
  ok('cap invalido nao grava', (await pag.evaluate(() => window.__gravado.length)) === 0);

  // prova por carga nao tem cap
  const semTempo = await pag.$$eval('#rWod option',
    os => os.map(o => o.textContent.trim()).findIndex(t => /Snatch/.test(t)));
  if (semTempo >= 0) {
    await pag.selectOption('#rWod', porTipo[semTempo]);
    await pag.waitForTimeout(300);
    ok('prova que nao e por tempo esconde o campo', !(await pag.isVisible('#rCapLinha')));
  }

  ok('o cadastro de prova nao pede mais o cap', (await pag.locator('#wCap').count()) === 0);

  // ---------- CARGA INICIAL COM PROVAS ----------
  // O JSON servido pelo servidor local nao tem wods, entao aqui o fetch e
  // interceptado para devolver um arquivo com provas e conferir a poda dos
  // resultados que apontam para prova que saiu da lista.
  await pag.route('**/dados/campeonato-inicial.json', async rota => {
    await rota.fulfill({ contentType: 'application/json', body: JSON.stringify({
      config: { nome: 'Blacksheep Invitational', data: 'Setembro 2026', local: 'São Paulo' },
      categorias: ['Elite Masculino', 'Elite Feminino', 'Scaled Masculino', 'Scaled Feminino'],
      unidades: ['Moema', 'Itaim'],
      atletas: [
        { id: 'x1', nome: 'Atleta Um', categoria: 'Elite Masculino', unidade: 'Moema' },
        { id: 'x2', nome: 'Atleta Dois', categoria: 'Scaled Feminino', unidade: 'Itaim' },
      ],
      wods: [
        { id: 'k1', nome: 'WOD 1 do arquivo', tipo: 'tempo', pub: true, ordem: 1, categorias: [],
          partes: [{ id: 'a', nome: 'Remo', tipo: 'tempo' }, { id: 'b', nome: 'For time', tipo: 'tempo' }] },
        { id: 'k2', nome: 'WOD 2 só Elite', tipo: 'carga', pub: true, ordem: 2,
          categorias: ['Elite Masculino', 'Elite Feminino'] },
      ],
    }) });
  });

  // resultado plantado: um item que sobrevive e um que some com a troca de provas
  await pag.evaluate(() => {
    window.__gravado = [];
    window.__plantar({
      atletas: [{ id: 'x1', nome: 'Atleta Um', categoria: 'Elite Masculino', unidade: 'Moema' }],
      resultados: { x1: { 'k1::a': { v: 200, cap: null }, 'prova-que-sai': { v: 999, cap: null } } },
    });
  });
  await pag.click('.admin-tab[data-ap="apAtletas"]');
  await pag.waitForTimeout(300);
  pag.once('dialog', d => d.accept());
  await pag.click('button:has-text("IMPORTAR LISTA OFICIAL")');
  await pag.waitForTimeout(900);
  g = await ultimo();
  ok('carga importa as provas do arquivo', g && Array.isArray(g.patch.wods) && g.patch.wods.length === 2,
     JSON.stringify(g && g.patch.wods && g.patch.wods.map(w => w.nome)));
  ok('prova do arquivo mantem as categorias dela',
     g && g.patch.wods[1].categorias.length === 2, JSON.stringify(g && g.patch.wods[1].categorias));
  ok('carga guarda o resultado da prova que ficou',
     g && g.patch.resultados.x1 && g.patch.resultados.x1['k1::a'],
     JSON.stringify(g && g.patch.resultados.x1));
  ok('carga poda o resultado da prova que saiu',
     g && g.patch.resultados.x1 && !g.patch.resultados.x1['prova-que-sai'],
     JSON.stringify(g && g.patch.resultados.x1));
  const msgCarga2 = (await pag.textContent('#cargaMsg')).trim();
  ok('carga avisa quantas provas subiram', /2 provas/.test(msgCarga2), msgCarga2);
  await pag.unroute('**/dados/campeonato-inicial.json');

  // ---------- CONFIGURACAO ----------
  await pag.click('.admin-tab[data-ap="apConfig"]');
  await pag.waitForTimeout(250);
  ok('config vem preenchida', (await pag.inputValue('#cNome')) === 'Blacksheep Invitational',
     await pag.inputValue('#cNome'));
  await limpar();
  await pag.fill('#cData', 'Setembro 2026');
  await pag.fill('#cLocal', 'São Paulo');
  await pag.click('button:has-text("SALVAR CONFIG")');
  await pag.waitForTimeout(400);
  g = await ultimo();
  ok('config salva data e local', g && g.patch.data === 'Setembro 2026' && g.patch.local === 'São Paulo',
     JSON.stringify(g && g.patch));

  await pag.click('#btnSair');
  await pag.waitForTimeout(400);
  ok('sair volta ao login', await pag.isVisible('#telaLogin'));

  let falhas = 0;
  for (const [n, c, x] of res) { if (!c) falhas++; console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x ? '  [' + x + ']' : ''}`); }
  if (erros.length) { falhas++; console.log('\nERROS DE JS:'); [...new Set(erros)].forEach(e => console.log('  ' + e)); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  await nav.close();
  process.exit(falhas ? 1 : 0);
})();
