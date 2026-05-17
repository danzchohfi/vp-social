# Security Playbook

Procedures pra incidentes e rotações de credenciais. Cada seção é
auto-contida — alguém de plantão consegue executar lendo só o passo
relevante.

## Rotacionar `BETTER_AUTH_SECRET`

Frequência recomendada: **anual** ou imediatamente após qualquer suspeita
de vazamento (commit acidental, repo público, dump de log etc).

Impacto: **todos os usuários são deslogados**. Sessions ativas (cookies
assinados com o secret antigo) ficam inválidas instantaneamente. Better
Auth não suporta dual-secret tolerance — não há overlap.

### Procedimento

1. **Gerar novo secret:**
   ```bash
   openssl rand -hex 32
   ```
   64 chars hex (256 bits). NÃO usar UUID, nem palavras, nem reaproveitar
   secrets de outros sistemas.

2. **Setar no Vercel** (`vp-social` project → Settings → Environment Variables):
   - Variable: `BETTER_AUTH_SECRET`
   - Value: o novo secret
   - Marcar **Production** + **Preview** (não Development, que usa `.env.local`)
   - Salvar.

3. **Trigger redeploy.** Pode ser via push vazio de commit ou
   "Redeploy" no dashboard do Vercel.

4. **Comunicar.** Avisa o time interno por WhatsApp/Slack que precisarão
   logar de novo. Janela de impacto: ~1min do redeploy completar.

5. **Verificar:** abre `posts.vitaminapublicitaria.com.br/dashboard`,
   confirma que redireciona pra `/login`, faz login normalmente.

### Backout

Se algo quebrar imediatamente após rotation, reverter o env var pro
secret antigo + redeploy. Sessions feitas no curto intervalo com o secret
novo serão invalidadas, mas as antigas (que ainda existiam) voltam a valer.

---

## Rotacionar OAuth client secrets

Aplica a: `NOTION_CLIENT_SECRET`, `FACEBOOK_APP_SECRET`,
`GOOGLE_CLIENT_SECRET`, `TIKTOK_CLIENT_SECRET`, `LINKEDIN_CLIENT_SECRET`.

Tokens de usuários existentes (já armazenados no DB) continuam válidos
até expirarem ou serem revogados manualmente. O secret só é usado em
NOVOS fluxos OAuth (auth-url → callback → token exchange).

### Procedimento

1. **Provider** (Notion / Meta / Google / TikTok / LinkedIn console):
   gerar novo secret. Cada um tem painel próprio.
2. **Vercel:** atualizar a env var correspondente, **Production** + **Preview**.
3. **Redeploy.**
4. **Testar** um fluxo OAuth completo (conectar workspace novo).
5. **Revogar** o secret antigo no painel do provider depois que confirmar
   que o novo funciona.

---

## Rotacionar magic tokens de aprovadores

Aprovadores legados podem ter tokens permanentes ou prestes a vencer
(MED-4 do audit: tokens vencem em 365 dias).

### Procedimento

- **Individual:** vai em `/approvers`, clica "Regerar token" no card do
  aprovador. Link antigo (`/a/{token-velho}`) para de funcionar
  imediatamente. Enviar o novo via WhatsApp.
- **Em lote (após vazamento):** SQL via Drizzle Studio:
  ```sql
  -- Força rotation: cron de backfill recalcula expiresAt depois.
  UPDATE "approver" SET "magic_token_expires_at" = NOW() - INTERVAL '1 day';
  ```
  Próximo `lookupApproverByToken` rejeita todos. Use só em emergência.

---

## Reset de senha do agency owner

Caso o owner perca acesso ao próprio email e não consiga `/forgot-password`:

1. Confirmar identidade out-of-band (call de vídeo, comparar com algum
   identificador conhecido — chave de cliente, dados de pagamento etc).
2. SQL pra atualizar o email antes do reset:
   ```sql
   UPDATE "user" SET "email" = 'novo@email.com', "email_verified" = true WHERE "id" = '<userId>';
   ```
3. Agora o owner consegue usar `/forgot-password` com o email novo.

---

## Disable de uma conta comprometida

Se uma session token vaza ou um user é comprometido:

1. Force logout via SQL:
   ```sql
   DELETE FROM "session" WHERE "user_id" = '<userId>';
   ```
   Todas as sessions ativas dele expiram.
2. Forçar reset de senha — gerar reset link manualmente:
   ```sql
   -- ou usar /forgot-password se o user ainda tiver acesso ao email
   ```
3. Rotacionar magic tokens dele se aplicável (acima).
4. Revisar `account` table pros providers OAuth — se o atacante tiver
   atrelado uma conta dele, deletar a linha:
   ```sql
   DELETE FROM "account" WHERE "user_id" = '<userId>' AND "provider_id" = 'facebook';
   ```

---

## Audit log

Hoje não temos audit log centralizado. Eventos relevantes ficam espalhados:

- **Login/logout:** Better Auth não loga (skip).
- **OAuth completions:** `notion_connection`, `instagram_account.created_at`.
- **Approval decisions:** `approval_link.decided_at`, `decided_from_ip`.
- **Production status changes:** `production.updated_at` (granular não).
- **Member changes:** `client_member.created_at` (mas sem who-removed-who).

Pra incidente, queries direto no Neon. Pra melhorar: schema `audit_log`
com user_id + action + target_type + target_id + timestamp + ip. TBD.
