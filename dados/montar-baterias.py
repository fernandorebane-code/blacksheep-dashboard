#!/usr/bin/env python3
"""Monta a planilha de baterias a partir da classificacao exportada do leaderboard.

Entrada: o CSV do botao "CSV DE TODAS" do leaderboard
         (Categoria; Pos; Atleta; Unidade; Total; Provas valendo; Com resultado;
          Completo; Faltando).

Regras:
  - So entra quem esta COMPLETO, isto e, quem tem resultado em todas as provas
    que ja estao valendo. Quem ainda deve prova nao vai para a bateria.
  - Dentro da categoria a ordem e da PIOR colocacao para a MELHOR: a ultima
    bateria e a dos lideres.
  - Baterias de RAIAS atletas. Quando a categoria nao fecha um multiplo exato,
    a bateria menor e a PRIMEIRA (a dos piores), para a bateria final sair cheia.

Uso:
    python3 dados/montar-baterias.py classificacao_todas_categorias.csv
    python3 dados/montar-baterias.py entrada.csv -o baterias-domingo.xlsx
"""
import argparse, csv, os, re, sys, unicodedata
from collections import OrderedDict
from datetime import datetime, timedelta

# ------------------------------------------------------------------ config
# O dia corre por NIVEL, nao por prova: o Scaled faz o 4 e 5 e emenda o 6 e 7, e
# so entao entra o nivel seguinte. O relogio e um so e nao reinicia em momento
# nenhum — as raias sao as mesmas o dia inteiro.
ABA       = 'BATERIAS DOMINGO'
INICIO    = '08:00'
INTERVALO = 18

# As provas que rodam juntas entram no mesmo titulo, e cada rodada tem o proprio
# numero de raias: 8 por bateria no 4 e 5, 6 no 6 e 7. Dentro de um nivel elas
# acontecem nesta ordem.
RODADAS = [
    {'titulo': 'PROVA 4 E 5', 'raias': 8},
    {'titulo': 'PROVA 6 E 7', 'raias': 6},
]

# Cada nivel vira uma coluna de blocos na planilha, e roda inteiro antes do
# proximo. A ordem das categorias aqui e a ordem em que elas entram.
TRILHAS = [
    ('SCALED',                  ['Scaled Feminino', 'Scaled Masculino']),
    ('INTERMEDIARIO E MASTER',  ['Intermediário Feminino', 'Master 45+ Feminino',
                                 'Intermediário Masculino', 'Master 45+ Masculino']),
    ('RX',                      ['RX Feminino', 'RX Masculino']),
    ('ELITE',                   ['Elite Feminino', 'Elite Masculino']),
]

