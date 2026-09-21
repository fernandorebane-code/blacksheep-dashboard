// Abre organizador.html com um Firebase falso e confere o que doLogin() manda
// para o signInWithEmailAndPassword em cada forma de digitar o usuario.
const { chromium } = require('playwright');
// Caminho do Chromium. Vazio = deixa o Playwright achar o dele.
const CHROME = process.env.CHROME_PATH || '';
const path = process.env.PAGINA || require('path').resolve(__dirname, '..', 'organizador.html');

const CASOS = [
  ['organizador',                 'organizador@invitational.bjjblacksheepfit.com', 'usuario simples'],
  ['  Organizador  ',             'organizador@invitational.bjjblacksheepfit.com', 'com espaco e maiuscula'],
  ['MESA',                        'mesa@invitational.bjjblacksheepfit.com',        'tudo maiusculo'],
  ['fernando.rebane@me.com',      'fernando.rebane@me.com',                        'e-mail do dashboard'],
  ['Fernando.Rebane@ME.com',      'fernando.rebane@me.com',                        'e-mail com maiusculas'],
];

(async () => {
  const navegador = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const pagina = await navegador.newPage();

  await pagina.addInitScript(() => {
    window.__enviados = [];
    const doc = {
      onSnapshot: (ok) => { ok({ exists: true, data: () => ({ publicado: false }) }); return () => {}; },
      get: async () => ({ exists: true, data: () => ({ ativo: true }) }),
      set: async () => {},
    };
    const colecao = () => ({ doc: () => doc });
    window.firebase = {
      initializeApp: () => {},
      auth: () => ({
        Auth: { Persistence: { LOCAL: 'local' } },
        setPersistence: async () => {},
        onAuthStateChanged: (cb) => { window.__authCb = cb; cb(null); },
        signInWithEmailAndPassword: async (email, senha) => {
          window.__enviados.push({ email, senha });
          if (senha !== 'certa') { const e = new Error('nao'); e.code = 'auth/wrong-password'; throw e; }
          const user = { email, uid: 'u1' };
          window.__authCb && window.__authCb(user);
          return { user };
        },
        signOut: async () => {},
      }),
      firestore: () => ({ collection: colecao }),
    };
    window.firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
  });

  const erros = [];
  pagina.on('pageerror', e => erros.push(String(e)));
  await pagina.goto('file://' + path);
  await pagina.waitForTimeout(300);

  let falhas = 0;
  for (const [digitado, esperado, descricao] of CASOS) {
    await pagina.evaluate(() => { window.__enviados = []; });
    await pagina.fill('#logEmail', digitado);
    await pagina.fill('#logSenha', 'errada');
    await pagina.click('#logBtn');
    await pagina.waitForTimeout(150);
    const enviado = await pagina.evaluate(() => window.__enviados[0]);
    const ok = enviado && enviado.email === esperado;
    if (!ok) falhas++;
    console.log(`${ok ? 'ok  ' : 'FALHOU'} ${descricao.padEnd(26)} "${digitado}" -> ${enviado ? enviado.email : '(nada enviado)'}`);
  }

  // campo vazio nao deve chamar o Firebase, e a mensagem fala de usuario
  await pagina.evaluate(() => { window.__enviados = []; });
  await pagina.fill('#logEmail', '');
  await pagina.fill('#logSenha', 'certa');
  await pagina.click('#logBtn');
  await pagina.waitForTimeout(150);
  const nenhum = await pagina.evaluate(() => window.__enviados.length);
  const msgVazio = await pagina.textContent('#logMsg');
  const okVazio = nenhum === 0 && /usu[aá]rio/i.test(msgVazio);
  if (!okVazio) falhas++;
  console.log(`${okVazio ? 'ok  ' : 'FALHOU'} usuario vazio nao chama o Firebase  msg="${msgVazio.trim()}"`);

  // senha errada: a mensagem nao pode mais falar em e-mail
  await pagina.fill('#logEmail', 'organizador');
  await pagina.fill('#logSenha', 'errada');
  await pagina.click('#logBtn');
  await pagina.waitForTimeout(150);
  const msgErro = (await pagina.textContent('#logMsg')).trim();
  const okErro = /usu[aá]rio ou senha/i.test(msgErro);
  if (!okErro) falhas++;
  console.log(`${okErro ? 'ok  ' : 'FALHOU'} senha errada                        msg="${msgErro}"`);

  // login certo: painel aparece e o cabecalho mostra so o usuario
  await pagina.fill('#logEmail', 'organizador');
  await pagina.fill('#logSenha', 'certa');
  await pagina.click('#logBtn');
  await pagina.waitForTimeout(300);
  const painel = await pagina.isVisible('#telaPainel');
  const cabec = (await pagina.textContent('#pSub')).trim();
  const okEntrou = painel && cabec === 'organizador';
  if (!okEntrou) falhas++;
  console.log(`${okEntrou ? 'ok  ' : 'FALHOU'} entrou: painel=${painel} cabecalho="${cabec}"`);

  if (erros.length) { falhas++; console.log('ERROS DE JS:', erros); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  await navegador.close();
  process.exit(falhas ? 1 : 0);
})();
