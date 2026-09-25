# Blacksheep Invitational — Leaderboard

Página pública do campeonato interno de CrossFit.

## Onde cada coisa mora

| Página | Endereço | Arquivo |
|---|---|---|
| Leaderboard público | https://invitational.bjjblacksheepfit.com | `publico/index.html` → repositório `blacksheep-invitational` |
| Painel do organizador | https://dashboard.bjjblacksheepfit.com/organizador.html | `organizador.html` |

As duas são **geradas** a partir de `src/leaderboard-fonte.html`, que é a fonte única
(não é publicada: junta as duas áreas na mesma página — ver `_config.yml`):

```
python3 build-paginas.py
```

O leaderboard público não tem login nem qualquer referência ao host do dashboard —
o link que vai para os atletas não revela o painel de gestão. O painel do organizador
fica só no host do dashboard, atrás do login.

Ao mexer na fonte, rode o gerador e publique as duas: `organizador.html` neste repositório
e `publico/index.html` como `index.html` no `blacksheep-invitational`. O endereço antigo
`dashboard.bjjblacksheepfit.com/leaderboard.html` redireciona para o subdomínio.

- **Banco:** Firestore, documento único `campeonatos/atual` (mesmo projeto do dashboard)

## Como usar

1. Abra a página e clique em **ADMIN** (canto superior direito).
2. Entre com o **mesmo login do dashboard de gestão** (coleção `dashboard_users`).
3. No painel:
   - **CONFIG** — nome, subtítulo, data, local, categorias, unidades, sistema de pontuação
     e o botão que libera o leaderboard para o público.
   - **PROVAS** — cadastre cada WOD, escolha o tipo de resultado, reordene e use o
     checkbox `pub` para segurar uma prova até a hora de divulgar.
   - **ATLETAS** — cadastro individual ou importação em lote (`Nome; Categoria; Unidade`, um por linha).
   - **RESULTADOS** — escolha prova + categoria e digite os resultados na grade. Salvar publica na hora.

Quem estiver com a página aberta vê a atualização ao vivo (sem dar refresh).

## Categorias padrão

Elite Masculino · Elite Feminino · RX Masculino · RX Feminino · Scaled Masculino · Scaled Feminino
(editáveis em CONFIG — cada uma tem ranking próprio)

## Tipos de prova

| Tipo | Critério | Como digitar |
|---|---|---|
| Tempo | menor vence | `8:42` (ou segundos). Não finalizou: deixe o tempo vazio e informe as reps no campo **Reps (cap)** |
| Repetições | maior vence | `220` |
| Carga | maior vence | `100` (kg) |
| Pontos | maior vence | `85` |

### Provas com mais de uma pontuação

Uma prova pode valer **duas ou mais pontuações** — por exemplo um buy-in de 1k de remo
cronometrado e, na sequência, o for time da prova. No painel, botão **PARTES** na prova:
uma parte por linha, no formato `Nome; tipo`:

```
Buy-in 1k remo; tempo
For time; tempo
```

Aceita os apelidos `for time`, `amrap`, `kg`/`peso` e `pts`. Cada parte é rankeada e pontuada
separadamente e aparece no leaderboard como **A**, **B**… dentro da mesma prova (colunas
`W3A`, `W3B`). O lançamento de resultados é feito parte por parte. Para voltar a ter
pontuação única, é só esvaziar o campo — os resultados das partes removidas são apagados junto.

## Pontuação

Dois sistemas, escolhidos em CONFIG:

- **Colocação por prova** (padrão do Invitational): 1º = 1 pt, 2º = 2 pts, 3º = 3 pts e assim por diante.
  **Menor total vence.**
- **Tabela de pontos**: 1º lugar = 100 pts, -5 por posição, mínimo 1. Maior total vence.
  Os dois valores são configuráveis (os campos só aparecem quando esse sistema está selecionado).

Regras aplicadas em toda prova:

- Empates recebem a mesma colocação e **dividem os pontos** das posições empatadas —
  dois atletas empatados em 1º ficam com 1,5 pt cada e o seguinte é o 3º, com 3 pts.
