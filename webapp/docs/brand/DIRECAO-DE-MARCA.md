# Direção de Marca — Produção

> **Versão 1.1** · 2026-05-18 (refoco MVP — ver pé do doc)
> Aprovado por: Daniel Chohfi (Vitamina Publicitária)
> Método: Vitamina Publicitária — 8 pilares de Direção de Marca

---

## Sumário executivo

**Produção** (`producao.app`) é a camada premium de relacionamento entre agência e cliente final. A agência é o comprador. O cliente final é quem experimenta a marca. **Produção é o painel de experiência do cliente plugado às ferramentas que a agência já usa** — onde o cliente acompanha entregas e garante que o conteúdo sai do jeito dele. Categoria nova: nem ferramenta interna (mLabs), nem agendador (Buffer), nem portal de review (Frame.io). É a camada que substitui *"WhatsApp solto + planilha + PDF manual"* por um sistema que cliente final adora e que a agência usa pra justificar o que cobra. Arquétipo **Soberano + Sábio**. Estética **editorial-quente** (Anthropic-style). Promessa: **mais conteúdo publicado, menos esforço pra todo mundo, plugado no que vocês já usam**.

**Entry point MVP (Q1-Q2 2026):** o gancho de venda imediato é *"largue o agendador. Seu Notion vira o piloto automático"* — substituir o agendador típico (mLabs-like) que a agência paga separado. Portal cliente-final aparece como entrega adicional na mesma compra. Categoria estratégica não muda. Detalhe completo em `POSITIONING.md §1.5`.

---

## 1. Posicionamento

> **Para agências de mídia social, Produção é o painel de experiência do cliente plugado às ferramentas que a agência já usa — onde o cliente acompanha entregas e garante que o conteúdo sai do jeito dele.**

### Por que essa frase passa em 5s
- **Persona** específica: agências de mídia social (não "todo mundo")
- **Categoria nova e tangível**: painel de experiência do cliente
- **Anti-substituição embutida**: *"plugado às ferramentas que a agência já usa"*
- **Benefício pelo ângulo do cliente final**: garante conteúdo do jeito dele
- **Mecanismo único**: a combinação plug planning + aprovação no canal do cliente + publicação automática não existe junta em nenhum outro produto

### O que essa frase elimina implicitamente
- **mLabs / Etus** — ferramentas internas, agência não mostra pro cliente
- **Frame.io / Filestage** — param na aprovação de criativo, sem painel mensal
- **Hootsuite / Sprout** — agendadores gringos dolarizados, sem cliente-final no centro
- **WhatsApp solto** — exatamente o caos que substituímos (mantendo o WhatsApp como canal)

### Posicionamento MVP (entry point — capa da home, ads, podcast outreach)

> **Largue o agendador. Seu Notion vira o piloto automático.**
> *Aprova no WhatsApp do cliente, publica sozinho em todas as redes — sem migrar nada.*

Categoria do produto **não muda** com isso — continua *"painel de experiência do cliente"*. O que muda é o **caminho de entrada na cabeça do prospect**: no MVP, leme primeiro pela dor de operar agendador paralelo (mLabs-like) que copia/cola do Notion. Portal premium aparece como entrega adicional na mesma compra. Conforme pilotos consolidam (Q2-Q3), o eixo migra naturalmente pro portal-as-moat.

**Tensão a observar:** prospect pode categorizar Produção como *"mais um agendador"* e nivelar pricing por baixo. Mitigação: demo SEMPRE termina no portal — owner sai entendendo que comprou *"agendador + relacionamento premium"*. Pricing argument continua sendo *"folha de pagamento operacional"*, não *"comparativo com mLabs R$ 200"*.

---

## 2. Personas

Dois blocos. Cliente final fica **fora** da persona — portal é white-label, marca Produção é invisível pra ele. Ele é **resultado**, não comprador.

### Persona 1 — Sócio Operacional *(decisor)*

