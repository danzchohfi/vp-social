// Service Worker minimalista pra Web Push do portal /c/[token].
// Sem caching ofensivo — só lida com push + click. Outras estratégias
// (offline-first, app-shell) podem ser adicionadas depois sem quebrar
// este contrato.

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: "Produção", body: event.data.text() } }
  const title = payload.title || "Produção"
  const opts = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/favicon-32.png",
    data: { url: payload.url || "/" },
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, opts))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      // Se já tem aba aberta do portal, foca em vez de abrir nova.
      for (const c of all) {
        if (c.url.includes("/c/") && "focus" in c) return c.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
