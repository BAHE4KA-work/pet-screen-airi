FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install prebuilt CPU llama-cpp-python without PyTorch or CUDA dependencies
ENV CMAKE_ARGS="-DGGML_CUDA=off"
RUN pip install --no-cache-dir --default-timeout=1000 --retries 5 \
    llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu || \
    pip install --no-cache-dir --default-timeout=1000 --retries 5 llama-cpp-python

COPY services/llm_worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --default-timeout=1000 --retries 5 --prefer-binary -r requirements.txt

COPY ./services/shared /app/services/shared
COPY ./services/llm_worker /app/services/llm_worker

ENV PYTHONPATH=/app
ENV MODELS_PATH=/models

CMD ["python", "services/llm_worker/worker.py"]
