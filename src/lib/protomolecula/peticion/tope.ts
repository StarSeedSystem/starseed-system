/**
 * Petición a la Protomolécula · TOPE por hora y por agente (Ola 1026P · P3).
 * Ninguna IA se llama en bucle ni sin tope: cada consulta al enrutador gasta una ficha de una ventana deslizante de
 * una hora, por agente. Las reglas locales no gastan. Módulo PURO: el reloj y el almacén entran por parámetro (en el
 * navegador, `localStorage`; sin él, memoria del proceso).
 */
export const CLAVE_TOPE = "starseed.protomolecula.peticion.tope.v1";
/** Consultas a la IA por hora: la persona desde la ventana, y un agente de Astraura (más corto: lo dispara una IA). */
export const TOPE_PERSONA_POR_HORA = 12;
export const TOPE_AGENTE_POR_HORA = 4;
const HORA_MS = 60 * 60 * 1000;
const MAX_CLAVES = 40;

export interface AlmacenTope { getItem(k: string): string | null; setItem(k: string, v: string): void }

const enMemoria = new Map<string, string>();
const almacenMemoria: AlmacenTope = { getItem: (k) => enMemoria.get(k) ?? null, setItem: (k, v) => { enMemoria.set(k, v); } };

function unir(a: string | null, b: string | null): string | null {
  if (!a || !b) return a ?? b;
  try {
    const x = JSON.parse(a) as Record<string, unknown>, y = JSON.parse(b) as Record<string, unknown>, r: Record<string, number[]> = {};
    // Unión de MULTICONJUNTOS: la misma marca guardada en los dos sitios cuenta una vez, pero dos consultas en el mismo
    // milisegundo (marca repetida) siguen siendo dos: se toma el máximo de repeticiones de cada marca, no un conjunto.
    const veces = (v: unknown): Map<number, number> => {
      const c = new Map<number, number>();
      for (const n of Array.isArray(v) ? v : []) if (typeof n === "number" && Number.isFinite(n)) c.set(n, (c.get(n) ?? 0) + 1);
      return c;
    };
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const a1 = veces(x[k]), b1 = veces(y[k]), marcas: number[] = [];
      for (const n of new Set([...a1.keys(), ...b1.keys()])) for (let i = Math.max(a1.get(n) ?? 0, b1.get(n) ?? 0); i > 0; i--) marcas.push(n);
      r[k] = marcas.sort((m, n) => m - n);
    }
    return JSON.stringify(r);
  } catch { return a; }
}

/**
 * El almacén del navegador si responde. Escribe SIEMPRE también en memoria y lee la unión de ambos: si
 * `localStorage` está bloqueado o lleno, el tope de este proceso sigue contando (nunca una vía libre para un bucle).
 */
export function almacenPorDefecto(): AlmacenTope {
  let local: Storage | null = null;
  try { if (typeof window !== "undefined" && window.localStorage) local = window.localStorage; } catch { local = null; }
  if (!local) return almacenMemoria;
  const l = local;
  return {
    getItem: (k) => { let v: string | null = null; try { v = l.getItem(k); } catch { v = null; } return unir(v, enMemoria.get(k) ?? null); },
    setItem: (k, v) => { enMemoria.set(k, v); try { l.setItem(k, v); } catch { /* lleno o bloqueado: queda en memoria */ } },
  };
}

type Registro = Record<string, number[]>;
function leer(a: AlmacenTope, ahora: number): Registro {
  let bruto: unknown;
  try { bruto = JSON.parse(a.getItem(CLAVE_TOPE) ?? "{}"); } catch { return {}; }
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const r: Registro = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>).slice(0, MAX_CLAVES)) {
    if (!Array.isArray(v)) continue;
    const marcas = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && ahora - x < HORA_MS && x <= ahora + 60_000);
    if (marcas.length) r[k.slice(0, 80)] = marcas.slice(-100);
  }
  return r;
}

export interface EstadoTope { usadas: number; maximo: number; restantes: number; reintentoEnMin: number }

/** Cuántas consultas lleva este agente en la última hora (no gasta ninguna). */
export function estadoTope(agenteId: string, maximo: number, o: { ahora?: number; almacen?: AlmacenTope } = {}): EstadoTope {
  const ahora = o.ahora ?? Date.now();
  const marcas = leer(o.almacen ?? almacenPorDefecto(), ahora)[agenteId] ?? [];
  const restantes = Math.max(0, maximo - marcas.length);
  const reintentoEnMin = restantes > 0 || !marcas.length ? 0 : Math.max(1, Math.ceil((marcas[0] + HORA_MS - ahora) / 60_000));
  return { usadas: marcas.length, maximo, restantes, reintentoEnMin };
}

/** Gasta una ficha si queda alguna. `ok: false` lleva en cuántos minutos vuelve a haber. */
export function consumirTope(agenteId: string, maximo: number, o: { ahora?: number; almacen?: AlmacenTope } = {}): { ok: true; restantes: number } | { ok: false; reintentoEnMin: number } {
  const ahora = o.ahora ?? Date.now();
  const almacen = o.almacen ?? almacenPorDefecto();
  const reg = leer(almacen, ahora);
  const marcas = reg[agenteId] ?? [];
  if (marcas.length >= maximo) return { ok: false, reintentoEnMin: Math.max(1, Math.ceil((marcas[0] + HORA_MS - ahora) / 60_000)) };
  reg[agenteId] = [...marcas, ahora];
  try { almacen.setItem(CLAVE_TOPE, JSON.stringify(reg)); } catch { /* sin almacén: el tope de este proceso sigue en `reg` solo esta vez */ }
  return { ok: true, restantes: maximo - reg[agenteId].length };
}

/** Solo para pruebas. */
export function vaciarTopeEnMemoria(): void { enMemoria.clear(); }
