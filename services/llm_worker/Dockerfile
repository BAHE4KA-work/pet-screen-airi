FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install lightweight PyTorch CPU build to avoid downloading 3GB+ CUDA packages and timeout errors
RUN pip install --no-cache-dir --default-timeout=1000 --retries 5 \
    torch --index-url https://download.pytorch.org/whl/cpu

COPY services/llm_worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --default-timeout=1000 --retries 5 -r requirements.txt

COPY ./services/shared /app/services/shared
COPY ./services/llm_worker /app/services/llm_worker

ENV PYTHONPATH=/app
ENV MODELS_PATH=/models

CMD ["python", "services/llm_worker/worker.py"]
