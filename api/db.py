"""SQLAlchemy persistence for projects and the global daily registration budget."""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Integer, JSON, String, Text, create_engine, func, select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from config import get_settings

def _sqlalchemy_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


_database_url = _sqlalchemy_database_url(get_settings().database_url)
_connect_args: dict[str, Any] = {}
_engine_options: dict[str, Any] = {"pool_pre_ping": True}
if _database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
    if _database_url in {"sqlite://", "sqlite:///:memory:"}:
        _engine_options["poolclass"] = StaticPool

engine = create_engine(
    _database_url,
    connect_args=_connect_args,
    **_engine_options,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    polygon_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    polygon_wkt: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String(64))
    claimed_hectares: Mapped[float]
    score: Mapped[int] = mapped_column(Integer)
    breakdown: Mapped[dict[str, float]] = mapped_column(JSON)
    ndvi_series: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    flags: Mapped[list[str]] = mapped_column(JSON)
    evidence_hash: Mapped[str] = mapped_column(String(66))
    evidence_uri: Mapped[str] = mapped_column(String(512))
    explanation: Mapped[str] = mapped_column(String(400))
    status: Mapped[str] = mapped_column(String(20))
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    data_source: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    public_result: Mapped[dict[str, Any]] = mapped_column(JSON)


class DailyRegistration(Base):
    __tablename__ = "daily_registrations"

    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class RegistryStats(Base):
    __tablename__ = "registry_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    duplicates_blocked: Mapped[int] = mapped_column(Integer, default=0)


def create_schema() -> None:
    Base.metadata.create_all(engine)


def get_db() -> Generator[Session, None, None]:
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()


def reserve_registration(database: Session, daily_cap: int) -> bool:
    day = datetime.now(timezone.utc).date().isoformat()
    table = DailyRegistration.__table__
    if engine.dialect.name == "sqlite":
        statement = sqlite_insert(DailyRegistration).values(day=day, count=1)
        statement = statement.on_conflict_do_update(
            index_elements=[table.c.day],
            set_={"count": table.c.count + 1},
            where=table.c.count < daily_cap,
        )
    elif engine.dialect.name == "postgresql":
        statement = postgresql_insert(DailyRegistration).values(day=day, count=1)
        statement = statement.on_conflict_do_update(
            index_elements=[table.c.day],
            set_={"count": table.c.count + 1},
            where=table.c.count < daily_cap,
        )
    else:
        raise RuntimeError("Unsupported database dialect for registration reservations.")
    result = database.execute(statement.returning(table.c.count)).scalar_one_or_none()
    database.commit()
    return result is not None


def release_registration(database: Session) -> None:
    day = datetime.now(timezone.utc).date().isoformat()
    database.execute(
        update(DailyRegistration)
        .where(DailyRegistration.day == day, DailyRegistration.count > 0)
        .values(count=DailyRegistration.count - 1)
    )
    database.commit()


def get_project(database: Session, project_id: str) -> Project | None:
    return database.get(Project, project_id)


def get_project_by_hash(database: Session, polygon_hash: str) -> Project | None:
    return database.scalar(
        select(Project).where(Project.polygon_hash == polygon_hash)
    )


def list_projects(database: Session, limit: int, offset: int) -> list[Project]:
    statement = (
        select(Project)
        .order_by(Project.created_at.desc(), Project.id)
        .limit(limit)
        .offset(offset)
    )
    return list(database.scalars(statement))


def count_projects(database: Session) -> int:
    return int(database.scalar(select(func.count(Project.id))) or 0)


def get_polygon_records(database: Session) -> list[tuple[str, str]]:
    return list(
        database.execute(
            select(Project.id, Project.polygon_wkt).where(Project.status == "verified")
        ).tuples()
    )


def record_blocked_duplicate(database: Session) -> None:
    table = RegistryStats.__table__
    if engine.dialect.name == "sqlite":
        insert = sqlite_insert(RegistryStats)
    elif engine.dialect.name == "postgresql":
        insert = postgresql_insert(RegistryStats)
    else:
        raise RuntimeError("Unsupported database dialect for registry statistics.")
    statement = insert.values(id=1, duplicates_blocked=1).on_conflict_do_update(
        index_elements=[table.c.id],
        set_={"duplicates_blocked": table.c.duplicates_blocked + 1},
    )
    database.execute(statement)
    database.commit()


def get_registry_stats(database: Session) -> dict[str, int]:
    verified = database.execute(
        select(Project.claimed_hectares, Project.score).where(Project.status == "verified")
    )
    credits_minted = sum(
        min(1_000_000, max(1, round(hectares * score / 100)))
        for hectares, score in verified
    )
    duplicates_blocked = database.scalar(
        select(RegistryStats.duplicates_blocked).where(RegistryStats.id == 1)
    ) or 0
    verified_count = database.scalar(
        select(func.count(Project.id)).where(Project.status == "verified")
    )
    return {
        "verified_count": int(verified_count or 0),
        "credits_minted": credits_minted,
        "duplicates_blocked": int(duplicates_blocked),
    }


def save_project(database: Session, values: dict[str, Any]) -> Project:
    project = Project(**values)
    database.add(project)
    database.commit()
    database.refresh(project)
    return project
