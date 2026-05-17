# VP Social — Posicionamento & Plano de Execução (Q1-Q2 2026)

> Documento vivo. Decisões consolidadas até **2026-05-17**. Cada seção tem `Decidido` ou `Aberto` no cabeçalho. Revisar trimestralmente.

---

## 1. Tese (TL;DR) — *Decidido*

Agências de social media operam hoje com **5+ ferramentas desconectadas** (planning em Notion/Sheets, publishing em mLabs/Etus, relatório em PDF manual ou Frame.io adaptado, aprovação em WhatsApp, financeiro em planilha à parte). VP Social é a **única camada que conecta o planning-tool que a agência já usa** (começando por Notion, depois Sheets/Trello/Asana) **à publicação multi-plataforma + ao portal premium do cliente final**.

**Duas teses simultâneas, em camadas diferentes do funil:**

- **Hook (venda) = Portal premium.** O que faz owner agency fechar a venda na primeira reunião. Wow factor visual, white-label, story-style report cinematográfico. Justifica preço premium na hora ("é por isso que vale R$ 697/mês").
- **Stickiness (retenção) = OS-orchestration multi-source.** O que torna o churn caro depois de 3 meses. Conectores múltiplos (Notion + Sheets + Trello…) + orquestração de cron + IA + auditoria + multi-tenant. Substituir = trocar o sistema operacional inteiro da agência.

Portal vende. OS retém. Os dois precisam existir — mas a sequência de dev importa.

---

## 2. Posicionamento de mercado — *Decidido*

### Headline de capa
> **O sistema operacional de conteúdo das agências brasileiras.**
> *Do Notion à publicação, do publicação ao portal do cliente. Um só fluxo. Premium.*

### Sub-headline (segunda dobra)
> Você já tem o Notion (ou Sheets, ou Trello) onde planeja conteúdo com seu cliente. VP Social conecta isso à publicação automática no Instagram, Facebook, YouTube, TikTok e LinkedIn — e devolve um portal premium pro seu cliente final amar. Agências de 3 a 50 clientes. Sem migrar sua operação. Sem perder o controle.

### Elevator pitch (30s, fala humana)
> "A gente é a camada que faltava entre o Notion da agência e o feed do cliente. Você continua planejando conteúdo onde já planeja, e a gente publica automaticamente em todas as redes, gera o relatório bonito que o cliente final fica olhando no celular e ainda dá pra agência um dashboard de tudo. Custa menos que um estagiário e substitui 3 ferramentas."

### Antagonista declarado
| Concorrente | Por que VP Social ganha |
|---|---|
| **mLabs / Etus** | Eles forçam você a planejar dentro do tool deles. Agência premium não migra a operação. Nós nos plugamos no Notion/Sheets que você JÁ usa. |
| **Hootsuite / Later (global)** | Preço dolarizado, UI corporativa fria, suporte em inglês, sem cliente-portal premium. Não foi feito pra agência BR. |
| **Frame.io / Filestage** (review de criativo) | Eles param na aprovação. Nós seguimos até publicação + relatório. |
| **Planilha + mLabs separados** | Auditoria, multi-cliente, sincronização e portal — tudo manual hoje. VP Social = isso virou um SaaS. |

### O que NÃO somos (anti-posicionamento)
- ❌ Não somos uma rede social (não fazemos feed próprio)
- ❌ Não somos um agendador genérico ("Buffer brasileiro")
- ❌ Não somos uma ferramenta de design (não competimos com Canva / CapCut)
- ❌ Não somos um CRM de agência (não gerimos pipeline comercial — só conteúdo)

---

## 3. Wedge sequencing — *Decidido*

**Estratégia: Híbrido escalonado em 6 meses.**

| Mês | Foco | Entregável | Métrica de sucesso |
|---|---|---|---|
| **1** | Portal redesign — fundação | `/c/[token]` cinematográfico: hero animado, story-style reports mobile-first, white-label completo (logo + cor primária da agência), share link com OG image | 3 agências-piloto contratadas e usando portal com seus clientes |
| **2** | Portal redesign — polimento | Filtros por período, comparativo período anterior, dark mode polido, branding "powered by VP" toggleable, export PDF do portal | NPS portal ≥ 50 entre clientes finais dos 3 pilotos |
| **3** | OS — abstração de fonte | Refator `lib/notion.ts` → `lib/source-adapter.ts` com interface `SourceOfTruthAdapter`. Notion vira 1 de N. Schema `notionConnection` → `sourceConnection` (migration) | Build verde, zero regressão Notion, contrato de adapter documentado |
| **4** | OS — Google Sheets connector | Implementar `GoogleSheetsAdapter` (OAuth, leitura, mapping UI espelhando fieldMapping do Notion) | 1 piloto rodando 100% via Sheets, paridade de features com Notion |
| **5** | OS — Observabilidade | Health dashboard interno (`/admin/health`): cron lag, último erro por conexão, taxa de publish OK/erro/skip por cliente. Webhook Notion (`v2` API) → publish near-realtime (substituir cron 5min onde possível) | < 1% de posts no estado "stuck", lag médio < 60s |
| **6** | Refinamento + 2º conector | Trello adapter OU IA assistant (briefing → draft de post no Notion) — escolha baseada em feedback dos pilotos | Decisão tomada com data de 3 pilotos + 2-3 prospects qualificados |

