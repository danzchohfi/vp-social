"""
Fluxo OAuth do Facebook para obter tokens de acesso às páginas e contas Instagram.
Abre o navegador, captura o callback automaticamente via servidor local.
"""

import os
import webbrowser
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from dataclasses import dataclass

GRAPH = "https://graph.facebook.com/v19.0"
CALLBACK_PORT = 8000
REDIRECT_URI = f"http://localhost:{CALLBACK_PORT}/callback"
SCOPES = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement"


@dataclass
class InstagramAccount:
    page_id: str
    page_name: str
    instagram_id: str
    page_access_token: str


class _CallbackHandler(BaseHTTPRequestHandler):
    code: str | None = None

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/callback":
            params = parse_qs(parsed.query)
            _CallbackHandler.code = params.get("code", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            if _CallbackHandler.code:
                self.wfile.write("<h2>✓ Autorizado! Pode fechar esta aba e voltar ao terminal.</h2>".encode())
            else:
                self.wfile.write("<h2>Erro na autorização. Tente novamente.</h2>".encode())

    def log_message(self, *args):
        pass


def run_oauth_flow() -> list[InstagramAccount]:
    """
    Executa o fluxo OAuth completo e retorna as contas Instagram disponíveis.
    Abre o browser automaticamente e captura o código sem intervenção do usuário.
    """
    app_id = os.getenv("FACEBOOK_APP_ID")
    app_secret = os.getenv("FACEBOOK_APP_SECRET")
    if not app_id or not app_secret:
        raise ValueError("FACEBOOK_APP_ID e FACEBOOK_APP_SECRET são obrigatórios no .env")

    auth_url = (
        f"https://www.facebook.com/v19.0/dialog/oauth"
        f"?client_id={app_id}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope={SCOPES}"
        f"&response_type=code"
    )

    print("\nAbrindo o Facebook no navegador...")
    print("Faça login e autorize o app. Esta janela vai continuar automaticamente.\n")
    webbrowser.open(auth_url)

    _CallbackHandler.code = None
    server = HTTPServer(("localhost", CALLBACK_PORT), _CallbackHandler)
    server.handle_request()

    code = _CallbackHandler.code
    if not code:
        raise RuntimeError("Autorização negada ou cancelada.")

    print("Autorizado! Buscando contas...")
    short_token = _exchange_code(code, app_id, app_secret)
    long_token = _exchange_long_lived(short_token, app_id, app_secret)
    return _list_instagram_accounts(long_token)


def _exchange_code(code: str, app_id: str, app_secret: str) -> str:
    resp = requests.get(f"{GRAPH}/oauth/access_token", params={
        "client_id": app_id,
        "client_secret": app_secret,
        "redirect_uri": REDIRECT_URI,
        "code": code,
    })
    _check(resp)
    return resp.json()["access_token"]


def _exchange_long_lived(short_token: str, app_id: str, app_secret: str) -> str:
    resp = requests.get(f"{GRAPH}/oauth/access_token", params={
        "grant_type": "fb_exchange_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "fb_exchange_token": short_token,
    })
    _check(resp)
    return resp.json()["access_token"]


def _list_instagram_accounts(user_token: str) -> list[InstagramAccount]:
    resp = requests.get(f"{GRAPH}/me/accounts", params={
        "fields": "id,name,access_token,instagram_business_account",
        "access_token": user_token,
    })
    _check(resp)

    accounts = []
    for page in resp.json().get("data", []):
        ig = page.get("instagram_business_account")
        if ig:
            accounts.append(InstagramAccount(
                page_id=page["id"],
                page_name=page["name"],
                instagram_id=ig["id"],
                page_access_token=page["access_token"],
            ))
    return accounts


def _check(resp: requests.Response) -> None:
    if not resp.ok:
        error = resp.json().get("error", {})
        raise RuntimeError(f"Facebook API erro: {error.get('message', resp.text)}")
