import os
from notion_client import Client
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class NotionPost:
    page_id: str
    title: str
    caption: str
    image_urls: list[str]
    hashtags: str
    status: str
    scheduled_date: Optional[str] = None

    @property
    def full_caption(self) -> str:
        parts = [self.caption]
        if self.hashtags:
            parts.append(self.hashtags)
        return "\n\n".join(filter(None, parts))

    @property
    def is_carousel(self) -> bool:
        return len(self.image_urls) > 1


class NotionReader:
    def __init__(self):
        api_key = os.getenv("NOTION_API_KEY")
        self.database_id = os.getenv("NOTION_DATABASE_ID")
        if not api_key or not self.database_id:
            raise ValueError("NOTION_API_KEY e NOTION_DATABASE_ID são obrigatórios")
        self.client = Client(auth=api_key)

    def get_ready_posts(self) -> list[NotionPost]:
        """Busca posts com status 'Pronto para publicar' no banco do Notion."""
        response = self.client.databases.query(
            database_id=self.database_id,
            filter={
                "property": "Status",
                "select": {"equals": "Pronto para publicar"},
            },
            sorts=[{"property": "Data de publicação", "direction": "ascending"}],
        )
        return [self._parse_page(page) for page in response["results"]]

    def mark_as_published(self, page_id: str) -> None:
        """Atualiza o status do post para 'Publicado'."""
        self.client.pages.update(
            page_id=page_id,
            properties={"Status": {"select": {"name": "Publicado"}}},
        )

    def mark_as_failed(self, page_id: str, error: str) -> None:
        """Atualiza o status do post para 'Erro' e registra a mensagem."""
        self.client.pages.update(
            page_id=page_id,
            properties={
                "Status": {"select": {"name": "Erro"}},
                "Erro": {"rich_text": [{"text": {"content": error[:2000]}}]},
            },
        )

    def _parse_page(self, page: dict) -> NotionPost:
        props = page["properties"]

        title = self._get_title(props.get("Nome") or props.get("Title") or props.get("Título"))
        caption = self._get_rich_text(props.get("Legenda") or props.get("Caption"))
        hashtags = self._get_rich_text(props.get("Hashtags"))
        status = self._get_select(props.get("Status"))
        scheduled_date = self._get_date(props.get("Data de publicação"))
        image_urls = self._get_files(props.get("Imagens") or props.get("Imagem"))

        return NotionPost(
            page_id=page["id"],
            title=title,
            caption=caption,
            image_urls=image_urls,
            hashtags=hashtags,
            status=status,
            scheduled_date=scheduled_date,
        )

    def _get_title(self, prop: Optional[dict]) -> str:
        if not prop:
            return ""
        content = prop.get("title", [])
        return "".join(t.get("plain_text", "") for t in content)

    def _get_rich_text(self, prop: Optional[dict]) -> str:
        if not prop:
            return ""
        content = prop.get("rich_text", [])
        return "".join(t.get("plain_text", "") for t in content)

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
