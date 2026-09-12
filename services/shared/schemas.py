import os
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union
from datetime import datetime

class BaseMessage(BaseModel):
    request_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ToolParameterProperty(BaseModel):
    type: str
    description: Optional[str] = None
    enum: Optional[List[str]] = None

class ToolParameters(BaseModel):
    type: str = "object"
    properties: Dict[str, Any] = Field(default_factory=dict)
    required: Optional[List[str]] = None

class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: Optional[ToolParameters] = None

class LLMInferenceRequest(BaseMessage):
    prompt: str
    tools: List[ToolDefinition] = Field(default_factory=list)
    model_name: Optional[str] = None
    temperature: float = 0.2
    max_tokens: int = 1024
    stream: bool = False

class LLMInferenceResponse(BaseMessage):
    tool_name: Optional[str] = None
    arguments: Dict[str, Any] = Field(default_factory=dict)
    raw_response: str
    model_ident: str
    source: str = "llm_worker"
    tokens_used: int = 0
    duration_ms: float = 0.0

class STTTranscribeRequest(BaseMessage):
    audio_base64: str
    audio_format: str = "webm"
    language: str = "ru"
    model_file: Optional[str] = None

class STTTranscribeResponse(BaseMessage):
    text: str
    language: str
    duration_sec: float
    confidence: float
    source: str = "voice_worker"

class ModelLoadRequest(BaseMessage):
    category: str # "basemodel", "stt", "tts", "embedding"
    filename: str

class ModelRuntimeStatus(BaseModel):
    category: str
    is_loaded: bool
    active_filename: Optional[str] = None
    allocated_ram_mb: float = 0.0
    rss_total_mb: float = 0.0
    device: str = "cpu"
    status_text: str = "ready"
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class SSEEventPayload(BaseModel):
    type: str # "MODEL_STATUS", "DEBUG_LOG", "AUDIO_VOLUME", "CONTAINER_HEALTH", "INFERENCE_STREAM"
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
