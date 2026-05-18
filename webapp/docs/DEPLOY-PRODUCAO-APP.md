# Deploy — producao.app

Checklist completo pra migrar o produto pro domínio próprio `producao.app`.
Ordem importa em alguns lugares (ex: DNS antes de Vercel custom domain).

> **Status do código:** ✅ Todas as referências hardcoded `posts.vitaminapublicitaria.com.br` foram trocadas pra `producao.app`. Email `RESEND_FROM` default agora é `Produção <contato@producao.app>`.
>
> **Falta:** configuração externa nos serviços (Vercel, Cloudflare, Resend, OAuth providers).

---

## 1. DNS — Cloudflare → Vercel

Você comprou `producao.app` no Cloudflare Registrar. Os nameservers já estão no Cloudflare por padrão.

1. **Cloudflare DNS** (`dash.cloudflare.com` → `producao.app` → DNS → Records):
   - Adicionar `CNAME` apex (`@`) → `cname.vercel-dns.com` *(Cloudflare permite CNAME flattening no apex)*
   - Adicionar `CNAME` `www` → `cname.vercel-dns.com`
   - **Proxy status:** `DNS only` (cinza, não laranja) — Vercel gerencia SSL diretamente. Proxy do Cloudflare quebra Vercel.

2. **SSL/TLS no Cloudflare** (Settings):
   - Mode: `Full (strict)` (Vercel emite cert válido)
   - Edge cert: deixa Cloudflare emitir o universal (não conflita com Vercel se proxy off)

---

## 2. Vercel — Custom Domain

1. **Vercel Dashboard** → `vp-social` project → **Settings → Domains**:
   - Add domain: `producao.app`
   - Add domain: `www.producao.app` (vai redirecionar pro apex automaticamente)
   - Vercel detecta o CNAME, emite cert Let's Encrypt automaticamente (~2-3 min)

2. **Production branch:** confirmar que está em `main` (Settings → Git → Branch Tracking).

3. **Domain alias:** marcar `producao.app` como **Primary Domain** (ícone de estrela).

4. **Redirect do domínio antigo:**
   - Manter `posts.vitaminapublicitaria.com.br` ativo por 90 dias com `308 Permanent Redirect` pra `producao.app/{path}`.
   - Vercel Settings → Domains → `posts.vitaminapublicitaria.com.br` → "Redirect to producao.app".

---

## 3. Environment Variables — Vercel

Settings → **Environment Variables** → Production:

| Var | Valor novo |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://producao.app` |
| `RESEND_FROM` | `Produção <contato@producao.app>` |
| `DEMO_LEAD_EMAIL` | `daniel@vitaminapublicitaria.com.br` (ou outro) |

**Atenção:** marcar todas pra **Build env** (não só Runtime), senão `next build` reclama de falta de `NEXT_PUBLIC_APP_URL`.

Depois de salvar: **Redeploy** o último build pra aplicar (Settings → Deployments → "..." → Redeploy).

---

## 4. Resend — Verificar `producao.app`

Pra mandar email *from* `@producao.app`, o domínio precisa estar verificado no Resend (senão emails caem em spam ou são rejeitados).

1. **Resend Dashboard** → **Domains** → **Add Domain** → `producao.app`
2. Resend mostra ~4 DNS records (SPF, DKIM, MX opcional, DMARC).
3. Copiar cada record pra **Cloudflare DNS** (mesmos passos do item 1):
   - `TXT` SPF: `@` → `v=spf1 include:amazonses.com ~all`
   - `CNAME` DKIM 1, 2, 3: `resend._domainkey`, etc → valores Resend
   - (opcional) `TXT` DMARC: `_dmarc` → `v=DMARC1; p=none; rua=mailto:daniel@vitaminapublicitaria.com.br`
4. **Verify** no Resend (~5-15 min pra propagar DNS)
5. Status fica **Verified** ✓

Quando verificado, o `RESEND_FROM` default (`Produção <contato@producao.app>`) funciona. **Antes disso, deixe `RESEND_FROM` apontando pro endereço antigo verificado** (`noreply@posts.vitaminapublicitaria.com.br`) pra não quebrar emails de password-reset, demo lead, publish-failure.

---

## 5. OAuth providers — adicionar nova URL de callback

**Em cada provider**, adicionar `https://producao.app/...` E `https://www.producao.app/...` às Redirect URIs. **Mantém os antigos por 90 dias** pra não quebrar quem tem sessão ativa.

> **Por que ambos (apex + www):** o código tem inconsistência intencional — `notion/auth-url` e `facebook/auth-url` derivam o `redirect_uri` do `new URL(req.url).origin` (o host que o user usou pra chegar), enquanto `youtube/tiktok/linkedin/auth-url` usam `process.env.NEXT_PUBLIC_APP_URL` fixo. Cadastrar as duas variantes evita `redirect_uri_mismatch` independente de como o user chegou ou de qual valor está no env.
>
> Better Auth (`/api/auth/callback/<provider>`) também deriva do host da request, então mesma lógica vale.

