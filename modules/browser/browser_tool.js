// modules/browser/browser_tool.js
export async function execute(params, context) {
  const browserConfig = context.config?.search || {};
  const viewConfig = context.config?.view || {};

  let targetUrl = params.url;
  if (!targetUrl && params.search_query) {
    const engine = browserConfig.default_search_engine || 'google';
    if (engine === 'yandex') {
      targetUrl = 'https://ya.ru/search/?text=' + encodeURIComponent(params.search_query);
    } else {
      targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(params.search_query);
    }
  }

  if (!targetUrl) {
    throw new Error('Укажите url или search_query для навигации.');
  }

  const kvView = context.views.createKeyValueView({
    title: 'Веб-навигация',
    entries: [
      { label: 'Целевой URL', value: targetUrl, highlight: true },
      { label: 'Действие', value: 'Готово к переходу' },
      { label: 'Поисковик', value: browserConfig.default_search_engine || 'google' }
    ]
  }, {
    title: 'Браузер',
    pinned: viewConfig.default_pinned === 'true'
  });

  return {
    url: targetUrl,
    opened: true,
    view: kvView
  };
}