**Risco aceito**: nada fica "uau perfeito" no Q1. Defesa = "we ship every month, com 3 clientes reais medindo cada release". Pilotos viram case studies + testimonials antes do lançamento aberto.

---

## 4. Pricing — *Decidido*

### Tier único, escala por cliente

| Componente | Valor |
|---|---|
| **Base** | R$ 697/mês |
| **Inclui** | 5 clientes ativos, seats ilimitados na agency, posts ilimitados, todas as plataformas, todos os conectores, portal premium, IA básica |
| **Cliente adicional** | R$ 97/cliente/mês a partir do 6º |
| **Anual** | -2 meses (R$ 6.970/ano = R$ 580/mês efetivo) |
| **Trial** | 14 dias, sem cartão |
| **Onboarding** | Gratuito (call de setup + import de planning existente). Material de venda. |

### Por que per-client e não flat
- ✅ Escala com sucesso da agência (cresceu clientes → paga mais, mas valor entregue também escalou)
- ✅ Captura agências grandes sem afastar pequenas (entrada acessível em R$ 697)
- ✅ Modelo que agência **entende** (porque ela mesma cobra clientes assim)
- ⚠️ Trade-off: dilui ligeiramente o "sinal premium puro" que um flat alto teria. Aceito — cobre c/ tier de marca e portal.

### O que NÃO cobramos (e por quê)
- Posts adicionais → cobrar por post tem cheiro de mLabs barato. Ilimitado sinaliza confiança.
- Plataformas adicionais → não fazemos paywall em IG vs TikTok. Adicionar plataforma é decisão **nossa** de roadmap, não do cliente.
- Storage / bandwidth → custo marginal baixo, e cobrar isso parece SaaS de 2015.

---

## 5. ICP (Ideal Customer Profile) — *Aberto, validar com pilotos*

### Hipótese de trabalho (T-shirt sketch)
- **Geo**: Brasil (BR-PT é diferencial vs Hootsuite)
- **Tamanho**: 3 a 15 clientes ativos sob gestão
- **Tipo de agência**: social media boutique, marketing 360 com forte vertical de conteúdo, ou agência de influência que gerencia perfis de creators
- **Operação**: já usa Notion (ou planilha estruturada) pra planejar. Já passou da fase "spreadsheet caótica", mas ainda não tem ferramenta dedicada.
- **Dor recorrente**: erros silenciosos de publishing (post não saiu, descobre 2 dias depois pelo cliente), relatório PDF manual no dia 28 do mês, aprovação no WhatsApp se perdendo no scroll
- **Owner perfil**: 28-45 anos, ainda operacional na agência, sente que o sistema atual "não escala mais", mas tem medo de migrar e perder o jeitão que cliente já tá acostumado

### O que vamos validar nos 3 pilotos
1. **Notion vs Sheets** — qual planning tool é dominante nesse segmento? (define ordem do 2º conector)
2. **Quem decide a compra?** Owner sozinho, ou tem head-de-ops? (define copy e fluxo de vendas)
3. **O que faz o piloto pagar no fim do trial?** Portal lindo? Auto-publish funcionando? Dashboard de erros? (confirma qual feature é o wedge real)
4. **Quanto tempo até o "aha moment"?** Hoje hipótese é 24h após o setup — quando agency posta primeiro conteúdo automatizado e abre o portal pra mostrar pro cliente.

---

## 6. Métricas de sucesso — *Decidido*

### Mês 1-2 (Portal-first)
- 3 agências-piloto assinaram trial e usam ativamente (≥ 5 posts publicados, ≥ 1 cliente final no portal)
- NPS portal entre clientes finais ≥ 50
- Tempo médio de setup novo cliente < 15 min

### Mês 3-4 (OS-first)
- 1 piloto rodando 100% via Google Sheets (sem Notion)
- Zero regressão Notion (build + smoke test)
- Adapter contract documentado e revisado