- Quem estoura o time cap entra **depois** de todos que finalizaram, ordenado por repetições.
- Quem não tem resultado na prova recebe a última colocação dela
  (na tabela de pontos, soma 0).
- Desempate no geral: melhores colocações individuais.

## Regras do Firestore

Para o leaderboard ser público (leitura sem login) e só a gestão escrever, as regras
precisam ter este bloco:

```
match /campeonatos/{id} {
  allow read: if true;
  allow write: if request.auth != null
    && exists(/databases/$(database)/documents/dashboard_users/$(request.auth.token.email.lower()));
}
```

Sem a permissão de leitura pública a página mostra "Não foi possível carregar o leaderboard".
Enquanto as regras não forem ajustadas, o conteúdo continua visível para quem faz login como organizador.

## Atualizar a lista de atletas

A lista oficial vem da planilha de inscrição (uma categoria por coluna; a partir
da linha `ATLETAS DESISTENTES`, quem saiu do campeonato).

```
python3 dados/atualizar-atletas.py ATLETAS_TOTAIS.xlsx            # só mostra o que mudaria
python3 dados/atualizar-atletas.py ATLETAS_TOTAIS.xlsx --aplicar  # grava o JSON
```

Depois: commitar `dados/campeonato-inicial.json`, publicar, e clicar em
**CARGA INICIAL** no organizador — é essa tela que leva a lista para o Firestore.
A carga substitui a lista inteira e descarta os resultados de quem saiu; os de
quem fica são preservados pelo `id`.

A planilha não traz a unidade de cada atleta, e os nomes mudam de forma entre uma
versão e outra — encurtam ("Heloisa Machado Agostini" vira "Heloisa Machado") e
trocam de grafia (Thiago/Tiago, Victor/Vitor, Cesar/Cezar). Por isso o script não
casa por igualdade: ele pontua cada par possível (nome igual, apelido entre
parênteses, um nome sendo a versão curta do outro, semelhança fonética, sobrenome
incomum na mesma categoria) e resolve do par mais parecido para o menos, para que
um nome curto não roube o atleta de outro. Quem é reconhecido mantém **id** e
**unidade**; quem não é entra como novo, sem unidade.

Isso é heurística, então **conferir a seção `CASARAM POR APROXIMAÇÃO`** antes de
aplicar: é ali que um erro apareceria. Um casamento errado troca a unidade de
alguém; um casamento que falta só perde a unidade, que se preenche na tela do
organizador.

## O leaderboard no celular

A tabela tem `min-width:640px`, e as colunas das pontas são `position:sticky`.
Num telefone de 380px isso escondia as colunas das provas **atrás** da coluna do
total: o espectador via posição, nome e total, e nada indicava que dava para
arrastar de lado. Na prática, a classificação parecia não ter as notas.

Abaixo de 700px cada linha vira um cartão: posição, nome e total em cima, e as
provas como fichas embaixo, três por linha. Sem rolagem lateral. A grade é de 12
colunas porque as fichas herdariam as larguras da primeira linha e sairiam
desiguais.

O bloco PROVAS é um `<details>` que começa recolhido no celular — a descrição da
prova não é o que o espectador veio ver, e aberta ela empurrava a classificação
para fora da tela.

## Cadastrar as provas

Cada prova tem **dono**: ao adicionar, escolhe-se o **nível** (Elite, RX,
Intermediário, Scaled, Master 45+) e o **gênero** (masc e fem / só masc / só
fem). Isso resolve para as categorias de verdade — "Elite" + "masc e fem" vira
`["Elite Masculino", "Elite Feminino"]`.

O agrupamento por nível existe porque masculino e feminino fazem a mesma prova
mudando só a carga, e a carga vai escrita na descrição ("Snatch 60kg / 40kg").
Quando de fato for só um dos dois, o seletor de gênero resolve.

Nível vazio = **todas as categorias**. É também como se comportam as provas
cadastradas antes disto existir: sem a chave `categorias`, valem para todo mundo.

Consequências, todas testadas:

- O leaderboard público só mostra as colunas e a legenda da categoria aberta
- O total de cada atleta só soma as provas da categoria dele — uma prova de outra
  categoria não entra como "sem nota" e não vira penalidade
- A tela de lançamento só oferece as provas da categoria escolhida

Para mudar o dono depois, o seletor na própria linha da lista de provas faz isso
sem recadastrar.

## Editar um atleta

Na aba ATLETAS, cada linha traz **nome, categoria e unidade** editáveis ali
mesmo. Nada disso exige excluir e recadastrar — e não deve mesmo: o `id` do
atleta é o que amarra os resultados já lançados, e `removerAtleta` apaga os
resultados junto. Corrigir a grafia de um nome no meio do evento apagaria as
notas da pessoa se a única saída fosse excluir.

O `×` continua existindo para quem realmente saiu do campeonato, e avisa que os
resultados vão junto.

Nome em branco é recusado: sumiria da lista sem sumir do campeonato.

Acima da lista há filtro por **nome, categoria e unidade** — com 121 atletas,
achar uma pessoa para corrigir era rolagem pura. A busca por nome ignora
acentos (`joao` acha `João`). A unidade tem a opção **— sem unidade —**, que é
como se acha quem entrou pela planilha sem unidade definida.

Os controles ficam fora do `#atLista` de propósito: `renderListaAtletas()`
reescreve só a lista, então o filtro sobrevive a cada gravação — sem isso ele
se perderia no exato momento em que serve para algo.

## Testes

`testes/` tem dois smoke tests opcionais, para quem for mexer no código — o
evento não depende deles. Eles abrem as páginas geradas num Chromium com o
Firebase trocado por um dublê, então não tocam no Firestore nem precisam de
login. Instruções em `testes/README.md`.

`painel.js` cobre o caminho de uso real: entrar, lançar resultados (inclusive um
WOD de duas partes pontuadas), salvar, importar a lista oficial e salvar a
configuração. Existem porque o build monta as páginas recortando trechos da
fonte: uma edição pode deixar o organizador quebrado sem que nada acuse.

## Como está publicado

| Onde | Repositório | Servido por |
|---|---|---|
| `invitational.bjjblacksheepfit.com` | `blacksheep-invitational` (`index.html`) | GitHub Pages, custom domain + HTTPS |
| `dashboard.bjjblacksheepfit.com` | `blacksheep-dashboard` | GitHub Pages, custom domain + HTTPS |

DNS: registro **CNAME**, host `invitational`, valor `fernandorebane-code.github.io`,
na zona do `bjjblacksheepfit.com` na Locaweb. O apex e o `www` continuam apontando para
o site principal, em outro servidor.

O GitHub Pages aceita um domínio por repositório — é por isso que o leaderboard público
mora num repositório separado. O arquivo `CNAME` de lá foi criado pelo próprio Pages ao
salvar o Custom domain; não editar à mão.

### Atualizar o leaderboard público

1. Mexer em `src/leaderboard-fonte.html`
2. `python3 build-paginas.py`
3. Commitar `organizador.html` e `publico/index.html` aqui
4. Copiar `publico/index.html` por cima de `index.html` no `blacksheep-invitational`
   e commitar lá — o `CNAME` daquele repositório, que sustenta o domínio e o
   certificado, nunca é tocado.

O passo 4 é o único que sai deste repositório, e existem dois caminhos para ele.

**A pé, do jeito que está funcionando hoje.** Quem tem os dois repositórios em
mão copia o arquivo e faz o push no `blacksheep-invitational`. O Pages reconstrói
sozinho em menos de um minuto.

**Automático, se alguém configurar o segredo.** A Action
`.github/workflows/publicar-leaderboard.yml` roda a cada push na `main` que mexa
em `publico/index.html`. Ela primeiro compara o arquivo com o que está no ar:

- iguais → passa e não faz nada (é o caso quando a cópia já foi feita a pé);
- diferentes e com o segredo `INVITATIONAL_TOKEN` → copia e publica;
- diferentes e sem o segredo → **falha de propósito**, porque uma cópia que não
  acontece em silêncio vira leaderboard desatualizado no ar sem ninguém perceber.

