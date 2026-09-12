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

  // Создаем стандартный View через интерфейс context.views
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
    iso: now.toISOString(),
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

  return {
    status: 'online',
    cpu: {
      model: cpuModel,
      cores: cpuCores,
      loadAverage1m: loadAvg[0].toFixed(2),
      loadAverage5m: loadAvg[1].toFixed(2),
      estimatedUsagePercent: Math.min(100, Math.round(loadAvg[0] * 15 + 10))
    },
    memory: {
      totalMb: totalMemMb,
      usedMb: usedMemMb,
      freeMb: freeMemMb,
      usagePercent: memUsagePercent + '%'
    },
    system: {
      platform: os.platform(),
      release: os.release(),
      uptime: uptimeHours + ' hours'
    }
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
  let processes = [];
  try {
    const cp = context.childProcess || require('child_process');
    const isWin = process.platform === 'win32';
    if (isWin) {
      const output = cp.execSync('tasklist /fo csv /nh', { encoding: 'utf-8', timeout: 2500 });
      const lines = output.trim().split('\\n');
      processes = lines.map(line => {
        const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
        const memKb = parseInt(parts[4]?.replace(/[^0-9]/g, '') || '0', 10);
        return {
          pid: parseInt(parts[1], 10) || 0,
          name: parts[0] || 'unknown',
          cpuPercent: 0,
          memMb: Math.round(memKb / 1024),
          user: 'current'
        };
      }).filter(p => p.pid > 0);
    } else {
      const output = cp.execSync('ps -eo pid,%cpu,%mem,comm --sort=-%cpu', { encoding: 'utf-8', timeout: 2500 });
      const lines = output.trim().split('\\n').slice(1);
      processes = lines.map(line => {
        const parts = line.trim().split(/\\s+/);
        return {
          pid: parseInt(parts[0], 10) || 0,
          name: parts[3] || 'unknown',
          cpuPercent: parseFloat(parts[1]) || 0,
          memMb: Math.round((parseFloat(parts[2]) || 0) * 16),
          user: 'local'
        };
      }).filter(p => p.pid > 0);
    }
  } catch (err) {
    processes = [
      { pid: process.pid, name: 'node', cpuPercent: 1.2, memMb: Math.round(process.memoryUsage().rss / (1024 * 1024)), user: 'app' }
    ];
  }

  let list = processes;
  if (params.filter_name) {
    const f = params.filter_name.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(f));
  }
  const limit = params.limit || 5;
  return {
    matchedCount: list.length,
    processes: list.slice(0, limit)
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
    return { status: 'success', action: 'write', length: context.state.clipboard.length };
  } else {
    return {
      status: 'success',
      action: 'read',
      content: context.state.clipboard || 'https://github.com/google/gemma-models'
    };
  }
}`
  },
  {
    id: 'search.web_lookup',
    name: 'web_lookup',
    module: 'search',
    version: '1.3.0',
    description: 'Быстрый веб-поиск и извлечение ключевой информации по запросу',
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
      title: 'Быстрый справочник по управлению фоновыми демонами и горячими клавишами',
      snippet: 'Оптимальные комбинации клавиш (Alt+Space, Ctrl+K) для мгновенного доступа к оверлеям и виджетам.',
      url: 'https://developer.mozilla.org/ru/docs/Web/API/KeyboardEvent'
    }
  ];
  return {
    query,
    count: results.length,
    results
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
    { id: 1, title: 'Конфигурация FunctionGemma', tags: ['ai', 'local', 'gemma'], text: 'Запуск модели с квантованием 4-bit на Ollama/vLLM с контекстом 4096 токенов.' },
    { id: 2, title: 'План модулей системы', tags: ['system', 'scripts'], text: 'Все модули должны возвращать строгий JSON и проверять контрольную сумму.' },
    { id: 3, title: 'Горячие клавиши оверлея', tags: ['ui', 'hotkeys'], text: 'Alt+Space для открытия оверлея, Esc для закрытия, Ctrl+1-4 для навигации.' }
  ];

  const kw = params.keyword.toLowerCase();
  const matched = notes.filter(n => n.title.toLowerCase().includes(kw) || n.text.toLowerCase().includes(kw) || n.tags.some(t => t.includes(kw)));
  return {
    keyword: params.keyword,
    foundCount: matched.length,
    notes: matched
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
  return {
    searchPattern: params.pattern,
    totalFound: matched.length,
    files: matched
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
  const cmd = params.command.trim();
  const allowedPrefixes = ['echo', 'node', 'git', 'date', 'uname', 'hostname', 'whoami'];
  const isAllowed = allowedPrefixes.some(p => cmd.startsWith(p));
  
  if (!isAllowed) {
    return {
      status: 'rejected',
      error: 'Команда "' + cmd + '" не входит в список разрешённых безопасных утилит.'
    };
  }

  // Simulate command execution in controlled sandbox
  if (cmd.startsWith('node')) return { stdout: 'v22.14.0', exitCode: 0 };
  if (cmd.startsWith('date')) return { stdout: new Date().toISOString(), exitCode: 0 };
  if (cmd.startsWith('uname')) return { stdout: 'Linux 6.6.0-generic x86_64', exitCode: 0 };
  if (cmd.startsWith('git status')) return { stdout: 'On branch main\\nnothing to commit, working tree clean', exitCode: 0 };
  if (cmd.startsWith('echo')) return { stdout: cmd.replace(/^echo\\s*/, ''), exitCode: 0 };

  return { stdout: 'OK: ' + cmd, exitCode: 0 };
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
    return {
      status: 'ok',
      storagePath: info.storagePath,
      totalFiles: info.totalFiles,
      totalSize: info.totalSizeFormatted,
      files: info.files.map(f => ({ name: f.name, size: f.sizeFormatted, modified: f.updatedAt }))
    };
  }

  if (action === 'read') {
    if (!params.filename) throw new Error('Не указано имя файла для чтения.');
    const content = storage.readFile(params.filename);
    return {
      status: 'ok',
      filename: params.filename,
      content: content
    };
  }

  if (action === 'write') {
    if (!params.filename) throw new Error('Не указано имя файла для записи.');
    const res = storage.writeFile(params.filename, params.content || '');
    return {
      status: 'written',
      filename: params.filename,
      bytes: res.bytes,
      storagePath: storage.getPath()
    };
  }

  throw new Error('Неизвестное действие: ' + action);
}`
  }
];
