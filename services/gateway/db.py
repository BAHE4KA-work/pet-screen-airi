from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Text, Boolean, Integer, Float, DateTime, JSON
from pgvector.sqlalchemy import Vector
from datetime import datetime
from services.shared.config import settings
from services.shared.logger import setup_logger

logger = setup_logger("Gateway-DB")

class Base(DeclarativeBase):
    pass

class ModuleModel(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str] = mapped_column(String(64), default="Box")
    category: Mapped[str] = mapped_column(String(64), default="system")
    version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_core: Mapped[bool] = mapped_column(Boolean, default=False)
    config_schema: Mapped[dict] = mapped_column(JSON, default=dict)
    tool_definition: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ExecutionLogModel(Base):
    __tablename__ = "execution_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    resolved_tool: Mapped[str] = mapped_column(String(128), nullable=True)
    arguments: Mapped[dict] = mapped_column(JSON, default=dict)
    result_data: Mapped[dict] = mapped_column(JSON, default=dict)
    model_source: Mapped[str] = mapped_column(String(128), default="llm_worker")
    duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

class VectorEmbeddingModel(Base):
    __tablename__ = "vector_embeddings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    embedding = mapped_column(Vector(384)) # Dimension 384 for standard sentence-transformers / bge-small
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

engine = None
async_session_factory = None

async def init_db():
    global engine, async_session_factory
    try:
        engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
        async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        
        async with engine.begin() as conn:
            # Enable pgvector extension if available
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            await conn.run_sync(Base.metadata.create_all)
            
        logger.info("PostgreSQL database with pgvector initialized successfully.")
    except Exception as e:
        logger.warning(f"PostgreSQL connection not available ({e}). Using local in-memory/JSON storage fallback.")

async def get_db_session():
    if async_session_factory:
        async with async_session_factory() as session:
            yield session
    else:
        yield None
