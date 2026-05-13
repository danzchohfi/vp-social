"use client"

import { SetupGuide, type SetupStep } from "./setup-guide"

// 4-step setup guide for connecting Instagram Business / Facebook Page.
// IG Graph API requires:
//   1. Facebook Page (admin role)
//   2. Instagram Business or Creator account linked to that Page
//   3. Meta Business Suite knows about both
//   4. OAuth flow grants `pages_show_list` + `instagram_basic`
// User confusion: usually it's #2 (IG Personal vs Business) or #3 (page not in Business Manager).

const IG_STEPS: SetupStep[] = [
  {
    title: "Criar/escolher uma página do Facebook",
    body: (
      <>
        Instagram publica via página do Facebook (Graph API). Se a agência ainda não tem, crie
        em <strong>facebook.com/pages/create</strong>. Categoria livre (Empresa, Marca, etc.).
        Você precisa ser admin da página.
        <br /><br />
        Se já tem mas é uma página antiga (criada como &quot;Local&quot; ou &quot;Pública&quot;),
        funciona — só precisa ter você como admin.
      </>
    ),
    href: "https://www.facebook.com/pages/create",
    hrefLabel: "Criar página Facebook",
    commonErrors: [
      {
        q: "Não consigo ser admin",
        a: "Outro admin precisa adicionar você em facebook.com/settings/page_roles. Sem isso a OAuth não enxerga a página.",
      },
    ],
  },
  {
    title: "Converter o Instagram em conta Business ou Creator",
    body: (
      <>
        No app Instagram → perfil → menu → <strong>Configurações</strong> →{" "}
        <strong>Conta</strong> → <strong>Mudar tipo de conta</strong> → escolha{" "}
        <em>Profissional</em>. Selecione <strong>Business</strong> (recomendado pra agência) ou
        Creator.
        <br /><br />
        <strong>Critical</strong>: contas pessoais NÃO funcionam — a Graph API só lê e publica
        em Business/Creator. Esse é o erro #1 de setup.
      </>
    ),
    commonErrors: [
      {
        q: "Não vejo &quot;Mudar tipo de conta&quot;",
        a: "App desatualizado, ou a conta tem &lt; 100 seguidores e o Instagram restringe. Atualize o app primeiro; última opção é criar uma conta nova já como Business.",
      },
    ],
  },
  {
    title: "Conectar Instagram à página do Facebook",
    body: (
      <>
        Em <strong>business.facebook.com</strong> → conta da agência → <strong>Configurações da
        Conta Comercial</strong> → <strong>Contas → Contas do Instagram</strong> →{" "}
        <em>Adicionar</em>. Faça login com o IG Business.
        <br /><br />
        Depois: <strong>Páginas</strong> → escolha a página criada no passo 1 →{" "}
        <em>Configurações da página</em> → <strong>Contas vinculadas</strong> →{" "}
        <strong>Instagram</strong> → conectar.
      </>
    ),
    href: "https://business.facebook.com",
    hrefLabel: "Abrir Meta Business Suite",
    commonErrors: [
      {
        q: "&quot;Esta conta do Instagram já está conectada a outra página&quot;",
        a: "Desconecte da outra página primeiro (em business.facebook.com → outra página → Contas vinculadas → Desconectar). Uma conta IG só pode estar conectada a 1 página por vez.",
      },
      {
        q: "Página não aparece no Business Suite",
        a: "A página precisa ser de propriedade da Conta Comercial. Em business.facebook.com → Páginas → Adicionar → Reivindicar página, e siga o fluxo de verificação.",
      },
    ],
  },
  {
    title: "Conectar via OAuth no app",
    body: (
      <>
        Volte ao app → <strong>/accounts</strong> → botão <strong>Conectar Instagram</strong>.
        Você vai pra Facebook → autorize <em>todas as permissões</em> que o app pedir (page
        management, IG read/write). Não desmarque nada — desmarcar quebra o publish.
        <br /><br />
        Depois da OAuth, o app lista as páginas que você administra. <strong>Marque só as
        páginas deste cliente</strong> (as outras vão pra outros clientes ou serão removidas).
      </>
    ),
    commonErrors: [
      {
        q: "Nenhuma página apareceu após OAuth",
        a: "Você desmarcou a permissão pages_show_list. Volte e refaça mantendo todas as caixas marcadas.",
      },
      {
        q: "Página apareceu mas IG não",
        a: "Conexão IG↔Page não está sincronizada. Refaça o passo 3 (desconecte e reconecte o IG na página).",
      },
      {
        q: "App Meta em &quot;Development Mode&quot;",
        a: "Pra agência testar em localhost ou usar contas que não estão no app, o app Meta precisa estar em Development. Pra produção, precisa de App Review aprovado.",
      },
    ],
  },
]

export function InstagramSetupGuide({ clientId, hasInstagramAccount }: { clientId: string; hasInstagramAccount: boolean }) {
  return (
    <SetupGuide
      title="Conectar Instagram — passo a passo"
      subtitle="~15-20min se já tiver página FB"
      storageKey={`vpsocial_instagram_setup_${clientId}`}
      steps={IG_STEPS}
      complete={hasInstagramAccount}
    />
  )
}