### Mês 5-6 (Refinamento)
- < 1% de posts "stuck"
- Lag médio cron / webhook < 60s
- 2 dos 3 pilotos convertidos em pagantes (passaram trial)
- Pelo menos 1 piloto recomendando p/ outra agência

### Métricas que NÃO vamos perseguir
- ❌ Total de posts publicados (vanity, não correlaciona com receita)
- ❌ DAU/MAU de seats (agência só loga quando precisa)
- ❌ "Engajamento na plataforma" (não somos rede social)

---

## 7. Brand Direction — *Aberto / Aguardando input*

> **Esta seção será preenchida** quando o doc de direção de marca (PDF/PPT usado com clientes) for compartilhado no repo (`webapp/docs/brand/`) ou anexado em conversa.

### O que já temos confirmado
- **Logo**: `logo.png` na raiz do repo. "VP." em sans-serif bold branco, ponto final vermelho, fundo preto. Vibe: ousada, condensada, decisiva.
- **Cores observadas (do logo)**: Preto `#000`, branco `#fff`, vermelho do ponto (a confirmar HEX exato — provável próximo a `#E53E3E` ou `#DC2626`).
- **Stack visual atual**: Tailwind v4 + shadcn/ui, dark-mode-first, sem ornamento.

### O que falta definir (vem do doc a ser compartilhado)
- [ ] Tipografia headline (sugestão de explorar: PP Editorial New, Druk, ou Söhne Breit pra alinhar com o "VP." condensado)
- [ ] Tipografia body (sugestão: Inter ou Söhne — neutra e legível, deixa headline brilhar)
- [ ] Paleta secundária / acento (além do vermelho do logo)
- [ ] Tom de voz escrito (formal-confiante? amigo-experiente? técnico-direto?)
- [ ] Do's & Don'ts de imagem (mood board: cinematográfico? editorial? minimalista? fotográfico?)
- [ ] Princípios de motion / animação (cinematográfico = inertia + spring, ou snappy + linear?)

### Provisório (até o doc chegar)
Vou operar com a hipótese: **editorial-tech**. Pense Stripe + Linear + um toque editorial brasileiro (Piauí, Quatro Cinco Um). Não Apple-genérico. Não SaaS-genérico. Algo que tem opinião visual.

---

## 8. Riscos & questões abertas

| Risco | Mitigação |
|---|---|
| Concorrente lança UI bonita em 6 meses copiando o portal | Stickiness do OS — quando agência conecta 4 platforms + 8 contas + WhatsApp, custo de troca > custo de tolerância |
| Owner não-tech não compra a tese "sistema operacional" | Portal vende emocionalmente, OS aparece só no sub-headline e na demo de retenção |
| Per-client pricing confunde no primeiro contato | Comunicar SEMPRE como "R$ 697 inclui 5 clientes" (não "R$ 97/cliente"). Ancorar no número grande. |
| Notion API muda contrato (já fez antes) | `SourceOfTruthAdapter` reduz blast radius — Notion vira 1 de N. Bug em Notion não trava produto. |
| 3 pilotos não convertem | Sinal de wedge errado. Re-validar ICP e tese antes do mês 7. |

### Questões abertas (decidir até mês 3)
1. **Free tier ou não?** Hoje só trial 14 dias. Free agressivo (1 cliente, 30 posts/mês) atrai SMB mas dilui sinal premium. Decidir com data dos pilotos.
2. **Vamos abrir API pública?** Agências grandes podem querer integrar com CRM próprio. Roadmap Q3, não Q2.
3. **Reseller / partner program?** Algumas agências grandes vão querer revender pra subagências. Por ora: ignorar, validar com 3+ pedidos.
4. **Geo expansão**: pode escalar pra LATAM-PT (PT) ou LATAM-ES (Mx, AR)? Resposta provável: PT primeiro (mesma timezone + mercado fragmentado), ES só depois de 50+ clientes BR.

---

## 9. Próximos passos imediatos

1. **Compartilhar doc de direção de marca** → preencher §7 (você)
2. **Iniciar mês 1**: redesign `/c/[token]` cinematográfico (eu, após §7 destravar)
3. **Identificar 3 agências-piloto** (target: confirmadas até fim do mês 1)
4. **Setup analytics interno**: tracking dos KPIs do §6 sem misturar com analytics dos posts dos clientes (eles são coisas diferentes)

---

*Revisar este documento ao fim de cada mês. Mudou tese? Atualizar §1-§3 com data. Não reescrever — manter histórico de pivôs visível.*
