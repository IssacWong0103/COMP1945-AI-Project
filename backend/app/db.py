from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_OUTFIT_TRYON_COLUMNS = {
    "try_on_result_kind": "VARCHAR(16)",
    "try_on_fallback_reason": "VARCHAR(32)",
    "try_on_detail": "TEXT",
    "try_on_style_reference_url": "VARCHAR(1024)",
}


def ensure_outfit_tryon_columns(bind: Engine | None = None) -> None:
    """Add try-on contract columns on databases created before resultKind was stored."""
    target = bind or engine
    insp = inspect(target)
    if not insp.has_table("outfits"):
        return
    existing = {column["name"] for column in insp.get_columns("outfits")}
    pending = {
        name: ddl for name, ddl in _OUTFIT_TRYON_COLUMNS.items() if name not in existing
    }
    if not pending:
        return
    with target.begin() as conn:
        for name, ddl in pending.items():
            conn.execute(text(f"ALTER TABLE outfits ADD COLUMN {name} {ddl}"))


def init_db() -> None:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    ensure_outfit_tryon_columns(engine)