| Campo | Direção |
|---|---|
| **Mentalidade** | Quer parecer premium pro cliente final dela, mas tem medo de virar refém de ferramenta. Confiante mas defensivo. Já se queimou com SaaS que prometeu transformação e durou 3 meses. Quer melhora **sem ruptura**. |
| **Como compra** | Decide a compra. Compra por relacionamento + prova social (referência de outro owner > anúncio). Demo de 5 min decide. Negocia via WhatsApp/áudio, não preenche formulário grande. |
| **Como falar** | Direto, sem corporativismo. Linguagem de owner-operator. Aceita ironia, palavrão leve. Quer ver tela e número, não promessa. |
| **O que NÃO funciona** | Enterprise-y (gradiente roxo, "soluções end-to-end", logos F500 sem caso). Desconto agressivo (sinal de desespero). Gamification. |

### Persona 2 — Gestor de Conteúdo *(usuário diário)*

| Campo | Direção |
|---|---|
| **Mentalidade** | Tá cansado de caçar aprovação no WhatsApp e remontar planilha toda segunda. Já viu 3 ferramentas "novas" que duraram 2 semanas porque o time não usou. Confia em quem entende a rotina dele. |
| **Como compra** | Não compra — mas é quem testa o trial. Se ele odiar, owner cancela em 14 dias. Power user invisível. |
| **Como falar** | Prático, sem hierarquia. Linguagem operacional ("o post atrasou", "deu pau", "tá rodando"). Valoriza atalhos. |
| **O que NÃO funciona** | Pop-ups de onboarding, dashboards com 50 widgets, tutorial em vídeo de 8 min, "best practices" patronizing. Setup tem que estar pronto em 10 min ou abandona. |

### Quem definitivamente NÃO é cliente
- Solo freelancer (sem multi-cliente)
- Agência com ticket médio do cliente abaixo de R$ 1.500/mês (orçamento aperta + sem demanda premium)
- Marca direta B2C (é cliente da agência, não nossa)
- Agência enterprise 50+ contas (SSO, audit logs Enterprise — Q3+ problem)
- Agência sem mentalidade premium

---

## 3. Promessa + Prova

### Promessa central
> **Mais conteúdo publicado. Menos esforço pra todo mundo. Plugado no que vocês já usam.**

Três cláusulas paralelas: AFIRMA (volume) + AFIRMA (facilidade dual) + NEGA implícito (não-substituição).

### Provas que TEMOS hoje *(em produção)*

> Provas ordenadas pela **prioridade de fala no MVP**. Aprovação tácita continua o diferencial estratégico (prova ÚNICA), mas no funil de entrada lideramos com automação porque é o gancho que faz prospect entender em 5 segundos. Reordenação coerente com `POSITIONING.md §1.5`.

| Prova | O que sustenta |
|---|---|
| **Publicação automática 5 plataformas via API oficial** | IG, FB, YT, TT, LinkedIn. Cron `*/5min`. Não é scraping. É o gancho MVP — *"largue o agendador"*. |
| **Plug em Notion (Sheets/Trello/Airtable em roadmap) sem migrar operação** | `fieldMapping` configurável, OAuth, sync automático. A stack de produção da agência **vira** o agendador — não há dupla operação. |
| **Aprovação WhatsApp via Meta Cloud API** com template aprovado | Não é hack `wa.me` — é canal oficial Meta, dispatcher robusto |
| **Cadeia de aprovadores reutilizáveis** | Magic-link 1 ano TTL, scoped por agência, encadeada (aprovador 1→2→3) |
| **Aprovação tácita por silêncio 30d** | Cron + atomic claim. **Único no mercado.** Silêncio do cliente = aprovado. Agência não fica refém. |
| **Multi-tenant agency-cliente** | `clientId` em todas as queries, agency mode, isolamento total |
| **Portal premium white-label completo** | 6 elementos do Pilar 7 (hero approval, status agregado, próxima reunião, comparativo mensal, wrapped swipável, solicitações top-level) + transversais (cores/fonte da agência, slide-to-approve, PWA push). Implementado 2026-05-18. |

### Provas ESCONDIDAS *(cliente não vê, mas existem)*
- **Atomic claim** entre cron tácito e clique explícito (sem duplo-aprovado)
- Rate limit + retry + oauth-state
- **Security review passado** (CSP, email verification, tenant isolation)
- Magic-link tokens com TTL + state forçado

### Pendências *(promete mas FALTA prova)*

