"use client"
import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { authClient } from "@/lib/auth-client"
import { Loader2 } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) {
      toast.error("Token ausente — peça um novo link.")
      return
    }
    if (password.length < 8) {
      toast.error("Senha precisa ter pelo menos 8 caracteres.")
      return
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.")
      return
    }
    setLoading(true)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setLoading(false)
    if (error) {
      toast.error(error.message ?? "Erro ao redefinir senha. O link pode ter expirado.")
      return
    }
    toast.success("Senha redefinida — entre com a nova senha.")
    router.push("/login")
  }

  if (!token) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl font-normal tracking-tight">Link inválido</CardTitle>
          <CardDescription>Este link de reset está incompleto ou expirou.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center text-sm">
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">Pedir um novo link</Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="font-display text-3xl font-normal tracking-tight">Nova senha</CardTitle>
        <CardDescription>Escolha uma nova senha para sua conta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Nova senha</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input id="confirm" type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Redefinir senha
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
