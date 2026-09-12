/**
 * INI Parser and Serializer for Airi modules
 */
export function parseIni(content: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let currentSection = 'default';
  result[currentSection] = {};

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim();
      if (!result[currentSection]) {
        result[currentSection] = {};
      }
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!result[currentSection]) {
        result[currentSection] = {};
      }
      result[currentSection][key] = val;
    }
  }

  return result;
}

export function stringifyIni(data: Record<string, Record<string, string>>): string {
  let output = '';
  for (const [section, values] of Object.entries(data)) {
    output += `[${section}]\n`;
    for (const [k, v] of Object.entries(values)) {
      output += `${k} = ${v}\n`;
    }
    output += '\n';
  }
  return output.trim() + '\n';
}