| Gap | Ação |
|---|---|
| Portal premium que cliente final ama | Redesign hub-do-cliente + NPS ≥ 50 dos 3 pilotos (mês 1-2) |
| Multi-source: Notion, Sheets, Trello | `SourceOfTruthAdapter` + Google Sheets (mês 3-4) |
| Cliente paga mais porque entende valor | Métrica de retenção/upsell em piloto (case study mês 4-6) |
| "Aprovação no prazo" como métrica | Tracking interno % aprovações ≤24h vs baseline (setup mês 1) |
| Testimonials e cases | Esperar 3 pilotos completarem 90d |

### Prova ÚNICA no mercado
A combinação **aprovação tácita por silêncio + cadeia auditável + WhatsApp Meta Cloud oficial + publicação automática 5 plataformas + plug-in (não substituição) do Notion** não existe junto em nenhum lugar. Concorrentes têm 1-2; ninguém tem todas.

Em especial: **aprovação tácita** é a coisa mais opinativa que vocês fizeram. *"Agência não fica refém de cliente sumido."* Vira frase de venda.

---

## 4. Mensagem-mãe

### Mensagem-mãe (estratégica, longo prazo, peças de marca)
> **"Mais conteúdo saindo. Sem ninguém se matando."**

Remix coloquial da promessa. Sócio Operacional repete pra outro fundador na mesa de bar — gruda porque tem ritmo, dual (agência + cliente) e palavrão social aceitável.

### Mensagem-mãe MVP (gancho de venda atual — capa, ads, podcast pitch)
> **"Largue o agendador. Seu Notion vira o piloto automático."**

Mesma estrutura ritmica (duas frases curtas), mesmo tom (direto, owner-operator), mesmo arquétipo Soberano (afirmação categórica). A versão MVP traz à tona a dor concreta da semana 1 do prospect (operar agendador paralelo). A versão estratégica fica pro pós-piloto, quando o eixo de venda migra pro relacionamento. As duas convivem.

### 4 sub-mensagens *(cada uma responde uma objeção diferente)*

| # | Tema | Frase | Responde objeção |
|---|---|---|---|
| **1** | Volume / Publicação | *"O conteúdo combinado, publicado. Toda vez."* | "Isso vai gerar resultado?" |
| **2** | Aprovação / Fricção | *"Aprovação em 1 toque no celular do cliente."* | "Meu cliente vai usar?" |
| **3** | Canal *(a frase do caos)* | *"Sai do caos do WhatsApp ainda usando o WhatsApp pra notificar."* | "Vou ter que migrar o WhatsApp?" |
| **4** | Não-migração | *"Sua stack vira o agendador. Sem outra ferramenta pra alimentar."* | "Vou ter que migrar minhas ferramentas?" |

---

## 5. Arquétipo

### Dominante: **Soberano** *(60-70%)*
Refinamento, autoridade pelo padrão, exclusividade. Casa com pricing premium + painel cinematográfico + white-label + *"cobrar o que vale"*.

### Secundário: **Sábio** *(30%)*
Autoridade pelo conhecimento profundo. Casa com engenharia robusta (aprovação tácita, multi-source, atomic claim) — confiante POR ENTENDER, não por prerrogativa.

### **NÃO somos** *(arquétipos explicitamente fora, pra equipe não escorregar)*
- ❌ **Inocente** — pureza, otimismo simplista
- ❌ **Cara-comum** — proximidade, "um de nós"
- ❌ **Cuidador** — proteção, generosidade

### Vibe-resumo
*"Confiante por entender o jogo."* Marca tipo Stripe, Linear, Notion (mas com voz BR + estética editorial-quente).

---

## 6. Identidade Verbal

### A marca **É** vs **NÃO É**

| **É** | **NÃO É** |
|---|---|
| **Direto** — vai ao ponto, sem aquecimento | **Corporativo** — "solução end-to-end", "transforme seu negócio" |
| **Confiante** — afirma, não pede licença | **Fofo** — sem mascote, sem "olá amiguinho", sem emoji decorativo |
| **Refinado** — palavra escolhida, jargão moderado | **Vendedor barato** — sem CAPS, sem 3 exclamações, sem "promoção imperdível" |

### Tabela por persona

