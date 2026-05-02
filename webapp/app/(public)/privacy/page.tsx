import Link from "next/link"

export const metadata = { title: "Política de Privacidade – VP Social" }

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/" className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="mb-8 text-sm text-muted-foreground">Última atualização: 2 de maio de 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold">1. Quem somos</h2>
          <p>VP Social é uma plataforma de agendamento e publicação de conteúdo em redes sociais operada pela Vitamina Publicitária. Nosso site é <strong>posts.vitaminapublicitaria.com.br</strong>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Dados coletados</h2>
          <p>Coletamos apenas os dados necessários para fornecer o serviço:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Endereço de e-mail e nome para criação de conta</li>
            <li>Tokens de acesso OAuth das plataformas conectadas (Instagram, Facebook, YouTube, TikTok, LinkedIn)</li>
            <li>Metadados de publicações (títulos, datas, status)</li>
            <li>Métricas de desempenho de posts (curtidas, alcance, comentários)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Uso dos dados</h2>
          <p>Utilizamos seus dados exclusivamente para:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Autenticar sua identidade e proteger sua conta</li>
            <li>Publicar conteúdo nas plataformas que você conectou</li>
            <li>Exibir métricas e histórico de publicações</li>
            <li>Enviar notificações transacionais (redefinição de senha)</li>
          </ul>
          <p>Não vendemos, alugamos nem compartilhamos seus dados com terceiros para fins de marketing.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Armazenamento e segurança</h2>
          <p>Seus dados são armazenados em servidores seguros (Neon PostgreSQL) com criptografia em trânsito (TLS) e em repouso. Tokens de acesso são armazenados de forma segura e utilizados apenas para interagir com as APIs das plataformas conectadas.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Dados de plataformas de terceiros</h2>
          <p>Ao conectar uma plataforma (ex: TikTok, Instagram), você autoriza o VP Social a acessar e publicar conteúdo em seu nome, conforme as permissões concedidas no momento da conexão. Você pode revogar esse acesso a qualquer momento desconectando a conta nas configurações do VP Social ou diretamente nas configurações de privacidade da plataforma.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Seus direitos (LGPD)</h2>
          <p>Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Acessar os dados que temos sobre você</li>
            <li>Corrigir dados incorretos</li>
            <li>Solicitar a exclusão da sua conta e dados</li>
            <li>Portabilidade dos dados</li>
          </ul>
          <p>Para exercer esses direitos, entre em contato pelo e-mail abaixo.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Cookies</h2>
          <p>Usamos apenas cookies de sessão estritamente necessários para manter você autenticado. Não utilizamos cookies de rastreamento ou publicidade.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Contato</h2>
          <p>Dúvidas sobre privacidade? Entre em contato: <a href="mailto:contato@vitaminapublicitaria.com.br" className="text-primary hover:underline">contato@vitaminapublicitaria.com.br</a></p>
        </section>
      </div>
    </div>
  )
}
