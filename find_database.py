#!/usr/bin/env python3
"""Encontra o ID do banco de dados no Notion pelo nome."""

import os
from dotenv import load_dotenv
from notion_client import Client

load_dotenv()

client = Client(auth=os.getenv("NOTION_API_KEY"))

response = client.search(
    query="Produção Vitamina",
    filter={"value": "database", "property": "object"},
)

if not response["results"]:
    print("Nenhum banco encontrado. Verifique se a integração tem acesso ao banco.")
else:
    for db in response["results"]:
        title = db.get("title", [])
        name = "".join(t.get("plain_text", "") for t in title)
        print(f"Nome: {name}")
        print(f"ID:   {db['id']}")
        print()
