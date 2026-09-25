// Auditoria de celular: percorre os estados das duas paginas e falha nos
// defeitos que da para medir sozinho — conteudo vazando para fora da tela,
// alvo de toque pequeno demais e texto miudo demais.
//
// Existe porque esses defeitos nao aparecem em teste de comportamento: a pagina
// funciona, so que ilegivel. Foi assim que as colunas das provas ficaram
// escondidas atras da coluna do total sem ninguem notar.
//
//   node testes/celular.js            # 390px, um iPhone
//   LARGURA=360 node testes/celular.js
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '';
const LARGURA = Number(process.env.LARGURA || 390);
const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const RAIZ = path.resolve(__dirname, '..');
const DADOS = require('./dados-celular.js');

// As regras de celular valem abaixo de 700px (o @media da fonte). Rodar isto
// numa largura de desktop acusaria o desenho de desktop como defeito.
if (LARGURA > 700) {
  console.error(`celular.js e para telas estreitas; ${LARGURA}px cai no desenho de desktop.`);
  console.error('Use LARGURA=390 (ou menor). Para desktop, os testes sao login/painel/provas.');
  process.exit(2);
}

const ALTURA_MINIMA = 36;   // alvo de toque confortavel com o dedo
const FONTE_MINIMA = 10;    // abaixo disso vira borrao no telefone

const falhas = [];

function stub(pag, dados) {
  return pag.addInitScript(d => {
    let estado = JSON.parse(JSON.stringify(d));
    let avisa = null;
    const doc = {
      onSnapshot: (ok) => { avisa = ok; ok({ exists: true, data: () => estado }); return () => {}; },
      get: async () => ({ exists: true, data: () => ({ ativo: true }) }),
      set: async (p) => { estado = { ...estado, ...p }; avisa && avisa({ exists: true, data: () => estado }); },
    };
    window.firebase = {
      initializeApp: () => {},
      auth: () => ({
        setPersistence: async () => {},
        onAuthStateChanged: (cb) => { window.__authCb = cb; cb(null); },
        signInWithEmailAndPassword: async (e) => { const u = { email: e, uid: 'u1' }; window.__authCb(u); return { user: u }; },
        signOut: async () => window.__authCb(null),
      }),
      firestore: () => ({ collection: () => ({ doc: () => doc }) }),
    };
    window.firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
  }, dados);
}

async function conferir(pag, estado) {
  const m = await pag.evaluate(({ alturaMin, fonteMin }) => {
    const vw = window.innerWidth;
    const vaza = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.right <= vw + 1 && r.left >= -1) return;
      if (getComputedStyle(el).position === 'fixed') return;
      // o que esta dentro de um container que rola de proposito nao conta
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return;
      }
      vaza.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 30)}"> vai ate ${Math.round(r.right)}px`);
    });

    const pequenos = [];
    document.querySelectorAll('button,select,summary,a[href],textarea,input:not([type=checkbox])').forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.height < alturaMin) {
        pequenos.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 24)}"> ${Math.round(r.height)}px "${(el.textContent || '').trim().slice(0, 16)}"`);
      }
    });

    const miudos = [];
    document.querySelectorAll('body *').forEach(el => {
      if (el.children.length || !el.textContent.trim()) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;   // escondido nao incomoda ninguem
      const f = parseFloat(getComputedStyle(el).fontSize);
      if (f < fonteMin) miudos.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 24)}"> ${f}px`);
    });

    return {
      vw, scrollW: document.documentElement.scrollWidth,
      vaza: [...new Set(vaza)].slice(0, 5),
      pequenos: [...new Set(pequenos)].slice(0, 5),
      miudos: [...new Set(miudos)].slice(0, 5),
    };
  }, { alturaMin: ALTURA_MINIMA, fonteMin: FONTE_MINIMA });

  const problemas = [];
  if (m.scrollW > m.vw + 1) problemas.push(`pagina com ${m.scrollW}px numa tela de ${m.vw}px`);
  m.vaza.forEach(v => problemas.push('vaza da tela: ' + v));
  m.pequenos.forEach(v => problemas.push(`alvo menor que ${ALTURA_MINIMA}px: ` + v));
  m.miudos.forEach(v => problemas.push(`texto menor que ${FONTE_MINIMA}px: ` + v));

  if (problemas.length) {
    falhas.push(estado);
    console.log(`FALHOU ${estado}`);
    problemas.forEach(p => console.log('       ' + p));
  } else {
    console.log(`ok     ${estado}`);
  }
}

(async () => {
  const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await nav.newContext({ viewport: { width: LARGURA, height: 844 } });

  // ---- pagina publica ----
  const pub = await ctx.newPage();
  await stub(pub, DADOS);
  await pub.goto('file://' + RAIZ + '/publico/index.html');
  await pub.waitForTimeout(700);
  await conferir(pub, 'publico · leaderboard');

  await pub.selectOption('#seletorCat', 'Master 45+ Feminino');
  await pub.waitForTimeout(400);
  await conferir(pub, 'publico · outra categoria');

  await pub.click('#wodBloco summary');
  await pub.waitForTimeout(300);
  await conferir(pub, 'publico · provas abertas');

  await pub.fill('#busca', 'Maria');
  await pub.waitForTimeout(300);
  await conferir(pub, 'publico · busca');
  await pub.fill('#busca', '');
  await pub.waitForTimeout(200);

  await pub.click('#tbody tr');
  await pub.waitForTimeout(400);
  await conferir(pub, 'publico · detalhe do atleta');
  await pub.keyboard.press('Escape');

  // ---- organizador ----
  const org = await ctx.newPage();
  await stub(org, DADOS);
  await org.goto(BASE + '/organizador.html');
  await org.waitForTimeout(600);
  await conferir(org, 'organizador · login');

  await org.fill('#logEmail', 'organizador');
  await org.fill('#logSenha', 'x');
  await org.click('#logBtn');
  await org.waitForTimeout(700);
  await conferir(org, 'organizador · resultados');

  for (const [aba, nome] of [['apAtletas', 'atletas'], ['apWods', 'provas'], ['apConfig', 'config']]) {
    await org.click(`.admin-tab[data-ap="${aba}"]`);
    await org.waitForTimeout(500);
    await conferir(org, 'organizador · ' + nome);
  }

  await org.click('.admin-tab[data-ap="apWods"]');
  await org.waitForTimeout(300);
  await org.click('#wLista button:has-text("PARTES")');
  await org.waitForTimeout(400);
  await conferir(org, 'organizador · modal partes');

  await nav.close();
  console.log(falhas.length ? `\n${falhas.length} ESTADO(S) COM PROBLEMA` : '\nTUDO PASSOU');
  process.exit(falhas.length ? 1 : 0);
})();
