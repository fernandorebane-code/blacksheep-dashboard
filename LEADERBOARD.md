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

A cópia para o `blacksheep-invitational` é automática: a GitHub Action
`.github/workflows/publicar-leaderboard.yml` roda a cada push na `main` que
mexa em `publico/index.html` e copia só esse arquivo — o `CNAME` de lá, que
sustenta o domínio e o certificado, nunca é tocado.

**Configuração, uma vez só.** A Action precisa do segredo `INVITATIONAL_TOKEN`,
com permissão de escrita no `blacksheep-invitational`:

1. github.com/settings/personal-access-tokens → **Generate new token** (fine-grained)
2. Repository access: **Only select repositories** → `blacksheep-invitational`
3. Permissions → Repository permissions → **Contents: Read and write**
4. Gerar, copiar o token
5. No `blacksheep-dashboard`: Settings → Secrets and variables → Actions →
   **New repository secret**, nome `INVITATIONAL_TOKEN`, valor o token

Sem o segredo a Action não falha: ela avisa e sai, e a cópia volta a ser manual.

## Acesso e regras — decisões registradas

A regra de escrita em `campeonatos` **não exige e-mail verificado**. Foi uma decisão
consciente, tomada em agosto/2026: o e-mail de verificação do Firebase não chega de
forma confiável e o console não permite marcar uma conta como verificada, então a
exigência travaria a equipe no meio do evento sem caminho de saída.

O que protege o acesso no lugar disso é a **ordem do cadastro**:

> Criar a conta no **Authentication** antes de criar o documento em `dashboard_users`.

Um e-mail autorizado sem conta correspondente é uma porta aberta: qualquer pessoa que
saiba esse e-mail pode registrá-lo e entrar. Foi exatamente o que existia até
28/08/2026 — um `novousuario@email.com` esquecido desde abril, removido depois de uma
auditoria da coleção.

**Nenhum código deste repositório escreve em `dashboard_users`** — as três ocorrências
(`index.html`, `organizador.html`, e a fonte) apenas leem, para checar autorização.
Documentos dessa coleção nascem no console do Firebase. Não existe tela de "adicionar
admin" para endurecer aqui.

### Pendências combinadas

1. **Depois do campeonato:** remover a conta da mesa de lançamento do `dashboard_users`
   e devolver `request.auth.token.email_verified == true` à regra de escrita.
2. **Correção definitiva:** trocar a whitelist de e-mail por **UID**. Um UID não pode ser
   reivindicado registrando um e-mail, o que elimina a classe inteira de ataque sem
   depender de ninguém lembrar da ordem do cadastro. Mexe também no login do dashboard,
   então é trabalho para fora da véspera do evento.

Não desativar **Authentication → Settings → User actions → Ativar criação (inscrição)**:
o cadastro de alunos passa por ali (396 contas, de uma a três novas por dia).
