# -*- coding: utf-8 -*-
"""Gera as duas paginas a partir do leaderboard.html (fonte unica):

  publico/index.html  -> leaderboard publico, sem login (vai para o repositorio
                         blacksheep-invitational, servido em invitational.*)
  organizador.html    -> painel do organizador, fica no host do dashboard

Fonte: src/leaderboard-fonte.html (nao publicada — ver _config.yml)
Rodar: python3 build-paginas.py
"""
import io, re, os

src = io.open('src/leaderboard-fonte.html', encoding='utf-8').read()

def bloco(ini, fim, texto=None):
    """Recorta de `ini` (inclusive) ate `fim` (exclusive)."""
    t = texto if texto is not None else src
    a = t.index(ini)
    b = t.index(fim, a)
    return t[a:b]

CABECA   = bloco('<!DOCTYPE html>', '<body>')
HEAD_TAG = bloco('<header>', '<div class="hero">')
HERO_ATE_FOOTER = bloco('<div class="hero">', '<!-- MODAL: login admin -->')
MODAL_LOGIN  = bloco('<!-- MODAL: login admin -->', '<!-- MODAL: partes da prova -->')
MODAL_PARTES = bloco('<!-- MODAL: partes da prova -->', '<!-- MODAL: painel admin -->')
MODAL_PAINEL = bloco('<!-- MODAL: painel admin -->', '<script src="https://www.gstatic')
SDKS         = bloco('<script src="https://www.gstatic', '<script>\n/* ===')

JS = bloco('<script>\n/* ===', '</script>')
JS_BASE  = bloco('/* ====', '/* ---------------- RENDER ----', JS)   # config, utils, motor, carregamento
JS_RENDER = bloco('/* ---------------- RENDER ----', '/* ============================================================\n   PAINEL DO ORGANIZADOR', JS)
JS_ADMIN  = JS[JS.index('/* ============================================================\n   PAINEL DO ORGANIZADOR'):]

# ---------------------------------------------------------------- PUBLICO
pub = CABECA.replace('<title>Blacksheep Invitational — Leaderboard</title>',
                     '<title>Blacksheep Invitational — Leaderboard</title>')
pub += '<body>\n'
pub += HEAD_TAG.replace(
    '    <button class="btn-ghost" id="btnAdmin" onclick="abrirAdmin()">ADMIN</button>\n', '')
pub += HERO_ATE_FOOTER
pub += SDKS.replace('<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>\n', '')
pub += '<script>\n'
pub += JS_BASE.replace(
    'const auth = firebase.auth();\nauth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);\n', '')
pub += JS_RENDER
pub += '''
/* Pagina publica: nao existe area de organizador aqui. O painel fica em
   dashboard.bjjblacksheepfit.com/organizador.html, atras do login. */
</script>
</body>
</html>
'''
pub = pub.replace("let isAdmin = false;     // usuário autorizado logado",
                  "const isAdmin = false;   // esta pagina e somente leitura")
pub = pub.replace("  if (isAdmin) preencherAdmin();\n", "")

os.makedirs('publico', exist_ok=True)
io.open('publico/index.html', 'w', encoding='utf-8').write(pub)

# ------------------------------------------------------------ ORGANIZADOR
org = CABECA.replace('<title>Blacksheep Invitational — Leaderboard</title>',
                     '<title>Blacksheep Invitational — Organização</title>')
org = org.replace('<meta name="description" content="Leaderboard oficial do campeonato interno de CrossFit da Blacksheep.">',
                  '<meta name="description" content="Painel de organização do Blacksheep Invitational.">')
org = org.replace('<meta property="og:title" content="Blacksheep Invitational — Leaderboard">',
                  '<meta name="robots" content="noindex">')
