import sys
from loguru import logger
import os

def setup_logger(service_name: str, log_level: str = "INFO"):
    logger.remove()
    
    # Standard format with colors
    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        f"<cyan>{service_name}</cyan>:<cyan>{{name}}</cyan>:<cyan>{{line}}</cyan> - "
        "<level>{message}</level>"
    )
    
    logger.add(
        sys.stdout,
        format=log_format,
        level=os.getenv("LOG_LEVEL", log_level),
        colorize=True
    )
    
    # Optional file logging
    log_dir = os.getenv("LOG_DIR", "/app/logs")
    if os.path.exists(log_dir) or os.getenv("ENABLE_FILE_LOGGING") == "true":
        try:
            os.makedirs(log_dir, exist_ok=True)
            logger.add(
                f"{log_dir}/{service_name}.log",
                rotation="50 MB",
                retention="10 days",
                format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{line} - {message}",
                level="DEBUG"
            )
        except Exception as e:
            logger.warning(f"Could not initialize file logger: {e}")
            
    return logger
