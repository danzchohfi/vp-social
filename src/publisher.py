import logging
from collections import defaultdict
from .notion_client import NotionReader, NotionPost
from .instagram_client import InstagramPublisher
from .client_config import ClientConfig, load_all_clients, find_client_by_conta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


class Publisher:
    def __init__(self):
        self.notion = NotionReader()

    def run(self, conta: str | None = None) -> dict:
        """Publica posts de todas as contas ativas, ou de uma conta específica."""
        posts = self.notion.get_ready_posts(conta=conta)

        if not posts:
            logger.info("Nenhum post com status 'Agendamento'.")
            return {"published": 0, "failed": 0, "skipped": 0}

        # Agrupa posts por conta
        by_conta: dict[str, list[NotionPost]] = defaultdict(list)
        for post in posts:
            by_conta[post.conta].append(post)

        total = {"published": 0, "failed": 0, "skipped": 0}

        for conta_name, conta_posts in by_conta.items():
            client = find_client_by_conta(conta_name)
            if not client:
                logger.warning(f"Conta '{conta_name}' não tem configuração — posts ignorados.")
                total["skipped"] += len(conta_posts)
                continue
            if not client.active:
                logger.info(f"Conta '{conta_name}' está inativa — pulando.")
                total["skipped"] += len(conta_posts)
                continue

            instagram = InstagramPublisher(client)
            for post in conta_posts:
                result = self._process_post(post, instagram, conta_name)
                total[result] += 1

        logger.info(
            f"Concluído: {total['published']} publicados, "
            f"{total['failed']} com erro, {total['skipped']} ignorados."
        )
        return total

    def _process_post(self, post: NotionPost, instagram: InstagramPublisher, conta: str) -> str:
        logger.info(f"[{conta}] Processando: '{post.title}'")

        if not post.vertical_urls:
            logger.warning(f"[{conta}] '{post.title}' sem Mídia Vertical — ignorado.")
            return "skipped"

        try:
            if post.is_carousel:
                pub_id = instagram.publish_carousel(post.vertical_urls, post.caption)
            else:
                pub_id = instagram.publish_single(post.vertical_urls[0], post.caption)
            self.notion.mark_as_published(post.page_id)
            logger.info(f"[{conta}] Publicado! ID Instagram: {pub_id}")
            return "published"
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[{conta}] Erro: {error_msg}")
            self.notion.mark_as_failed(post.page_id, error_msg)
            return "failed"
