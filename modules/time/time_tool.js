// modules/time/time_tool.js
export async function execute(params, context) {
  // Получаем настройки из файла config.ini данного модуля
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

  // Создаем формализованный компонент отображения через интерфейс context.views
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
}
