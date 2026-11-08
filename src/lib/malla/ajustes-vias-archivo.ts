/**
 * ajustes-vias-archivo — qué vías puede usar un archivo y con qué topes (MPT1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   · `modo`: «automatico» (por defecto) usa TODAS las vías permitidas que llegan al destino; «directas» solo enlaces
 *     directos (red local, Wi‑Fi directo, Bluetooth, WebRTC), sin relés.
 *   · Relés (solo texto cifrado, el archivo siempre va sellado): tus otras neuronas (sí por defecto, con tope de batería y
 *     de datos), tus servidores y el relé de StarSeed (sí por defecto, con tope de bytes) y los de terceros (NO por defecto).
 * Los ajustes por chat («medio») siguen mandando: este módulo solo decide lo que se permite ADEMÁS de ellos.
 * Puro salvo la lectura/escritura en `localStorage` (envuelta en try/catch).
 */

export type ModoVias = "automatico" | "directas";

export interface AjustesViasArchivo {
  modo: ModoVias;
  releNeuronas: boolean;
  releServidor: boolean;
  releTerceros: boolean;
  /** Tope de bytes de ARCHIVO por cada vía de relé (MPT1108A: 64 MiB). */
  maxBytesRele: number;
  /** Un relé solo se usa para archivos de al menos este tamaño (los pequeños van por las vías directas). */
  minBytesRele: number;
  /** Datos que esta neurona presta como salto de otras por día. */
  maxBytesSaltoDia: number;
  /** Batería mínima (0..1) para hacer de salto si no está cargando. */
  bateriaMinSalto: number;
}

export const MAX_BYTES_RELE_POR_DEFECTO = 64 * 1024 * 1024;

export const AJUSTES_VIAS_POR_DEFECTO: AjustesViasArchivo = {
  modo: "automatico",
  releNeuronas: true,
  releServidor: true,
  releTerceros: false,
  maxBytesRele: MAX_BYTES_RELE_POR_DEFECTO,
  minBytesRele: 1024 * 1024,
  maxBytesSaltoDia: 256 * 1024 * 1024,
  bateriaMinSalto: 0.3,
};

const CLAVE = "starseed.archivos.vias.v1";

export function normalizarAjustesVias(x: unknown): AjustesViasArchivo {
  const d = AJUSTES_VIAS_POR_DEFECTO;
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const num = (v: unknown, def: number, min: number, max: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  const bool = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);
  return {
    modo: o.modo === "directas" ? "directas" : "automatico",
    releNeuronas: bool(o.releNeuronas, d.releNeuronas),
    releServidor: bool(o.releServidor, d.releServidor),
    releTerceros: bool(o.releTerceros, d.releTerceros),
    maxBytesRele: num(o.maxBytesRele, d.maxBytesRele, 0, 1024 * 1024 * 1024),
    minBytesRele: num(o.minBytesRele, d.minBytesRele, 0, 1024 * 1024 * 1024),
    maxBytesSaltoDia: num(o.maxBytesSaltoDia, d.maxBytesSaltoDia, 0, 64 * 1024 * 1024 * 1024),
    bateriaMinSalto: num(o.bateriaMinSalto, d.bateriaMinSalto, 0, 1),
  };
}

export function leerAjustesVias(): AjustesViasArchivo {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CLAVE) : null;
    return normalizarAjustesVias(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...AJUSTES_VIAS_POR_DEFECTO };
  }
}

export function guardarAjustesVias(cambio: Partial<AjustesViasArchivo>): AjustesViasArchivo {
  const nuevo = normalizarAjustesVias({ ...leerAjustesVias(), ...cambio });
  try {
    localStorage.setItem(CLAVE, JSON.stringify(nuevo));
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  return nuevo;
}

/** ¿Puede esta neurona hacer de salto ahora? Puro. `usadoHoy` = bytes ya prestados hoy. */
export function topesSalto(
  a: Pick<AjustesViasArchivo, "releNeuronas" | "maxBytesSaltoDia" | "bateriaMinSalto">,
  estado: { bateria: number | null; cargando: boolean; usadoHoy: number; bytes: number },
): { ok: boolean; motivo?: string } {
  if (!a.releNeuronas) return { ok: false, motivo: "hacer de salto para tus otras neuronas está apagado" };
  if (!estado.cargando && estado.bateria !== null && estado.bateria < a.bateriaMinSalto) {
    return { ok: false, motivo: `batería por debajo del ${Math.round(a.bateriaMinSalto * 100)} % y sin cargar` };
  }
  if (estado.usadoHoy + estado.bytes > a.maxBytesSaltoDia) return { ok: false, motivo: "tope diario de datos prestados alcanzado" };
  return { ok: true };
}
