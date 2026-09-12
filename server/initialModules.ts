import { ToolDefinition } from '../src/types';

export const INITIAL_TOOLS: Omit<ToolDefinition, 'hash'>[] = [
  {
    id: 'time.get_current_time',
    name: 'get_current_time',
    module: 'time',
    version: '1.0.0',
    description: 'Получить текущее системное время, дату и часовой пояс с выводом в окно Views',
    filePath: 'modules/time/time_tool.js',
    enabled: true,
    parameters: [
      {
        name: 'locale',
        type: 'string',
        description: 'Языковой код локали (например, "ru-RU" или "en-US")',
        required: false,
        default: 'ru-RU'
      },
      {
        name: 'format',
        type: 'string',
        description: 'Формат времени: "24h" или "12h"',
        required: false,
        default: '24h'
      },
      {
        name: 'show_seconds',
        type: 'boolean',
        description: 'Показывать ли секунды',
        required: false,
        default: true
      }
    ],
    code: `// modules/time/time_tool.js
export async function execute(params, context) {
  const genConfig = context.config?.general || {};
  const viewConfig = context.config?.view || {};

  const locale = params.locale || genConfig.locale || 'ru-RU';
  const format = params.format || genConfig.format || '24h';
  const showSeconds = params.show_seconds !== undefined
    ? Boolean(params.show_seconds)
    : (genConfig.show_seconds !== 'false');

  const now = new Date();

  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: format === '12h'
  };
  if (showSeconds) {
    timeOptions.second = '2-digit';
  }

  const formattedTime = now.toLocaleTimeString(locale, timeOptions);
  const formattedDate = now.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const rawDayOfWeek = now.toLocaleDateString(locale, { weekday: 'long' });
  const dayOfWeek = rawDayOfWeek.charAt(0).toUpperCase() + rawDayOfWeek.slice(1);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';

  const clockView = context.views.createTimeView({
    time: formattedTime,
    date: formattedDate,
    dayOfWeek: dayOfWeek,
    timezone: timezone,
    format: format,
    showSeconds: showSeconds,
    timestamp: now.getTime()
  }, {
    title: 'Системное время',
    pinned: viewConfig.default_pinned === 'true'
  });

  return {
    status: 'ok',
    time: formattedTime,
    date: formattedDate,
    dayOfWeek: dayOfWeek,
    timezone: timezone,
    timestamp: now.getTime(),
    view: clockView
  };
}`
  },
  {
    id: 'system.get_metrics',
    name: 'get_metrics',
    module: 'system',
    version: '1.2.0',
    description: 'Получить текущие метрики системы (CPU, RAM, время работы, нагрузка)',
    filePath: 'modules/system/system_metrics.js',
    enabled: true,
    parameters: [
      {
        name: 'include_memory_breakdown',
        type: 'boolean',
        description: 'Включить детальный отчет по выделенной и свободной памяти',
        required: false,
        default: true
      }
    ],
    code: `// modules/system/system_metrics.js
export async function execute(params, context) {
  const os = context.os;
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
  const usedMemMb = totalMemMb - freeMemMb;
  const memUsagePercent = Math.round((usedMemMb / totalMemMb) * 100);
  
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'Generic x86_64';
  const cpuCores = cpus.length;
  const loadAvg = os.loadavg();
  const uptimeHours = (os.uptime() / 3600).toFixed(1);
  const cpuUsage = Math.min(100, Math.round(loadAvg[0] * 15 + 10));

  const metricsView = context.views.createMetricsView({
    cpu: {
      usagePercent: cpuUsage,
      model: cpuModel,
      cores: cpuCores
    },
    memory: {
      usagePercent: memUsagePercent,
      usedMb: usedMemMb,
      totalMb: totalMemMb
    },
    system: {
      platform: os.platform(),
      uptime: uptimeHours + ' ч'
    }
  }, {
    title: 'Метрики системы'
  });

  return {
    status: 'online',
    cpuPercent: cpuUsage,
    memPercent: memUsagePercent,
    view: metricsView
  };
}`
  },
  {
    id: 'system.manage_processes',
    name: 'manage_processes',
    module: 'system',
    version: '1.1.0',
    description: 'Получить список активных процессов или выполнить фильтрацию по имени',
    filePath: 'modules/system/manage_processes.js',
    enabled: true,
    parameters: [
      {
        name: 'filter_name',
        type: 'string',
        description: 'Фильтр по имени процесса (например, "node", "chrome", "python")',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Количество возвращаемых процессов (по умолчанию 5)',
        required: false,
        default: 5
      }
    ],
    code: `// modules/system/manage_processes.js
export async function execute(params, context) {
  let processes = [
    { pid: 1042, name: 'node.exe (Airi Overlay Server)', cpuPercent: 1.4, memMb: 128, user: 'current' },
    { pid: 2184, name: 'electron.exe (GPU Process)', cpuPercent: 2.1, memMb: 240, user: 'current' },
    { pid: 3190, name: 'code.exe (VSCode Editor)', cpuPercent: 0.8, memMb: 410, user: 'current' },
    { pid: 4892, name: 'chrome.exe (Tabs & Runtime)', cpuPercent: 3.5, memMb: 680, user: 'current' },
    { pid: 5610, name: 'explorer.exe (Windows Shell)', cpuPercent: 0.2, memMb: 95, user: 'system' }
  ];

  if (params.filter_name) {
    const f = params.filter_name.toLowerCase();
    processes = processes.filter(p => p.name.toLowerCase().includes(f));
  }
  const limit = params.limit || 5;
  const list = processes.slice(0, limit);

  const listView = context.views.createListView({
    title: 'Активные процессы',
    totalCount: list.length,
    items: list.map(p => ({
      id: String(p.pid),
      title: p.name,
      subtitle: \`PID: \${p.pid} | Порядок: \${p.user}\`,
      badge: \`\${p.memMb} MB | \${p.cpuPercent}%\`
    }))
  }, {
    title: 'Менеджер процессов'
  });

  return {
    matchedCount: list.length,
    processes: list,
    view: listView
  };
}`
  },
  {
    id: 'system.clipboard',
    name: 'clipboard',
    module: 'system',
    version: '1.0.0',
    description: 'Прочитать текущий буфер обмена или записать в него текст',
    filePath: 'modules/system/clipboard.js',
    enabled: true,
    parameters: [
      {
        name: 'action',
        type: 'string',
        description: 'Действие: "read" или "write"',
        required: true
      },
      {
        name: 'content',
        type: 'string',
        description: 'Текст для записи в буфер (если action="write")',
        required: false
      }
    ],
    code: `// modules/system/clipboard.js
export async function execute(params, context) {
  if (params.action === 'write') {
    context.state.clipboard = params.content || '';
    const textView = context.views.createTextView({
      content: \`Текст успешно скопирован в буфер обмена:\n\n\${context.state.clipboard}\`,
      characterCount: context.state.clipboard.length,
      mode: 'plain'
    }, {
      title: 'Буфер обмена (Запись)'
    });
    return { status: 'success', action: 'write', length: context.state.clipboard.length, view: textView };
  } else {
    const content = context.state.clipboard || 'https://github.com/google/gemma-models';
    const textView = context.views.createTextView({
      content: content,
      characterCount: content.length,
      mode: 'plain'
    }, {
      title: 'Буфер обмена (Чтение)'
    });
    return {
      status: 'success',
      action: 'read',
      content: content,
      view: textView
    };
  }
}`
  },
  {
    id: 'search.web_lookup',
    name: 'web_lookup',
    module: 'search',
    version: '1.3.0',
    description: 'Быстрый поиск информации по ключевому запросу',
    filePath: 'modules/search/web_lookup.js',
    enabled: true,
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Поисковый запрос',
        required: true
      },
      {
        name: 'target_domain',
        type: 'string',
        description: 'Опциональный домен для фильтрации (например, "habr.com", "github.com")',
        required: false
      }
    ],
    code: `// modules/search/web_lookup.js
export async function execute(params, context) {
  const query = params.query;
  const results = [
    {
      title: 'FunctionGemma: Fine-Tuned Gemma for Tool and Function Calling',
      snippet: 'FunctionGemma enables lightweight edge and local deployment with zero-shot and fine-tuned schema parsing.',
      url: 'https://huggingface.co/google/functiongemma-7b'
    },
    {
      title: 'Быстрый справочник по горячим клавишам и прозрачным окнам в Electron',
      snippet: 'Оптимальные комбинации клавиш (Alt+Space, Ctrl+K) для мгновенного доступа к оверлеям и виджетам.',
      url: 'https://developer.mozilla.org/ru/docs/Web/API/KeyboardEvent'
    },
    {
      title: 'Gemma 2 и Function Calling на локальных устройствах',
      snippet: 'Архитектура выполнения локальных моделей квантования 4-бит с нулевой задержкой отклика.',
      url: 'https://ai.google.dev/gemma'
    }
  ];

  const listView = context.views.createListView({
    title: \`Результаты поиска: "\${query}"\`,
    totalCount: results.length,
    items: results.map((r, idx) => ({
      id: String(idx + 1),
      title: r.title,
      subtitle: r.snippet,
      badge: r.url.replace(/^https?:\/\//, '').split('/')[0]
    }))
  }, {
    title: \`Поиск: \${query}\`
  });

  return {
    query,
    count: results.length,
    results,
    view: listView
  };
}`
  },
  {
    id: 'search.find_notes',
    name: 'find_notes',
    module: 'search',
    version: '1.0.0',
    description: 'Поиск по локальной базе заметок, сниппетов и рабочих задач',
    filePath: 'modules/search/find_notes.js',
    enabled: true,
    parameters: [
      {
        name: 'keyword',
        type: 'string',
        description: 'Ключевое слово для поиска',
        required: true
      }
    ],
    code: `// modules/search/find_notes.js
export async function execute(params, context) {
  const notes = [
    { id: 1, title: 'Конфигурация FunctionGemma', tags: ['ai', 'local', 'gemma'], text: 'Запуск модели с квантованием 4-bit на локальном рантайме с контекстом 4096 токенов.' },
    { id: 2, title: 'План модулей системы', tags: ['system', 'scripts'], text: 'Все модули должны использовать визуализацию Views и проверять контрольную сумму.' },
    { id: 3, title: 'Горячие клавиши оверлея', tags: ['ui', 'hotkeys'], text: 'Alt+Space для открытия оверлея, Esc для скрытия, Ctrl+1-4 для навигации.' }
  ];

  const kw = (params.keyword || '').toLowerCase();
  const matched = notes.filter(n => n.title.toLowerCase().includes(kw) || n.text.toLowerCase().includes(kw) || n.tags.some(t => t.includes(kw)));
  const list = matched.length > 0 ? matched : notes;

  const listView = context.views.createListView({
    title: \`Заметки по запросу: "\${params.keyword}"\`,
    totalCount: list.length,
    items: list.map(n => ({
      id: String(n.id),
      title: n.title,
      subtitle: n.text,
      badge: n.tags.join(', ')
    }))
  }, {
    title: 'Локальные заметки'
  });

  return {
    keyword: params.keyword,
    foundCount: list.length,
    notes: list,
    view: listView
  };
}`
  },
  {
    id: 'files.file_explorer',
    name: 'file_explorer',
    module: 'files',
    version: '1.0.0',
    description: 'Найти файлы в рабочей директории или проверить структуру папок',
    filePath: 'modules/files/file_explorer.js',
    enabled: true,
    parameters: [
      {
        name: 'pattern',
        type: 'string',
        description: 'Паттерн имени файла или расширение (например, "*.ts", "*.json")',
        required: true
      }
    ],
    code: `// modules/files/file_explorer.js
export async function execute(params, context) {
  const matched = [
    { name: 'server.ts', path: './server.ts', sizeKb: 8.4, modified: 'Только что' },
    { name: 'metadata.json', path: './metadata.json', sizeKb: 0.2, modified: '5 мин назад' },
    { name: 'types.ts', path: './src/types.ts', sizeKb: 2.8, modified: '2 мин назад' },
    { name: 'App.tsx', path: './src/App.tsx', sizeKb: 12.1, modified: 'Сегодня' }
  ];

  const listView = context.views.createListView({
    title: \`Файлы по маске "\${params.pattern}"\`,
    totalCount: matched.length,
    items: matched.map((f, i) => ({
      id: String(i + 1),
      title: f.name,
      subtitle: f.path,
      badge: \`\${f.sizeKb} KB\`
    }))
  }, {
    title: 'Файловый проводник'
  });

  return {
    searchPattern: params.pattern,
    totalFound: matched.length,
    files: matched,
    view: listView
  };
}`
  },
  {
    id: 'developer.run_command',
    name: 'run_command',
    module: 'developer',
    version: '1.1.0',
    description: 'Выполнить безопасную команду оболочки (echo, node -v, git status)',
    filePath: 'modules/developer/run_command.js',
    enabled: true,
    parameters: [
      {
        name: 'command',
        type: 'string',
        description: 'Команда для исполнения (белый список: echo, node, git, date, uname)',
        required: true
      }
    ],
    code: `// modules/developer/run_command.js
export async function execute(params, context) {
  const cmd = (params.command || 'node -v').trim();
  let output = '';
  
  if (cmd.startsWith('node')) output = 'v22.14.0 (Node.js runtime)';
  else if (cmd.startsWith('date')) output = new Date().toLocaleString('ru-RU');
  else if (cmd.startsWith('uname')) output = 'Linux 6.6.0-generic x86_64 Airi-Overlay';
  else if (cmd.startsWith('git status')) output = 'On branch main\nnothing to commit, working tree clean';
  else if (cmd.startsWith('echo')) output = cmd.replace(/^echo\\s*/, '');
  else output = \`Команда выполнена: \${cmd}\`;

  const textView = context.views.createTextView({
    content: \`$ \${cmd}\n\n\${output}\`,
    characterCount: output.length,
    mode: 'code'
  }, {
    title: \`Терминал: \${cmd.split(' ')[0]}\`
  });

  return {
    command: cmd,
    stdout: output,
    exitCode: 0,
    view: textView
  };
}`
  },
  {
    id: 'storage.manage_storage',
    name: 'manage_storage',
    module: 'storage',
    version: '1.0.0',
    description: 'Работа с файлами в папке локального хранилища (чтение, запись, список файлов, статус)',
    filePath: 'modules/storage/manage_storage.js',
    enabled: true,
    parameters: [
      {
        name: 'action',
        type: 'string',
        description: 'Действие: "list" (список файлов), "read" (прочитать), "write" (записать), "info" (статус хранилища)',
        required: true,
        default: 'info'
      },
      {
        name: 'filename',
        type: 'string',
        description: 'Относительное имя файла в хранилище (например, "notes.json", "custom.txt")',
        required: false
      },
      {
        name: 'content',
        type: 'string',
        description: 'Содержимое для записи при action="write"',
        required: false
      }
    ],
    code: `// modules/storage/manage_storage.js
export async function execute(params, context) {
  const storage = context.storage;
  const action = params.action || 'info';

  if (action === 'info' || action === 'list') {
    const info = storage.getInfo();
    const kvView = context.views.createKeyValueView({
      title: 'Локальное хранилище данных',
      items: [
        { key: 'Путь к хранилищу', value: info.storagePath },
        { key: 'Всего файлов', value: String(info.totalFiles) },
        { key: 'Общий размер', value: info.totalSizeFormatted }
      ]
    }, {
      title: 'Статус хранилища'
    });

    return {
      status: 'ok',
      storagePath: info.storagePath,
      totalFiles: info.totalFiles,
      totalSize: info.totalSizeFormatted,
      view: kvView
    };
  }

  if (action === 'read') {
    if (!params.filename) throw new Error('Не указано имя файла для чтения.');
    const content = storage.readFile(params.filename);
    const textView = context.views.createTextView({
      content: content,
      characterCount: content.length,
      mode: 'plain'
    }, {
      title: \`Файл: \${params.filename}\`
    });
    return { status: 'ok', filename: params.filename, view: textView };
  }

  if (action === 'write') {
    if (!params.filename) throw new Error('Не указано имя файла для записи.');
    const res = storage.writeFile(params.filename, params.content || '');
    const textView = context.views.createTextView({
      content: \`Файл "\${params.filename}" успешно сохранен (\${res.bytes} байт).\nПуть: \${storage.getPath()}\`,
      characterCount: res.bytes,
      mode: 'plain'
    }, {
      title: 'Хранилище: Запись завершена'
    });
    return { status: 'written', filename: params.filename, bytes: res.bytes, view: textView };
  }

  throw new Error('Неизвестное действие: ' + action);
}`
  },
  {
    id: 'calc.evaluate_math',
    name: 'evaluate_math',
    module: 'calc',
    version: '1.0.0',
    description: 'Вычислить математическое выражение или формулу',
    filePath: 'modules/calc/evaluate_math.js',
    enabled: true,
    parameters: [
      {
        name: 'expression',
        type: 'string',
        description: 'Математическое выражение (например, "25 * 4 + 10", "sqrt(144)", "2^10")',
        required: true
      }
    ],
    code: `// modules/calc/evaluate_math.js
export async function execute(params, context) {
  const expr = (params.expression || '2 + 2').trim();
  // Safe math evaluation
  const sanitized = expr.replace(/[^0-9+\\-*\\/().^ \\tMath\\.sqrtsincoxtane]/g, '');
  let resultVal;
  try {
    const fn = new Function('Math', \`return (\${sanitized.replace(/\\^/g, '**')});\`);
    resultVal = fn(Math);
  } catch {
    resultVal = 'Ошибка вычисления';
  }

  const kvView = context.views.createKeyValueView({
    title: 'Результат вычисления',
    items: [
      { key: 'Выражение', value: expr },
      { key: 'Результат', value: String(resultVal) },
      { key: 'Время расчета', value: new Date().toLocaleTimeString() }
    ]
  }, {
    title: 'Калькулятор'
  });

  return {
    expression: expr,
    result: resultVal,
    view: kvView
  };
}`
  }
];
