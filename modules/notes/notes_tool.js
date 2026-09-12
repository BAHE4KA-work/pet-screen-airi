// modules/notes/notes_tool.js
export async function execute(params, context) {
  const notesConfig = context.config?.storage || {};
  const viewConfig = context.config?.view || {};

  context.state.customNotes = context.state.customNotes || [
    { id: 1, title: 'Запустить дообучение FunctionGemma', date: '2026-09-12 10:30', tag: 'AI' },
    { id: 2, title: 'Проверить контрольные суммы модулей', date: '2026-09-12 11:15', tag: 'Dev' },
    { id: 3, title: 'Протестировать закрепление окон Views', date: '2026-09-12 14:00', tag: 'UX' }
  ];

  const action = params.action || 'list';
  if (action === 'add' && params.text) {
    const newNote = {
      id: Date.now(),
      title: params.text,
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      tag: params.tag || 'Общее'
    };
    context.state.customNotes.unshift(newNote);

    const listView = context.views.createListView({
      title: 'Быстрые заметки (Добавлена новая)',
      items: context.state.customNotes.slice(0, 8).map(n => ({
        id: n.id,
        title: n.title,
        subtitle: n.date,
        badge: n.tag
      }))
    }, {
      title: 'Заметки',
      pinned: viewConfig.default_pinned === 'true'
    });

    return {
      status: 'created',
      added: newNote,
      totalNotes: context.state.customNotes.length,
      view: listView
    };
  }

  let list = context.state.customNotes;
  if (params.search_query) {
    const q = params.search_query.toLowerCase();
    list = list.filter(n => n.title.toLowerCase().includes(q) || (n.tag && n.tag.toLowerCase().includes(q)));
  }

  const listView = context.views.createListView({
    title: params.search_query ? `Заметки по запросу "${params.search_query}"` : 'Быстрые заметки',
    items: list.slice(0, 8).map(n => ({
      id: n.id,
      title: n.title,
      subtitle: n.date,
      badge: n.tag
    })),
    emptyText: 'Заметок пока нет'
  }, {
    title: 'Заметки',
    pinned: viewConfig.default_pinned === 'true'
  });

  return {
    action,
    matchedCount: list.length,
    notes: list,
    view: listView
  };
}
