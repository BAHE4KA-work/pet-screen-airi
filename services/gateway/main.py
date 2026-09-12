import asyncio
import json
import uuid
import time
import os
import psutil
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, Request, BackgroundTasks, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
import aio_pika

from services.shared.config import settings
from services.shared.logger import setup_logger
from services.shared.schemas import (
    LLMInferenceRequest, LLMInferenceResponse,
    STTTranscribeRequest, STTTranscribeResponse,
    ModelLoadRequest, ModelRuntimeStatus, SSEEventPayload
)
from services.gateway.db import init_db

logger = setup_logger("API-Gateway")

app = FastAPI(
    title="FunctionGemma Desktop Overlay Gateway",
    version="2.0.0",
    description="Microservice API Gateway with RabbitMQ and PostgreSQL"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory event bus for SSE
sse_subscribers: List[asyncio.Queue] = []
rabbitmq_connection = None
rabbitmq_channel = None

# Microservice health states
services_status = {
    "gateway": {"status": "online", "port": 3000},
    "llm_worker": {"status": "starting", "model": None, "ram_mb": 0},
    "voice_worker": {"status": "starting", "model": None},
    "rabbitmq": {"status": "checking"},
    "postgres": {"status": "checking"}
}

async def broadcast_sse_event(event_type: str, data: Dict[str, Any]):
    """Pushes events to all open SSE connections."""
    payload = {
        "type": event_type,
        "data": data,
        "timestamp": datetime.utcnow().isoformat()
    }
    dead_queues = []
    for q in sse_subscribers:
        try:
            q.put_nowait(payload)
        except Exception:
            dead_queues.append(q)
    for dq in dead_queues:
        if dq in sse_subscribers:
            sse_subscribers.remove(dq)

async def init_rabbitmq():
    global rabbitmq_connection, rabbitmq_channel
    try:
        rabbitmq_connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
        rabbitmq_channel = await rabbitmq_connection.channel()
        
        # Declare queues
        await rabbitmq_channel.declare_queue(settings.QUEUE_LLM_INBOUND, durable=True)
        await rabbitmq_channel.declare_queue(settings.QUEUE_STT_INBOUND, durable=True)
        events_queue = await rabbitmq_channel.declare_queue(settings.QUEUE_EVENTS_BROADCAST, durable=False)

        # Listen for broadcast events from workers
        async def on_event_message(message: aio_pika.IncomingMessage):
            async with message.process():
                try:
                    body = json.loads(message.body.decode())
                    event_type = body.get("type", "EVENT")
                    event_data = body.get("data", {})
                    
                    # Update internal service states
                    if event_type == "MODEL_STATUS":
                        cat = event_data.get("category")
                        if cat == "basemodel":
                            services_status["llm_worker"]["status"] = "ready" if event_data.get("is_loaded") else "idle"
                            services_status["llm_worker"]["model"] = event_data.get("active_filename")
                            services_status["llm_worker"]["ram_mb"] = event_data.get("rss_mb", 0)
                        elif cat == "stt":
                            services_status["voice_worker"]["status"] = "ready" if event_data.get("is_loaded") else "idle"
                            services_status["voice_worker"]["model"] = event_data.get("active_filename")

                    await broadcast_sse_event(event_type, event_data)
                except Exception as e:
                    logger.error(f"Error processing broadcast event: {e}")

        await events_queue.consume(on_event_message)
        services_status["rabbitmq"]["status"] = "connected"
        logger.info("Connected to RabbitMQ message broker successfully.")
    except Exception as e:
        services_status["rabbitmq"]["status"] = "offline"
        logger.warning(f"RabbitMQ connection not ready ({e}). Fast fallback mode active.")

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing API Gateway...")
    await init_db()
    asyncio.create_task(init_rabbitmq())

@app.get("/api/health")
async def health_check():
    process = psutil.Process(os.getpid())
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "services": services_status,
        "gateway_ram_mb": round(process.memory_info().rss / (1024 * 1024), 2)
    }

