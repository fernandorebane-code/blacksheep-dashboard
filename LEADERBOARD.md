# Blacksheep Invitational — Leaderboard

Página pública do campeonato interno de CrossFit.

- **Endereço oficial:** https://invitational.bjjblacksheepfit.com (ver "Publicação" no fim)
- **Endereço provisório:** https://dashboard.bjjblacksheepfit.com/leaderboard.html
- **Arquivo:** `leaderboard.html` (auto-contido, sem build)
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

## Publicação em invitational.bjjblacksheepfit.com

O GitHub Pages aceita **um domínio por repositório**, e este repositório já usa
`dashboard.bjjblacksheepfit.com`. Por isso o site do evento vai num repositório separado.

1. **Criar o repositório** `blacksheep-invitational` na conta `fernandorebane-code`, **público**
   (o GitHub Pages do plano gratuito só publica repositório público).
2. **Conteúdo:** `index.html` (cópia do `leaderboard.html` deste repositório) e um arquivo
   `CNAME` com uma linha: `invitational.bjjblacksheepfit.com`
3. **DNS** — no painel onde o domínio `bjjblacksheepfit.com` é administrado (hoje a zona
   aponta para a Locaweb, `187.45.239.160`), criar um registro:

   | Tipo | Nome | Valor |
   |---|---|---|
   | CNAME | `invitational` | `fernandorebane-code.github.io` |

   Não mexer no apex nem no `www` — o site principal continua onde está.
4. **GitHub Pages** — no repositório novo: Settings → Pages → Source `Deploy from a branch`,
   branch `main`, pasta `/ (root)`. Em Custom domain, `invitational.bjjblacksheepfit.com`,
   e marcar **Enforce HTTPS** depois que o certificado for emitido (leva alguns minutos
   após o DNS propagar).

Enquanto o DNS não propaga, a página continua acessível pelo endereço provisório.
