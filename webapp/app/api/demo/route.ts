import { NextResponse } from "next/server"
import { notifyDemoRequest, type DemoLead } from "@/lib/email-notifications"

// Public endpoint — captures lead from /demo form and sends an email
// to the founder inbox. Validates at boundary (boundary = req.json
// parse + type check). After that, trusts shape.
//
// No rate limit yet — add when /demo starts getting spammed. Roadmap:
// integrate ManyChat + push to internal CRM.

export const runtime = "nodejs"

type Body = Partial<DemoLead>

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null

  if (!body || !isString(body.name) || !isString(body.email) || !isString(body.phone)) {
    return NextResponse.json(
      { ok: false, error: "Nome, e-mail e WhatsApp são obrigatórios." },
      { status: 400 },
    )
  }

  // Quick sanity check on email shape — server-side belt + suspenders.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 })
  }

  await notifyDemoRequest({
    name: body.name.trim().slice(0, 120),
    email: body.email.trim().toLowerCase().slice(0, 200),
    phone: body.phone.trim().slice(0, 30),
    agencyName: body.agencyName?.toString().trim().slice(0, 120) || null,
    clientCount: body.clientCount?.toString().trim().slice(0, 40) || null,
    planningTool: body.planningTool?.toString().trim().slice(0, 80) || null,
    comments: body.comments?.toString().trim().slice(0, 1000) || null,
    source: body.source?.toString().trim().slice(0, 80) || null,
  })

  return NextResponse.json({ ok: true })
}
