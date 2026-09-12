# Руководство по созданию модулей и инструментов

Каждый модуль в Airi представляет собой отдельную директорию внутри папки `modules/`.

---

## 1. Структура директории модуля

Каждый модуль должен иметь следующую файловую структуру:

```text
modules/<module_name>/
├── module.json      # Обязательный файл: метаданные модуля и сигнатуры инструментов
├── config.ini       # Обязательный файл: параметры конфигурации модуля в формате INI
└── <tool_file>.js   # Исполняемый JavaScript-файл с телом функции инструмента
```

---

## 2. Формат `module.json`

Файл `module.json` описывает имя модуля, версию, список инструментов и их параметры в формате JSON Schema:

```json
{
  "name": "time",
  "displayName": "Время и Дата",
  "version": "1.0.0",
  "author": "Airi Team",
  "description": "Модуль для получения точного системного времени и даты",
  "tools": [
    {
      "id": "time.get_current_time",
      "name": "get_current_time",
      "module": "time",
      "description": "Получает текущее локальное системное время, дату и часовой пояс.",
      "parameters": {
        "type": "object",
        "properties": {
          "format": {
            "type": "string",
            "enum": ["24h", "12h"],
            "description": "Формат отображения часов: 24h или 12h."
          },
          "show_seconds": {
            "type": "boolean",
            "description": "Показывать ли секунды."
          }
        }
      },
      "scriptFile": "time_tool.js"
    }
  ]
}
```

---

## 3. Конфигурация `config.ini`

Файл `config.ini` содержит пользовательские параметры, которые считываются сервером и автоматически передаются в инструмент через `context.config`:

```ini
[General]
default_format = 24h
show_seconds = true
timezone = Europe/Moscow
```

---

## 4. Контекст исполнения инструмента (`context`)

При вызове функции инструмента в него передаются два аргумента:
1. `args` (объект аргументов, переданных моделью FunctionGemma)
2. `context` (системный контекст исполнения)

Объект `context` предоставляет следующие возможности:

### 4.1 `context.config`
Содержит распарсенный файл `config.ini` для текущего модуля:
```javascript
const defaultFormat = context.config.General?.default_format || '24h';
```

### 4.2 `context.storage`
Позволяет взаимодействовать с папкой `/storage/`:
- `context.storage.readFile(filename)` — чтение текстового файла.
- `context.storage.writeFile(filename, content)` — запись файла.
- `context.storage.listFiles()` — список файлов в хранилище.
- `context.storage.deleteFile(filename)` — удаление файла.

### 4.3 `context.views` (Фабрика представлений)
Позволяет порождать окна в оверлей-слое:
- `context.views.createTimeView(data, options)`
- `context.views.createMetricsView(data, options)`
- `context.views.createListView(data, options)`
- `context.views.createKeyValueView(data, options)`
- `context.views.createTextView(data, options)`

---

## 5. Возвращаемое значение инструмента

Инструмент может вернуть как обычный текст/объект, так и объект с прикрепленным представлением `view` или `views`:

```javascript
return {
  success: true,
  result: `Текущее время: 14:30:15`,
  view: context.views.createTimeView({
    timestamp: Date.now(),
    format: '24h',
    showSeconds: true,
    timezone: 'Europe/Moscow'
  }, { title: 'Системное время', pinned: false })
};
```
