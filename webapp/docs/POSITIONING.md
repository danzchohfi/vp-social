# Produção — Posicionamento & Plano de Execução (Q1-Q2 2026)

> Documento vivo. **v4 — 2026-05-18** (refoco MVP — ver histórico de pivôs no fim). Cada seção marca `Decidido` ou `Aberto`. Revisar trimestralmente.
>
> **Nome do produto**: Produção · `producao.app`
> **Direção de marca completa**: ver [`brand/DIRECAO-DE-MARCA.md`](./brand/DIRECAO-DE-MARCA.md)

---

## 1. Tese (TL;DR) — *Decidido*

Agências de social media operam com **5+ ferramentas desconectadas**: planning em Notion/Sheets, aprovação no WhatsApp se perdendo no scroll, publicação em mLabs, relatório em PDF manual no fim do mês. Cada agência tem o mesmo Frankenstein.

**Produção é a camada premium de relacionamento entre a agência e o cliente final dela.**

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

## 1.5 Entry point MVP atual (Q1-Q2 2026) — *Decidido v4*

A tese estratégica acima é a **visão de longo prazo**. O **gancho de venda no MVP** é mais imediato e mensurável: **publicação no piloto automático usando a stack de produção da agência (Notion, Sheets, Trello, Airtable) — substituindo o agendador típico**.

Quem chega na home lê primeiro *"largue o agendador. Seu Notion vira o piloto automático"*. O portal premium aparece como entrega adicional na mesma compra — não some, vira o sub-texto.

### Por que entrar pela automação, não pelo portal

- **Dor mais imediata e mensurável.** Owner-agency já paga R$ 200-500/mês num agendador (mLabs/Etus/RD Station). Substituir um SaaS que ele paga = ROI óbvio em 30s de demo.
- **Setup que cabe na demo de 30 min.** Conectar Notion + WhatsApp + 1 conta IG é tangível. Re-conceituar portal cliente-final como hub-do-relacionamento exige fé.
- **Portal cresce organicamente.** Quando a publicação já tá rodando automatizada (semana 1-2), o link permanente `/c/[token]` é uma adição natural pro cliente acompanhar — sem precisar "vender" o portal isoladamente.
- **Demo converte mais rápido.** A virada psicológica acontece quando owner-agency vê o post saindo sozinho do Notion dele. Portal vira "ah, e ainda tem isso aqui pra mostrar pro cliente" no minuto 25.

### Tensão a observar

Risco do entry point MVP: prospect categorizar Produção como *"mais um agendador"* e nivelar pricing por baixo (R$ 200 mLabs vs R$ 1.500 nosso). Mitigação: a demo SEMPRE termina no portal — owner sai entendendo que comprou *"agendador + relacionamento premium"*, não *"agendador caro"*. Pricing argument continua sendo *"folha de pagamento operacional"*, não *"comparativo com mLabs"*.

Conforme os pilotos consolidam (Q2-Q3), o eixo de venda migra naturalmente pro portal-as-moat. Categoria estratégica permanece *"painel de experiência do cliente"*.

---

## 2. Posicionamento de mercado — *Decidido*

### Headline estratégico (longo prazo, peças de marca)
> **Dê ao seu cliente um portal que faz ele entender por que você cobra o que cobra.**
> *Aprovação no WhatsApp, publicação automática, relatório story-style — sem migrar sua operação.*

### Headline MVP (entry point — capa da home, ads, podcast outreach)
> **Largue o agendador. Seu Notion vira o piloto automático.**
> *Aprova no WhatsApp do cliente, publica sozinho em todas as redes — sem migrar nada.*

### Sub-headline (segunda dobra)
> Você já planeja no Notion (ou Sheets, ou Trello) com seu cliente. Produção conecta isso, dispara aprovação no WhatsApp do cliente final, publica multi-plataforma assim que ele aprova — e devolve um portal premium **white-label** que ele abre no celular todo dia. Sua agência fica com o controle. Seu cliente fica com a experiência.

### Elevator pitch (30s, fala humana)
> "A gente é a camada de relacionamento entre a agência e o cliente final dela. Agência conecta o Notion que ela já usa, a gente dispara aprovação no WhatsApp do cliente, publica nas redes assim que aprovado e devolve pro cliente um portal premium que parece que a agência mandou construir só pra ele. Sem migrar operação, sem aprender ferramenta nova. A agência cobra mais porque entrega mais. O cliente fica nas mãos da agência — porque também tá nas nossas."

### Antagonistas declarados
| Concorrente | Por que Produção ganha |
|---|---|
| **Status quo: WhatsApp manual + planilha + PDF** | É o real concorrente em agências sem stack. É o que perde aprovações no scroll. É o que faz a agência parecer amadora pro cliente. |
| **Agendador típico (categoria sem nomear: "mLabs-like")** | Concorrente direto **na cabeça do prospect** no MVP. Eles operam num plano interno-da-agência: você copia/cola do Notion, aprova manualmente, paga R$ 200-500/mês. Produção **não substitui o trabalho do agendador — substitui a dupla operação**: Notion já vira o agendador. E entrega portal + aprovação que o mLabs-like nem tem. |
| **mLabs / Etus** (categoria) | Anti-exemplo de categoria, não competimos no mesmo plano. Ferramenta interna de SMM que ninguém mostra pro cliente. Agência premium não migra a operação dela pra dentro do tool deles. |
| **Hootsuite / Later / Sprout** | Gringos, dolarizados, UI corporativa fria, sem portal cliente-final, suporte em inglês. Sprout custa R$ 5k/mês e não fala português. |
| **Frame.io / Filestage** | Param na aprovação de criativo. Não publicam. Não constroem relacionamento com cliente final ao longo do mês. |

