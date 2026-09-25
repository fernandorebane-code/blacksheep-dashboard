# -*- coding: utf-8 -*-
"""Escreve as provas em dados/campeonato-inicial.json a partir dos documentos.

Sao 7 provas por programacao. As programacoes vieram de quatro arquivos, e o de
Intermediario diz "INTERMEDIARIO/MASTER": Master faz a mesma coisa, entao as
provas dele valem para os dois niveis.

Cada prova vale para as duas categorias de genero do nivel — masculino e
feminino fazem a mesma prova, e a carga de cada um esta escrita na descricao,
sempre no formato do documento (MULHERES/HOMENS).
"""
import io, json, os

AQUI = os.path.dirname(os.path.abspath(__file__))
JSON = os.path.join(AQUI, 'campeonato-inicial.json')

# nivel -> categorias reais
NIVEIS = {
    'Elite':          ['Elite Masculino', 'Elite Feminino'],
    'RX':             ['RX Masculino', 'RX Feminino'],
    'Intermediário':  ['Intermediário Masculino', 'Intermediário Feminino',
                       'Master 45+ Masculino', 'Master 45+ Feminino'],
    'Scaled':         ['Scaled Masculino', 'Scaled Feminino'],
}

# (numero, nome, tipo, descricao) por programacao
PROVAS = {
'Elite': [
 (1, 'PROVA 1', 'tempo',
  'FOR TIME 15′\n'
  'Wall ball 35/25/15\n'
  'T2B 20/20/20\n'
  'Box jump over ou step box over 15/15/15\n'
  'Devil press 5/5/5\n'
  'Bike 35/25/15\n\n'
  'Bola 20/30 lbs — 2 DB 15/22,5 kg (mulheres/homens)\n'
  'Obrigatorio step down.\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (2, 'PROVA 2', 'reps',
  'AMRAP 1′ — max devil press\n2 DB 15/22,5 kg (mulheres/homens)\n\n'
  'Entra 1′ depois da PROVA 1.'),
 (3, 'PROVA 3', 'tempo',
  'FOR TIME 12′\n'
  'Buy in 1000 m remo\n'
  '9/7 bike\n9/7 thruster\napos 9+7 = 5 shuttle run\n'
  '9/7 bike\n9/7 hang snatch\napos 9+7 = 5 shuttle run\n'
  '9/7 bike\n9/7 STOH\napos 9+7 = 5 shuttle run\n\n'
  'Carga da barra 45/60 kg (mulheres/homens)\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (4, 'PROVA 4', 'reps',
  '3 ROUNDS 3′ ON / 1′ OFF\n'
  '20 burpee over bar\n50 double under\n8 OHS\nmax reps C2B\n\n'
  'Peso da barra 50/70 kg (mulheres/homens)\n'
  'Resultado: total de C2B nos 3 rounds.'),
 (5, 'PROVA 5', 'reps',
  '1 ROUND 3′ ON — max rounds DT\n'
  'DT = 12 deadlift + 9 hang clean + 6 STOH\n\n'
  'Carga da barra 50/70 kg (mulheres/homens)\n'
  'Resultado: total de repeticoes.'),
 (6, 'PROVA 6', 'tempo',
  'FOR TIME 4′\n'
  '7 ring MU\n6 m HSW\n1 legless\n6 m mixed lunge 2 DB (front + OH)\n'
  '5 ring MU\n6 m mixed lunge 2 DB (front + OH)\n1 legless\n6 m HSW\n'
  '3 ring MU\n6 m HSW + piruet\n6 m mixed lunge 2 DB (front + OH)\n\n'
  'Peso 2 DB 15/22,5 kg (mulheres/homens)\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (7, 'PROVA 7', 'carga',
  'EMOM 6′ — impar: clean & jerk / par: snatch\n\n'
  'Nao pode diminuir o peso da barra.\n'
  'Resultado: soma das 6 pegadas.\n'
  'Se nao fizer o clean & jerk, o snatch seguinte nao e validado.\n'
  'Se errar o snatch, o clean & jerk anterior nao e validado.\n\n'
  'Entra 2′ depois da PROVA 6.'),
],
'RX': [
 (1, 'PROVA 1', 'tempo',
  'FOR TIME 15′\n'
  'Wall ball 35/25/15\n'
  'T2B 20/20/20\n'
  'Box jump over ou step box over 15/15/15\n'
  'Devil press 5/5/5\n'
  'Bike 35/25/15\n\n'
  'Bola 14/20 lbs — 2 DB 15/22,5 kg (mulheres/homens)\n'
  'Obrigatorio step down.\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (2, 'PROVA 2', 'reps',
  'AMRAP 1′ — max devil press\n2 DB 15/22,5 kg (mulheres/homens)\n\n'
  'Entra 1′ depois da PROVA 1.'),
 (3, 'PROVA 3', 'tempo',
  'FOR TIME 12′\n'
  'Buy in 1000 m remo\n'
  '9/7 bike\n9/7 thruster\napos 9+7 = 5 shuttle run\n'
  '9/7 bike\n9/7 hang snatch\napos 9+7 = 5 shuttle run\n'
  '9/7 bike\n9/7 STOH\napos 9+7 = 5 shuttle run\n\n'
  'Carga da barra 35/50 kg (mulheres/homens)\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (4, 'PROVA 4', 'reps',
  '3 ROUNDS 3′ ON / 1′ OFF\n'
  '20 burpee over bar\n50 double under\n8 OHS\nmax reps C2B\n\n'
  'Peso da barra 45/60 kg (mulheres/homens)\n'
  'Resultado: total de C2B nos 3 rounds.'),
 (5, 'PROVA 5', 'reps',
  '1 ROUND 3′ ON — max rounds DT\n'
  'DT = 12 deadlift + 9 hang clean + 6 STOH\n\n'
  'Carga da barra 45/60 kg (mulheres/homens)\n'
  'Resultado: total de repeticoes.'),
 (6, 'PROVA 6', 'tempo',
  'FOR TIME 4′\n'
  '9 B.MU\n12 m mixed lunge 2 DB (carry + OH)\n6 m HSW\n'
  '6 B.MU\n12 m mixed lunge 2 DB (carry + OH)\n6 m HSW\n'
  '3 B.MU\n12 m mixed lunge 2 DB (carry + OH)\n6 m HSW\n\n'
  'Peso 2 DB 15/22,5 kg (mulheres/homens)\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (7, 'PROVA 7', 'carga',
  'EMOM 6′ — impar: clean & jerk / par: snatch\n\n'
  'Nao pode diminuir o peso da barra.\n'
  'Resultado: soma das 6 pegadas.\n'
  'Se nao fizer o clean & jerk, o snatch seguinte nao e validado.\n'
  'Se errar o snatch, o clean & jerk anterior nao e validado.\n\n'
  'Entra 2′ depois da PROVA 6.'),
],
'Intermediário': [
 (1, 'PROVA 1', 'tempo',
  'FOR TIME 15′\n'
  'Wall ball 30/20/10\n'
  'T2B 20/20/20\n'
  'Box jump over ou step box over 15/15/15\n'
  'Devil press 5/5/5\n'
  'Bike 30/20/10\n\n'
  'Bola 14/20 lbs — 1 DB 15/22,5 kg (mulheres/homens)\n'
  'Obrigatorio step down.\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (2, 'PROVA 2', 'reps',
  'AMRAP 1′ — max devil press\n1 DB 15/22,5 kg (mulheres/homens)\n\n'
  'Entra 1′ depois da PROVA 1.'),
 (3, 'PROVA 3', 'tempo',
  'FOR TIME 12′\n'
  'Buy in 1000 m remo\n'
  '9/7 bike\n9/7 thruster\napos 9+7 = 5 shuttle run\n'
  '9/7 bike\n9/7 hang snatch\napos 9+7 = 5 shuttle run\n'
  '9/7 bike\n9/7 STOH\napos 9+7 = 5 shuttle run\n\n'
  'Carga da barra 25/40 kg (mulheres/homens)\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (4, 'PROVA 4', 'reps',
  '3 ROUNDS 3′ ON / 1′ OFF\n'
  '20 burpee over bar\n50 crossover\n8 OHS\nmax reps pull-up / C2B\n\n'
  'Peso da barra 35/50 kg (mulheres/homens)\n'
  'Pull-up (mulheres) / C2B (homens)\n'
  'Resultado: total de repeticoes nos 3 rounds.'),
 (5, 'PROVA 5', 'reps',
  '1 ROUND 3′ ON — max rounds DT\n'
  'DT = 12 deadlift + 9 hang clean + 6 STOH\n\n'
  'Carga da barra 35/50 kg (mulheres/homens)\n'
  'Resultado: total de repeticoes.'),
 (6, 'PROVA 6', 'tempo',
  'FOR TIME 4′\n'
  '9 B.MU / C2B\n12 m OH lunge 1 DB\n'
  '6/9 B.MU / C2B\n12 m OH lunge 1 DB\n'
  '3/9 B.MU / C2B\n12 m OH lunge 1 DB\n\n'
  'Peso 1 DB 15/22,5 kg (mulheres/homens)\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (7, 'PROVA 7', 'carga',
  'FOR TIME 4′ — PR clean & jerk\n\n'
  'Resultado: maior carga.\n'
  'Entra 2′ depois da PROVA 6.'),
],
'Scaled': [
 (1, 'PROVA 1', 'tempo',
  'FOR TIME 15′\n'
  'Wall ball 30/20/10\n'
  'Knees raise 20/20/20\n'
  'Box jump over ou step box over 15/15/15\n'
  'Devil press 5/5/5\n'
  'Bike 30/20/10\n\n'
  'Bola 14/8 lbs — 1 DB 10/8 kg\n'
  'Obrigatorio step down.\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (2, 'PROVA 2', 'reps',
  'AMRAP 1′ — max devil press\n1 DB 10/8 kg\n\n'
  'Entra 1′ depois da PROVA 1.'),
 (3, 'PROVA 3', 'tempo',
  'FOR TIME 12′\n'
  'Buy in 800 m (mulheres) / 1000 m (homens) remo\n'
  '9/7 bike\n9/7 thruster\napos 9+7 = 5 shuttle run\n'
  '9/7 bike\n9/7 hang snatch\napos 9+7 = 5 shuttle run\n'
  '9/7 bike\n9/7 STOH\napos 9+7 = 5 shuttle run\n\n'
  'Carga da barra 20/30 kg (mulheres/homens)\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (4, 'PROVA 4', 'reps',
  '3 ROUNDS 3′ ON / 1′ OFF\n'
  '16 burpee over bar\n50 single under\n8 front squat\nmax reps KB swing\n\n'
  'Peso da barra 25/40 kg (mulheres/homens)\n'
  'Peso do KB 12/16 kg (mulheres/homens)\n'
  'Resultado: total de KB swing nos 3 rounds.'),
 (5, 'PROVA 5', 'reps',
  '1 ROUND 3′ ON — max rounds DT\n'
  'DT = 12 deadlift + 9 hang clean + 6 STOH\n\n'
  'Carga da barra 25/40 kg (mulheres/homens)\n'
  'Resultado: total de repeticoes.'),
 (6, 'PROVA 6', 'tempo',
  '3 ROUNDS FOR TIME 6′\n'
  '60 m farmer carry 2 DB\n12 m lunge 2 DB\nbox step over 1 DB\n\n'
  'Peso DB 10/12,5 kg (mulheres/homens)\n'
  'Nao finalizou no cap: deixe o tempo vazio e lance as repeticoes feitas.'),
 (7, 'PROVA 7', 'carga',
  'FOR TIME 4′ — PR clean & jerk\n\n'
  'Resultado: maior carga.\n'
  'Entra 2′ depois da PROVA 6.'),
],
}

