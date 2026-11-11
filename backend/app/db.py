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
    if "profiles" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(profiles)"))}
        if "face_photo_url" not in columns:
            conn.execute(text("ALTER TABLE profiles ADD COLUMN face_photo_url VARCHAR(512)"))


def init_db() -> None:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate(engine)
