// Malla cristalina SiO₂ amorfa: teselas que se fusionan solas (CRDT) y huella común.
// Puro: sin node:* ni Supabase. Contrato: architecture/malla-cristalina-sio2.md §2.

import type { Reticula, SenalMedida, Tesela } from './tipos';
import { claveSenal } from './tipos';

// JSON canónico: claves ordenadas a cualquier profundidad, arrays en su orden.
export function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  const o = v as Record<string, unknown>;
  const claves = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
}

// Hash puro de 53 bits (cyrb53) en hexadecimal: la huella no es criptográfica,
// solo sirve para comparar retículas («misma retícula en N de M neuronas»).
export function huellaTexto(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// Sin el campo `firma`: la huella es del contenido, no de quién la lleva.
function sinFirma(t: Tesela): Omit<Tesela, 'firma'> {
  const { firma: _omitida, ...resto } = t;
  return resto;
}

// Huella común de la retícula: JSON canónico con teselas ordenadas por origen.
export function huellaReticula(r: Reticula): string {
  const teselas = Object.keys(r.teselas).sort().map((id) => sinFirma(r.teselas[id]));
  return huellaTexto(canonico(teselas));
}

// CRDT por origen: manda la de mayor reloj de Lamport; empate, la de canonico mayor.
export function ganaTesela(a: Tesela, b: Tesela): Tesela {
  if (a.reloj !== b.reloj) return a.reloj > b.reloj ? a : b;
  return canonico(sinFirma(a)) >= canonico(sinFirma(b)) ? a : b;
}

// Fusión conmutativa: en cualquier orden da la misma retícula (y la misma huella).
export function fusionar(x: Reticula, y: Reticula): Reticula {
  const teselas: Reticula['teselas'] = { ...x.teselas };
  for (const [origen, t] of Object.entries(y.teselas)) {
    const previa = teselas[origen];
    teselas[origen] = previa === undefined ? t : ganaTesela(previa, t);
  }
  return { teselas };
}

const peor = {
  rssiDbm: (a: number, b: number) => Math.min(a, b),      // más negativo, peor
  snrDb: (a: number, b: number) => Math.min(a, b),
  rttMs: (a: number, b: number) => Math.max(a, b),
  anchoBandaKbps: (a: number, b: number) => Math.min(a, b),
  perdidaPct: (a: number, b: number) => Math.max(a, b),
} as const;

// Dos puntas del mismo enlace se combinan en la PEO medida (conservador, §2).
function unirSenal(a: SenalMedida, b: SenalMedida): SenalMedida {
  const reciente = a.vistaEn >= b.vistaEn ? a : b;
  const salida: SenalMedida = {
    de: a.de < a.a ? a.de : a.a,
    a: a.de < a.a ? a.a : a.de,
    medio: a.medio,
    vistaEn: Math.max(a.vistaEn, b.vistaEn),
    frecuenciaMhz: reciente.frecuenciaMhz,
    anchoCanalMhz: reciente.anchoCanalMhz,
  };
  for (const k of Object.keys(peor) as (keyof typeof peor)[]) {
    const va = a[k];
    const vb = b[k];
    if (va !== undefined || vb !== undefined) {
      salida[k] = va === undefined ? vb : vb === undefined ? va : peor[k](va, vb);
    }
  }
  return salida;
}

// Señales de toda la retícula, una por par+medio, combinadas en la peor medida.
export function senalesDeReticula(r: Reticula): SenalMedida[] {
  const porClave = new Map<string, SenalMedida>();
  for (const t of Object.values(r.teselas)) {
    for (const s of t.senales) {
      const clave = claveSenal(s);
      const previa = porClave.get(clave);
      porClave.set(clave, previa === undefined ? s : unirSenal(previa, s));
    }
  }
  return [...porClave.values()].sort((x, y) => claveSenal(x).localeCompare(claveSenal(y)));
}

// Caducidad: una tesela sin latido en 3 latidos sale de la retícula (§2).
// Sin señales se conserva: no hay fecha fiable que la caduque.
export function caducarTeselas(r: Reticula, ahoraMs: number, latidoMs = 5000, latidos = 3): Reticula {
  const limite = ahoraMs - latidoMs * latidos;
  const teselas: Reticula['teselas'] = {};
  for (const [origen, t] of Object.entries(r.teselas)) {
    const ultima = t.senales.reduce((m, s) => Math.max(m, s.vistaEn), -Infinity);
    if (ultima === -Infinity || ultima >= limite) teselas[origen] = t;
  }
  return { teselas };
}
