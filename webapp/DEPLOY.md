# Deploy do Publify

Stack: Next.js 15 (Vercel) + Neon (PostgreSQL) + Trigger.dev (background jobs)

---

## 1. Banco de dados — Neon

1. Acesse **neon.tech** e crie uma conta
2. Crie um projeto chamado `publify`
3. Copie a **Connection string** (ex: `postgresql://user:pass@ep-xxx.neon.tech/publify?sslmode=require`)
4. Salve como `DATABASE_URL`

---

## 2. Background jobs — Trigger.dev

1. Acesse **trigger.dev** e crie uma conta
2. Crie um projeto chamado `publify`
3. Copie o **Project ID** (ex: `proj_xxxxxxxx`) → `TRIGGER_PROJECT_ID`
4. Em **API Keys**, copie a chave de produção → `TRIGGER_SECRET_KEY`

---

## 3. Notion OAuth — Integração Pública

1. Acesse **notion.so/profile/integrations**
2. Clique em **"New integration"**
3. Marque **"Public integration"** (não Internal)
4. Em **OAuth Domain & URIs**, adicione:
   ```
   https://SEU-DOMINIO.vercel.app/api/notion/callback
   ```
5. Copie **Client ID** → `NOTION_CLIENT_ID`
6. Copie **Client Secret** → `NOTION_CLIENT_SECRET`

---

## 4. Meta App — Facebook Login

1. Acesse **developers.facebook.com** → seu app
2. Adicione o produto **"Facebook Login"**
3. Em **Facebook Login → Configurações → URIs de redirecionamento OAuth válidos**, adicione:
   ```
   https://SEU-DOMINIO.vercel.app/api/facebook/callback
   ```
4. Salve

---

## 5. Deploy na Vercel

### Via GitHub (recomendado)
1. Acesse **vercel.com** → **"Add New Project"**
2. Importe o repositório `danzchohfi/Teste`
3. Em **Root Directory**, selecione `webapp`
4. Adicione todas as variáveis de ambiente abaixo
5. Clique em **Deploy**

### Variáveis de ambiente na Vercel

| Variável | Onde obter |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL do deploy (ex: `https://publify.vercel.app`) |
| `BETTER_AUTH_SECRET` | Gere com: `openssl rand -base64 32` |
| `DATABASE_URL` | Neon → Connection string |
| `FACEBOOK_APP_ID` | Meta for Developers → Configurações → Básico |
| `FACEBOOK_APP_SECRET` | Meta for Developers → Configurações → Básico |
| `NOTION_CLIENT_ID` | Notion → Integração pública |
| `NOTION_CLIENT_SECRET` | Notion → Integração pública |
| `TRIGGER_PROJECT_ID` | Trigger.dev → projeto |
| `TRIGGER_SECRET_KEY` | Trigger.dev → API Keys |

---

## 6. Criar tabelas no banco

Após o primeiro deploy, abra o terminal na pasta `webapp` e rode:

```bash
npm install
DATABASE_URL="sua-url-do-neon" npm run db:push
```

---

## 7. Deploy do worker Trigger.dev

```bash
cd webapp
npm install
npx trigger.dev@latest deploy
```

---

## 8. Teste local

```bash
cd webapp
cp .env.example .env.local
# Preencha .env.local com todas as variáveis

npm install
npm run db:push          # cria as tabelas
npm run dev              # inicia o app em localhost:3000
npm run trigger:dev      # em outro terminal: inicia o worker local
```

---

## Arquitetura final

```
Usuário
  ↓
Vercel (Next.js 15)
  ├── Landing page
  ├── Auth (Better Auth)
  ├── Dashboard
  └── API Routes
         ↓
       Neon (PostgreSQL)
         ↓
Trigger.dev (worker a cada 15min)
  ├── Lê Notion de cada usuário
  ├── Publica no Instagram
  └── Salva log no banco
```

## Custo inicial: R$0

| Serviço | Plano gratuito |
|---|---|
| Vercel | 100GB bandwidth, deploys ilimitados |
| Neon | 3GB storage, 0.5 vCPU |
| Trigger.dev | 25.000 execuções/mês |
