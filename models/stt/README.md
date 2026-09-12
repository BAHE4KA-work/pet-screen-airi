# Модели распознавания речи (Speech-to-Text)

Сюда помещаются модели транскрипции русской и многоязычной речи:
- Faster-Whisper (OpenAI Whisper base/small/medium/large-v3)
- Sherpa-ONNX / Vosk
- Whisper.cpp GGML бинарники (`ggml-base.bin`)

### Рекомендуемые файлы:
- `whisper-base-ru.bin` (~145 MB) — быстрый отклик на CPU, высокая точность для команд
- `whisper-small-ru.bin` (~460 MB) — расширенный словарь для сложных терминов
- `.onnx` квантованные модели
