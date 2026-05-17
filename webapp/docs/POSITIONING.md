# VP Social — Posicionamento & Plano de Execução (Q1-Q2 2026)

> Documento vivo. **v2 — 2026-05-17** (reescrita após reframe estratégico). Cada seção marca `Decidido` ou `Aberto`. Revisar trimestralmente. Histórico de pivôs no final.

---

## 1. Tese (TL;DR) — *Decidido*

Agências de social media operam com **5+ ferramentas desconectadas**: planning em Notion/Sheets, aprovação no WhatsApp se perdendo no scroll, publicação em mLabs, relatório em PDF manual no fim do mês. Cada agência tem o mesmo Frankenstein.

**VP Social é a camada premium de relacionamento entre a agência e o cliente final dela.**

A agência é o comprador. O cliente final é quem **experimenta** a marca. A agência **compra pelo portal cinematográfico** que faz o cliente final entender — e amar — o trabalho que ela entrega. Por trás, automatizamos: planning conectado (Notion hoje; Sheets, Trello, Asana, Airtable depois), aprovação por WhatsApp (BR; Email/Slack pra mercado internacional) com cadeia auditável e fallback tácito por silêncio, publicação multi-plataforma assim que aprovado.

**Categoria nova** — não é ferramenta interna (mLabs, Etus), não é agendador (Buffer), não é portal de review (Frame.io). É a camada que **substitui o WhatsApp solto + planilha + PDF manual** por um sistema premium que o cliente final adora — e que dá à agência o moat de "se cliente saísse, perderia o portal que ele já internalizou".

**Resumo de 6 palavras:** *Portal vende. Aprovação retém. Pricing posiciona.*

### Por que a tese é forte (não é só copy)

| Implicação | Mecanismo |
|---|---|
| **Pricing per-client é coerente, não arbitrário** | Cada cliente final = unidade de relacionamento entregue. Cobrança casa com valor. |
| **Churn cai** | Saída quebra relacionamento com cliente final (já internalizou o portal), não só fluxo interno. Custo de troca = 2x. |
| **Network effect lateral** | Cliente final aprovador atravessa N agências ao longo da vida — quando entra em outra agência, pergunta "vocês usam VP?". Viralidade horizontal. |
| **Brand power composto fora do gueto B2B** | Cliente final fala da gente em contextos onde nenhum SaaS B2B aparece. Marca escapa do nicho "ferramenta de agência". |

---

## 2. Posicionamento de mercado — *Decidido*

### Headline de capa
> **Dê ao seu cliente um portal que faz ele entender por que você cobra o que cobra.**
> *Aprovação no WhatsApp, publicação automática, relatório story-style — sem migrar sua operação.*

### Sub-headline (segunda dobra)
> Você já planeja no Notion (ou Sheets, ou Trello) com seu cliente. VP Social conecta isso, dispara aprovação no WhatsApp do cliente final, publica multi-plataforma assim que ele aprova — e devolve um portal premium **white-label** que ele abre no celular todo dia. Sua agência fica com o controle. Seu cliente fica com a experiência.

### Elevator pitch (30s, fala humana)
> "A gente é a camada de relacionamento entre a agência e o cliente final dela. Agência conecta o Notion que ela já usa, a gente dispara aprovação no WhatsApp do cliente, publica nas redes assim que aprovado e devolve pro cliente um portal premium que parece que a agência mandou construir só pra ele. Sem migrar operação, sem aprender ferramenta nova. A agência cobra mais porque entrega mais. O cliente fica nas mãos da agência — porque também tá nas nossas."

### Antagonistas declarados
| Concorrente | Por que VP Social ganha |
|---|---|
| **Status quo: WhatsApp manual + planilha + PDF** | É o real concorrente. É o que agência usa hoje. É o que perde aprovações no scroll. É o que faz a agência parecer amadora pro cliente. |
| **mLabs / Etus** | Não é concorrente — é nosso anti-exemplo de categoria. Ferramenta interna de SMM que ninguém mostra pro cliente. Agência premium não migra a operação dela pra dentro do tool deles. |
| **Hootsuite / Later / Sprout** | Gringos, dolarizados, UI corporativa fria, sem portal cliente-final, suporte em inglês. Sprout custa R$ 5k/mês e não fala português. |
| **Frame.io / Filestage** | Param na aprovação de criativo. Não publicam. Não constroem relacionamento com cliente final ao longo do mês. |

