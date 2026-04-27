#!/usr/bin/env python3
"""
Gerenciador de contas — adicione, liste e remova contas de clientes.

Uso:
  python manage.py add       Adiciona uma nova conta
  python manage.py list      Lista todas as contas
  python manage.py remove    Remove uma conta
  python manage.py disable   Desativa uma conta (sem deletar)
  python manage.py enable    Reativa uma conta
"""

import sys
from dotenv import load_dotenv

load_dotenv()

from src.client_config import ClientConfig, load_all_clients, find_client_by_conta


def cmd_add():
    print("\n=== Adicionar nova conta ===\n")
    print("O valor de 'Conta' deve ser idêntico ao que está no Notion.\n")
    conta = input("Conta (valor exato do Notion): ").strip()
    if not conta:
        print("Conta obrigatória.")
        return

    if find_client_by_conta(conta):
        print(f"Conta '{conta}' já existe.")
        return

    ig_account = input("Instagram Business Account ID: ").strip()
    fb_token = input("Facebook Access Token: ").strip()

    client = ClientConfig(
        conta=conta,
        instagram_business_account_id=ig_account,
        facebook_access_token=fb_token,
    )
    client.save()
    print(f"\n✓ Conta '{conta}' adicionada! Arquivo: {client.file_path}")


def cmd_list():
    clients = load_all_clients(active_only=False)
    if not clients:
        print("Nenhuma conta cadastrada.")
        return

    print(f"\n{'#':<4} {'Conta (Notion)':<35} {'Status'}")
    print("-" * 55)
    for i, c in enumerate(clients, 1):
        status = "Ativa" if c.active else "Inativa"
        print(f"{i:<4} {c.conta:<35} {status}")
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


COMMANDS = {"add": cmd_add, "list": cmd_list, "remove": cmd_remove, "disable": cmd_disable, "enable": cmd_enable}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[sys.argv[1]]()


if __name__ == "__main__":
    main()
