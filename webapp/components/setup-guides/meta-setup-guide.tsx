"use client"

import { SetupGuide, type SetupStep } from "./setup-guide"

// 8-step setup guide for Meta WhatsApp Cloud API. Walks the agency
// through every Meta UI screen with literal Portuguese labels, external
// deep-links, copy-paste template body, and common-error tooltips.
//
// Extracted from the inline definition in client-config-panels.tsx
// (Fase 5 prep — splitting the 2590-line monster). Behavior identical
// to the previous in-file MetaCloudSetupGuide; what changed is just
// where it lives + reuse of the shared <SetupGuide /> primitive
// (so it auto-matches the visual style of NotionSetupGuide +
// InstagramSetupGuide).

const META_STEPS: SetupStep[] = [
  {
    title: "Criar app no Meta for Developers",
    body: (
      <>
        Em <strong>developers.facebook.com/apps</strong>, clique <em>Criar app</em>. Tipo: <strong>Empresa</strong> (Business).
        Dê um nome (ex: &quot;VP Social WhatsApp&quot;) e conecte ao Business Manager da agência.
        Esse é o &quot;app&quot; do ponto de vista da Meta — não é um app móvel, só um container pra credenciais.
      </>
    ),
    href: "https://developers.facebook.com/apps/",
    hrefLabel: "Abrir Meta for Developers",
    commonErrors: [
      { q: "Não vejo a opção Business", a: "Selecione Outro → Próxima → escolha Business no segundo passo." },
      { q: "Pede Business Manager", a: "Crie um em business.facebook.com primeiro, depois volte." },
    ],
  },
  {
    title: "Adicionar produto WhatsApp ao app",
    body: (
      <>
        Dentro do app recém-criado, no menu lateral procure <strong>Adicionar produto</strong> e selecione <strong>WhatsApp</strong>.
        Aceite os termos. Isso libera o painel <em>WhatsApp → API Setup</em> que usaremos pra pegar credenciais.
      </>
    ),
  },
  {
    title: "Pegar Phone Number ID",
    body: (
      <>
        No painel <strong>WhatsApp → API Setup</strong> do app, copie o <strong>Phone number ID</strong> (campo numérico ao lado do número WA Business da agência).
        <strong className="mt-1 block">NÃO é o número de telefone</strong> — é um ID interno tipo <code className="rounded bg-muted px-1 font-mono">123456789012345</code>.
        Guarde pra colar abaixo no campo &quot;Phone Number ID&quot;.
      </>
    ),
    commonErrors: [
      { q: "Não tenho número WA Business cadastrado", a: "Use o número de teste que a Meta provê grátis (top da página API Setup) pra começar; depois adicione o real." },
    ],
  },
  {
    title: "Adicionar caso de uso ao app",
    body: (
      <>
        ⚠ Esse passo é o que mais surpreende: apps Meta criados em 2024+ precisam ter <strong>&quot;Casos de uso&quot;</strong> ativados antes que as permissões fiquem disponíveis pros tokens.
        <br /><br />
        No app: menu lateral → <strong>Permissões e recursos</strong> (ou <em>App Review → Use Cases</em>) → adicione o caso de uso <strong>&quot;WhatsApp Business Messaging&quot;</strong>.
        Dentro dele, clique <em>Solicitar acesso avançado</em> e habilite as permissões: <code className="rounded bg-muted px-1 font-mono">whatsapp_business_messaging</code> + <code className="rounded bg-muted px-1 font-mono">whatsapp_business_management</code>.
      </>
    ),
    commonErrors: [
      { q: "Não vejo 'Casos de uso' no menu", a: "App muito novo. Tente: Configurações → Avançado → Permissões. Se não tiver, crie um app diferente do tipo Business." },
      { q: "'Acesso padrão' vs 'avançado'", a: "Padrão funciona pro System User Token. Avançado só é pra apps em produção pública. Pode marcar Padrão." },
    ],
  },
  {
    title: "Criar System User",
    body: (
      <>
        Em <strong>business.facebook.com/settings/system-users</strong>, clique <em>Adicionar</em>.
        <br /><br />
        <strong>Nome: apenas alfanumérico, sem espaços.</strong> Ex: <code className="rounded bg-muted px-1 font-mono">vpsocial</code>, <code className="rounded bg-muted px-1 font-mono">vp_social</code>.
        Função: <strong>Funcionário</strong> (Employee) — suficiente pra enviar mensagens.
      </>
    ),
    href: "https://business.facebook.com/settings/system-users",
    hrefLabel: "Abrir System Users",
    commonErrors: [
      { q: "'Nome inválido'", a: "Tira espaços e caracteres especiais. Use apenas letras, números e underscore." },
      { q: "Pede 2FA", a: "Ative 2FA na conta Meta primeiro (Business Settings → Security)." },
    ],
  },
  {
    title: "Atribuir ativos ao System User",
    body: (
      <>
        Ainda em Business Settings, clique no System User criado → <strong>Adicionar ativos</strong>.
        Atribua DOIS ativos:
        <ul className="mt-1 ml-4 list-disc space-y-0.5">
          <li><strong>App</strong> → seu app WhatsApp → <em>Controle total</em> (ou &quot;Gerenciar app&quot;)</li>
          <li><strong>Contas do WhatsApp</strong> → sua WABA → <em>Gerenciar conta + Enviar mensagens</em></li>
        </ul>
      </>
    ),
    commonErrors: [
      { q: "Não acho minha WABA", a: "Business Settings → Contas do WhatsApp. Se vazio, conecte o número primeiro em business.facebook.com/wa/manage." },
    ],
  },
  {
    title: "Gerar token permanente",
    body: (
      <>
        Volte em System Users → clique no usuário → <strong>Gerar Novo Token</strong>.
        <br /><br />
        Na tela do token:
        <ul className="mt-1 ml-4 list-disc space-y-0.5">
          <li>Selecione o <strong>app WhatsApp</strong> que você criou</li>
          <li><strong>Expiração: Nunca</strong> (NÃO use 60 dias — token vai morrer e quebrar tudo)</li>
          <li>Marque as duas permissões: <code className="rounded bg-muted px-1 font-mono">whatsapp_business_messaging</code> + <code className="rounded bg-muted px-1 font-mono">whatsapp_business_management</code></li>
        </ul>
        <strong className="mt-2 block">Copie agora — só aparece UMA vez.</strong> Cole no campo &quot;Token da API&quot; abaixo.
      </>
    ),
    commonErrors: [
      { q: "'Nenhuma permissão disponível'", a: "Volta no passo 4 — você não habilitou o caso de uso ainda, OU o System User não foi atribuído ao app (passo 6)." },
      { q: "Perdi o token", a: "Gera um novo (revoga o antigo automaticamente). System Users → Gerar Novo Token." },
    ],
  },
  {
    title: "Criar template no WhatsApp Manager",
    body: (
      <>
        Em <strong>business.facebook.com/wa/manage/message-templates</strong>, clique <em>Criar template</em>.
        <br /><br />
        Configuração exata:
        <ul className="mt-1 ml-4 list-disc space-y-0.5">
          <li><strong>Categoria</strong>: Utilidade (Utility)</li>
          <li><strong>Idioma</strong>: Português (Brasil) → cole <code className="rounded bg-muted px-1 font-mono">pt_BR</code> abaixo</li>
          <li><strong>Nome</strong>: <code className="rounded bg-muted px-1 font-mono">approval_request</code> (qualquer, mas sem espaços; cole exato abaixo)</li>
          <li><strong>Corpo</strong>: cole o texto à direita ↓</li>
        </ul>
        <br />
        Clique <em>Enviar pra revisão</em>. <strong>Meta aprova em 24-48h.</strong> Volta aqui depois, cola o nome do template e teste.
      </>
    ),
    href: "https://business.facebook.com/wa/manage/message-templates",
    hrefLabel: "Abrir Templates",
    copy: {
      label: "Copiar corpo do template",
      text: `Olá {{1}}! Você tem o post "{{2}}" aguardando sua aprovação.\n\nPara aprovar ou pedir alterações, acesse: {{3}}`,
    },
    commonErrors: [
      { q: "Template rejeitado", a: "Geralmente categoria errada (Marketing ao invés de Utility). Aprovação de conteúdo qualifica como Utility — recrie com essa categoria." },
      { q: "Quanto tempo?", a: "24-48h normalmente. Pode levar até 7 dias em casos raros. Email da Meta avisa quando aprovado." },
    ],
  },
]

export function MetaSetupGuide({ clientId, hasCredentials }: { clientId: string; hasCredentials: boolean }) {
  return (
    <SetupGuide
      title="Configurar Meta WhatsApp Cloud — passo a passo"
      subtitle="~30-45min + 24-48h de revisão Meta"
      storageKey={`vpsocial_meta_setup_progress_${clientId}`}
      steps={META_STEPS}
      complete={hasCredentials}
    />
  )
}