### O que NÃO somos (anti-posicionamento)
- ❌ Não somos rede social (não fazemos feed próprio)
- ❌ Não somos agendador genérico ("Buffer brasileiro") — **mesmo entrando pela automação no MVP, categoria é "painel"**
- ❌ Não somos ferramenta de design (não competimos com Canva / CapCut)
- ❌ Não somos CRM de agência (não gerimos pipeline comercial)
- ❌ Não somos "mais um SaaS pra agência operar" — somos a camada que a agência usa pra **mostrar** trabalho

---

## 3. Wedge sequencing — *Decidido (v4 — checkmarks + marco MVP)*

**Estratégia: Híbrido escalonado em 6 meses. Portal vende, OS retém — dev finito decide a ordem.**

| Mês | Foco | Status | Métrica de sucesso |
|---|---|---|---|
| **1-2** | **Portal hub-do-cliente** (6 elementos do Pilar 7 + transversais: white-label real, slide-to-approve, PWA push, story-report swipável) | ✅ **Implementado 2026-05-18** — 9 fases técnicas (commits `8bdfb69` → `ecc811a`). VAPID keys pendem geração pra ativar push em prod. | 3 agências-piloto contratadas e usando ativamente. NPS portal entre clientes finais ≥ 50 (pendente: pilotos completarem 90d). |
| **2-3** | **Consolidar oferta MVP de automação como entry point** (NOVO v4) | 🟡 Em curso — copy da home reescrita 2026-05-18 (`542af67`); falta propagar pra `/como-funciona`, `/integracoes`, `/faq`, `/setup`, `/demo` + materiais de venda (deck, vídeo de demo gravado, 1-pager). | 3 demos/semana via formulário público; taxa conversão demo → trial ≥ 30%; 1 caso de uso público completo (vídeo + screenshots) até fim de junho. |
| **3-4** | **OS multi-source: abstração + 2º conector** | ⬜ Não iniciado | Refator `lib/notion.ts` → `lib/source-adapter.ts` com interface `SourceOfTruthAdapter`. Schema `notionConnection` → `sourceConnection` (migration). Google Sheets como 2º conector com paridade de features. 1 piloto rodando 100% via Sheets. Zero regressão Notion. |
| **5-6** | **Refinamento + escolha do 3º conector** | ⬜ Não iniciado | Health dashboard interno (`/admin/health`): cron lag, último erro por conexão, taxa publish OK/erro/skip por cliente. Notion webhooks (substituir cron 5min onde possível). Decisão Trello vs IA assistant baseada em data dos pilotos. <1% posts "stuck", lag médio <60s, 2 de 3 pilotos convertidos em pagantes. |

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
- Produção R$ 1.500/mês = plataforma (7-8x acima de mLabs)
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

## 7. Brand Direction — *Decidido (v1.0)*

> Direção de marca completa em [`brand/DIRECAO-DE-MARCA.md`](./brand/DIRECAO-DE-MARCA.md) — 8 pilares pelo método Vitamina Publicitária. Resumo abaixo.

### Nome e domínio
- **Nome do produto**: Produção
- **Domínio**: `producao.app`
- **Logo VP atual sai** — pertence à Vitamina Publicitária mãe, não ao produto Produção. Entra em fila pra revisão e não deve ser usado em material da Produção.

### Arquétipo
- **Dominante**: Soberano (60-70%) — refinamento, autoridade pelo padrão
- **Secundário**: Sábio (30%) — autoridade pelo conhecimento técnico
- **Fora**: Inocente, Cara-comum, Cuidador

### Direção visual — Editorial-quente (Anthropic-style)

| Dimensão | Direção |
|---|---|
| **Paleta** | Cream-quente (~`#FAF7F0`) + coral (~`#CC785C`) + marrom-escuro (~`#1A1612`). Nunca branco puro, nunca preto-frio. |
| **Tipografia** | Headline: serif refinada bold (Tiempos / Söhne Headline / Editorial New). Body: sans clean (Söhne, Inter). |
| **Layout** | Generoso em cream-space. Editorial. |
| **Mockups** | Cinematográficos, full-bleed. Nunca fileira de iPhones. |

### Referências
- **Anthropic** (claude.com) — referência **principal**
- **Stripe** — refinamento técnico
- **Linear** — voz, motion contido
- **Spotify Wrapped** — modelo do story-report mensal
- **Frame.io** — estética cinematográfica de mockup

