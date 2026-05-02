import Link from "next/link"

export const metadata = { title: "Termos de Serviço – VP Social" }

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/" className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Termos de Serviço</h1>
      <p className="mb-8 text-sm text-muted-foreground">Última atualização: 2 de maio de 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold">1. Aceitação dos termos</h2>
          <p>Ao utilizar o VP Social (<strong>posts.vitaminapublicitaria.com.br</strong>), você concorda com estes Termos de Serviço. Se não concordar, não utilize o serviço.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Descrição do serviço</h2>
          <p>VP Social é uma ferramenta de agendamento e publicação de conteúdo em redes sociais que integra com Notion, Instagram, Facebook, YouTube, TikTok e LinkedIn, permitindo automatizar a publicação de posts a partir de um banco de dados Notion.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Uso aceitável</h2>
          <p>Você concorda em utilizar o VP Social apenas para fins legais e de acordo com as políticas de uso das plataformas conectadas. É proibido:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Publicar conteúdo que viole direitos de terceiros</li>
            <li>Usar o serviço para spam ou automação abusiva</li>
            <li>Tentar acessar contas de outros usuários</li>
            <li>Realizar engenharia reversa do sistema</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Conta do usuário</h2>
          <p>Você é responsável por manter a segurança de sua senha e por todas as atividades realizadas em sua conta. Notifique-nos imediatamente em caso de uso não autorizado.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Plataformas de terceiros</h2>
          <p>O VP Social integra com plataformas de terceiros (TikTok, Meta, Google, etc.). O uso dessas plataformas está sujeito às respectivas políticas de uso. Não somos responsáveis por mudanças nas APIs ou políticas dessas plataformas que possam afetar o funcionamento do serviço.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Disponibilidade</h2>
          <p>Nos esforçamos para manter o serviço disponível, mas não garantimos disponibilidade ininterrupta. Podemos realizar manutenções programadas com ou sem aviso prévio.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Limitação de responsabilidade</h2>
          <p>O VP Social não se responsabiliza por perdas indiretas, publicações não realizadas por falhas nas APIs de terceiros, ou danos decorrentes de uso indevido da plataforma.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Cancelamento</h2>
          <p>Você pode encerrar sua conta a qualquer momento. Ao cancelar, seus dados serão excluídos conforme nossa Política de Privacidade.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">9. Alterações nos termos</h2>
          <p>Podemos atualizar estes termos periodicamente. O uso continuado do serviço após as alterações constitui aceitação dos novos termos.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">10. Lei aplicável</h2>
          <p>Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca de São Paulo/SP para resolução de conflitos.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">11. Contato</h2>
          <p>Dúvidas? Entre em contato: <a href="mailto:contato@vitaminapublicitaria.com.br" className="text-primary hover:underline">contato@vitaminapublicitaria.com.br</a></p>
        </section>
      </div>
    </div>
  )
}
