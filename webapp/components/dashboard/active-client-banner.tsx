import { Building2 } from "lucide-react"
import { getActiveClient } from "@/lib/active-client"

export async function ActiveClientBanner({ userId }: { userId: string }) {
  const client = await getActiveClient(userId)

  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-8 py-2 text-xs">
      <span className="text-muted-foreground">Cliente ativo:</span>
      {client.logoUrl ? (
        <img src={client.logoUrl} alt="" className="h-4 w-4 rounded object-cover" />
      ) : (
        <Building2 className="h-3.5 w-3.5 text-primary" />
      )}
      <span className="font-medium">{client.name}</span>
      <a href="/clients" className="ml-auto text-muted-foreground hover:text-foreground">
        Gerenciar clientes →
      </a>
    </div>
  )
}
