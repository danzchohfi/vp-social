import { createAuthClient } from "better-auth/react"

// SEM baseURL: better-auth/react cai pra window.location.origin
// automaticamente. Garante que toda request seja same-origin, sem
// importar se o user chegou via www.producao.app, producao.app ou
// um preview *.vercel.app. Antes, NEXT_PUBLIC_APP_URL hardcoded
// causava fetch cross-origin quando os domínios divergiam (caso
// www vs apex) — CSP connect-src 'self' bloqueava, signIn.email
// lançava TypeError uncaught e o spinner do botão ficava pendurado
// sem toast de erro. O server (lib/auth.ts) continua precisando
// de baseURL pra resolver callback URLs OAuth — só o client agora
// usa origin dinâmica.
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
