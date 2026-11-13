from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
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


def _migrate(engine) -> None:
    """Apply additive SQLite column migrations for pre-existing databases."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "wardrobe_items" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("wardrobe_items")}
    if "formality_score" in columns:
        return

    from app.services.vlm import heuristic_formality

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE wardrobe_items ADD COLUMN formality_score INTEGER"))
        rows = connection.execute(
            text("SELECT id, category, style, description FROM wardrobe_items")
        ).mappings()
        for row in rows:
            connection.execute(
                text("UPDATE wardrobe_items SET formality_score = :score WHERE id = :item_id"),
                {
                    "score": heuristic_formality(row["style"], row["category"], row["description"]),
                    "item_id": row["id"],
                },
            )


def init_db() -> None:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate(engine)
