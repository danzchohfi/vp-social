"use client"
import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { signIn } from "@/lib/auth-client"
import { Loader2, Facebook } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fbLoading, setFbLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn.email({ email, password })
    if (error) {
      toast.error(error.message || "Erro ao entrar. Verifique suas credenciais.")
    } else {
      router.push("/dashboard")
    }
    setLoading(false)
  }

  async function handleFacebook() {
    setFbLoading(true)
    await signIn.social({ provider: "facebook", callbackURL: "/dashboard" })
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Bem-vindo de volta</CardTitle>
        <CardDescription>Entre na sua conta para continuar</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleFacebook}
          disabled={fbLoading}
        >
          {fbLoading ? <Loader2 className="animate-spin" /> : <Facebook className="h-4 w-4 text-blue-600" />}
          Entrar com Facebook
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Entrar
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Não tem conta?{" "}
        <Link href="/signup" className="ml-1 font-medium text-primary hover:underline">
          Criar conta grátis
        </Link>
      </CardFooter>
    </Card>
  )
}
