#!/usr/bin/env python3
"""
Notion → Instagram Publisher
Publica automaticamente conteúdo do Notion no Instagram para todos os clientes.

Uso:
  python main.py                              Publica para todos os clientes ativos
  python main.py --client "Nome do cliente"  Publica para um cliente específico
  python main.py --schedule 60               Executa em loop a cada 60 minutos
"""

import sys
import argparse
import schedule
import time
from dotenv import load_dotenv

load_dotenv()

from src.publisher import NotionToInstagram
from src.client_config import load_all_clients, find_client


def run_for_clients(clients):
    if not clients:
        print("Nenhum cliente ativo encontrado. Use 'python manage.py add' para adicionar.")
        return True

    total = {"published": 0, "failed": 0, "skipped": 0}
    for client in clients:
        results = NotionToInstagram(client).run()
        for k in total:
            total[k] += results[k]

    return total["failed"] == 0


def run_once(client_name: str | None = None):
    if client_name:
        client = find_client(client_name)
        if not client:
            print(f"Cliente '{client_name}' não encontrado. Use 'python manage.py list'.")
            sys.exit(1)
        clients = [client]
    else:
        clients = load_all_clients()

    return run_for_clients(clients)


def run_scheduled(interval_minutes: int, client_name: str | None = None):
    print(f"Agendamento ativo: verificando a cada {interval_minutes} minutos.")

    def job():
        if client_name:
            client = find_client(client_name)
            clients = [client] if client else []
        else:
            clients = load_all_clients()
        run_for_clients(clients)

    schedule.every(interval_minutes).minutes.do(job)
    job()

    while True:
        schedule.run_pending()
        time.sleep(30)


def main():
    parser = argparse.ArgumentParser(description="Publica conteúdo do Notion no Instagram.")
    parser.add_argument("--client", metavar="NOME", help="Nome do cliente específico")
    parser.add_argument("--schedule", type=int, metavar="MINUTOS", help="Executa em loop a cada N minutos")
    args = parser.parse_args()

    if args.schedule:
        run_scheduled(args.schedule, args.client)
    else:
        success = run_once(args.client)
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
