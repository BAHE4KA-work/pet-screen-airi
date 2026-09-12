// modules/calc/calc_tool.js
export async function execute(params, context) {
  const expr = params.expression;
  if (!expr) {
    throw new Error('Параметр expression обязателен для вычисления.');
  }

  const sanitized = String(expr).replace(/[^0-9+\-*/().,%^ \tMath.sqrtpieE]/g, '');
  let result;
  try {
    const fn = new Function('return (' + sanitized + ')');
    result = fn();
  } catch (e) {
    throw new Error('Некорректное математическое выражение: ' + expr);
  }

  const kvView = context.views.createKeyValueView({
    title: 'Результат вычисления',
    entries: [
      { label: 'Выражение', value: expr },
      { label: 'Ответ', value: String(result), highlight: true },
      { label: 'Тип', value: typeof result }
    ]
  }, {
    title: 'Калькулятор Airi',
    pinned: false
  });

  return {
    expression: expr,
    result: result,
    view: kvView
  };
}