| | **Sócio Operacional** *(decisor)* | **Gestor de Conteúdo** *(usuário)* |
|---|---|---|
| **Registro** | Direto, confiante. Palavrão leve OK em contexto casual. Sem vossa-mercezinha. | Prático, sem hierarquia. Coloquial-operacional. *"Cara", "rola", "tá rodando", "deu pau"*. |
| **Postura** | Owner-operator falando com owner-operator. Sem fingir ser maior. | Colega de operação que entende a rotina. Sem ar de "vou te ensinar". |
| **Ironia** | OK, sem ser cínica. Pode rir do mLabs sem nomear *("ferramenta que cobra por post")*. | Pode ironizar o caos do dia-a-dia *("nem o WhatsApp do cliente é mais o WhatsApp")*. |
| **NÃO funciona** | Casual demais (vira moleque), formal demais (vira chato). Promessa vaga. | Workshop, "best practice", *"vamos te ensinar a usar"*. Tutorial em vídeo de 8min. |

### Vocabulário

**USA** *(palavras-marca, vocabulário consistente em todas as peças)*
- Verbos: **plugar, rodar, entregar, sair** (post), aprovar, garantir, **largar** (o agendador)
- Substantivos: **camada, painel, fluxo, calendário, piloto automático, stack** (de produção), conteúdo, publicação, agência, cliente, marca
- Adjetivos: combinado, no prazo, premium *(com parcimônia)*, simples, **automatizado, sozinho**
- Expressões: *"sua agência já usa"*, *"sem trocar nada"*, *"do jeito do cliente"*, *"toda vez"*, *"sem dupla operação"*, *"sua stack vira o agendador"*, *"largue o agendador"*, *"no piloto automático"*
- Categoria que substituímos *(sem nomear mLabs)*: **agendador típico, agendador paralelo, outra ferramenta pra alimentar**

**NÃO USA** *(palavras proibidas)*
- **Nomes próprios de concorrentes** em copy pública: nunca citar mLabs, Etus, Buffer, Hootsuite, Sprout, RD Station por nome. Use **agendador típico** quando precisar dizer o que substituímos.
- **Marketing-clichê:** engajamento *(orgânico ou qualquer)*, excelência, qualidade, compromisso, storytelling, autêntico, *"transforme"*, *"revolucione"*
- **B2B-frio:** solução end-to-end, otimização, performance, ROI, sinergia, escalável, robusto
- **Anglicismos vazios:** *experience* (em vez de experiência), *insights* (em vez de leituras), pipeline (exceto técnico interno), *workflow* (usa **fluxo**)
- **Vendedor:** imperdível, exclusivo, oferta, "última chance"
- **Auto-categorização que perdemos:** *"ferramenta"*, *"SaaS"*, *"plataforma"* — somos **camada** e **painel**. Atenção redobrada agora que vendemos contra agendador: NÃO virar *"o agendador melhor"*. Somos *"o que faz o agendador deixar de existir no fluxo da agência"*.
- **Emoji decorativo** em texto formal. Exceção: ✓ em status check. Sem rosto, sem confete, sem sticker.

### Pendência declarada
**Figura de referência de voz** — em aberto. Quando definida, vai ancorar a calibração fina ("X falaria isso?"). Útil pra ter, não bloqueia execução.

---

## 7. Pilares de Conteúdo

4 buckets que organizam toda peça produzida. Soma 100%.

| # | **Pilar** | **%** | **O quê** | **Função** | **Exemplos** |
|---|---|---|---|---|---|
| 1 | **Conversão** | 40% | Produto em ação. Dor → solução visual. Comparativo "antes/depois". | Gerar trial/demo. Motor direto de receita. | **Screen recording 30s "do Notion direto pro feed — sem agendador no meio"** · carrossel *"5 sinais que você tá pagando agendador à toa"* · vídeo 30s aprovação 1-tap · post *"Por que pagar agendador se seu Notion já é o calendário?"* · screen recording do portal · post comparando relatório PDF manual vs story-report Produção |
| 2 | **Autoridade** | 30% | Operação de agency premium. Padrões de relacionamento agency-cliente. Tese da categoria. | Cria a categoria *"painel de experiência do cliente"*. Sem categoria, conversão não converte. | Ensaio *"Sua stack de produção JÁ é seu agendador — só falta plugar nas redes"* · ensaio *"Por que silêncio do cliente NÃO é negativa"* · post *"Como agency boutique cobra premium em 2026"* · série *"Anatomia do contrato de agency"* |
| 3 | **Prova social** | 20% | Case studies, testimonials, métricas reais dos pilotos. | Mata objeção. Pós-demo, pré-fechamento. | Case *"Agency X: 40% mais aprovações no prazo em 60d"* · screenshot de feedback real · vídeo do owner falando · número agregado |
| 4 | **Bastidores / Founder** | 10% | Decisões de produto, contexto de tese, time, humor seco. | Humaniza. Fortalece marca. | Post *"Por que paramos de chamar a gente de SaaS"* · BTS do redesign do portal · founder explicando aprovação tácita |

