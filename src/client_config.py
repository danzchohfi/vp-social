import json
import re
from dataclasses import dataclass
from pathlib import Path

CLIENTS_DIR = Path(__file__).parent.parent / "clients"


@dataclass
class ClientConfig:
    conta: str  # valor exato da propriedade "Conta" no Notion
    instagram_business_account_id: str
    facebook_access_token: str
    active: bool = True

    @property
    def slug(self) -> str:
        return re.sub(r"[^a-z0-9]+", "-", self.conta.lower()).strip("-")

    @property
    def file_path(self) -> Path:
        return CLIENTS_DIR / f"{self.slug}.json"

    def save(self) -> None:
        CLIENTS_DIR.mkdir(exist_ok=True)
        self.file_path.write_text(
            json.dumps(self.__dict__, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> "ClientConfig":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(**data)

    def delete(self) -> None:
        self.file_path.unlink(missing_ok=True)


def load_all_clients(active_only: bool = True) -> list[ClientConfig]:
    if not CLIENTS_DIR.exists():
        return []
    clients = [ClientConfig.load(f) for f in sorted(CLIENTS_DIR.glob("*.json"))]
    return [c for c in clients if c.active] if active_only else clients


def find_client_by_conta(conta: str) -> ClientConfig | None:
    for client in load_all_clients(active_only=False):
        if client.conta.lower() == conta.lower():
            return client
    return None
