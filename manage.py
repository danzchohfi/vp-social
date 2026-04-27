#!/usr/bin/env python3
"""
Gerenciador de contas — adicione, liste e remova contas de clientes.

Uso:
  python manage.py add       Adiciona uma nova conta via login com Facebook
  python manage.py list      Lista todas as contas
  python manage.py remove    Remove uma conta
  python manage.py disable   Desativa uma conta (sem deletar)
  python manage.py enable    Reativa uma conta
"""

import sys
from dotenv import load_dotenv

load_dotenv()

from src.client_config import ClientConfig, load_all_clients, find_client_by_conta
from src.oauth import run_oauth_flow


def cmd_add():
    print("\n=== Adicionar nova conta ===")
    print("Você será redirecionado para o Facebook para autorizar o acesso.\n")

    try:
        accounts = run_oauth_flow()
    except Exception as e:
        print(f"\nErro no login: {e}")
        return

    if not accounts:
        print("\nNenhuma conta do Instagram Business encontrada.")
        print("Verifique se sua Página do Facebook está conectada a uma conta Instagram Business.")
        return

    print("\nContas Instagram encontradas:\n")
    for i, acc in enumerate(accounts, 1):
        print(f"  {i}. {acc.page_name} (Instagram ID: {acc.instagram_id})")

    print()
    while True:
        try:
            choice = int(input("Escolha o número da conta: ")) - 1
            if 0 <= choice < len(accounts):
                break
            print(f"Digite um número entre 1 e {len(accounts)}.")
        except ValueError:
            print("Digite um número válido.")

    selected = accounts[choice]

    conta = input(f"\nNome da Conta no Notion (valor exato da propriedade 'Conta')\n"
                  f"[Enter para usar '{selected.page_name}']: ").strip()
    if not conta:
        conta = selected.page_name

    if find_client_by_conta(conta):
        overwrite = input(f"Conta '{conta}' já existe. Sobrescrever? (s/N): ").strip().lower()
        if overwrite != "s":
            return

    client = ClientConfig(
        conta=conta,
        instagram_business_account_id=selected.instagram_id,
        facebook_access_token=selected.page_access_token,
    )
    client.save()
    print(f"\n✓ Conta '{conta}' adicionada com sucesso!")


def cmd_list():
    clients = load_all_clients(active_only=False)
    if not clients:
        print("Nenhuma conta cadastrada. Use 'python manage.py add'.")
        return

    print(f"\n{'#':<4} {'Conta (Notion)':<35} {'Instagram ID':<22} {'Status'}")
    print("-" * 72)
    for i, c in enumerate(clients, 1):
        status = "Ativa" if c.active else "Inativa"
        print(f"{i:<4} {c.conta:<35} {c.instagram_business_account_id:<22} {status}")
    print()


def cmd_remove():
    _toggle(delete=True)


def cmd_disable():
    _toggle(active=False)


def cmd_enable():
    _toggle(active=True)


def _toggle(active: bool = True, delete: bool = False):
    clients = load_all_clients(active_only=False)
    if not clients:
        print("Nenhuma conta cadastrada.")
        return

    cmd_list()
    conta = input("Conta: ").strip()
    client = find_client_by_conta(conta)

    if not client:
        print(f"Conta '{conta}' não encontrada.")
        return

    if delete:
        confirm = input(f"Deletar '{client.conta}'? (s/N): ").strip().lower()
        if confirm == "s":
            client.delete()
            print(f"✓ Conta '{client.conta}' removida.")
    else:
        client.active = active
        client.save()
        print(f"✓ Conta '{client.conta}' {'ativada' if active else 'desativada'}.")


COMMANDS = {
    "add": cmd_add,
    "list": cmd_list,
    "remove": cmd_remove,
    "disable": cmd_disable,
    "enable": cmd_enable,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[sys.argv[1]]()


if __name__ == "__main__":
    main()