### O que NÃO entra como pilar
- ❌ Conteúdo educacional genérico de social media (best practices Instagram etc) — não somos canal educacional, isso é job de mLabs/RD
- ❌ "Tendências e novidades das redes" — não somos curadores de algoritmo
- ❌ Pilar pesado de cultura interna — agency não compra por "como é trabalhar lá"

### Calibração ao longo do tempo
- **Hoje (MVP)**: distribuição acima
- **Mês 4-6**: Prova social sobe pra 25-30% conforme pilotos converterem; Conversão pode descer pra 35%
- **Ano 2**: Autoridade pode subir pra 35% se categoria estiver formada

---

## 8. Diretrizes Criativas

### Direção visual: **Editorial-quente** (Anthropic-style)

| Dimensão | Direção |
|---|---|
| **Paleta** | **Cream-quente** (~`#FAF7F0`) como fundo dominante. **Coral/laranja-queimado** (~`#CC785C`) como acento principal e raro. **"Escuro" = marrom-escuro / preto-quente** (~`#1A1612`). Nunca branco puro, nunca preto-frio. |
| **Tipografia** | Headline: **serif refinada bold** (Tiempos, Söhne Headline, FAQT, Editorial New). Não condensada, não tech. Body: sans clean (Söhne, Inter). |
| **Layout** | Generoso em cream-space. Max-width moderado. Hierarquia editorial. Pausa visual valorizada — não polui. |
| **Texto** | Frases curtas com cadência. Cabeçalhos em **lower-case** quando couber. Humor seco. Exclamação rara. Emoji só funcional. |
| **Ritmo** | Cortes contidos. Música sóbria, instrumental, ambiente — **nunca pop empolgante**. Espaço em branco como recurso. |
| **Pessoas** | Founder (Daniel) com moderação. Clientes em case studies com **foto real + citação verdadeira**. Sem atores. Sem stock photo. |
| **Mockup de produto** | Cinematográfico, full-bleed. **Nunca card genérico, nunca fileira de iPhones, nunca screenshot pelado.** |

### PROIBIDO
- Gradiente roxo→azul vivo (vibe SaaS-2021)
- **Corporate Memphis** (ilustração flat de personagem com perna longa)
- *"Trusted by"* com logos pequenos sem caso real
- Fileira de 3 mockups iPhone com 3 telas
- Confete, fogos, emoji rosto, sticker
- Música pop empolgante em demo
- Mascote (animal, personagem, robô)
- Clichê de setor: *"revolucione"*, *"transforme"*, *"engajamento orgânico"*, *"escale seu negócio"*

### Referências concretas

| Referência | Pra quê |
|---|---|
| **Anthropic** (claude.com) | **Principal**: paleta cream+coral, tipografia serif refinada, densidade editorial |
| **Stripe** (stripe.com) | Refinamento técnico, hierarquia visual exemplar |
| **Linear** (linear.app) | Voz, motion contido, densidade |
| **Spotify Wrapped** | Modelo do **story-report mensal** do portal *(Sub-mensagem 1)* |
| **Frame.io** | Estética cinematográfica em mockups do produto |

### Logo *(briefing pra designer)*
- **Wordmark `producao.app`** como unidade: `producao` em serif bold + `.app` em peso/cor distinto (coral)
- Sobre fundo cream-quente
- Sem ícone separado por ora — wordmark sustenta
- Logo VP atual (preto + branco + ponto vermelho) **sai** — pertence à Vitamina Publicitária mãe, não ao produto Produção

---

## Pendências

