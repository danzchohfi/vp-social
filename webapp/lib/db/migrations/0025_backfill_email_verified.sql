-- INFO-2 do audit de segurança: ativar requireEmailVerification.
-- Pra não quebrar usuários existentes (signup pré-2026-05-17), marca
-- como verified=true tudo que já existe agora. Going forward, novos
-- signups precisam clicar link do email pra logar.
--
-- Roda UMA VEZ via drizzle-kit migrate (tracked em
-- __drizzle_migrations) — idempotente na prática porque na 2ª execução
-- já não tem rows com false (que tinham conta criada antes desta data).
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
