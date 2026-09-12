import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    RABBITMQ_URL: str = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/overlay_db")
    
    MODELS_BASE_PATH: str = os.getenv("MODELS_PATH", "/models")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "DEBUG")
    
    # Queue names
    QUEUE_LLM_INBOUND: str = "overlay.tasks.llm.inbound"
    QUEUE_LLM_OUTBOUND: str = "overlay.tasks.llm.outbound"
    QUEUE_STT_INBOUND: str = "overlay.tasks.stt.inbound"
    QUEUE_STT_OUTBOUND: str = "overlay.tasks.stt.outbound"
    QUEUE_EVENTS_BROADCAST: str = "overlay.events.broadcast"
    
    # Defaults
    DEFAULT_LLM_MODEL: str = "functiongemma-7b-tools-v2.1.Q4_K_M.gguf"
    DEFAULT_STT_MODEL: str = "whisper-base-ru.bin"

settings = Settings()