### O que NÃO somos (anti-posicionamento)
- ❌ Não somos rede social (não fazemos feed próprio)
- ❌ Não somos agendador genérico ("Buffer brasileiro")
- ❌ Não somos ferramenta de design (não competimos com Canva / CapCut)
- ❌ Não somos CRM de agência (não gerimos pipeline comercial)
- ❌ Não somos "mais um SaaS pra agência operar" — somos a camada que a agência usa pra **mostrar** trabalho

---

## 3. Wedge sequencing — *Decidido*

**Estratégia: Híbrido escalonado em 6 meses. Portal vende, OS retém — dev finito decide a ordem.**

| Mês | Foco | Escopo (com reframe v2) | Métrica de sucesso |
|---|---|---|---|
| **1-2** | **Portal hub-do-cliente** (NÃO é redesign de UI — é re-conceituar o produto) | Os 6 elementos do hub: (1) posts pra aprovar como CTA principal, (2) publicados esse mês com métricas visuais, (3) briefing/estratégia aprovada, (4) próxima reunião, (5) status geral ("tudo em dia ✓"), (6) relatório story-style mensal swipável tipo Spotify Wrapped. White-label real (logo + cor + fonte da agency, zero "powered by VP"). Mobile-first impecável: aprovação 1-tap, slide-to-approve com microinteractions, áudio WhatsApp embed, notificação push PWA. | 3 agências-piloto contratadas e usando ativamente. NPS portal entre clientes finais ≥ 50. |
| **3-4** | **OS multi-source: abstração + 2º conector** | Refator `lib/notion.ts` → `lib/source-adapter.ts` com interface `SourceOfTruthAdapter`. Schema `notionConnection` → `sourceConnection` (migration). Google Sheets como 2º conector com paridade de features. | 1 piloto rodando 100% via Sheets. Zero regressão Notion. Adapter contract documentado. |
| **5-6** | **Refinamento + escolha do 3º conector** | Health dashboard interno (`/admin/health`): cron lag, último erro por conexão, taxa publish OK/erro/skip por cliente. Notion webhooks (substituir cron 5min onde possível). Decisão Trello vs IA assistant baseada em data dos pilotos. | <1% posts "stuck", lag médio <60s, 2 de 3 pilotos convertidos em pagantes. |

### Por que **Híbrido** e não **Portal-puro** ou **OS-puro**

- Portal-puro: vende, mas concorrente UI-pretty derruba o moat em 6 meses. Sem OS narrativo, pricing premium não sustenta.
- OS-puro: defensável, mas owner agency não-tech não compra pela tese. Venda inicial morre.
- Híbrido: portal é o **foco de DEV no Q1** (90%+ de horas) — mas OS multi-source aparece desde já **na narrativa de posicionamento** pra justificar pricing R$ 1.500. Dev pesado do OS começa mês 3.

### Wedge defensável (hierarquia, ordem importa)

```
(1) Portal premium cliente-final          ← coração da experiência (mês 1-2)
   ├── WhatsApp como atalho               ← canal de notificação que ABRE o portal
   ├── Aprovação como experiência         ← slide-to-approve, microinteractions
   ├── Story-style report mensal          ← cliente final encaminha pros sócios dele
   └── White-label real                   ← cliente nunca vê "powered by VP"

(2) Plug planning tool da agency          ← multi-source (mês 3-4)
   └── SourceOfTruthAdapter               ← Notion vira 1 de N, não wrapper-de-Notion

(3) Multi-cliente agency-mode             ← já em operação
   └── Health dashboard interno           ← agency vê tudo em uma tela (mês 5)

(4) IA cross-cutting                      ← roadmap aberto (mês 6+)
   └── caption AI, brief→draft, áudio→comentário
```

---

## 4. Pricing — *Decidido*

### Tier único, per-client

| Componente | Valor |
|---|---|
| **Base** | **R$ 1.500/mês** |
| **Inclui** | 5 clientes ativos, seats ilimitados na agency, posts ilimitados, todas as plataformas, todos os conectores, portal premium white-label, IA básica |
| **Cliente adicional** | **R$ 197/cliente/mês** a partir do 6º |
| **Anual** | -2 meses → R$ 15.000/ano = R$ 1.250/mês efetivo |
| **Trial** | 14 dias, sem cartão |
| **Onboarding white-glove (opcional)** | R$ 2.500 one-time — call de setup + migração assistida de planning + treinamento da agency. Sinaliza premium. |

### Por que R$ 1.500 (e não R$ 697 nem R$ 1.997)

