#!/usr/bin/env python3
"""Exibe as propriedades do banco de dados do Notion."""

import os
from dotenv import load_dotenv
from notion_client import Client

load_dotenv()

client = Client(auth=os.getenv("NOTION_API_KEY"))
db = client.databases.retrieve(os.getenv("NOTION_DATABASE_ID"))

title = "".join(t.get("plain_text", "") for t in db.get("title", []))
print(f"Banco: {title}\n")
print("Propriedades:")
for name, prop in db["properties"].items():
    print(f"  - {name!r:35} tipo: {prop['type']}")