1. **Figura de referência de voz** *(Pilar 6)* — em aberto. Útil ter pra calibração; não bloqueia execução.
2. **Confirmar `producao.app` disponível e registrar** (Cloudflare ou outro registrador)
3. **Busca de marca BR (INPI) e EUA (USPTO)** pra "Produção" como marca de SaaS — fazer com advogado de marca antes de lançar
4. **Briefing detalhado pra designer** com este doc — logo + identidade visual completa (paleta exata HEX, tipografias finais licenciadas, sistema de componentes)
5. **Cores secundárias** — definir HEX exato do coral/cream/marrom (Anthropic-inspired mas próprios)
6. **Tipografias finais** — licenciamento Tiempos/Söhne/FAQT/Editorial New
7. **Redesign do `/c/[token]`** baseado em Pilar 1-3 e sub-mensagens 1-4 (mês 1-2 do `POSITIONING.md`)
8. **Atualizar `webapp/docs/POSITIONING.md`** mudando "VP Social" → "Produção" em todo o doc
9. **UX explícita da aprovação tácita 30d** — transparência no card de aprovação ("se você não responder, posta automaticamente em 30d")

---

## Próximos passos *(ações concretas com responsáveis)*

| # | Ação | Responsável | Prazo |
|---|---|---|---|
| 1 | Confirmar e registrar `producao.app` | Daniel | Hoje/amanhã |
| 2 | Busca de marca INPI + USPTO | Daniel + advogado | 1 semana |
| 3 | Briefing pra designer (logo + identidade) com este doc | Daniel | 1 semana |
| 4 | Atualizar `POSITIONING.md` substituindo "VP Social" → "Produção" | Claude | Próxima sessão |
| 5 | Re-conceituar `/c/[token]` como hub-do-cliente (6 elementos do Pilar 7) | Claude (código) | Mês 1-2 |
| 6 | Identificar 3 agências-piloto com perfil ICP refinado | Daniel | Mês 1 |
| 7 | Material de venda v1 (deck + landing) com tese consolidada | Daniel + designer | Mês 1-2 |
| 8 | Definir figura de referência de voz | Daniel | Antes do lançamento público |

---

## Regras de revisão

- **Trimestral**: revisar tese (§1) + métricas dos pilares (§7)
- **Mudou tese material?** Criar v2.0 deste doc, manter v1.0 em histórico
- **Mudou nome ou domínio?** Atualizar este doc + `POSITIONING.md` + branding em paralelo

---

## Histórico de versões

### v1.0 → v1.1 (2026-05-18) — refoco MVP

Refoco do **gancho de venda** sem alterar tese estratégica. Ver `POSITIONING.md §1.5` pro contexto completo.

- **§1 Posicionamento**: adicionada subseção *"Posicionamento MVP"* com headline *"Largue o agendador. Seu Notion vira o piloto automático."* Categoria não muda — continua *"painel de experiência do cliente"*.
- **§3 Provas**: reordenadas pela prioridade de fala no MVP. *Publicação automática via API oficial* sobe pra #1 (era #4). *Aprovação tácita* mantém o status de prova ÚNICA mas desce na ordem de leitura. Adicionada prova *Portal premium white-label completo* refletindo a implementação de 2026-05-18.
- **§4 Mensagem-mãe**: adicionada versão MVP (*"Largue o agendador..."*) ao lado da estratégica (*"Mais conteúdo saindo..."*). Convivem — MVP no funil de entrada, estratégica em peças de marca. Sub-mensagem 4 (Não-migração) reescrita pra refletir *"sua stack vira o agendador"*.
- **§6 Vocabulário**: USA ganhou *piloto automático, stack (de produção), largar (o agendador), sozinho, automatizado, sem dupla operação*. NÃO USA reforçado com *"nomes próprios de concorrentes"* (mLabs/Etus/Buffer nunca aparecem em copy pública — use *"agendador típico"*) + alerta extra sobre *não virar "o agendador melhor"* (continuamos camada e painel, não agendador premium).
- **§7 Pilares de Conteúdo**: exemplos do Pilar 1 (Conversão) e Pilar 2 (Autoridade) atualizados pra cobrir o ângulo automação — *"do Notion direto pro feed — sem agendador no meio"*, *"sua stack JÁ é seu agendador"* etc.

---

*Documento aprovado no método Vitamina Publicitária — 8 pilares · 2026-05-17 v1.0 · 2026-05-18 v1.1*
