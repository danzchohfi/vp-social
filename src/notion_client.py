import os
from notion_client import Client
from dataclasses import dataclass
from typing import Optional


@dataclass
class NotionPost:
    page_id: str
    title: str
    conta: str
    caption: str
    vertical_urls: list[str]
    horizontal_urls: list[str]
    scheduled_date: Optional[str] = None

    @property
    def is_carousel(self) -> bool:
        return len(self.vertical_urls) > 1


class NotionReader:
    STATUS_READY = "Agendamento"
    STATUS_PUBLISHED = "Publicado"
    STATUS_ERROR = "Erro"

    def __init__(self):
        api_key = os.getenv("NOTION_API_KEY")
        self.database_id = os.getenv("NOTION_DATABASE_ID")
        if not api_key or not self.database_id:
            raise ValueError("NOTION_API_KEY e NOTION_DATABASE_ID são obrigatórios no .env")
        self.notion = Client(auth=api_key)

    def get_ready_posts(self, conta: str | None = None) -> list[NotionPost]:
        """Busca posts com status 'Agendamento', opcionalmente filtrados por Conta."""
        filters: list[dict] = [
            {"property": "Status", "status": {"equals": self.STATUS_READY}}
        ]
        if conta:
            filters.append({"property": "Conta", "select": {"equals": conta}})

        response = self.notion.databases.query(
            database_id=self.database_id,
            filter={"and": filters},
            sorts=[{"property": "Dia para fazer", "direction": "ascending"}],
        )
        return [self._parse_page(page) for page in response["results"]]

    def mark_as_published(self, page_id: str) -> None:
        self.notion.pages.update(
            page_id=page_id,
            properties={"Status": {"status": {"name": self.STATUS_PUBLISHED}}},
        )

    def mark_as_failed(self, page_id: str, error: str) -> None:
        self.notion.pages.update(
            page_id=page_id,
            properties={"Status": {"status": {"name": self.STATUS_ERROR}}},
        )

    def _parse_page(self, page: dict) -> NotionPost:
        props = page["properties"]
        return NotionPost(
            page_id=page["id"],
            title=self._get_title(props.get("Produção")),
            conta=self._get_select(props.get("Conta")),
            caption=self._get_rich_text(props.get("Legenda")),
            vertical_urls=self._get_files(props.get("Mídia Vertical")),
            horizontal_urls=self._get_files(props.get("Mídia Horizontal")),
            scheduled_date=self._get_date(props.get("Dia para fazer")),
        )

    def _get_title(self, prop: Optional[dict]) -> str:
        if not prop:
            return ""
        return "".join(t.get("plain_text", "") for t in prop.get("title", []))

    def _get_rich_text(self, prop: Optional[dict]) -> str:
        if not prop:
            return ""
        return "".join(t.get("plain_text", "") for t in prop.get("rich_text", []))

    def _get_select(self, prop: Optional[dict]) -> str:
        if not prop:
            return ""
        select = prop.get("select")
        return select.get("name", "") if select else ""

    def _get_date(self, prop: Optional[dict]) -> Optional[str]:
        if not prop:
            return None
        date = prop.get("date")
        return date.get("start") if date else None

    def _get_files(self, prop: Optional[dict]) -> list[str]:
        if not prop:
            return []
        urls = []
        for file in prop.get("files", []):
            if file.get("type") == "external":
                urls.append(file["external"]["url"])
            elif file.get("type") == "file":
                urls.append(file["file"]["url"])
        return urls
