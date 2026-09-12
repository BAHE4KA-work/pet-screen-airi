import asyncio
import os
import time
from faststream import FastStream
from faststream.rabbit import RabbitBroker
from services.shared.config import settings
from services.shared.logger import setup_logger
from services.shared.schemas import STTTranscribeRequest, STTTranscribeResponse, ModelLoadRequest
from services.voice_worker.stt_engine import STTEngine
from services.voice_worker.vad_analyzer import VADAnalyzer

logger = setup_logger("Voice-Worker")

broker = RabbitBroker(settings.RABBITMQ_URL)
app = FastStream(broker)

stt_models_path = os.path.join(settings.MODELS_BASE_PATH, "stt")
os.makedirs(stt_models_path, exist_ok=True)
engine = STTEngine(stt_models_path)

@broker.subscriber(settings.QUEUE_STT_INBOUND)
async def handle_stt_transcribe(req: STTTranscribeRequest) -> STTTranscribeResponse:
    logger.info(f"Received STT transcription request {req.request_id} (format={req.audio_format}, lang={req.language})")

    res = engine.transcribe_base64(req.audio_base64, language=req.language)

    response = STTTranscribeResponse(
        request_id=req.request_id,
        text=res.get("text", ""),
        language=req.language,
        duration_sec=res.get("duration_sec", 0.0),
        confidence=res.get("confidence", 0.0),
        source="voice_worker"
    )

    # Broadcast event to frontend
    await broker.publish(
        {
            "type": "STT_RESULT",
            "data": {
                "request_id": req.request_id,
                "text": res.get("text", ""),
                "duration_sec": res.get("duration_sec", 0.0)
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )

    return response

@broker.subscriber("overlay.models.stt.load")
async def handle_stt_load(req: ModelLoadRequest):
    logger.info(f"Loading STT model file: {req.filename}")
    success = engine.load_model(req.filename)
    
    await broker.publish(
        {
            "type": "MODEL_STATUS",
            "data": {
                "category": "stt",
                "is_loaded": success,
                "active_filename": engine.active_filename
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )
    return {"success": success, "active_filename": engine.active_filename}

@app.on_startup
async def on_startup():
    logger.info("Voice Worker started successfully. Initializing Whisper model...")
    files = [f for f in os.listdir(stt_models_path) if f.endswith((".bin", ".onnx", ".pt"))]
    if files:
        logger.info(f"Auto-loading STT model: {files[0]}")
        engine.load_model(files[0])
    else:
        logger.info("Using default 'base' Whisper model configuration.")
        engine.load_model("base")

if __name__ == "__main__":
    asyncio.run(app.run())
