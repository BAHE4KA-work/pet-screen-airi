# Локальный каталог моделей AI (Local Model Store)

В этой папке хранятся файлы нейросетевых моделей, разделенные по категориям и назначению:

## Структура папок

- **`basemodel/`** — Основные большие языковые модели (LLM) с поддержкой Function Calling:
  - **FunctionGemma 7B / 2B**, Gemma 2, Llama 3.1 / 3.2, Qwen 2.5
  - Форматы: `.gguf` (рекомендуются квантования `Q4_K_M`, `Q5_K_M`), `.safetensors`, `.bin`, `.json` (манифесты)
  - Пример: `functiongemma-7b-it.Q4_K_M.gguf`, `functiongemma-2b-tools.gguf`

- **`stt/`** — Модели распознавания речи (Speech-to-Text):
  - **Whisper** (Faster-Whisper, whisper.cpp, Sherpa-ONNX, Vosk)
  - Форматы: `.bin` (ggml/whisper), `.onnx`, папки с весами HuggingFace
  - Пример: `whisper-base-ru.bin`, `ggml-base.bin`, `whisper-small.onnx`

- **`tts/`** — Модели синтеза речи (Text-to-Speech, на будущее):
  - **Piper**, **VITS**, **Kokoro**, **Silero TTS**
  - Форматы: `.onnx`, `.pt`, `.json` (конфиг голоса и фонем)
  - Пример: `ru_RU-dmitri-medium.onnx`, `ru_RU-dmitri-medium.onnx.json`

- **`embedding/`** — Модели векторных эмбеддингов (на будущее):
  - **BGE** (BAAI/bge-small-ru, bge-m3), **all-MiniLM-L6-v2**, **Nomic Embed**
  - Форматы: `.onnx`, `.safetensors`, `model.bin`
  - Используются для RAG, семантического поиска заметок и маршрутизации инструментов

---

## Как добавить свою модель

1. Скачайте файл модели (например, с Hugging Face)
2. Положите файл в соответствующую подпапку (`basemodel/`, `stt/`, `tts/`, `embedding/`)
3. Откройте в приложении **Настройки -> Локальные модели**
4. Нажмите кнопку **«Пересканировать папку»**
5. Выберите активную модель кликом по карточке