**Âncora 1 — Vende contra a folha de pagamento, não contra outro SaaS.**
CLT júnior operacional em SP com encargos: R$ 3.000-5.000/mês. R$ 1.500 lê como **"menos da metade de uma pessoa operacional que ainda erra mais"**. Owner agency entende em 5s.

**Âncora 2 — Sinaliza plataforma, não ferramenta.**
- mLabs ~R$ 199/mês = ferramenta
- VP Social R$ 1.500/mês = plataforma (7-8x acima de mLabs)
- Sprout ~R$ 5.000/mês = gringo enterprise

Cair em ~R$ 697 ativaria a desconfiança *"se é tão barato, não pode ser bom"* — vai contra a tese de relacionamento premium.

**Âncora 3 — Per-client é coerente com a categoria.**
Não é "escalar com sucesso da agência" (justificativa fraca). É **"cada cliente final é uma unidade de relacionamento entregue. Unidade de valor = unidade de cobrança"**. Investidor + agency entendem na hora.

### Math do pricing

| Agency size | Preço/mês | R$/cliente | Comparativo |
|---|---|---|---|
| 3 clientes | R$ 1.500 | R$ 500 | <½ pessoa operacional |
| 5 clientes | R$ 1.500 | R$ 300 | sweet spot do tier base |
| 8 clientes | R$ 2.090 | R$ 261 | ainda <Sprout |
| 15 clientes | R$ 3.470 | R$ 231 | abaixo de Sprout, com portal cliente-final |
| 30 clientes | R$ 6.420 | R$ 214 | acima de Sprout flat, mas com 2x valor |

### O que NÃO cobramos (e por quê)
- Posts adicionais → cheiro de mLabs. Ilimitado sinaliza confiança.
- Plataformas adicionais → não fazemos paywall em IG vs TikTok.
- Storage / bandwidth → custo marginal baixo, e cobrar isso parece SaaS de 2015.

---

## 5. ICP — *Hipótese refinada, validar com pilotos*

### Refinamento crítico do reframe v2

A variável-chave **não é tamanho da agency** (n° de clientes). É **ticket médio que a agency cobra do cliente final**. Razão: se agency cobra R$ 800/mês do cliente, ela não comporta R$ 1.500/mês nosso — e o cliente final dela não tem "padrão premium" pra precisar de portal cinematográfico.

### Perfil-alvo
- **Geo:** Brasil (BR-PT é diferencial vs Hootsuite/Sprout)
- **N° de clientes:** 3 a 15 ativos sob gestão
- **Ticket médio do cliente final:** **R$ 3.000 a R$ 15.000/mês** ← variável de corte
- **Tipo de agency:** social media boutique premium, marketing 360 com vertical forte de conteúdo, agency de influência (clientes = creators que se importam com marca)
- **Operação atual:** Notion ou planilha estruturada. Passou da fase caótica, ainda sem tool dedicada de aprovação/portal
- **Dores recorrentes:** aprovação no WhatsApp se perdendo no scroll, posts saindo errado/atrasado, relatório PDF manual no dia 28, cliente final que não entende o trabalho (e renegocia preço pra baixo todo trimestre)
- **Owner perfil:** 28-45 anos, ainda operacional, sente que "não escala mais", **quer parecer premium pro cliente final**, tem orgulho do trabalho e fica puto quando o trabalho parece amador por culpa da ferramenta

### Quem definitivamente NÃO é cliente
- Agency que cobra <R$ 1.500/mês do cliente final (operação não comporta nosso preço)
- Solo freelancer (não tem necessidade de agency-mode multi-cliente)
- Marca direta (B2C que faz social próprio — não precisa de camada cliente-final, é o cliente final)
- Agency enterprise 50+ clientes (precisa de SSO, audit logs Enterprise, contratos jurídicos pesados — Q3 problem)

### O que vamos validar nos 3 pilotos
1. **Variável de corte real**: é ticket do cliente final mesmo, ou outra coisa (vertical, idade do owner, geografia)?
2. **Notion vs Sheets**: qual planning tool é dominante nesse segmento? (define ordem do 2º conector)
3. **Quem decide a compra**: owner sozinho, ou tem head-de-ops?
4. **O que faz o piloto pagar no fim do trial**: portal? auto-publish? aprovação WhatsApp? (confirma feature-wedge real)
5. **Tempo até "aha moment"**: hipótese hoje = 24h após setup, quando agency dispara primeira aprovação WhatsApp e cliente final aprova em 1 tap

