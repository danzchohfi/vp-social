import os
import time
import requests


GRAPH_API_BASE = "https://graph.facebook.com/v19.0"


class InstagramPublisher:
    def __init__(self):
        self.account_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID")
        self.access_token = os.getenv("FACEBOOK_ACCESS_TOKEN")
        if not self.account_id or not self.access_token:
            raise ValueError(
                "INSTAGRAM_BUSINESS_ACCOUNT_ID e FACEBOOK_ACCESS_TOKEN são obrigatórios"
            )

    def publish_single(self, image_url: str, caption: str) -> str:
        """Publica uma imagem única e retorna o ID da publicação."""
        container_id = self._create_image_container(image_url, caption)
        self._wait_for_container(container_id)
        return self._publish_container(container_id)

    def publish_carousel(self, image_urls: list[str], caption: str) -> str:
        """Publica um carrossel de imagens e retorna o ID da publicação."""
        if len(image_urls) < 2 or len(image_urls) > 10:
            raise ValueError("Carrossel requer entre 2 e 10 imagens")

        children_ids = []
        for url in image_urls:
            child_id = self._create_carousel_item(url)
            self._wait_for_container(child_id)
            children_ids.append(child_id)

        carousel_id = self._create_carousel_container(children_ids, caption)
        self._wait_for_container(carousel_id)
        return self._publish_container(carousel_id)

    def _create_image_container(self, image_url: str, caption: str) -> str:
        response = self._post(
            f"/{self.account_id}/media",
            {"image_url": image_url, "caption": caption},
        )
        return response["id"]

    def _create_carousel_item(self, image_url: str) -> str:
        response = self._post(
            f"/{self.account_id}/media",
            {"image_url": image_url, "is_carousel_item": True},
        )
        return response["id"]

    def _create_carousel_container(self, children_ids: list[str], caption: str) -> str:
        response = self._post(
            f"/{self.account_id}/media",
            {
                "media_type": "CAROUSEL",
                "children": ",".join(children_ids),
                "caption": caption,
            },
        )
        return response["id"]

    def _publish_container(self, container_id: str) -> str:
        response = self._post(
            f"/{self.account_id}/media_publish",
            {"creation_id": container_id},
        )
        return response["id"]

    def _wait_for_container(self, container_id: str, max_attempts: int = 10) -> None:
        """Aguarda o container ficar pronto para publicação."""
        for attempt in range(max_attempts):
            status = self._get_container_status(container_id)
            if status == "FINISHED":
                return
            if status == "ERROR":
                raise RuntimeError(f"Erro ao processar container {container_id}")
            time.sleep(3 * (attempt + 1))
        raise TimeoutError(f"Container {container_id} não ficou pronto após {max_attempts} tentativas")

    def _get_container_status(self, container_id: str) -> str:
        response = requests.get(
            f"{GRAPH_API_BASE}/{container_id}",
            params={"fields": "status_code", "access_token": self.access_token},
        )
        self._check_response(response)
        return response.json().get("status_code", "")

    def _post(self, path: str, data: dict) -> dict:
        response = requests.post(
            f"{GRAPH_API_BASE}{path}",
            data={**data, "access_token": self.access_token},
        )
        self._check_response(response)
        return response.json()

    def _check_response(self, response: requests.Response) -> None:
        if not response.ok:
            error = response.json().get("error", {})
            raise RuntimeError(
                f"Instagram API erro {response.status_code}: "
                f"{error.get('message', response.text)}"
            )
