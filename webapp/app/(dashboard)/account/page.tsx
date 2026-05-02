"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Save } from "lucide-react"
import { useSession } from "@/lib/auth-client"
import { toast } from "sonner"

export default function AccountPage() {
  const { data: session, refetch } = useSession()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? "")
      setEmail(session.user.email ?? "")
    }
  }, [session])

  async function saveProfile() {
    setSavingProfile(true)
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar")
      toast.success("Perfil atualizado")
      refetch?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword() {
    if (newPassword !== confirmPassword) {
      toast.error("Senhas não conferem")
      return
    }
    if (newPassword.length < 8) {
      toast.error("Senha deve ter ao menos 8 caracteres")
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao trocar senha")
      toast.success("Senha trocada com sucesso")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSavingPassword(false)
    }
  }

  if (!session) return null

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">Minha conta</h1>
        <p className="text-muted-foreground">Atualize seus dados pessoais e senha.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Nome e email que você usa para entrar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Trocar o email pode exigir verificação por link enviado ao novo endereço.
            </p>
          </div>
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
          <CardDescription>Mínimo 8 caracteres.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Senha atual</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <Button onClick={savePassword} disabled={savingPassword || !currentPassword || !newPassword}>
            {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Trocar senha
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