---

## 6. Métricas de sucesso — *Decidido*

### Mês 1-2 (Portal hub-do-cliente)
- 3 agências-piloto assinaram trial e usam ativamente
- ≥ 5 posts publicados via VP por piloto
- ≥ 1 cliente final do piloto entrou no portal ≥ 3 vezes na semana
- NPS portal entre clientes finais ≥ 50
- Tempo médio setup novo cliente < 15 min

### Mês 3-4 (OS multi-source)
- 1 piloto rodando 100% via Google Sheets (sem Notion)
- Zero regressão Notion (build + smoke test)
- `SourceOfTruthAdapter` contract documentado, revisado e usado em prod

### Mês 5-6 (Refinamento + conversão)
- < 1% de posts "stuck"
- Lag médio cron / webhook < 60s
- 2 de 3 pilotos convertidos em pagantes (passaram trial)
- ≥ 1 piloto recomendou ativamente pra outra agency (network effect lateral começa)

### Métricas que NÃO vamos perseguir
- ❌ Total de posts publicados (vanity)
- ❌ DAU/MAU de seats (agency só loga quando precisa)
- ❌ "Engajamento na plataforma" (não somos rede social)
- ❌ Quantidade de integrações conectadas (mais ≠ melhor)

---

## 7. Brand Direction — *Aberto / Aguardando input*

> Esta seção será preenchida quando o doc de direção de marca (PDF/PPT que a Vitamina Publicitária usa com clientes) chegar via conversa ou em `webapp/docs/brand/`.

### Requisito novo com o reframe v2
**Brand precisa funcionar em DOIS níveis simultâneos** — diferente de qualquer SaaS B2B comum, que tem só uma audiência:

1. **Voz pra agency (comprador)** — owner 28-45, sente que "não escala mais", quer parecer premium pro cliente. Marca aqui = confiança + sofisticação técnica + "isso não é mais um SaaS genérico".
2. **Experiência pro cliente final (usuário)** — varia muito por vertical (creator, founder, marca de luxo). Portal precisa ser white-label real, então a "marca VP" no nível do usuário final é *invisível*. Mas o **padrão de qualidade** que entregamos via portal vira a "marca VP" indireta — quando o cliente final descobre que aquele portal incrível chama VP por trás.

Isso é diferente de Stripe (1 audiência: dev), diferente de mLabs (1 audiência: agency interna). Mais perto de **Squarespace + plataforma de luxo white-label** (Houzz, Honeybook).

### O que já temos confirmado
- **Logo**: `logo.png` na raiz do repo. "VP." em sans-serif bold branco, ponto vermelho, fundo preto. Vibe: ousada, condensada, decisiva.
- **Cores observadas**: Preto `#000`, branco `#fff`, vermelho do ponto (HEX a confirmar — provável próximo a `#E53E3E` / `#DC2626`).
- **Stack visual atual**: Tailwind v4 + shadcn/ui, dark-mode-first, sem ornamento.

### O que falta definir (do doc cliente-facing que vem)
- [ ] Tipografia headline + body
- [ ] Paleta secundária / acentos
- [ ] Tom de voz escrito (formal-confiante? técnico-direto? editorial?)
- [ ] Do's & Don'ts de imagem
- [ ] Princípios de motion (cinematográfico = inertia + spring? ou snappy + linear?)
- [ ] Referência específica admirada — "Apple" foi mencionado mas o **aspecto** ainda não foi travado (pendência declarada)

### Provisório (até o doc chegar)
Operar com hipótese **editorial-tech com camada cinematográfica**. Stripe + Linear + um toque editorial brasileiro (Piauí, Quatro Cinco Um). Para a experiência cliente-final do portal: pensar Frame.io + Linear + Spotify Wrapped no story report. Não Apple-genérico. Não SaaS-genérico.

---

## 8. Riscos & questões abertas

