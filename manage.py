#!/usr/bin/env python3
"""
Gerenciador de clientes — adicione, liste e remova contas.

Uso:
  python manage.py add       Adiciona um novo cliente
  python manage.py list      Lista todos os clientes
  python manage.py remove    Remove um cliente
  python manage.py disable   Desativa um cliente (sem deletar)
  python manage.py enable    Reativa um cliente
"""

import sys
import os
from dotenv import load_dotenv

load_dotenv()

from src.client_config import ClientConfig, load_all_clients, find_client


def cmd_add():
    print("\n=== Adicionar novo cliente ===\n")
    name = input("Nome do cliente: ").strip()
    if not name:
        print("Nome obrigatório.")
        return

    if find_client(name):
        print(f"Cliente '{name}' já existe.")
        return

    notion_db = input("Notion Database ID: ").strip()
    ig_account = input("Instagram Business Account ID: ").strip()
    fb_token = input("Facebook Access Token: ").strip()

    client = ClientConfig(
        name=name,
        notion_database_id=notion_db,
        instagram_business_account_id=ig_account,
        facebook_access_token=fb_token,
    )
    client.save()
    print(f"\n✓ Cliente '{name}' adicionado com sucesso!")
    print(f"  Arquivo: {client.file_path}")


def cmd_list():
    clients = load_all_clients(active_only=False)
    if not clients:
        print("Nenhum cliente cadastrado.")
        return

    print(f"\n{'#':<4} {'Nome':<30} {'Status':<10} {'Notion DB'}")
    print("-" * 75)
    for i, c in enumerate(clients, 1):
        status = "Ativo" if c.active else "Inativo"
        db_short = c.notion_database_id[:8] + "..."
        print(f"{i:<4} {c.name:<30} {status:<10} {db_short}")
    print()


def cmd_remove():
    _toggle_client(delete=True)


def cmd_disable():
    _toggle_client(active=False)


def cmd_enable():
    _toggle_client(active=True)


def _toggle_client(active: bool = True, delete: bool = False):
    clients = load_all_clients(active_only=False)
    if not clients:
        print("Nenhum cliente cadastrado.")
        return

    cmd_list()
    name = input("Nome do cliente: ").strip()
    client = find_client(name)

    if not client:
        print(f"Cliente '{name}' não encontrado.")
        return

    if delete:
        confirm = input(f"Deletar '{client.name}'? (s/N): ").strip().lower()
        if confirm == "s":
            client.delete()
            print(f"✓ Cliente '{client.name}' removido.")
    else:
        client.active = active
        client.save()
        state = "ativado" if active else "desativado"
        print(f"✓ Cliente '{client.name}' {state}.")


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