# ------------------------------------------------------------------ leitura
def chave(txt):
    """Normaliza para comparar nome de categoria com nome de arquivo.

    O CSV por categoria nasce com o nome da categoria no arquivo, e no caminho
    ele chega sem acento e com a pontuacao trocada: "Intermediário Masculino"
    vira "intermedia_rio_masculino". Tirando acento e tudo que nao e letra ou
    numero, os dois viram "intermediariomasculino".
    """
    sem = unicodedata.normalize('NFKD', txt)
    sem = ''.join(c for c in sem if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', sem.lower())


def categoria_do_arquivo(caminho, conhecidas):
    k = chave(os.path.basename(caminho))
    achadas = [c for c in conhecidas if chave(c) and chave(c) in k]
    if not achadas:
        return None
    return max(achadas, key=lambda c: len(chave(c)))   # a mais especifica


def ler_por_categoria(caminhos, conhecidas):
    """CSV do botao CSV (uma categoria por arquivo, com as provas em colunas).

    Aqui nao existe coluna "Completo": a prova conta como valendo quando ao menos
    um atleta do arquivo tem resultado nela, e o atleta esta completo quando tem
    resultado em todas essas.
    """
    saida = []
    for caminho in caminhos:
        cat = categoria_do_arquivo(caminho, conhecidas)
        if not cat:
            sys.exit('Nao consegui dizer de que categoria e o arquivo ' +
                     os.path.basename(caminho) + '. Renomeie com o nome da categoria ' +
                     'ou use o CSV DE TODAS.')
        linhas = ler(caminho)
        provas = [k for k in (linhas[0] if linhas else {}) if k.strip().endswith('(result)')]
        valendo = [p for p in provas if any((l.get(p) or '').strip() for l in linhas)]
        for l in linhas:
            faltando = [p[:-len(' (result)')].strip() for p in valendo
                        if not (l.get(p) or '').strip()]
            saida.append({
                'Categoria': cat, 'Pos': coluna(l, 'Pos'),
                'Atleta': coluna(l, 'Atleta', 'Nome'), 'Unidade': coluna(l, 'Unidade'),
                'Total': coluna(l, 'Total'),
                'Completo': 'nao' if faltando else 'sim',
                'Faltando': ' | '.join(faltando),
            })
    return saida


def ler(caminho):
    with open(caminho, encoding='utf-8-sig', newline='') as f:
        amostra = f.read(4096); f.seek(0)
        sep = ';' if amostra.count(';') >= amostra.count(',') else ','
        return list(csv.DictReader(f, delimiter=sep))


def coluna(linha, *nomes):
    for n in nomes:
        for k in linha:
            if k.strip().lower() == n.lower():
                return (linha[k] or '').strip()
    return ''


def baterias_da_categoria(atletas, maximo):
    """Da pior para a melhor colocacao, em baterias o mais parelhas possivel.

    Nao basta encher de 'maximo' em 'maximo' e jogar o resto numa bateria: com 7
    atletas e teto 6 isso daria uma bateria de 1 e outra de 6. Aqui o numero de
    baterias e o minimo que cabe no teto, e os atletas se dividem por igual entre
    elas — 7 vira 3 e 4, 14 vira 4, 5 e 5, 27 vira 5, 5, 5, 6 e 6.

    As menores vao na frente, entao a ultima bateria continua sendo a dos lideres
    e a mais cheia. Nenhuma passa do teto: base+1 so e usado quando base < maximo.
    """
    ordenado = sorted(atletas, key=lambda a: -a['pos'])       # pior primeiro
    n = len(ordenado)
    if not n:
        return []
    k = -(-n // maximo)                                       # teto da divisao
    base, resto = divmod(n, k)
    tamanhos = [base] * (k - resto) + [base + 1] * resto       # menores primeiro
    blocos, i = [], 0
    for t in tamanhos:
        blocos.append(ordenado[i:i + t])
        i += t
    return blocos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('csv', nargs='+',
                    help='o CSV DE TODAS, ou varios CSV por categoria')
    ap.add_argument('-o', '--saida', default='baterias.xlsx')
    ap.add_argument('--inicio', default=INICIO)
    ap.add_argument('--intervalo', type=int, default=INTERVALO)
    ap.add_argument('--aba', default=ABA)
    ap.add_argument('--janela', action='append', default=[], metavar='NIVEL=HH:MM-HH:MM',
                    help='janela do nivel (repetivel). Todas as baterias dele — 4 e '
                         '5 e depois 6 e 7 — sao distribuidas por igual dentro do '
                         'intervalo, e o fim e quando a ultima acaba. Ex: '
                         '--janela "SCALED=08:00-09:39". Nivel sem janela entra na '
                         'fila do relogio corrido, logo apos o anterior.')
    ap.add_argument('--sem-horario', action='store_true',
                    help='deixa a coluna HORARIO em branco, para preencher na mao')
    ap.add_argument('--incluir', action='append', default=[], metavar='NOME',
                    help='escala o atleta mesmo devendo prova (repetivel). '
                         'O organizador decide quem segue no campeonato; o script '
                         'so nao adivinha isso sozinho.')
    args = ap.parse_args()
    forcados = {chave(n) for n in args.incluir}
    usados = set()

    janelas = {}
    for j in args.janela:
        if '=' not in j or '-' not in j.split('=', 1)[1]:
            sys.exit(f'--janela mal formada: {j!r}. Use CATEGORIA=HH:MM-HH:MM.')
        cat, faixa = j.split('=', 1)
        ini, fim = [x.strip() for x in faixa.split('-', 1)]
        try:
            a = datetime.strptime(ini, '%H:%M'); b = datetime.strptime(fim, '%H:%M')
        except ValueError:
            sys.exit(f'--janela com horario invalido: {j!r}. Use HH:MM.')
        if b <= a:
            sys.exit(f'--janela termina antes de comecar: {j!r}.')
        janelas[chave(cat)] = (a, b)

    conhecidas_cfg = [c for _, cats in TRILHAS for c in cats]
    primeiro = ler(args.csv[0])
    if not primeiro:
        sys.exit('CSV vazio.')
    if any(k.strip().lower() == 'categoria' for k in primeiro[0]):
        if len(args.csv) > 1:
            sys.exit('O CSV DE TODAS ja traz tudo — passe um arquivo so.')
        linhas = primeiro
    else:
        linhas = ler_por_categoria(args.csv, conhecidas_cfg)

    porCat, fora, semPos, forcado = OrderedDict(), [], [], []
    for l in linhas:
        cat = coluna(l, 'Categoria')
        nome = coluna(l, 'Atleta', 'Nome')
        if not cat or not nome:
            continue
        completo = coluna(l, 'Completo').lower() in ('sim', 's', 'yes', '1')
        if not completo and chave(nome) in forcados:
            usados.add(chave(nome))
            forcado.append((cat, nome, coluna(l, 'Faltando')))
        elif not completo:
            fora.append((cat, nome, coluna(l, 'Faltando'))); continue
        pos = coluna(l, 'Pos')
        if not pos.isdigit():
            semPos.append((cat, nome)); continue
        porCat.setdefault(cat, []).append(
            {'nome': nome, 'unidade': coluna(l, 'Unidade'), 'pos': int(pos)})

    conhecidas = set(conhecidas_cfg)
    orfas = [c for c in porCat if c not in conhecidas]
    ausentes = [c for c in conhecidas_cfg if c not in porCat]

    # ---------------------------------------------------------- planilha
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook(); wb.remove(wb.active)
    fina = Side(style='thin', color='000000')
    borda = Border(left=fina, right=fina, top=fina, bottom=fina)
    tit = Font(bold=True, italic=True, underline='single', size=12)
    cab = Font(bold=True, italic=True, underline='single', size=11)
    meio = Alignment(horizontal='center', vertical='center', wrap_text=True)

    resumo = []
    passos = {}          # passo real de cada nivel: com janela ele nao e o padrao
    relogio = datetime.strptime(args.inicio, '%H:%M')
    ws = wb.create_sheet(args.aba)
    for t, (trilha, cats) in enumerate(TRILHAS):
        c0 = 1 + t * 5                                   # A, F, K, P...
        linha = 1
        # O nivel roda inteiro — 4 e 5, depois 6 e 7 — antes do proximo entrar.
        # A fila e montada ANTES de cronometrar: para caber numa janela e preciso
        # saber de quantas baterias o nivel e feito.
        fila = []
        for rod in RODADAS:
            for cat in cats:
                for bloco in baterias_da_categoria(porCat.get(cat, []), rod['raias']):
                    fila.append((rod, cat, bloco))
        if not fila:
            continue

        jan = janelas.get(chave(trilha))
        if jan:
            # O fim da janela e quando a ultima bateria ACABA, entao o passo e a
            # janela dividida pelo numero de baterias, e nao por uma a menos.
            passo = (jan[1] - jan[0]) / len(fila)
            horarios = [jan[0] + passo * i for i in range(len(fila))]
        else:
            passo = timedelta(minutes=args.intervalo)
            horarios = [relogio + passo * i for i in range(len(fila))]
        passos[trilha] = passo
        relogio = horarios[-1] + passo          # o nivel seguinte entra depois

        for (rod, cat, bloco), quando in zip(fila, horarios):
                raias = rod['raias']
                if True:
                    hora = quando.strftime('%H:%M')
                    ws.merge_cells(start_row=linha, start_column=c0,
                                   end_row=linha, end_column=c0 + 3)
                    cel = ws.cell(linha, c0, f"{rod['titulo']} {trilha}")
                    cel.font = tit; cel.alignment = meio
                    for j, txt in enumerate(['CATEGORIA', 'RAIA:', 'NOME:', 'HORÁRIO:']):
                        c = ws.cell(linha + 1, c0 + j, txt)
                        c.font = cab; c.alignment = meio; c.border = borda
                    p0, u = linha + 2, linha + 1 + raias
                    ws.merge_cells(start_row=p0, start_column=c0, end_row=u, end_column=c0)
                    cc = ws.cell(p0, c0, cat.upper()); cc.alignment = meio; cc.border = borda
                    ws.merge_cells(start_row=p0, start_column=c0 + 3, end_row=u, end_column=c0 + 3)
                    ch = ws.cell(p0, c0 + 3, '' if args.sem_horario else hora)
                    ch.alignment = meio; ch.border = borda
                    for r in range(raias):
                        atleta = bloco[r] if r < len(bloco) else None
                        cr = ws.cell(p0 + r, c0 + 1, r + 1); cr.alignment = meio; cr.border = borda
                        cn = ws.cell(p0 + r, c0 + 2, atleta['nome'] if atleta else '')
                        cn.alignment = Alignment(vertical='center'); cn.border = borda
                        for cx in (c0, c0 + 3):
                            ws.cell(p0 + r, cx).border = borda
                    resumo.append((trilha, rod['titulo'], cat, hora, [a['nome'] for a in bloco]))
                    linha = u + 1
        # get_column_letter, e nao ws.cell(...): a linha 1 esta mesclada e a
        # celula mesclada nao carrega column_letter.
        for desloc, larg in ((0, 26), (1, 7), (2, 28), (3, 11), (4, 3)):
            if desloc == 4 and t == len(TRILHAS) - 1:
                continue
            ws.column_dimensions[get_column_letter(c0 + desloc)].width = larg

    wb.save(args.saida)

    # ---------------------------------------------------------- relatorio
    print(f'{args.saida}  ({args.aba})\n')
    atual = None
    for trilha, titulo, cat, hora, nomes in resumo:
        if (trilha, titulo) != atual:
            raias = next(r['raias'] for r in RODADAS if r['titulo'] == titulo)
            print(f'\n=== {trilha} · {titulo}  ({raias} raias) ===')
            atual = (trilha, titulo)
        print(f'  {hora}  {cat:26s} {len(nomes)} atleta(s)')
        for i, n in enumerate(nomes, 1):
            print(f'           raia {i}: {n}')

    print('\n--- resumo por nível ---')
    for trilha, _ in TRILHAS:
        b = [x for x in resumo if x[0] == trilha]
        if not b:
            continue
        fim = datetime.strptime(b[-1][3], '%H:%M') + passos[trilha]
        # cada atleta passa uma vez por rodada, entao aqui vale contar cabecas
        cabecas = len({n for x in b for n in x[4]})
        print(f'{trilha:24s} {cabecas:3d} atleta(s), {len(b):2d} bateria(s)'
              f'  {b[0][3]} → última começa {b[-1][3]}, libera a raia {fim.strftime("%H:%M")}')
    todas = [x[3] for x in resumo]
    if todas:
        ultimo = max(resumo, key=lambda x: x[3])
        fim = datetime.strptime(max(todas), '%H:%M') + passos[ultimo[0]]
        print(f'\nO dia inteiro: {len(resumo)} baterias, {min(todas)} às {fim.strftime("%H:%M")}.')
    if forcado:
        print(f'\nESCALADOS MESMO DEVENDO PROVA ({len(forcado)}) — por --incluir:')
        for cat, nome, falta in forcado:
            print(f'  {cat:26s} {nome:28s} falta: {falta}')
    naoAchadasJ = [j for j in args.janela
                   if chave(j.split('=', 1)[0]) not in {chave(t) for t, _ in TRILHAS}]
    if naoAchadasJ:
        print('\nATENÇÃO — janelas de níveis que não existem na configuração')
        print(f'(os níveis são: {", ".join(t for t, _ in TRILHAS)}):')
        for j in naoAchadasJ:
            print(f'  {j}')
    naoAchados = forcados - usados
    if naoAchados:
        print('\nATENÇÃO — nomes passados em --incluir que não bateram com ninguém')
        print('(ou que já estavam completos, e aí não era preciso forçar):')
        for n in args.incluir:
            if chave(n) in naoAchados:
                print(f'  {n}')
    if fora:
        print(f'\nFORA — ainda devem prova ({len(fora)}):')
        for cat, nome, falta in fora:
            print(f'  {cat:26s} {nome:28s} falta: {falta or "(sem resultado nenhum)"}')
    if semPos:
        print(f'\nFORA — sem colocação ({len(semPos)}):')
        for cat, nome in semPos:
            print(f'  {cat:26s} {nome}')
    if orfas:
        print('\nATENÇÃO — categorias que não estão em nenhuma trilha do script:')
        for c in orfas:
            print(f'  {c}  ({len(porCat[c])} atleta(s) COMPLETOS ficaram de fora)')
    if ausentes:
        print('\nSEM DADOS — categorias da configuração que não vieram em nenhum CSV:')
        for c in ausentes:
            print(f'  {c}')


if __name__ == '__main__':
    main()
