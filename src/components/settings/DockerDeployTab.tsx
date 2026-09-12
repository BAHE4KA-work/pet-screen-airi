import React, { useState } from 'react';
import { Box, Copy, Check, Terminal, Layers, Shield, Network } from 'lucide-react';
import { soundEffects } from '../../utils/audioEffects';

export const DockerDeployTab: React.FC = () => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedCompose, setCopiedCompose] = useState(false);

  const composeSnippet = `version: '3.8'
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      - STORAGE_PATH=/app/storage
      - LOCAL_LLM_ENDPOINT=http://functiongemma-llm:11434
      - LOCAL_STT_ENDPOINT=http://stt-whisper:8000/v1/audio/transcriptions
      - HTTP_PROXY=http://network-proxy:8080
    volumes:
      - app-storage:/app/storage

  functiongemma-llm:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes:
      - ollama-models:/root/.ollama

  stt-whisper:
    image: fedirz/faster-whisper-server:latest-cpu
    ports: ["8000:8000"]

  network-proxy:
    image: ginuerzh/gost:latest
    ports: ["8080:8080", "1080:1080", "8388:8388"]
    command: -L=http://:8080 -L=socks5://:1080 -L=ss://AEAD_CHACHA20_POLY1305:secret@:8388`;

  const handleCopyCmd = () => {
    navigator.clipboard.writeText('docker compose up -d --build');
    setCopiedCmd(true);
    soundEffects.playCompletionPing();
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleCopyCompose = () => {
    navigator.clipboard.writeText(composeSnippet);
    setCopiedCompose(true);
    soundEffects.playCompletionPing();
    setTimeout(() => setCopiedCompose(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div
        className="p-5 rounded-xl border"
        style={{
          backgroundColor: '#161922',
          borderColor: 'var(--c-border)'
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-400">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-100">Docker контейнеризация и прокси-сеть</h3>
              <p className="text-xs text-zinc-400">
                Запуск полного стека (оверлей + локальная FunctionGemma + Faster-Whisper + сетевой прокси) в один клик
              </p>
            </div>
          </div>

          <button
            id="copy-docker-run-btn"
            onClick={handleCopyCmd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/40 transition-colors"
          >
            {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />}
            {copiedCmd ? 'Скопировано!' : 'docker compose up -d'}
          </button>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Проект подготовлен для автономного запуска на любом сервере или рабочей станции с поддержкой изоляции сетевых соединений через встроенный контейнер Gost-прокси (SOCKS5, HTTP, Shadowsocks).
        </p>
      </div>

      {/* 4 Containers Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
            1. functiongemma-app
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Основной Express + React оверлей на порту 3000 с постоянным томом <code className="text-orange-300">storage</code>.
          </p>
        </div>

        <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            2. functiongemma-llm
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Ollama / vLLM инференс на порту 11434 с изолированным хранилищем весов моделей.
          </p>
        </div>

        <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            3. stt-whisper
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Сервер Faster-Whisper на порту 8000 для локального голосового набора без отправки аудио наружу.
          </p>
        </div>

        <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            4. network-proxy (Gost)
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Мультипротокольный прокси: HTTP:8080, SOCKS5:1080, Shadowsocks:8388 для безопасного маршрутизирования трафика.
          </p>
        </div>
      </div>

      {/* Copy Compose Config */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-300">Файл docker-compose.yml</span>
          <button
            id="copy-compose-config-btn"
            onClick={handleCopyCompose}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {copiedCompose ? <Check className="w-3.5 h-3.5 text-orange-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedCompose ? 'Скопировано' : 'Копировать манифест'}
          </button>
        </div>
        <pre className="p-4 text-xs font-mono text-zinc-300 bg-zinc-950 overflow-x-auto max-h-56 leading-relaxed">
          {composeSnippet}
        </pre>
      </div>
    </div>
  );
};
