#!/usr/bin/env python3
"""
Notion → Instagram Publisher
Publica automaticamente conteúdo do Notion no Instagram.
"""

import os
import sys
import argparse
import schedule
import time
from dotenv import load_dotenv

load_dotenv()

from src.publisher import NotionToInstagram


def run_once():
    publisher = NotionToInstagram()
    results = publisher.run()
    return results["failed"] == 0


def run_scheduled(interval_minutes: int):
    print(f"Agendamento ativo: verificando a cada {interval_minutes} minutos.")
    publisher = NotionToInstagram()

    def job():
        publisher.run()

    schedule.every(interval_minutes).minutes.do(job)
    job()  # executa imediatamente na primeira vez

    while True:
        schedule.run_pending()
        time.sleep(30)


def main():
    parser = argparse.ArgumentParser(
        description="Publica conteúdo do Notion no Instagram."
    )
    parser.add_argument(
        "--schedule",
        type=int,
        metavar="MINUTOS",
        help="Executa em loop a cada N minutos (ex: --schedule 60)",
    )
    args = parser.parse_args()

    if args.schedule:
        run_scheduled(args.schedule)
    else:
        success = run_once()
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
