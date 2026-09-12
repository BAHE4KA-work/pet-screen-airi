/**
 * Fuzzy Search & Bi-directional Keyboard Layout Converter (QWERTY <-> ЙЦУКЕН)
 * Allows smart query auto-completion from history even with layout mistakes or skipped letters.
 */

const EN_TO_RU: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю', '/': '.',
  Q: 'Й', W: 'Ц', E: 'У', R: 'К', T: 'Е', Y: 'Н', U: 'Г', I: 'Ш', O: 'Щ', P: 'З', '{': 'Х', '}': 'Ъ',
  A: 'Ф', S: 'Ы', D: 'В', F: 'А', G: 'П', H: 'Р', J: 'О', K: 'Л', L: 'Д', ':': 'Ж', '"': 'Э',
  Z: 'Я', X: 'Ч', C: 'С', V: 'М', B: 'И', N: 'Т', M: 'Ь', '<': 'Б', '>': 'Ю', '?': ','
};

const RU_TO_EN: Record<string, string> = {};
for (const [en, ru] of Object.entries(EN_TO_RU)) {
  RU_TO_EN[ru] = en;
}

/**
 * Converts text from EN layout to RU layout (e.g. "rfrfz" -> "какая")
 */
export function convertEnToRu(text: string): string {
  return text.split('').map(ch => EN_TO_RU[ch] || ch).join('');
}

/**
 * Converts text from RU layout to EN layout (e.g. "рудз" -> "help")
 */
export function convertRuToEn(text: string): string {
  return text.split('').map(ch => RU_TO_EN[ch] || ch).join('');
}

/**
 * Subsequence fuzzy matcher allowing skipped characters
 * Returns score > 0 if matched, 0 if not matched.
 */
function fuzzySubsequenceMatch(pattern: string, target: string): number {
  const p = pattern.toLowerCase();
  const t = target.toLowerCase();

  // Direct substring is best match
  if (t.includes(p)) {
    const idx = t.indexOf(p);
    return 100 - idx * 2;
  }

  let pIdx = 0;
  let tIdx = 0;
  let matches = 0;
  let consecutive = 0;
  let bonus = 0;

  while (pIdx < p.length && tIdx < t.length) {
    if (p[pIdx] === t[tIdx]) {
      matches++;
      consecutive++;
      bonus += consecutive * 2;
      pIdx++;
      tIdx++;
    } else {
      consecutive = 0;
      tIdx++;
    }
  }

  // If we matched at least 75% of pattern characters in sequence
  if (pIdx >= Math.max(2, Math.floor(p.length * 0.75))) {
    return matches * 10 + bonus - (t.length - p.length);
  }

  return 0;
}

export interface SuggestionMatch {
  text: string;
  source: 'history' | 'preset';
  score: number;
}

export const PRESET_QUERIES = [
  'Какая сейчас нагрузка на процессор?',
  'Покажи список запущенных процессов',
  'Скопируй в буфер обмена текущий статус системы',
  'Найди файлы с расширением .ts',
  'Поищи информацию о FunctionGemma',
  'Найди заметки про архитектуру модулей',
  'Проверь состояние локального хранилища storage'
];

/**
 * Finds top 3 smart suggestions for user input based on history + presets,
 * matching fuzzy substrings and handling opposite keyboard layouts.
 */
export function getSmartQuerySuggestions(
  input: string,
  history: string[],
  limit = 3
): SuggestionMatch[] {
  const rawInput = input.trim();
  if (!rawInput || rawInput.length < 2) return [];

  // Prepare input variants
  const variantOriginal = rawInput;
  const variantRu = convertEnToRu(rawInput);
  const variantEn = convertRuToEn(rawInput);
  const variants = Array.from(new Set([variantOriginal, variantRu, variantEn]));

  // Combine unique query pool (history prioritizes over presets)
  const pool: { text: string; source: 'history' | 'preset' }[] = [];
  const seen = new Set<string>();

  for (const h of history) {
    const clean = h.trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      pool.push({ text: clean, source: 'history' });
    }
  }

  for (const p of PRESET_QUERIES) {
    if (!seen.has(p.toLowerCase())) {
      seen.add(p.toLowerCase());
      pool.push({ text: p, source: 'preset' });
    }
  }

  const scored: SuggestionMatch[] = [];

  for (const item of pool) {
    // If identical to current input, skip
    if (item.text.toLowerCase() === rawInput.toLowerCase()) continue;

    let bestScore = 0;
    for (const v of variants) {
      const score = fuzzySubsequenceMatch(v, item.text);
      if (score > bestScore) {
        bestScore = score;
      }
    }

    if (bestScore > 0) {
      // Small bias towards real user history
      const historyBonus = item.source === 'history' ? 15 : 0;
      scored.push({
        text: item.text,
        source: item.source,
        score: bestScore + historyBonus
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
