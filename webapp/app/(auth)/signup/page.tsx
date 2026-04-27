"use client"
import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { signUp, signIn } from "@/lib/auth-client"
import { Loader2, Facebook } from "lucide-react"

export default function SignupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fbLoading, setFbLoading] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres.")
      return
    }
    setLoading(true)
    const { error } = await signUp.email({ name, email, password })
    if (error) {
      toast.error(error.message || "Erro ao criar conta.")
    } else {
      toast.success("Conta criada! Bem-vindo ao Publify.")
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
        <CardTitle className="text-2xl">Criar conta grátis</CardTitle>
        <CardDescription>Comece a publicar do Notion em minutos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" className="w-full gap-2" onClick={handleFacebook} disabled={fbLoading}>
          {fbLoading ? <Loader2 className="animate-spin" /> : <Facebook className="h-4 w-4 text-blue-600" />}
          Continuar com Facebook
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Criar conta
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="ml-1 font-medium text-primary hover:underline">
          Entrar
        </Link>
      </CardFooter>
    </Card>
  )
}