org = org.replace('<meta property="og:description" content="Ranking ao vivo do campeonato interno de CrossFit da Blacksheep.">', '')
org += '''<body>

<div id="aviso" class="aviso"></div>

<header>
  <div class="logo"><span class="gold">BLACKSHEEP </span><span class="wht">INVITATIONAL</span></div>
  <div class="header-right">
    <div class="live-badge"><span class="live-dot off" id="liveDot"></span><span id="liveTxt">Conectando</span></div>
    <a class="btn-ghost" href="https://invitational.bjjblacksheepfit.com/" target="_blank"
       style="text-decoration:none">VER LEADERBOARD</a>
    <span class="user-email" id="pSub"></span>
    <button class="btn-ghost" id="btnSair" onclick="doLogout()" style="display:none">SAIR</button>
  </div>
</header>

<div class="container" id="telaLogin" style="max-width:420px">
  <div class="painel-box">
    <h2 class="painel-titulo">ÁREA DO ORGANIZADOR</h2>
    <div class="painel-sub">Use o mesmo login do dashboard de gestão.</div>
    <label class="lbl">E-mail</label>
    <input class="field" id="logEmail" style="width:100%;margin-bottom:0.7rem" type="email" autocomplete="username">
    <label class="lbl">Senha</label>
    <input class="field" id="logSenha" style="width:100%" type="password" autocomplete="current-password">
    <div class="msg err" id="logMsg"></div>
    <button class="btn-solid" style="width:100%;margin-top:0.4rem" id="logBtn" onclick="doLogin()">ENTRAR</button>
  </div>
</div>

<div class="container" id="telaPainel" style="display:none">
  <div class="resumo" id="resumo"></div>

  <div class="admin-tabs">
'''
# reaproveita as abas e os paineis do modal original
abas_e_panes = bloco('<button class="admin-tab active" data-ap="apResultados"', '    </div>\n  </div>\n</div>\n\n<script src="https://www.gstatic', MODAL_PAINEL + SDKS)
org += '    ' + abas_e_panes + '\n</div>\n\n'
org += MODAL_PARTES
org += SDKS
org += '<script>\n'
org += JS_BASE
org += '''
/* ---------------- RESUMO (no lugar do leaderboard publico) ---------------- */
function render() {
  const el = document.getElementById('resumo');
  if (!el || !D) return;
  const itens = (D.wods || []).reduce((n, w) => n + ((w.partes && w.partes.length) || 1), 0);
  const publicado = D.publicado !== false;
  el.innerHTML =
    item('Campeonato', esc(D.nome || '—')) +
    item('Atletas', (D.atletas || []).length) +
    item('Provas', (D.wods || []).length + ' (' + itens + ' pontuações)') +
    item('Leaderboard público', publicado
      ? '<span style="color:var(--green)">liberado</span>'
      : '<span style="color:var(--red)">oculto</span>');
  function item(rot, val) {
    return '<div class="resumo-item"><div class="resumo-rot">' + rot + '</div>' +
           '<div class="resumo-val">' + val + '</div></div>';
  }
}
'''
org += JS_ADMIN
org += '\n</script>\n</body>\n</html>\n'

# ajustes de fluxo: sem modal de painel, as telas trocam direto
org = org.replace("""function abrirAdmin() {
  if (isAdmin) { preencherAdmin(); abrir('mPainel'); }
  else abrir('mLogin');
}""", """function mostrarPainel(logado) {
  document.getElementById('telaLogin').style.display = logado ? 'none' : 'block';
  document.getElementById('telaPainel').style.display = logado ? 'block' : 'none';
  document.getElementById('btnSair').style.display = logado ? '' : 'none';
}""")
org = org.replace("""    isAdmin = true;
    document.getElementById('btnAdmin').textContent = 'PAINEL';
    document.getElementById('pSub').textContent = user.email;
    if (D) { preencherAdmin(); render(); }
  } else {
    if (user) { auth.signOut(); }
    isAdmin = false;
    document.getElementById('btnAdmin').textContent = 'ADMIN';
    if (D) render();
  }""", """    isAdmin = true;
    document.getElementById('pSub').textContent = user.email;
    mostrarPainel(true);
    if (D) { preencherAdmin(); render(); }
  } else {
    if (user) { auth.signOut(); }
    isAdmin = false;
    document.getElementById('pSub').textContent = '';
    mostrarPainel(false);
  }""")
org = org.replace("""    } else {
      fechar('mLogin');
      document.getElementById('logSenha').value = '';
      abrir('mPainel');
    }""", """    } else {
      document.getElementById('logSenha').value = '';
    }""")
org = org.replace("function doLogout() { auth.signOut(); fechar('mPainel'); }",
                  "function doLogout() { auth.signOut(); }")
org = org.replace("""  document.getElementById('loader').style.display = 'none';
  document.getElementById('app').style.display = 'block';
""", "")

# estilos proprios da pagina de organizacao
org = org.replace('</style>', '''
.painel-box{background:var(--surface);border:1px solid var(--border);padding:2rem 1.6rem;margin-top:3rem;}
.painel-titulo{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:0.06em;}
.painel-sub{font-size:0.72rem;color:var(--gray);margin:0.2rem 0 1.4rem;}
.user-email{font-size:0.7rem;color:var(--gray);}
.resumo{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.7rem;margin-bottom:1.6rem;}
.resumo-item{background:var(--surface);border:1px solid var(--border-soft);padding:0.8rem 1rem;}
.resumo-rot{font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--gray);}
.resumo-val{font-family:'DM Mono',monospace;font-size:1rem;margin-top:0.3rem;}
</style>''')

io.open('organizador.html', 'w', encoding='utf-8').write(org)
print('publico/index.html :', len(pub), 'bytes')
print('organizador.html   :', len(org), 'bytes')
