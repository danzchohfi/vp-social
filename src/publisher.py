import logging
from .notion_client import NotionReader, NotionPost
from .instagram_client import InstagramPublisher
from .client_config import ClientConfig

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


class NotionToInstagram:
    def __init__(self, client: ClientConfig):
        self.client = client
        self.notion = NotionReader(client)
        self.instagram = InstagramPublisher(client)

    def run(self) -> dict:
        logger.info(f"[{self.client.name}] Buscando posts agendados...")
        posts = self.notion.get_ready_posts()

        if not posts:
            logger.info(f"[{self.client.name}] Nenhum post com status 'Agendamento'.")
            return {"published": 0, "failed": 0, "skipped": 0}

        results = {"published": 0, "failed": 0, "skipped": 0}
        for post in posts:
            results[self._process_post(post)] += 1

        logger.info(
            f"[{self.client.name}] Concluído: {results['published']} publicados, "
            f"{results['failed']} com erro, {results['skipped']} ignorados."
        )
        return results

    def _process_post(self, post: NotionPost) -> str:
        logger.info(f"[{self.client.name}] Processando: '{post.title}'")

        if not post.vertical_urls:
            logger.warning(f"[{self.client.name}] '{post.title}' sem Mídia Vertical — ignorado.")
            return "skipped"

        try:
            pub_id = self._publish(post)
            self.notion.mark_as_published(post.page_id)
            logger.info(f"[{self.client.name}] Publicado! ID Instagram: {pub_id}")
            return "published"
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[{self.client.name}] Erro: {error_msg}")
            self.notion.mark_as_failed(post.page_id, error_msg)
            return "failed"

    def _publish(self, post: NotionPost) -> str:
        if post.is_carousel:
            logger.info(f"[{self.client.name}] Carrossel com {len(post.vertical_urls)} imagens...")
            return self.instagram.publish_carousel(post.vertical_urls, post.caption)
        else:
            logger.info(f"[{self.client.name}] Imagem única...")
            return self.instagram.publish_single(post.vertical_urls[0], post.caption)
