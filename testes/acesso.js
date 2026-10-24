// Quem abre o painel tem de ser exatamente quem a regra do Firestore deixa
// escrever. Este teste existe por um bug que so apareceu no dia do evento: a
// pagina de um campeonato de outra academia conferia o acesso na whitelist do
// dashboard da casa, entao a conta da mesa logava e levava "nao tem acesso de
// organizador" — enquanto a regra, por UID em outra colecao, teria deixado.
const { chromium } = require('playwright');
const CHROME = process.env.CHROME_PATH || '';
const path = require('path');
const ORG = process.env.PAGINA_ORG || path.resolve(__dirname, '..', 'organizador.html');

// Cada caso diz o que existe no banco e quem tenta entrar.
const res = [];
const ok = (n, c, x = '') => res.push([n, !!c, x]);

async function entrar(nav, pagina, { listas, usuario, uid }) {
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  await p.addInitScript(({ listas, uid }) => {
    const doc = {
      onSnapshot: (cb) => { cb({ exists: true, data: () => ({ publicado: true, atletas: [], wods: [], resultados: {} }) }); return () => {}; },
      get: async () => ({ exists: true, data: () => ({ ativo: true }) }),
      set: async () => {},
    };
    // Cada colecao responde so pelos ids que a lista traz; o resto "nao existe".
    const colecao = (nome) => ({
      doc: (id) => (nome === 'campeonatos') ? doc : {
        get: async () => ({ exists: (listas[nome] || []).includes(String(id)),
                            data: () => ({ ativo: true }) }),
      },
    });
    window.firebase = {
      initializeApp: () => {},
      auth: () => ({
        setPersistence: async () => {},
        onAuthStateChanged: (cb) => { window.__authCb = cb; cb(null); },
        signInWithEmailAndPassword: async (email) => {
          const user = { email, uid };
          window.__authCb(user); return { user };
        },
        signOut: async () => window.__authCb(null),
      }),
      firestore: () => ({ collection: colecao }),
    };
    window.firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
  }, { listas, uid });

  await p.goto('file://' + pagina);
  await p.waitForTimeout(300);
  await p.fill('#logEmail', usuario);
  await p.fill('#logSenha', 'x');
  await p.click('#logBtn');
  await p.waitForTimeout(500);
  const entrou = await p.isVisible('#telaPainel');
  const msg = (await p.textContent('#logMsg') || '').trim();
  await p.close();
  return { entrou, msg };
}

(async () => {
  const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  // Precisa das DUAS paginas lado a lado: a da casa e a de um evento com lista
  // propria. Rodando de dentro da pasta de um evento so, a segunda nao existe.
  const ctstorm = process.env.PAGINA_CTSTORM ||
    path.resolve(__dirname, '..', 'sites', 'ctstorm', 'organizador.html');
  if (!require('fs').existsSync(ctstorm)) {
    console.log('pulado: falta ' + ctstorm + ' (rode a partir da raiz do repositorio).');
    await nav.close();
    process.exit(0);
  }

  // ---- pagina da casa: a whitelist do dashboard, por e-mail ----
  let r = await entrar(nav, ORG, {
    listas: { dashboard_users: ['fernando.rebane@me.com'] },
    usuario: 'fernando.rebane@me.com', uid: 'dono',
  });
  ok('casa: quem esta no dashboard_users entra', r.entrou, r.msg);

  r = await entrar(nav, ORG, {
    listas: { dashboard_users: [] },
    usuario: 'estranho@exemplo.com', uid: 'x',
  });
  ok('casa: quem nao esta na lista nao entra', !r.entrou, r.msg);

  // ---- pagina de outro campeonato: a lista dele, por UID ----
  r = await entrar(nav, ctstorm, {
    listas: { ctstorm_users: ['UID-DA-MESA'] },
    usuario: 'organizador', uid: 'UID-DA-MESA',
  });
  ok('evento: a conta da mesa entra pelo UID', r.entrou, r.msg);

  r = await entrar(nav, ctstorm, {
    listas: { ctstorm_users: ['OUTRO-UID'] },
    usuario: 'jony', uid: 'UID-NAO-LIBERADO',
  });
  ok('evento: UID fora da lista nao entra', !r.entrou, r.msg);

  // O dono do projeto nao esta na lista do evento, e nao pode ficar de fora do
  // campeonato que ele mesmo hospeda.
  r = await entrar(nav, ctstorm, {
    listas: { ctstorm_users: [], dashboard_users: ['fernando.rebane@me.com'] },
    usuario: 'fernando.rebane@me.com', uid: 'dono',
  });
  ok('evento: o dono entra pela whitelist do dashboard', r.entrou, r.msg);

  // E a conta da mesa do evento NAO pode entrar pela whitelist do dashboard:
  // e justamente o que a separacao existe para impedir.
  r = await entrar(nav, ORG, {
    listas: { ctstorm_users: ['UID-DA-MESA'], dashboard_users: [] },
    usuario: 'organizador', uid: 'UID-DA-MESA',
  });
  ok('casa: a mesa do outro evento nao entra aqui', !r.entrou, r.msg);

  let falhas = 0;
  for (const [n, c, x] of res) { if (!c) falhas++; console.log(`${c ? 'ok    ' : 'FALHOU'} ${n}${x ? '  [' + x + ']' : ''}`); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  await nav.close();
  process.exit(falhas ? 1 : 0);
})();
