FROM python:3.11-slim-bookworm

WORKDIR /app

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG DEBIAN_MIRROR

ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    NO_PROXY=${NO_PROXY} \
    DEBIAN_FRONTEND=noninteractive

# Configure resilient APT (IPv4-first, retries, timeouts, and fallback mirrors)
RUN set -e; \
    echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4; \
    echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/99retries; \
    echo 'Acquire::http::Timeout "30";' >> /etc/apt/apt.conf.d/99retries; \
    echo 'Acquire::https::Timeout "30";' >> /etc/apt/apt.conf.d/99retries; \
    switch_mirror() { \
        NEW_MIRROR="$1"; \
        echo "--> Switching Debian mirror to: $NEW_MIRROR"; \
        if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
            sed -i 's|http://deb.debian.org/debian-security|http://security.debian.org/debian-security|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
            sed -i "s|http://deb.debian.org/debian|${NEW_MIRROR}|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
        fi; \
        if [ -f /etc/apt/sources.list ]; then \
            sed -i 's|http://deb.debian.org/debian-security|http://security.debian.org/debian-security|g' /etc/apt/sources.list 2>/dev/null || true; \
            sed -i "s|http://deb.debian.org/debian|${NEW_MIRROR}|g" /etc/apt/sources.list 2>/dev/null || true; \
        fi; \
    }; \
    if [ -n "${DEBIAN_MIRROR}" ]; then \
        switch_mirror "${DEBIAN_MIRROR}"; \
    fi; \
    install_packages() { \
        apt-get update && apt-get install -y --no-install-recommends --fix-missing \
            build-essential \
            cmake \
            git \
            libgomp1; \
    }; \
    if ! install_packages; then \
        echo "--> deb.debian.org mirror timed out or failed. Trying ftp.de.debian.org..."; \
        switch_mirror "http://ftp.de.debian.org/debian"; \
        if ! install_packages; then \
            echo "--> Fallback failed. Trying mirror.yandex.ru..."; \
            switch_mirror "http://mirror.yandex.ru/debian"; \
            install_packages; \
        fi; \
    fi; \
    rm -rf /var/lib/apt/lists/*

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
