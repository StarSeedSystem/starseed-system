// Malla cristalina SiO₂ amorfa: teselas y fusión (CRDT)
// Funciones puras, sin node:* ni Supabase

import type { NeuronaReticula, SenalMedida, Tesela, Reticula } from "./tipos";

/**
 * Crea una tesela a partir de una neurona, sus señales y un reloj de Lamport.
 * @param neurona - La neurona que genera la tesela
 * @param senales - Las señales medidas por la neurona
 * @param reloj - El reloj de Lamport (debe ser mayor que el anterior)
 * @returns Una nueva tesela
 */
export function crearTesela(
  neurona: NeuronaReticula,
  senales: SenalMedida[],
  reloj: number
): Tesela {
  return {
    origen: neurona.id,
    reloj,
    neurona,
    senales,
  };
}

/**
 * Fusiona una tesela en una retícula, siguiendo las reglas de CRDT:
 * - Por origen manda la tesela con mayor reloj.
 * - En caso de empate en reloj, gana la que tenga JSON.stringify canónico menor.
 * - Nunca muta la entrada; devuelve una nueva retícula.
 * @param r - La retícula actual
 * @param t - La tesela a fusionar
 * @returns Una nueva retícula con la tesela fusionada
 */
export function fusionarTesela(r: Reticula, t: Tesela): Reticula {
  const existing = r.teselas[t.origen];
  if (!existing) {
    // No existing tesela for this origen, just add it
    return { teselas: { ...r.teselas, [t.origen]: t } };
  }
  // Compare reloj
  if (t.reloj > existing.reloj) {
    return { teselas: { ...r.teselas, [t.origen]: t } };
  }
  if (t.reloj < existing.reloj) {
    // Keep existing
    return r;
  }
  // Equal reloj: compare canonical JSON.stringify (excluding? we include whole tesela)
  const canonT = canonicalJsonStringify(t);
  const canonE = canonicalJsonStringify(existing);
  if (canonT < canonE) {
    return { teselas: { ...r.teselas, [t.origen]: t } };
  }
  // Keep existing (if equal or greater)
  return r;
}

// Helper: produce canonical JSON string with sorted keys at all depths
function canonicalJsonStringify(obj: unknown): string {
  return JSON.stringify(obj, canonicalReplacer);
}
function canonicalReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  // Sort object keys
  const sorted: Record<string, unknown> = {};
  Object.keys(value).sort().forEach(key => {
    sorted[key] = value[key as keyof typeof value];
  });
  return sorted;
}

/**
 * Fusiona un array de teselas en una retícula vacía.
 * El orden de fusión no afecta al resultado (CRDT).
 * @param teselas - Array de teselas a fusionar
 * @returns La retícula resultante
 */
export function fusionarTodas(teselas: Tesela[]): Reticula {
  let ret: Reticula = { teselas: {} };
  for (const t of teselas) {
    ret = fusionarTesela(ret, t);
  }
  return ret;
}

/**
 * Elimina de la retícula las teselas cuyas señales más antiguas (vistaEn mínima)
 * sean más viejas que el tiempo actual menos ttlMs.
 * Nota: El contrato dice: "cadenar(r, ahora, ttlMs) quita teselas cuyas señales más nuevas (`vistaEn`) sean más viejas que ttl"
 * Pero parece un error: debería ser las señales más antiguas? Vamos a interpretar como:
 *   Se elimina una tesela si para TODAS sus señales, vistaEn < (ahora - ttlMs)
 *   Es decir, si la señal más reciente (máxima vistaEn) es todavía más vieja que el umbral, entonces la tesela está completamente caducada.
 *   Sin embargo, el contrato dice: "señales más nuevas (vistaEn)" y "más viejas que ttl". 
 *   Vamos a seguir exactamente lo que dice: eliminar teselas donde la señal más nueva (máxima vistaEn) es más vieja que (ahora - ttlMs).
 *   Eso significa que si incluso la señal más reciente es antigua, entonces toda la tesela es antigua.
 *   Pero eso parece demasiado estricto. Vamos a revisar el contrato original en la tarea:
 *   "caducar(r, ahora, ttlMs) quita teselas cuyas señales más nuevas (`vistaEn`) sean más viejas que ttl"
 *   Así que usaremos: max(vistaEn de las señales) < (ahora - ttlMs)
 * @param r - La retícula
 * @param ahora - Tiempo actual en milisegundos
 * @param ttlMs - Tiempo de vida en milisegundos
 * @returns Una nueva retícula sin las teselas caducadas
 */
export function caducar(r: Reticula, ahora: number, ttlMs: number): Reticula {
  const cutoff = ahora - ttlMs;
  const next: Record<string, Tesela> = {};
  for (const [id, tesela] of Object.entries(r.teselas)) {
    if (tesela.senales.length === 0) {
      // No signals, keep it (cannot judge)
      next[id] = tesela;
      continue;
    }
    const maxVistaEn = Math.max(...tesela.senales.map(s => s.vistaEn));
    if (maxVistaEn >= cutoff) {
      next[id] = tesela;
    }
    // else: drop (expired)
  }
  return { teselas: next };
}

