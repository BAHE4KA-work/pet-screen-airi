# Пример: Модуль Системного Времени (Time Tool)

В данном примере показан законченный модуль `time` с инструментом `get_current_time`, демонстрирующий чтение `config.ini` и генерацию компонента окна `Views`.

---

## 1. Файловая структура модуля

```text
modules/time/
├── module.json
├── config.ini
└── time_tool.js
```

---

## 2. Манифест `modules/time/module.json`

```json
{
  "name": "time",
  "displayName": "Время и Дата",
  "version": "1.0.0",
  "author": "Airi Team",
  "description": "Модуль для получения точного системного времени, даты и таймзоны хоста",
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
            "description": "Формат отображения времени: 24-часовой (24h) или 12-часовой (12h)."
          },
          "show_seconds": {
            "type": "boolean",
            "description": "Флаг отображения секунд (по умолчанию true)."
          }
        },
        "required": []
      },
      "scriptFile": "time_tool.js"
    }
  ]
}
```

---

## 3. Конфигурация `modules/time/config.ini`

```ini
[General]
default_format = 24h
show_seconds = true
timezone = Europe/Moscow
```

---

## 4. Исполняемый код `modules/time/time_tool.js`

```javascript
/**
 * Инструмент получения текущего системного времени
 * @param {Object} args Аргументы от модели (format, show_seconds)
 * @param {Object} context Контекст исполнения: config, storage, views
 */
const now = new Date();

// Считываем значения из параметров вызова или из config.ini
const configFormat = context.config?.General?.default_format || '24h';
const configSeconds = context.config?.General?.show_seconds !== 'false';
const timezone = context.config?.General?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

const format = args?.format || configFormat;
const showSeconds = args?.show_seconds !== undefined ? Boolean(args.show_seconds) : configSeconds;

const hours = now.getHours();
const displayHours = format === '12h' ? (hours % 12 || 12) : hours;
const pad = n => n.toString().padStart(2, '0');

const timeStr = `${pad(displayHours)}:${pad(now.getMinutes())}${showSeconds ? ':' + pad(now.getSeconds()) : ''}${format === '12h' ? (hours >= 12 ? ' PM' : ' AM') : ''}`;
const dateStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const weekdayStr = now.toLocaleDateString('ru-RU', { weekday: 'long' });

return {
  success: true,
  result: `Текущее время: ${timeStr} (${weekdayStr}, ${dateStr})`,
  view: context.views.createTimeView({
    timestamp: now.getTime(),
    format: format,
    showSeconds: showSeconds,
    timezone: timezone
  }, {
    title: 'Системное время',
    pinned: false
  })
};
```

---

## 5. Результат работы

1. Модель распознаёт фразу вроде: *«Который сейчас час?»* или *«Сколько времени?»*.
2. Вызывается функция `get_current_time`.
3. В оверлее рядом с окном запроса моментально открывается интерактивное окно с живыми тикающими часами, датой и индикатором таймзоны.
4. Если пользователь нажмёт на булавку (📌), окно останется на экране. Если кликнет на рабочий стол без закрепления — окно плавно закроется.
