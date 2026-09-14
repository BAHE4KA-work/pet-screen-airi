import asyncio
import os
import time
import json
from faststream import FastStream
from faststream.rabbit import RabbitBroker
from services.shared.config import settings
from services.shared.logger import setup_logger
from services.shared.schemas import LLMInferenceRequest, LLMInferenceResponse, ModelLoadRequest, ModelRuntimeStatus
from services.llm_worker.engine_gguf import GGUFEngine
from services.llm_worker.memory_guard import MemoryGuard

logger = setup_logger("LLM-Worker")

broker = RabbitBroker(settings.RABBITMQ_URL)
app = FastStream(broker)

models_path = os.path.join(settings.MODELS_BASE_PATH, "basemodel")
os.makedirs(models_path, exist_ok=True)
engine = GGUFEngine(models_path)

@broker.subscriber(settings.QUEUE_LLM_INBOUND)
async def handle_inference_task(req: LLMInferenceRequest) -> LLMInferenceResponse:
    start_time = time.time()
    logger.info(f"Received inference task: {req.request_id} for prompt '{req.prompt}'")

    mem_before = MemoryGuard.get_process_memory()
    logger.debug(f"Process RAM before inference: {mem_before['rss_mb']} MB")

    # If model is requested but not loaded, auto-load
    if req.model_name and engine.active_filename != req.model_name:
        engine.load_model(req.model_name)

    result = engine.generate_function_call(req.prompt, req.tools)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    logger.info(f"Task {req.request_id} resolved tool: '{result.get('tool_name')}' in {duration_ms}ms")

    response = LLMInferenceResponse(
        request_id=req.request_id,
        tool_name=result.get("tool_name"),
        arguments=result.get("arguments", {}),
        raw_response=result.get("raw_response", ""),
        model_ident=engine.active_filename or "FunctionGemma-GGUF",
        source="llm_worker",
        duration_ms=duration_ms
    )

    # Publish memory and status update event
    mem_after = MemoryGuard.get_process_memory()
    await broker.publish(
        {
            "type": "MODEL_STATUS",
            "data": {
                "category": "basemodel",
                "is_loaded": engine.model is not None,
                "active_filename": engine.active_filename,
                "rss_mb": mem_after["rss_mb"],
                "last_duration_ms": duration_ms
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )

    return response

@broker.subscriber("overlay.models.llm.load")
async def handle_model_load(req: ModelLoadRequest):
    logger.info(f"Received request to load LLM model: {req.filename}")
    success = engine.load_model(req.filename)
    mem = MemoryGuard.get_process_memory()
    
    await broker.publish(
        {
            "type": "MODEL_STATUS",
            "data": {
                "category": "basemodel",
                "is_loaded": success,
                "active_filename": engine.active_filename if success else None,
                "rss_mb": mem["rss_mb"]
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )
    return {"success": success, "active_filename": engine.active_filename, "rss_mb": mem["rss_mb"]}

@app.on_startup
async def on_startup():
    logger.info("LLM Worker started successfully. Scanning available models...")
    # Find any existing .gguf models to auto-load
    files = [f for f in os.listdir(models_path) if f.endswith((".gguf", ".bin", ".safetensors"))]
    if files:
        logger.info(f"Auto-loading default base model: {files[0]}")
        engine.load_model(files[0])
    else:
        logger.warning(f"No .gguf or model files found in {models_path}. Awaiting model upload.")

async def run_with_retry():
    max_retries = 20
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Connecting to RabbitMQ at {settings.RABBITMQ_URL} (attempt {attempt}/{max_retries})...")
            await broker.connect()
            logger.info("Successfully established connection to RabbitMQ.")
            await app.run()
            break
        except Exception as e:
            if attempt >= max_retries:
                logger.error(f"RabbitMQ connection failed permanently after {max_retries} attempts: {e}")
                raise
            logger.warning(f"RabbitMQ broker is warming up ({e}). Retrying in 3 seconds...")
            await asyncio.sleep(3)

if __name__ == "__main__":
    asyncio.run(run_with_retry())
