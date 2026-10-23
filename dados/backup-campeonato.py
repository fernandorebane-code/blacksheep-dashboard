# -*- coding: utf-8 -*-
"""Baixa um campeonato inteiro do Firestore e grava em backups/.

A leitura do Firestore e publica, entao isto roda sem login nenhum.

    python3 dados/backup-campeonato.py            # campeonatos/atual
    python3 dados/backup-campeonato.py ctstorm    # campeonatos/ctstorm

Existe porque nenhuma regra protege contra o estrago mais provavel: nao e
apagar o documento (isso so o dono faz), e sim gravar por cima dele. Um
`set()` sem merge, ou um IMPORTAR LISTA OFICIAL no meio do evento, substitui
atletas e resultados — e o Firestore nao tem lixeira. Com o arquivo em maos,
restaurar e colar de volta.

COMO RESTAURAR, se precisar no meio de um evento:

 1. abrir o organizador do campeonato e entrar (precisa estar logado: quem
    restaura e a conta, nao o arquivo);
 2. abrir o console do navegador (F12 -> Console);
 3. digitar `DOC.set(` , colar o conteudo do arquivo de backup, fechar `)` e
    dar Enter.

`DOC` e o documento do campeonato, ja no escopo da pagina, e `set()` sem merge
devolve o documento exatamente como estava no backup.
"""
import io, os, sys, json, time
from urllib.request import urlopen
from urllib.error import HTTPError

CHAVE = 'AIzaSyAcyQMnedG-XcRzMPv8_hyLcnF_VIAF7AQ'   # a mesma das paginas; leitura publica
PROJETO = 'bjj-blacksheep'

def simples(v):
    """Converte o formato do REST ({'stringValue': 'x'}) em JSON normal."""
    if 'nullValue' in v: return None
    if 'stringValue' in v: return v['stringValue']
    if 'booleanValue' in v: return v['booleanValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'timestampValue' in v: return v['timestampValue']
    if 'arrayValue' in v:
        return [simples(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        return dict((k, simples(x)) for k, x in v['mapValue'].get('fields', {}).items())
    raise SystemExit('backup-campeonato.py: tipo que eu nao conheco: %r' % list(v)[:1])

doc = sys.argv[1] if len(sys.argv) > 1 else 'atual'
url = ('https://firestore.googleapis.com/v1/projects/%s/databases/(default)'
       '/documents/campeonatos/%s?key=%s' % (PROJETO, doc, CHAVE))

# Campeonato que ainda nao existe devolve 404, e o urlopen levanta: sem isto o
# usuario leva um traceback no lugar da unica frase que importa.
try:
    resposta = urlopen(url, timeout=60).read()
except HTTPError as e:
    corpo = json.loads(e.read().decode('utf-8') or '{}')
    raise SystemExit('backup-campeonato.py: campeonatos/%s -> %s'
                     % (doc, (corpo.get('error') or {}).get('status', 'HTTP %d' % e.code)))
bruto = json.loads(resposta.decode('utf-8'))

dados = dict((k, simples(v)) for k, v in bruto.get('fields', {}).items())

os.makedirs('backups', exist_ok=True)
nome = 'backups/%s-%s.json' % (doc, time.strftime('%Y-%m-%d-%H%M'))
io.open(nome, 'w', encoding='utf-8').write(json.dumps(dados, ensure_ascii=False, indent=1) + '\n')

atletas = dados.get('atletas') or []
resultados = dados.get('resultados') or {}
lancados = sum(len(v or {}) for v in resultados.values())
print('%s  (gravado no servidor em %s)' % (nome, bruto.get('updateTime', '')[:19]))
print('  %s · %d inscrito(s) · %d com resultado · %d resultado(s) no total'
      % (dados.get('nome', '(sem nome)'), len(atletas), len(resultados), lancados))
