"""
Fluxo OAuth do Facebook para obter tokens de acesso às páginas e contas Instagram.
Abre o navegador para autorização e extrai o código da URL de retorno colada pelo usuário.
"""

import os
import webbrowser
import requests
from urllib.parse import urlparse, parse_qs
from dataclasses import dataclass

GRAPH = "https://graph.facebook.com/v19.0"
REDIRECT_URI = "https://www.facebook.com/connect/login_success.html"
SCOPES = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement"


@dataclass
class InstagramAccount:
    page_id: str
    page_name: str
    instagram_id: str
    page_access_token: str


def run_oauth_flow() -> list[InstagramAccount]:
    """
    Executa o fluxo OAuth completo e retorna as contas Instagram disponíveis.
    Não requer configuração de redirect URI — usa a URL de sucesso padrão do Facebook.
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

    print("\n" + "=" * 60)
    print("PASSO 1: Abra esta URL no navegador e faça login:")
    print("=" * 60)
    print(f"\n{auth_url}\n")
    webbrowser.open(auth_url)

    print("=" * 60)
    print("PASSO 2: Após autorizar, o navegador vai abrir uma")
    print("página em branco. Copie a URL completa da barra de")
    print("endereços e cole aqui:")
    print("=" * 60)
    callback_url = input("\nURL de retorno: ").strip()

    code = _extract_code(callback_url)
    if not code:
        raise RuntimeError(
            "Não foi possível extrair o código da URL. "
            "Certifique-se de copiar a URL completa após o login."
        )

    print("\nAutorizando... aguarde.")
    short_token = _exchange_code(code, app_id, app_secret)
    long_token = _exchange_long_lived(short_token, app_id, app_secret)
    accounts = _list_instagram_accounts(long_token)

    return accounts


def _extract_code(url: str) -> str | None:
    try:
        params = parse_qs(urlparse(url).query)
        return params.get("code", [None])[0]
    except Exception:
        return None


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
    pages = resp.json().get("data", [])

    accounts = []
    for page in pages:
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