### Google (Cloud Console → APIs & Services → Credentials)

OAuth 2.0 Client ID `Web application`:
- Authorized redirect URIs:
  - `https://producao.app/api/auth/callback/google` *(Better Auth login com Google)*
  - `https://www.producao.app/api/auth/callback/google`
  - `https://producao.app/api/youtube/callback` *(YouTube upload)*
  - `https://www.producao.app/api/youtube/callback`
- Authorized JavaScript origins:
  - `https://producao.app`
  - `https://www.producao.app`

### Meta (Facebook + Instagram) — developers.facebook.com → My Apps

Facebook Login → Settings → **Valid OAuth Redirect URIs**:
- `https://producao.app/api/auth/callback/facebook`
- `https://www.producao.app/api/auth/callback/facebook`
- `https://producao.app/api/facebook/callback`
- `https://www.producao.app/api/facebook/callback`

App Domain: `producao.app` (Meta aceita só um — o apex)
Site URL: `https://producao.app`

### TikTok (developers.tiktok.com → My Apps)

App Settings → **Redirect URI**:
- `https://producao.app/api/tiktok/callback`
- `https://www.producao.app/api/tiktok/callback`

### LinkedIn (developer.linkedin.com → My Apps)

Products → Sign In with LinkedIn → **Authorized Redirect URLs**:
- `https://producao.app/api/linkedin/callback`
- `https://www.producao.app/api/linkedin/callback`

### Notion (developers.notion.com → My integrations)

OAuth → **Redirect URIs**:
- `https://producao.app/api/notion/callback`
- `https://www.producao.app/api/notion/callback`

---

## 6. Better Auth — trustedOrigins

`lib/auth.ts` deriva `trustedOrigins` em runtime a partir de `NEXT_PUBLIC_APP_URL`:

- Inclui o valor de `NEXT_PUBLIC_APP_URL`.
- Inclui automaticamente o **irmão com/sem www** (se env é `https://producao.app`, adiciona `https://www.producao.app` e vice-versa). Fix de 2026-05-18 — antes disso, mismatch apex↔www causava 403.
- Inclui `ADDITIONAL_TRUSTED_ORIGINS` (CSV) — usar pra migração cruzada com `posts.vitaminapublicitaria.com.br`.

Não precisa mexer no código pra apex/www. Pra adicionar o domínio antigo durante a janela de 90 dias, setar no Vercel:

```
ADDITIONAL_TRUSTED_ORIGINS=https://posts.vitaminapublicitaria.com.br
```

Remover quando descomissionar.

---

## 7. Verificações pós-deploy

Depois de tudo acima:

1. **DNS propagado** — `dig producao.app` retorna IP do Vercel
2. **SSL OK** — `https://producao.app` carrega com cadeado verde
3. **Home renderiza** — `https://producao.app/` mostra a landing
4. **Auth funciona** — login com email + Google + Facebook (todos os 3)
5. **OAuth conexões** — conectar Notion, IG, FB, YT, TT, LinkedIn (todos os 5)
6. **Email demo** — enviar uma demo de teste pra ver se `notifyDemoRequest` entrega
7. **Email password reset** — pedir reset e verificar entrega
8. **Email publish failure** — forçar uma falha (post sem mídia) e ver email
9. **WhatsApp template** — disparar aprovação pra cliente de teste

Tudo ✅ = pode redirecionar tráfego principal pro `producao.app`.

---

## 8. Pós-90-dias (cleanup)

Quando tiver certeza que ninguém ainda usa o domínio antigo:

1. Remover redirect `posts.vitaminapublicitaria.com.br` → `producao.app` no Vercel
2. Remover redirect URIs antigos dos OAuth providers
3. Remover `noreply@posts.vitaminapublicitaria.com.br` do Resend (se quiser)
4. Atualizar CLAUDE.md mencionando que domínio antigo foi descomissionado

---

## Notas técnicas

- **Cookies internos** (`vpsocial_density`, `vpsocial_client_id`) **mantêm o nome antigo** — são tokens internos, mudar quebra sessões existentes. Não vale o trade-off.
- **`producao_theme`** (cookie/localStorage) é novo e já usa o nome novo.
- **Manifest icons** (`/icon-192.png`, `/icon-512.png`, `/apple-icon.png`, `/favicon-32.png`) **ainda apontam pro logo VP antigo** — substituir os arquivos em `public/` quando o designer entregar logo novo do producao.app (pendência no `DIRECAO-DE-MARCA.md`).
- **`logo.png` na raiz do repo** (não no `webapp/public`) é só placeholder/referência da Vitamina Publicitária mãe — não usado em produção do app.
