import logging
from .notion_client import NotionReader, NotionPost
from .instagram_client import InstagramPublisher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


class NotionToInstagram:
    def __init__(self):
        self.notion = NotionReader()
        self.instagram = InstagramPublisher()

    def run(self) -> dict:
        """Busca posts prontos no Notion e publica no Instagram."""
        posts = self.notion.get_ready_posts()

        if not posts:
            logger.info("Nenhum post pronto para publicar.")
            return {"published": 0, "failed": 0, "skipped": 0}

        results = {"published": 0, "failed": 0, "skipped": 0}

        for post in posts:
            result = self._process_post(post)
            results[result] += 1

        logger.info(
            f"Concluído: {results['published']} publicados, "
            f"{results['failed']} com erro, {results['skipped']} ignorados."
        )
        return results

    def _process_post(self, post: NotionPost) -> str:
        logger.info(f"Processando: '{post.title}' (ID: {post.page_id})")

        if not post.image_urls:
            logger.warning(f"Post '{post.title}' sem imagens — ignorado.")
            return "skipped"

        try:
            publication_id = self._publish(post)
            self.notion.mark_as_published(post.page_id)
            logger.info(f"Publicado com sucesso! ID Instagram: {publication_id}")
            return "published"
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Erro ao publicar '{post.title}': {error_msg}")
            self.notion.mark_as_failed(post.page_id, error_msg)
            return "failed"

    def _publish(self, post: NotionPost) -> str:
        caption = post.full_caption
        if post.is_carousel:
            logger.info(f"Publicando carrossel com {len(post.image_urls)} imagens...")
            return self.instagram.publish_carousel(post.image_urls, caption)
        else:
            logger.info("Publicando imagem única...")
            return self.instagram.publish_single(post.image_urls[0], caption)