SLUG = {'Elite': 'elite', 'RX': 'rx', 'Intermediário': 'inter', 'Scaled': 'scaled'}

wods, ordem = [], 0
for nivel in ['Elite', 'RX', 'Intermediário', 'Scaled']:
    for num, nome, tipo, desc in PROVAS[nivel]:
        ordem += 1
        wods.append({
            'id': 'w_%s_p%d' % (SLUG[nivel], num),   # id fixo: nao duplica ao recarregar
            'nome': nome,
            'tipo': tipo,
            'desc': desc,
            'categorias': NIVEIS[nivel],
            'ordem': ordem,
            'pub': True,
        })

d = json.load(io.open(JSON, encoding='utf-8'))
d['wods'] = wods
io.open(JSON, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

print('%d provas gravadas' % len(wods))
cats = set()
for w in wods:
    cats |= set(w['categorias'])
print('categorias cobertas: %d de %d' % (len(cats), len(d['categorias'])))
faltando = [c for c in d['categorias'] if c not in cats]
print('sem nenhuma prova:', faltando or 'nenhuma')
for nivel in PROVAS:
    tipos = [t for _, _, t, _ in PROVAS[nivel]]
    print('  %-14s %d provas  %s' % (nivel, len(tipos), ' '.join(tipos)))
