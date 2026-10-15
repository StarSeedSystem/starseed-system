import { ConversorDef } from './convertidores';

function csvAJson(e: Uint8Array | string): string {
  let t = typeof e === 'string' ? e : new TextDecoder().decode(e);
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (!inQuotes && ch === ',') { row.push(field); field = ''; }
    else if (!inQuotes && (ch === '\r' || ch === '\n')) {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (ch === '\r' && t[i + 1] === '\n') i++;
    } else if (ch === '"') {
      if (inQuotes) {
        if (i + 1 < t.length && t[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        if (field === '') inQuotes = true;
        else field += ch;
      }
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return '[]';
  const header = rows[0];
  const nc = header.length;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length !== nc) throw new Error(`Fila ${i + 1}: ${rows[i].length} columnas, se esperaban ${nc}`);
  }
  const result: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const obj: Record<string, string> = {};
    for (let j = 0; j < nc; j++) obj[header[j]] = rows[i][j];
    result.push(obj);
  }
  return JSON.stringify(result);
}

function jsonACsv(e: Uint8Array | string): string {
  let t = typeof e === 'string' ? e : new TextDecoder().decode(e);
  let data: any;
  try { data = JSON.parse(t); } catch { throw new Error('Entrada JSON inválida'); }
  if (!Array.isArray(data)) throw new Error('Se esperaba un array de objetos');
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const obj of data) {
    if (obj === null || typeof obj !== 'object') throw new Error('Se esperaba un array de objetos planos');
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key) && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  for (const obj of data) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== null && typeof val === 'object') throw new Error('JSON demasiado anidado para CSV');
      }
    }
  }
  function escapeCSV(field: string): string {
    if (field == null) return '';
    const s = String(field);
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  const lines: string[] = [keys.map(escapeCSV).join(',')];
  for (const obj of data) {
    const values: string[] = [];
    for (const key of keys) {
      const val = obj[key];
      values.push(escapeCSV(val == null ? '' : val));
    }
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

function srtAVtt(e: Uint8Array | string): string {
  let t = typeof e === 'string' ? e : new TextDecoder().decode(e);
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  t = t.replace(/\r\n/g, '\n');
  const lines = t.split('\n');
  const blocks: Array<{ timestamp: string; text: string[] }> = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') { i++; continue; }
    i++; // skip number
    if (i >= lines.length) break;
    const timestamp = lines[i++].trim();
    const text: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') text.push(lines[i++]);
    blocks.push({ timestamp, text });
    if (i < lines.length && lines[i].trim() === '') i++;
  }
  const out: string[] = ['WEBVTT', ''];
  for (const b of blocks) {
    out.push(b.timestamp.replace(/,/g, '.'));
    out.push(...b.text);
    out.push('');
  }
  if (blocks.length === 0) out.pop();
  return out.join('\n');
}

function vttASrt(e: Uint8Array | string): string {
  let t = typeof e === 'string' ? e : new TextDecoder().decode(e);
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  t = t.replace(/\r\n/g, '\n');
  const lines = t.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].includes('-->')) i++;
  if (i >= lines.length) return '';
  const blocks: Array<{ timestamp: string; text: string[] }> = [];
  let blockNum = 1;
  while (i < lines.length) {
    const timestamp = lines[i++].trim();
    const text: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') text.push(lines[i++]);
    blocks.push({ timestamp, text });
    if (i < lines.length && lines[i].trim() === '') i++;
    blockNum++;
  }
  const out: string[] = [];
  for (let idx = 0; idx < blocks.length; idx++) {
    const b = blocks[idx];
    out.push(String(idx + 1));
    out.push(b.timestamp.replace(/\./g, ','));
    out.push(...b.text);
    if (idx < blocks.length - 1) out.push('');
  }
  return out.join('\n');
}

export const CONVERSORES_TEXTO: ConversorDef[] = [
  { de: 'csv', a: 'json', via: 'js', costo: 1, nombre: 'CSV a JSON', convertir: csvAJson },
  { de: 'json', a: 'csv', via: 'js', costo: 1, nombre: 'JSON a CSV', convertir: jsonACsv },
  { de: 'srt', a: 'vtt', via: 'js', costo: 1, nombre: 'SRT a VTT', convertir: srtAVtt },
  { de: 'vtt', a: 'srt', via: 'js', costo: 1, nombre: 'VTT a SRT', convertir: vttASrt },
];