| Risco | Mitigação |
|---|---|
| Concorrente lança portal bonito em 6 meses copiando UI | Stickiness vem do OS multi-source + aprovação em cadeia + cliente final que já internalizou o portal. UI sozinha não é moat — operação integrada é. |
| Owner agency não-tech não compra "camada de relacionamento" | Headline puxa portal premium ("dê ao seu cliente um portal que justifica seu preço") — emocional + concreto. "Camada" e "OS" vivem no sub-texto e na demo de retenção. |
| R$ 1.500 confunde agencies pequenas | Comunicar SEMPRE como "R$ 1.500 inclui 5 clientes ativos" (não "R$ 300/cliente"). Ancorar no número grande. Comparar com folha de pagamento, não com mLabs. |
| Notion API muda contrato (já aconteceu) | `SourceOfTruthAdapter` (mês 3) reduz blast radius. Notion vira 1 de N. |
| 3 pilotos não convertem | Sinal de wedge errado ou ICP errado. Re-validar antes do mês 7. Não escalar marketing antes dos 3 pilotos pagantes. |
| Aprovação tácita 30d entendida como "passou despercebido" pelo cliente | UX explícita do TTL no card de aprovação ("se você não responder, posta automaticamente em 30d"). Transparência = confiança. |

### Questões abertas (decidir até mês 3)
1. **Free tier?** Hoje só trial. Free atrai SMB mas dilui sinal premium. Decidir com data dos pilotos.
2. **API pública?** Roadmap Q3, não Q2.
3. **Reseller / partner program?** Por ora ignorar — validar com 3+ pedidos explícitos.
4. **Geo expansão**: BR fechado primeiro. PT segundo (mesma TZ + mercado fragmentado). ES só depois de 50+ clientes BR.
5. **Aprovação via Email/Slack como canal primário no mercado internacional**: roadmap Q4 — mas a abstração de canal já tá pronta no código.
6. **Onboarding white-glove gratuito ou pago**: virou pago (R$ 2.500) no v2 pra sinalizar premium. Validar se afasta vendas iniciais ou se é qualifier saudável.

---

## 9. Próximos passos imediatos

1. **Fechar Direção de Marca** (§7) — sessão em andamento usando Método Vitamina Publicitária (8 pilares). Depende de Daniel responder briefing (aspecto-da-Apple + o-que-NÃO-quer-parecer) + 8 pilares estruturados.
2. **Mês 1**: re-conceituar `/c/[token]` como hub-do-cliente (6 elementos). NÃO é redesign UI — é re-arquitetura de produto. Spec primeiro, código depois.
3. **Identificar 3 agências-piloto** com perfil ICP refinado (ticket médio R$ 3-15k/cliente/mês). Target: confirmadas até fim do mês 1.
4. **Pre-flight check no MVP atual**: validar que aprovação WhatsApp + publicação + portal atual estão estáveis o suficiente pra 3 pilotos novos antes de começar redesign.
5. **Setup analytics interno**: KPIs do §6 isolados dos analytics dos posts dos clientes (são coisas diferentes — não misturar).

---

## Histórico de pivôs

### v1 → v2 (2026-05-17)

Reframe estratégico após Daniel passar contexto da sessão de manhã que faltava no contexto desta sessão:

- **Categoria**: "OS de conteúdo das agências brasileiras" → **"camada premium de relacionamento entre agência e cliente final"**. A agência é comprador; o cliente final é quem experimenta. Categoria nova.
- **Headline**: "O sistema operacional de conteúdo das agências brasileiras" → **"Dê ao seu cliente um portal que faz ele entender por que você cobra o que cobra"**. Foco no cliente final como justificativa de preço, não em eficiência interna.
- **Pricing**: R$ 697 + R$ 97 → **R$ 1.500 + R$ 197**. Âncora muda de "comparativo com SaaS" pra "comparativo com folha de pagamento operacional da agency". Preço é posicionamento.
- **Wedge sequencing**: Híbrido escalonado MANTIDO. Mas escopo do mês 1-2 (portal) expandiu — não é redesign UI, é re-conceituar o portal como hub-do-cliente com 6 elementos + slide-to-approve + story-report.
- **WhatsApp**: era "secundário" → agora claramente **"canal de notificação + atalho que ABRE o portal"**. Hierarquia: portal é coração da experiência, WhatsApp é a porta de entrada.
- **Aprovação**: era listada como "dor das agências" no v1 → agora **pilar central do produto**, com infraestrutura própria (cadeia de aprovadores, magic links, tácita por silêncio).
- **ICP**: variável de corte virou **ticket médio do cliente final R$ 3-15k/mês**, não mais "número de clientes da agency".
- **Antagonistas**: mLabs cai de "concorrente" pra "anti-exemplo de categoria". Concorrente real = **status quo (WhatsApp + planilha + PDF)**.

---

*Revisar este documento ao fim de cada mês. Mudou tese material? Criar v3 e listar no histórico de pivôs. Não reescrever silencioso — manter rastreabilidade.*