/**
 * Obtiene las señales de la retícula, combinando por claveSenal (de MC1012A).
 * Para cada claveSenal, se queda con la medida PEOR de las dos puntas:
 *   - rssiDbm: menor (peor)
 *   - snrDb: menor (peor)
 *   - rttMs: mayor (peor)
 *   - perdidaPct: mayor (peor)
 *   - anchoBandaKbps: menor (peor)
 *   - vistaEn: el mayor entre las dos puntas (la más reciente)
 * Si solo existe una punta, se usa esa medida.
 * @param r - La retícula
 * @returns Array de señales medidas combinadas
 */
import { claveSenal } from "./tipos";

export function senalesDeReticula(r: Reticula): SenalMedida[] {
  const groups: Map<string, SenalMedida[]> = new Map();
  for (const tesela of Object.values(r.teselas)) {
    for (const s of tesela.senales) {
      const key = claveSenal(s);
      const list = groups.get(key) ?? [];
      list.push(s);
      groups.set(key, list);
    }
  }
  const result: SenalMedida[] = [];
  for (const [key, signals] of groups.entries()) {
    // Find signal with max vistaEn to get de,a
    let maxSignal = signals[0];
    for (const s of signals) {
      if (s.vistaEn > maxSignal.vistaEn) {
        maxSignal = s;
      }
    }
    // Compute aggregated fields
    let rssiDbm: number | undefined;
    let snrDb: number | undefined;
    let rttMs: number | undefined;
    let perdidaPct: number | undefined;
    let anchoBandaKbps: number | undefined;
    let vistaEn = maxSignal.vistaEn; // already max
    for (const s of signals) {
      if (typeof s.rssiDbm === 'number') {
        rssiDbm = rssiDbm === undefined ? s.rssiDbm : Math.min(rssiDbm, s.rssiDbm);
      }
      if (typeof s.snrDb === 'number') {
        snrDb = snrDb === undefined ? s.snrDb : Math.min(snrDb, s.snrDb);
      }
      if (typeof s.rttMs === 'number') {
        rttMs = rttMs === undefined ? s.rttMs : Math.max(rttMs, s.rttMs);
      }
      if (typeof s.perdidaPct === 'number') {
        perdidaPct = perdidaPct === undefined ? s.perdidaPct : Math.max(perdidaPct, s.perdidaPct);
      }
      if (typeof s.anchoBandaKbps === 'number') {
        anchoBandaKbps = anchoBandaKbps === undefined ? s.anchoBandaKbps : Math.min(anchoBandaKbps, s.anchoBandaKbps);
      }
    }
    const combined: SenalMedida = {
      de: maxSignal.de,
      a: maxSignal.a,
      medio: maxSignal.medio, // keep medio from maxSignal (could be any)
      ...(rssiDbm !== undefined ? { rssiDbm } : {}),
      ...(snrDb !== undefined ? { snrDb } : {}),
      ...(rttMs !== undefined ? { rttMs } : {}),
      ...(perdidaPct !== undefined ? { perdidaPct } : {}),
      ...(anchoBandaKbps !== undefined ? { anchoBandaKbps } : {}),
      vistaEn,
    };
    result.push(combined);
  }
  return result;
}

/**
 * Calcula la huella de la retícula como FNV-1a de 64 bits en hex (BigInt)
 * sobre JSON canónico:
 *   - Claves ordenadas a cualquier profundidad
 *   - Teselas ordenadas por origen
 *   - SIN el campo `firma` de cada tesela
 * @param r - La retícula
 * @returns Huella como string hexadecimal (16 caracteres para 64 bits)
 */
export function huellaReticula(r: Reticula): string {
  // Build teselas array sorted by origen, without firma field
  const teselasArray: Omit<Tesela, 'firma'>[] = Object.entries(r.teselas)
    .map(([id, tesela]) => ({
      origen: tesela.origen,
      reloj: tesela.reloj,
      neurona: tesela.neurona,
      senales: tesela.senales,
      huella: tesela.huella,
    }))
    .sort((a, b) => a.origen.localeCompare(b.origen));
  const obj = { teselas: teselasArray };
  const canonical = canonicalJsonStringify(obj);
  const hashBytes = new TextEncoder().encode(canonical);
  // FNV-1a de 64 bits. La máscara se aplica DENTRO del bucle: sin ella el BigInt
  // crece un byte por iteración y el tiempo es cuadrático (medido: 11 s con 256
  // neuronas). Con la máscara el valor se queda en 64 bits y el bucle es lineal.
  // El resultado es idéntico: es aritmética módulo 2^64.
  const MASCARA = BigInt("0xffffffffffffffff");
  let hash = BigInt("0xcbf29ce484222325");
  for (const b of hashBytes) {
    hash = ((hash ^ BigInt(b)) * BigInt("0x100000001b3")) & MASCARA;
  }
  return hash.toString(16).padStart(16, '0');
}