### Pendências de marca
- Figura de referência de voz (Pilar 6) — ainda em aberto
- HEX exatos da paleta — refinar com designer
- Tipografias finais com licenciamento
- Briefing detalhado pra designer (logo + identidade)
- Busca de marca INPI + USPTO antes do lançamento público

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

1. **Registrar `producao.app`** + **busca de marca INPI/USPTO** pra "Produção" como SaaS antes do lançamento público (Daniel — semana 1).
2. **Briefing pra designer** com `brand/DIRECAO-DE-MARCA.md` — logo (wordmark `producao.app`), paleta HEX exata, tipografias com licenciamento, sistema de componentes (Daniel + designer — semana 1-2).
3. **Mês 1**: re-conceituar `/c/[token]` como hub-do-cliente (6 elementos do §7 do brand doc). NÃO é redesign UI — é re-arquitetura de produto. Spec primeiro, código depois.
4. **Identificar 3 agências-piloto** com perfil ICP refinado (ticket médio R$ 3-15k/cliente/mês). Target: confirmadas até fim do mês 1.
5. **Pre-flight check no MVP atual**: validar que aprovação WhatsApp + publicação + portal atual estão estáveis o suficiente pra 3 pilotos novos antes de começar redesign.
6. **Setup analytics interno**: KPIs do §6 isolados dos analytics dos posts dos clientes.
7. **Migração de nome no código**: identificar usos de "VP Social" em copy/UI do app e migrar pra "Produção" — backlog técnico (separado deste doc).

---

## Histórico de pivôs

### v3 → v4 (2026-05-18)

Refoco MVP: copy/CTA da home pivota pra **"publicação no piloto automático"** como entry point, sem alterar a tese estratégica de longo prazo (relacionamento premium). Daniel observou que após a migração pra `producao.app` e implementação do redesign do portal (9 fases entregues), o gancho de venda imediato é mais claro como automação — owner-agency precisa "entender em 5s" e substituir um SaaS que já paga é tangível.

- **Tese estratégica**: inalterada — categoria continua *"painel de experiência do cliente"*. Portal premium continua o moat de longo prazo.
- **§1.5 Entry point MVP** (novo): explícito que o gancho de venda atual é automação (*"largue o agendador"*), portal aparece como upsell narrativo na mesma compra. Tensão a observar: prospect pode nivelar pricing por baixo contra mLabs (R$ 200/mês); mitigação é demo SEMPRE terminar no portal.
- **§2 Headline MVP** adicionado: *"Largue o agendador. Seu Notion vira o piloto automático"* pra uso no funil de captação (Google, Meta ads, podcast outreach, capa da home). Headline estratégico (*"Dê ao seu cliente um portal..."*) continua pra peças de marca.
- **§2 Antagonistas**: adicionado *"Agendador típico (mLabs-like)"* como concorrente declarado **na cabeça do prospect** no MVP. mLabs/Etus por nome continua como anti-exemplo de categoria (não competimos no mesmo plano). Distinção importante pra que o argumento de pricing não vire comparativo com SaaS de R$ 200.
- **§3 Roadmap**: Mês 1-2 (portal) marcado ✅ — 9 fases técnicas entregues 2026-05-18 (commits `8bdfb69` → `ecc811a`). Inserido marco **Mês 2-3: consolidar oferta MVP** pra fechar a virada de copy + materiais de venda + 1 caso de uso público. Mês 3-4 OS multi-source segue mesma.
- Direção de marca (`DIRECAO-DE-MARCA.md`) recebeu mudanças correspondentes: posicionamento MVP (§1), provas reordenadas (§3, automação sobe pro topo), mensagem-mãe MVP (§4), vocabulário ganha "piloto automático / agendador / dupla operação / stack de produção" (§6).

### v2 → v3 (2026-05-17, mesma data)

Sessão de Direção de Marca pelo método Vitamina Publicitária (8 pilares) — ver `brand/DIRECAO-DE-MARCA.md`:

- **Nome do produto**: "VP Social" (placeholder) → **Produção** (`producao.app`). Logo VP atual sai — pertence à Vitamina Publicitária mãe.
- **Posicionamento (Pilar 1)**: cristalizado em frase única — *"Para agências de mídia social, Produção é o painel de experiência do cliente plugado às ferramentas que a agência já usa — onde o cliente acompanha entregas e garante que o conteúdo sai do jeito dele."*
- **Promessa central**: *"Mais conteúdo publicado. Menos esforço pra todo mundo. Plugado no que vocês já usam."* — eixo passou de qualidade/prazo pra **volume + simplicidade + não-substituição**.
- **Mensagem-mãe**: *"Mais conteúdo saindo. Sem ninguém se matando."* + 4 sub-mensagens estruturadas.
- **Arquétipo**: Soberano dominante + Sábio secundário. Fora: Inocente, Cara-comum, Cuidador.
- **Identidade visual**: virou **editorial-quente (Anthropic-style)** — cream + coral + marrom-escuro. Mudou de "editorial-tech Linear+Stripe dark-mode" pra "Anthropic-quente cream+coral light-mode". Logo entra em redesign.
- **Brand direction**: era *Aberto* → agora *Decidido v1.0*.

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