Para criar o segredo, uma vez só:

1. github.com/settings/personal-access-tokens → **Generate new token** (fine-grained)
2. Repository access: **Only select repositories** → `blacksheep-invitational`
3. Permissions → Repository permissions → **Contents: Read and write**
4. Gerar, copiar o token
5. No `blacksheep-dashboard`: Settings → Secrets and variables → Actions →
   **New repository secret**, nome `INVITATIONAL_TOKEN`, valor o token

Um PAT expira e está preso a uma pessoa. Depois do evento, vale trocar por uma
**deploy key** do `blacksheep-invitational`, que não expira nem depende de conta.

## Acesso e regras

### Login do organizador

A tela em `organizador.html` pede **usuário e senha**, não e-mail. Quem lança os
resultados é quem estiver de plantão na mesa, e essa pessoa não deve precisar da
conta pessoal de ninguém.

O Firebase Auth só trabalha com e-mail, então o que for digitado sem `@` vira
`usuario@invitational.bjjblacksheepfit.com` (a constante `DOMINIO_ORGANIZADOR`
na fonte). Um e-mail inteiro continua valendo — é assim que as contas do
dashboard de gestão entram. O cabeçalho mostra só o usuário, sem o domínio.

Esse domínio não precisa receber e-mail: é apenas o formato que o Firebase exige.

**Criar a conta da mesa**, uma vez só:

1. Firebase Console → Authentication → Users → **Add user**
2. E-mail `organizador@invitational.bjjblacksheepfit.com`, e a senha que for usar
3. Copiar o **UID** que aparece na lista
4. Firestore → Rules → acrescentar esse UID à lista de UIDs autorizados

O passo 4 é o que dá permissão de escrita. A outra via da regra — estar em
`dashboard_users` — exige `email_verified`, e essa conta não tem e-mail de
verdade para verificar; por isso ela entra pela lista de UIDs.

Depois do evento, remover o UID da lista encerra o acesso sem mexer em mais nada.



A regra de escrita em `campeonatos` autoriza por **UID em lista** ou por e-mail
cadastrado em `dashboard_users` **com e-mail verificado**:

```
    match /campeonatos/{id} {
      allow read: if true;
      allow write: if request.auth != null
        && (request.auth.uid in [
              'eOMZrPKQlHdEQif3EkmOMsM7Bwo2'
            ]
            || (request.auth.token.email_verified == true
                && exists(/databases/$(database)/documents/dashboard_users/$(request.auth.token.email.lower()))));
    }
```

### Como dar acesso a alguém da organização

**Pelo UID, não pelo e-mail.** Crie a conta em Authentication, copie o UID e acrescente
uma linha na lista da regra. Só isso.

Por que não pelo `dashboard_users`: aquela coleção é a whitelist do **dashboard
financeiro da rede** — pôr alguém lá dá acesso à receita das seis unidades, não só ao
leaderboard. E um e-mail cadastrado lá **antes** de a conta existir é uma porta aberta:
quem souber o endereço registra a conta e entra. Foi exatamente o que existia até
28/08/2026, um `novousuario@email.com` esquecido desde abril, encontrado numa auditoria
e removido. O `email_verified` na regra fecha essa janela, mas a lista de UIDs a evita
por completo.

**Nenhum código deste repositório escreve em `dashboard_users`** — `index.html`,
`organizador.html` e a fonte apenas leem, para checar autorização. Documentos dessa
coleção nascem no console do Firebase.

**Não desativar** Authentication → Settings → User actions → *Ativar criação (inscrição)*:
o cadastro de alunos passa por ali (396 contas, de uma a três novas por dia).

### Histórico

Em 28/08/2026 a exigência de `email_verified` foi removida por algumas horas e depois
restaurada. O motivo da remoção não era um bug de login: ninguém estava sendo barrado —
o acesso do dono passa pela lista de UIDs e nunca chega a avaliar `email_verified`. Era
o aviso do painel pedindo verificação, um e-mail de verificação que não chega, e a
intenção de usar uma senha única para a mesa de lançamento. A lista de UIDs atende esse
caso sem afrouxar regra nenhuma.
