"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Building2, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { useSession } from "@/lib/auth-client"
import { toast } from "sonner"
import Link from "next/link"

type InviteInfo = {
  clientId: string
  email: string
  role: string
  clientName: string
  clientLogoUrl: string | null
  invitedByName: string
  invitedByEmail: string
  expired: boolean
  accepted: boolean
}

export default function InviteAcceptPage() {
  const router = useRouter()
  const { token } = useParams<{ token: string }>()
  const { data: session } = useSession()
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/invites/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setInvite(data)
      })
      .finally(() => setLoading(false))
  }, [token])

  async function accept() {
    if (!session) {
      const callback = encodeURIComponent(`/invites/${token}`)
      router.push(`/login?redirect=${callback}`)
      return
    }
    setAccepting(true)
    try {
      const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro")
      toast.success("Convite aceito! Redirecionando…")
      window.location.href = "/dashboard"
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        {loading ? (
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        ) : error || !invite ? (
          <>
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Convite inválido</CardTitle>
              <CardDescription>{error ?? "Convite não encontrado."}</CardDescription>
            </CardHeader>
          </>
        ) : invite.accepted ? (
          <>
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <CardTitle>Convite já aceito</CardTitle>
              <CardDescription>Você já tem acesso a este cliente.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/dashboard">Ir para o Dashboard</Link>
              </Button>
            </CardContent>
          </>
        ) : invite.expired ? (
          <>
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Convite expirado</CardTitle>
              <CardDescription>Peça para {invite.invitedByName} gerar um novo convite.</CardDescription>
            </CardHeader>
          </>
        ) : (
          <>
            <CardHeader>
              <div className="mb-3 flex items-center gap-3">
                {invite.clientLogoUrl ? (
                  <img src={invite.clientLogoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <CardTitle className="text-lg">{invite.clientName}</CardTitle>
                  <p className="text-xs text-muted-foreground capitalize">
                    Convite como {invite.role === "admin" ? "Admin" : "Membro"}
                  </p>
                </div>
              </div>
              <CardDescription>
                <strong>{invite.invitedByName}</strong> ({invite.invitedByEmail}) está convidando você
                para acessar o cliente <strong>{invite.clientName}</strong> no Publify.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="text-muted-foreground">O convite é para:</p>
                <p className="font-medium">{invite.email}</p>
                {session && session.user.email.toLowerCase() !== invite.email.toLowerCase() && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Você está logado como {session.user.email}. Faça login com {invite.email} para aceitar.
                  </p>
                )}
              </div>
              <Button onClick={accept} disabled={accepting} className="w-full" size="lg">
                {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {session ? "Aceitar convite" : "Entrar e aceitar"}
              </Button>
              {!session && (
                <p className="text-center text-xs text-muted-foreground">
                  Não tem conta?{" "}
                  <Link href={`/signup?email=${encodeURIComponent(invite.email)}&redirect=${encodeURIComponent(`/invites/${token}`)}`} className="underline">
                    Criar conta
                  </Link>
                </p>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
