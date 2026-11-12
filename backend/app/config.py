from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

BACKEND_ROOT = Path(__file__).resolve().parent.parent
CORS_ORIGINS = (
    "http://localhost:1945",
    "http://127.0.0.1:1945",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    deepseek_api_key: str = ""
    kie_api_key: str = ""
    public_base_url: str = ""
    fashion_captions_path: str = ""
    fashion_images_root: str = ""
    fashion_visual_rerank: bool = True
    fashion_visual_rerank_max: int = 1
    fashion_pass_model_reference: bool = True

    @property
    def db_path(self) -> Path:
        return BACKEND_ROOT / "data" / "ustyle.db"

    @property
    def database_url(self) -> str:
        return URL.create("sqlite", database=str(self.db_path)).render_as_string(
            hide_password=False
        )

    @property
    def uploads_dir(self) -> Path:
        return BACKEND_ROOT / "uploads"

    @property
    def reference_outfits_path(self) -> Path:
        return Path(__file__).resolve().parent / "data" / "reference_outfits.json"

    @property
    def fashion_captions_file(self) -> Path:
        if self.fashion_captions_path.strip():
            return Path(self.fashion_captions_path.strip()).expanduser()
        return Path(__file__).resolve().parent / "data" / "captions.jsonl"

    @property
    def fashion_images_root_dir(self) -> Path | None:
        if self.fashion_images_root.strip():
            return Path(self.fashion_images_root.strip()).expanduser()
        default = Path.home() / "Desktop/COMP1945/Project/Fashion DB - Sorted"
        return default if default.is_dir() else None

    def normalized_public_base_url(self) -> str:
        return self.public_base_url.strip().rstrip("/")

    def public_uploads_reachable(self) -> bool:
        """kie.ai can only fetch images from a non-loopback HTTPS/HTTP origin."""
        base = self.normalized_public_base_url()
        if not base:
            return False
        host = (urlparse(base).hostname or "").lower()
        if not host or host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
            return False
        return True


settings = Settings()
