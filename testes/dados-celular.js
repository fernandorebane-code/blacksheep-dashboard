// Dados de mentira para a auditoria de celular: muitos atletas, um nome bem
// comprido, atleta sem unidade, prova de duas partes e prova de uma so categoria.
const CATS = ['Elite Masculino','Elite Feminino','RX Masculino','RX Feminino',
  'Intermediário Masculino','Intermediário Feminino','Scaled Masculino','Scaled Feminino',
  'Master 45+ Masculino','Master 45+ Feminino'];
const UNIS = ['Moema','Pinheiros','Berrini','Itaim','Vila Olímpia','Alphaville','Convidado'];

const ATLETAS = [];
CATS.forEach((c, ci) => {
  const n = c.startsWith('Elite') ? 4 : 9;
  for (let i = 0; i < n; i++) {
    ATLETAS.push({
      id: 'a' + ci + '_' + i,
      // um nome bem longo para testar quebra de linha
      nome: i === 0 ? 'Maria Fernanda Costa de Melo Albuquerque' : c.split(' ')[0] + ' Atleta ' + (i + 1),
      categoria: c,
      unidade: i % 7 === 3 ? '' : UNIS[i % UNIS.length],
    });
  }
});

const WODS = [
  { id:'w1', nome:'WOD 1 — Remo + For Time', tipo:'tempo', pub:true, ordem:1, categorias:[],
    desc:'Buy-in 1k de remo, depois 21-15-9 thruster e muscle-up. Masc 43kg / Fem 30kg.',
    partes:[{id:'p1',nome:'1k remo',tipo:'tempo'},{id:'p2',nome:'For time',tipo:'tempo'}] },
  { id:'w2', nome:'WOD 2 — Snatch máximo', tipo:'carga', pub:true, ordem:2, categorias:[],
    desc:'Máximo em 10 min. Masc 60kg / Fem 40kg.' },
  { id:'w3', nome:'WOD 3 — AMRAP 12', tipo:'reps', pub:true, ordem:3, categorias:[],
    desc:'AMRAP 12 min: 10 burpees, 15 wall ball, 20 double under.' },
  { id:'w4', nome:'WOD 4 — Só do Elite', tipo:'tempo', pub:true, ordem:4,
    categorias:['Elite Masculino','Elite Feminino'], desc:'Legless rope climb + handstand walk.' },
];

const RESULTADOS = {};
ATLETAS.forEach((a, i) => {
  RESULTADOS[a.id] = {
    'w1::p1': { v: 200 + (i * 7) % 90, cap: null },
    'w1::p2': { v: 420 + (i * 13) % 200, cap: null },
    w2: { v: 60 + (i * 5) % 50, cap: null },
    w3: { v: 120 + (i * 11) % 80, cap: null },
  };
  if (a.categoria.startsWith('Elite')) RESULTADOS[a.id].w4 = { v: 300 + (i * 9) % 120, cap: null };
  if (i % 11 === 0) delete RESULTADOS[a.id].w2;      // alguem sem nota numa prova
});

module.exports = {
  nome:'Blacksheep Invitational', data:'Setembro 2026', local:'São Paulo',
  publicado:true, sistema:'posicao', p1:100, dec:5,
  categorias:CATS, unidades:UNIS, atletas:ATLETAS, wods:WODS, resultados:RESULTADOS,
};
