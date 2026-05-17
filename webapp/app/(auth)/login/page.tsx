"use client"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { signIn } from "@/lib/auth-client"
import { Loader2, Facebook } from "lucide-react"

// Forwards the current ?redirect= so that invitees who land on /login and
// click "Criar conta" don't lose the invite target.
function SignupLink() {
  const [href, setHref] = useState("/signup")
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const redirect = sp.get("redirect")
    if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
      setHref(`/signup?redirect=${encodeURIComponent(redirect)}`)
    }
  }, [])
  return (
    <Link href={href} className="ml-1 font-medium text-primary hover:underline">
      Criar conta grátis
    </Link>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [fbLoading, setFbLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // Honor ?redirect=<path> so the invite-accept flow can come back to
  // /invites/{token} after signing in. Read at click time (not via
  // useSearchParams) to avoid forcing dynamic rendering on the auth page.
  function postAuthTarget(): string {
    if (typeof window === "undefined") return "/dashboard"
    const sp = new URLSearchParams(window.location.search)
    const redirect = sp.get("redirect")
    // Only allow same-origin paths to prevent open-redirect.
    return redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard"
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn.email({ email, password })
    if (error) {
      toast.error(error.message || "Erro ao entrar. Verifique suas credenciais.")
    } else {
      router.push(postAuthTarget())
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    await signIn.social({ provider: "google", callbackURL: postAuthTarget() })
  }

  async function handleFacebook() {
    setFbLoading(true)
    await signIn.social({ provider: "facebook", callbackURL: postAuthTarget() })
  }

  return (
    <Card className="w-full max-w-md border-border bg-card shadow-sm">
      <CardHeader className="text-center">
        <CardTitle className="[font-family:var(--font-fraunces),Georgia,serif] text-[34px] font-normal leading-tight tracking-tight">
          Bem-vindo de volta.
        </CardTitle>
        <CardDescription className="text-[15px]">
          Entre na sua conta pra continuar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" className="w-full gap-2" onClick={handleGoogle} disabled={googleLoading}>
          {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Entrar com Google
        </Button>
        <Button variant="outline" className="w-full gap-2" onClick={handleFacebook} disabled={fbLoading}>
          {fbLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4 text-blue-600" />}
          Entrar com Facebook
        </Button>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-sm uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary hover:underline">
                Esqueci a senha
              </Link>
            </div>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-base text-muted-foreground">
        Não tem conta?{" "}
        <SignupLink />
      </CardFooter>
    </Card>
  )
}
