FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/gateway/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --default-timeout=1000 --retries 5 -r requirements.txt

COPY ./services/shared /app/services/shared
COPY ./services/gateway /app/services/gateway

ENV PYTHONPATH=/app
ENV PORT=3000

EXPOSE 3000

CMD ["uvicorn", "services.gateway.main:app", "--host", "0.0.0.0", "--port", "3000"]