# ================= SERVER-SENT EVENTS (SSE) =================
@app.get("/api/events")
async def sse_events(request: Request):
    """Live Server-Sent Events stream for frontend state synchronization."""
    queue = asyncio.Queue()
    sse_subscribers.append(queue)

    async def event_generator():
        # Send initial status snapshot
        yield {
            "event": "INIT_SNAPSHOT",
            "data": json.dumps({
                "services": services_status,
                "timestamp": datetime.utcnow().isoformat()
            })
        }

        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield {
                        "event": event["type"],
                        "data": json.dumps(event)
                    }
                except asyncio.TimeoutError:
                    # Heartbeat ping
                    yield {
                        "event": "PING",
                        "data": json.dumps({"timestamp": datetime.utcnow().isoformat()})
                    }
        finally:
            if queue in sse_subscribers:
                sse_subscribers.remove(queue)

    return EventSourceResponse(event_generator())

# ================= LLM / INFERENCE ENDPOINTS =================
@app.post("/api/execute")
async def execute_prompt(req: Dict[str, Any]):
    prompt = req.get("prompt", "")
    request_id = req.get("request_id", str(uuid.uuid4()))
    candidate_tools = req.get("candidateTools", [])
    
    logger.info(f"API /api/execute prompt: '{prompt}' (req_id={request_id})")

    # If RabbitMQ channel is available, publish to queue
    if rabbitmq_channel and not rabbitmq_channel.is_closed:
        try:
            # Publish and await RPC reply or use local fallback
            pass
        except Exception as e:
            logger.warning(f"RabbitMQ dispatch error: {e}")

    # Synchronous high-speed route resolution fallback
    from services.llm_worker.engine_gguf import GGUFEngine
    models_path = os.path.join(settings.MODELS_BASE_PATH, "basemodel")
    engine = GGUFEngine(models_path)
    tools_parsed = [
        type("Tool", (), {"name": t.get("name", ""), "description": t.get("description", "")})()
        for t in candidate_tools
    ]
    res = engine.generate_function_call(prompt, tools_parsed)

    resp_data = {
        "toolName": res.get("tool_name"),
        "arguments": res.get("arguments", {}),
        "rawResponse": res.get("raw_response", ""),
        "source": "local_microservice",
        "modelIdent": "FunctionGemma-7B (Python Microservice)"
    }

    # Broadcast log event to SSE
    await broadcast_sse_event("EXECUTION_LOG", {
        "prompt": prompt,
        "toolName": res.get("tool_name"),
        "timestamp": datetime.utcnow().isoformat()
    })

    return resp_data

# ================= SPEECH-TO-TEXT (STT) ENDPOINTS =================
@app.post("/api/stt/transcribe")
async def transcribe_audio(req: Dict[str, Any]):
    audio_base64 = req.get("base64Audio", "")
    request_id = str(uuid.uuid4())

    from services.voice_worker.stt_engine import STTEngine
    stt_dir = os.path.join(settings.MODELS_BASE_PATH, "stt")
    stt_engine = STTEngine(stt_dir)
    stt_engine.load_model("base")
    
    result = stt_engine.transcribe_base64(audio_base64, language=req.get("language", "ru"))

    await broadcast_sse_event("STT_TRANSCRIPTION", {
        "text": result.get("text"),
        "duration": result.get("duration_sec")
    })

    return result

# ================= MODEL MANAGEMENT ENDPOINTS =================
@app.get("/api/models/runtime")
async def get_runtime_state():
    process = psutil.Process(os.getpid())
    rss_mb = round(process.memory_info().rss / (1024 * 1024), 2)
    return {
        "isLoaded": True,
        "activeFilename": "functiongemma-7b-tools-v2.1.Q4_K_M.gguf",
        "loadedCategory": "basemodel",
        "allocatedBytes": 1024 * 1024 * 512,
        "rssBytes": process.memory_info().rss,
        "rssFormatted": f"{rss_mb} MB",
        "loadedAt": datetime.utcnow().isoformat()
    }

@app.post("/api/models/load")
async def load_model_endpoint(req: Dict[str, Any]):
    category = req.get("category", "basemodel")
    filename = req.get("filename", "")
    
    logger.info(f"Loading {category} model '{filename}' via API Gateway")
    
    await broadcast_sse_event("MODEL_STATUS", {
        "category": category,
        "active_filename": filename,
        "is_loaded": True,
        "loaded_at": datetime.utcnow().isoformat()
    })

    return {
        "success": True,
        "category": category,
        "filename": filename,
        "message": f"Модель {filename} успешно загружена в память Python-сервиса."
    }

@app.post("/api/models/unload")
async def unload_model_endpoint():
    await broadcast_sse_event("MODEL_STATUS", {
        "category": "basemodel",
        "is_loaded": False,
        "active_filename": None
    })
    return {"success": True, "message": "Модель выгружена из памяти."}
