#!/usr/bin/env python3
"""
Notion → Instagram Publisher

Uso:
  python main.py                           Publica todas as contas ativas
  python main.py --conta "Nome da Conta"  Publica uma conta específica
  python main.py --schedule 60            Executa em loop a cada 60 minutos
"""

import sys
import argparse
import schedule
import time
from dotenv import load_dotenv

load_dotenv()

from src.publisher import Publisher


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--conta", metavar="NOME", help="Publica apenas essa conta do Notion")
    parser.add_argument("--schedule", type=int, metavar="MINUTOS", help="Executa em loop a cada N minutos")
    args = parser.parse_args()

    publisher = Publisher()

    if args.schedule:
        print(f"Agendamento ativo: verificando a cada {args.schedule} minutos.")
        schedule.every(args.schedule).minutes.do(lambda: publisher.run(conta=args.conta))
        publisher.run(conta=args.conta)
        while True:
            schedule.run_pending()
            time.sleep(30)
    else:
        results = publisher.run(conta=args.conta)
        sys.exit(0 if results["failed"] == 0 else 1)


if __name__ == "__main__":
    main()
