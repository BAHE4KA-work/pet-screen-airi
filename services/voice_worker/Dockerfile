FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install lightweight CPU builds for torch and torchaudio
RUN pip install --no-cache-dir --default-timeout=1000 --retries 5 --prefer-binary \
    torch torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY services/voice_worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --default-timeout=1000 --retries 5 --prefer-binary -r requirements.txt

COPY ./services/shared /app/services/shared
COPY ./services/voice_worker /app/services/voice_worker

ENV PYTHONPATH=/app
ENV MODELS_PATH=/models

CMD ["python", "services/voice_worker/worker.py"]
