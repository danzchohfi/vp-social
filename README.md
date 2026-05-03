# VP Social

SaaS multi-tenant para publicar posts de bancos do Notion em Instagram, Facebook, YouTube, TikTok e LinkedIn — com agendamento, mapeamento de campos por workspace e sincronização de analytics.

**Produção:** [posts.vitaminapublicitaria.com.br](https://posts.vitaminapublicitaria.com.br)

## Estrutura

Todo o código fica em [`webapp/`](./webapp). Stack:

- Next.js 15 + React 19 + TypeScript
- Drizzle ORM + Neon (Postgres)
- Better Auth (email/senha + Google + Facebook)
- Trigger.dev (cron de publicação a cada 5 min e sync de analytics a cada 6h)
- Vercel (deploy)

## Começar a desenvolver

```bash
cd webapp
npm install --legacy-peer-deps
cp .env.example .env.local   # preencher chaves
npm run db:push              # sincroniza schema com Neon
npm run dev                  # http://localhost:3000
```

Em terminal separado:

```bash
cd webapp
npm run trigger:dev          # worker Trigger.dev
```

Ver `webapp/DEPLOY.md` para deploy e `CLAUDE.md` para arquitetura detalhada.

<!-- deploy-trigger: 2026-05-03T20:30 -->
