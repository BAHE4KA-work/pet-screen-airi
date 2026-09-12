# Спецификация системы окон отображения (Views)

Система **Views** в Airi отвечает за стандартизированное создание, управление и отображение плавающих окон-виджетов на слое оверлея поверх рабочего стола.

---

## 1. Концепция и поведение окон Views

1. **Появление рядом с HUD**: При ответе инструмента окно соответствующего типа появляется на экране рядом с окном запроса.
2. **Перетаскивание (Drag & Drop)**: Каждое окно оснащено шапкой в стиле Mac/Apple с манипулятором захвата и может свободно перемещаться мышью.
3. **Механизм закрепления (Pinning 📌)**:
   - Каждое окно Views и само окно HUD имеют кнопку булавки (📌).
   - Если окно **закреплено** (`pinned: true`), оно подсвечивается акцентной рамкой и остаётся на экране постоянно.
   - Если окно **не закреплено** (`pinned: false`), **клик по свободной рабочей области рабочего стола моментально закрывает его** вместе с окном ввода запроса.

---

## 2. Стандартные типы представлений

### 2.1 `time` (TimeCardView)
Предназначено для отображения часов, даты и таймзоны.
- **Интерфейс данных**: `TimeViewData`
```typescript
interface TimeViewData {
  timestamp: number;
  format?: '24h' | '12h';
  showSeconds?: boolean;
  timezone?: string;
}
```
- **Особенности**: Живые тикающие цифровые часы с плавным пульсирующим двоеточием, локализованный день недели, дата и бейдж часового пояса.

### 2.2 `metrics` (MetricsCardView)
Предназначено для мониторинга хоста (процессор, оперативная память, диски, нагрузка).
- **Интерфейс данных**: `MetricsViewData`
```typescript
interface MetricsViewData {
  cpuPercent: number;
  memPercent?: string;
  memUsedMb?: number;
  memTotalMb?: number;
  uptime?: string;
  platform?: string;
  loadAverage?: number[];
}
```
- **Особенности**: Графические прогресс-бары с цветовой градацией нагрузки, статистика памяти в МБ и показатели Uptime.

### 2.3 `list` (ListCardView)
Предназначено для списков процессов, заметок, результатов поиска или файлов.
- **Интерфейс данных**: `ListViewData`
```typescript
interface ListViewData {
  items: Array<{
    id?: string | number;
    title: string;
    subtitle?: string;
    badge?: string;
    value?: string | number;
  }>;
  emptyText?: string;
}
```
- **Особенности**: Встроенный поиск/фильтр элементов, бейджи, подзаголовки.

### 2.4 `key_value` (KeyValueCardView)
Предназначено для структурированных параметров, метаданных и таблиц конфигураций.
- **Интерфейс данных**: `KeyValueViewData`
```typescript
interface KeyValueViewData {
  entries: Array<{
    label: string;
    value: string | number | boolean;
    highlight?: boolean;
  }>;
}
```
- **Особенности**: Моноширинный вывод значений и кнопка быстрого копирования каждого поля в буфер обмена.

### 2.5 `text` (TextCardView)
Предназначено для текстовых ответов, сниппетов кода, логов и заметок.
- **Интерфейс данных**: `TextViewData`
```typescript
interface TextViewData {
  content: string;
  language?: string;
}
```
- **Особенности**: Прокручиваемый блок с сохранением переносов строк и кнопка «Скопировать».

---

## 3. Интерфейс фабрики `ViewsFactory`

Фабрика внедряется в `context.views` каждого инструмента:

```typescript
export interface ViewsFactory {
  createTimeView(data: TimeViewData, options?: ViewOptions): ViewSpec;
  createMetricsView(data: MetricsViewData, options?: ViewOptions): ViewSpec;
  createListView(data: ListViewData, options?: ViewOptions): ViewSpec;
  createKeyValueView(data: KeyValueViewData, options?: ViewOptions): ViewSpec;
  createTextView(data: TextViewData, options?: ViewOptions): ViewSpec;
}
```
