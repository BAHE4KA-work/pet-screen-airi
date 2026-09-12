// modules/system/manage_processes.js
export async function execute(params, context) {
  const procConfig = context.config?.processes || {};
  const viewConfig = context.config?.view || {};

  const sampleProcesses = [
    { pid: 1042, name: 'airi-daemon', cpuPercent: 8.4, memMb: 820, user: 'local' },
    { pid: 2130, name: 'code-editor-service', cpuPercent: 3.2, memMb: 650, user: 'local' },
    { pid: 3411, name: 'node-dev-server', cpuPercent: 1.8, memMb: 240, user: 'local' },
    { pid: 4892, name: 'chrome-browser', cpuPercent: 7.5, memMb: 1120, user: 'local' },
    { pid: 5120, name: 'whisper-stt-engine', cpuPercent: 0.4, memMb: 450, user: 'system' }
  ];

  let list = sampleProcesses;
  if (params.filter_name) {
    const f = params.filter_name.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(f));
  }
  const limit = params.limit || parseInt(procConfig.default_limit || '5', 10);
  const sliced = list.slice(0, limit);

  // Формируем стандартный ListView
  const listView = context.views.createListView({
    title: params.filter_name ? `Процессы ("${params.filter_name}")` : 'Активные процессы хоста',
    items: sliced.map(p => ({
      id: p.pid,
      title: p.name,
      subtitle: `PID: ${p.pid} • Пользователь: ${p.user}`,
      badge: `${p.cpuPercent}% CPU`,
      value: `${p.memMb} MB`
    })),
    emptyText: 'Процессы не найдены'
  }, {
    title: 'Диспетчер процессов',
    pinned: viewConfig.default_pinned === 'true'
  });

  return {
    matchedCount: list.length,
    processes: sliced,
    view: listView
  };
}
