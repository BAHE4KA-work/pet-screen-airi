# Базовые модели Function Calling (LLM)

Сюда помещаются файлы весов моделей для вызова инструментов (Function Calling):
- Google FunctionGemma 7B
- FunctionGemma 2B
- Gemma 2 9B / 27B
- Qwen 2.5 7B Coder
- Llama 3.1 8B Instruct

### Поддерживаемые форматы
- `.gguf` (Оптимально для CPU и GPU через llama.cpp / Ollama)
- Рекомендуемые квантования: `Q4_K_M` (баланс скорости и памяти), `Q5_K_M` (высокая точность), `Q8_0`
- Файлы манифестов `.json` для связывания параметров модели
