"use client"

import { SetupGuide, type SetupStep } from "./setup-guide"

// 5-step setup guide for connecting Notion as the post CMS. Covers
// integration creation, sharing with databases, picking the right
// database type, common pitfalls (multi-source DBs, inline DBs,
// missing share-with-integration).

const NOTION_STEPS: SetupStep[] = [
  {
    title: "Criar uma integração interna no Notion",
    body: (
      <>
        Em <strong>notion.so/profile/integrations</strong>, clique <em>Nova integração</em>. Tipo:{" "}
        <strong>Interna</strong>. Dê um nome (ex: &quot;VP Social&quot;) e escolha o workspace da
        agência.
        <br /><br />
        Em <strong>Recursos (Capabilities)</strong>, marque: <em>Ler conteúdo, Inserir conteúdo,
        Atualizar conteúdo</em>. Sem essas três, o cron não consegue ler posts nem flipar
        status.
      </>
    ),
    href: "https://www.notion.so/profile/integrations",
    hrefLabel: "Abrir integrações Notion",
    commonErrors: [
      {
        q: "&quot;Workspace owner approval&quot;",
        a: "Workspaces enterprise exigem que um admin aprove integrações novas. Peça ao admin pra liberar antes de salvar.",
      },
    ],
  },
  {
    title: "Copiar o token (Internal Integration Secret)",
    body: (
      <>
        Na página da integração, na aba <strong>Secrets</strong>, clique <em>Mostrar</em> ao lado
        de <strong>Internal Integration Secret</strong> → <em>Copiar</em>. É uma string que
        começa com <code className="rounded bg-muted px-1 font-mono">ntn_</code> ou{" "}
        <code className="rounded bg-muted px-1 font-mono">secret_</code>.
        <br /><br />
        Cole no campo &quot;Notion Token&quot; do app (próxima tela do /settings → Notion).
      </>
    ),
    commonErrors: [
      {
        q: "Token regenerado", a: "Se regerar o secret, todas as conexões antigas quebram. Atualize aqui imediatamente.",
      },
    ],
  },
  {
    title: "Compartilhar o database com a integração",
    body: (
      <>
        Abre o database de posts no Notion. No canto superior direito, clique <strong>•••</strong>{" "}
        → <strong>Conexões</strong> → digite o nome da integração que você criou e selecione.
        <br /><br />
        <strong>Importante</strong>: se o database tem propriedades de relação (Conta, Contato,
        etc.), você precisa compartilhar a integração com TODOS os databases relacionados
        também — senão o cron lê o post mas não consegue resolver a relação.
      </>
    ),
    commonErrors: [
      {
        q: "&quot;database not found&quot; mesmo compartilhado",
        a: "Multi-source DB (views combinadas) não funcionam via API. Use o DB de origem, não a view.",
      },
      {
        q: "Database inline (dentro de uma página)",
        a: "Notion Search pode não enxergar — use a opção &quot;Colar URL do database&quot; em /settings em vez de buscar.",
      },
    ],
  },
  {
    title: "Pegar o database ID da URL",
    body: (
      <>
        Abra o database no Notion como página completa. A URL fica tipo:
        <pre className="mt-2 overflow-x-auto rounded border bg-background p-2 font-mono text-[12px]">
          https://www.notion.so/Title-<strong>abc123456789abcdef0123456789abcd</strong>?v=...
        </pre>
        O <strong>database ID</strong> são os 32 caracteres hex em negrito acima — entre o título
        e o <code className="rounded bg-muted px-1 font-mono">?v=</code>. Cole no campo
        &quot;Database ID&quot; do app.
        <br /><br />
        Dica: o app aceita a URL inteira — extrai o ID automaticamente.
      </>
    ),
  },
  {
    title: "Mapear campos do Notion",
    body: (
      <>
        Em <strong>/settings → Notion → Mapeamento</strong>, indique quais propriedades do seu
        database são: <em>título, data de publicação, status, conta, mídia, &quot;Publicar em&quot;</em>.
        Os defaults batem com nomes em português (Produção, Dia para fazer, Status, Conta) — se
        seus campos têm nomes diferentes, ajuste aqui.
        <br /><br />
        Sem isso o cron pode até ler posts, mas não sabe qual é o título nem onde publicar.
      </>
    ),
    commonErrors: [
      {
        q: "Campo Status não tem &quot;Agendamento&quot;",
        a: "Status pode ser Select ou Status — em /settings você indica o valor exato do status que dispara publicação (ex: &quot;Pronto&quot;, &quot;Aprovado&quot;).",
      },
    ],
  },
]

export function NotionSetupGuide({ clientId, hasConnection }: { clientId: string; hasConnection: boolean }) {
  return (
    <SetupGuide
      title="Conectar Notion — passo a passo"
      subtitle="~10-15min"
      storageKey={`vpsocial_notion_setup_${clientId}`}
      steps={NOTION_STEPS}
      complete={hasConnection}
    />
  )
}
