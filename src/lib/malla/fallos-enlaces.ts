/**
 * fallos-enlaces — qué carril falló con qué pareja, y cuándo se reintenta (2026-11-09 · MTZ1109A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Cuando los DOS extremos anuncian un carril pero no abre (permiso, radio ocupada, el otro no contesta…), se anota el
 * fallo POR PAREJA Y CARRIL, la matriz (`decidirPareja({ caidas })`) salta al siguiente y se reintenta con espera
 * creciente: 30 s, 1 min, 2 min… hasta 10 min. Un éxito borra el fallo. Se cuenta en Señales:
 * «Wi‑Fi Direct con <neurona>: falló (motivo) · sigue por Bluetooth». Módulo con estado mínimo, reloj inyectable y
 * sin I/O: nunca lanza. Contrato: `architecture/matriz-enlaces-directos.md` §5.
 */

import { decidirPareja, lanaDeEnlace, nombreLanaMatriz, type Lana, type NeuronaLanas, type OpcionesPareja } from "./matriz-enlaces";

export const ESPERA_BASE_MS = 30_000;
export const ESPERA_MAX_MS = 10 * 60_000;
/** Un fallo sin repetirse en este tiempo se olvida del todo. */
export const OLVIDO_MS = 60 * 60_000;

export interface FalloEnlace {
  /** La otra neurona de la pareja. */
  otra: string;
  lana: Lana;
  motivo: string;
  /** Veces seguidas que falló. */
  veces: number;
  /** Último fallo (epoch ms). */
  at: number;
  /** No se reintenta antes de esto (epoch ms). */
  hasta: number;
}

/** Espera tras el fallo número `veces` (1 = la primera). Pura. */
export function esperaTrasFallo(veces: number): number {
  const n = Math.max(1, Math.floor(veces));
  return Math.min(ESPERA_MAX_MS, ESPERA_BASE_MS * 2 ** (n - 1));
}

const clave = (otra: string, lana: Lana) => `${otra}|${lana}`;
let fallos = new Map<string, FalloEnlace>();
const oyentes = new Set<() => void>();
let version = 0;
let instantanea: readonly FalloEnlace[] = [];

function avisar(): void {
  version++;
  instantanea = Array.from(fallos.values()).sort((a, b) => b.at - a.at);
  for (const f of Array.from(oyentes)) {
    try {
      f();
    } catch {
      /* un oyente roto no frena a los demás */
    }
  }
}

/** Anota que `lana` falló con `otra`. Devuelve el fallo (con su espera). Nunca lanza. */
export function registrarFalloEnlace(otra: string, lana: Lana, motivo: string, ahora: number = Date.now()): FalloEnlace | null {
  if (!otra) return null;
  const previo = fallos.get(clave(otra, lana));
  const veces = previo && ahora - previo.at < OLVIDO_MS ? previo.veces + 1 : 1;
  const f: FalloEnlace = { otra, lana, motivo: (motivo || "sin motivo").slice(0, 160), veces, at: ahora, hasta: ahora + esperaTrasFallo(veces) };
  fallos.set(clave(otra, lana), f);
  avisar();
  return f;
}

/** Un carril abrió bien con esa pareja: se olvida su fallo. */
export function registrarExitoEnlace(otra: string, lana: Lana): void {
  if (fallos.delete(clave(otra, lana))) avisar();
}

/** ¿Está ese carril en espera con esa pareja? Pura sobre el estado. */
export function enEspera(otra: string, lana: Lana, ahora: number = Date.now()): boolean {
  const f = fallos.get(clave(otra, lana));
  return !!f && ahora < f.hasta;
}

/** ¿Este enlace del transporte va por un carril en espera con su neurona? (sin dato, no). */
export function enlaceEnEspera(e: { id: string; tipo: string; alcanza: { neuronDeviceId?: string } }, ahora: number = Date.now()): boolean {
  const lana = lanaDeEnlace(e.id, e.tipo);
  return !!lana && !!e.alcanza.neuronDeviceId && enEspera(e.alcanza.neuronDeviceId, lana, ahora);
}

/** Carriles en espera ahora con esa pareja (para `decidirPareja({ caidas })`). */
export function lanasCaidas(otra: string, ahora: number = Date.now()): Lana[] {
  const out: Lana[] = [];
  for (const f of fallos.values()) if (f.otra === otra && ahora < f.hasta) out.push(f.lana);
  return out;
}

/** Los fallos que se conocen (más reciente primero). Referencia estable entre cambios. */
export function fallosEnlaces(): readonly FalloEnlace[] {
  return instantanea;
}

export function suscribirFallosEnlaces(f: () => void): () => void {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Solo para pruebas. */
export function olvidarFallosEnlaces(): void {
  fallos = new Map();
  avisar();
}

/** Versión que sube con cada cambio (para dependencias de memo). */
export function versionFallosEnlaces(): number {
  return version;
}

/**
 * Frase de Señales: «Wi‑Fi Direct con Portátil: falló (sin permiso) · sigue por Bluetooth». `siguiente`: el carril
 * que la matriz usa ahora con esa pareja (null: ninguno directo). Pura.
 */
export function textoFalloSenal(nombreOtra: string, f: Pick<FalloEnlace, "lana" | "motivo">, siguiente: Lana | null): string {
  const cola = siguiente ? `sigue por ${nombreLanaMatriz(siguiente).replace(/^red local$/, "la red local")}` : "sin carril directo: sigue por la malla";
  return `${nombreLanaMatriz(f.lana)} con ${nombreOtra}: falló (${f.motivo}) · ${cola}`;
}

/**
 * Calcula la decisión de la pareja con los fallos de ahora y devuelve, para cada fallo vigente, su frase de Señales.
 * `nombreDe`: nombre legible de la otra neurona. Pura sobre el estado.
 */
export function frasesFallos(
  yo: NeuronaLanas,
  otras: ReadonlyMap<string, NeuronaLanas>,
  nombreDe: (id: string) => string,
  ahora: number = Date.now(),
  opciones: OpcionesPareja = {},
): Array<{ otra: string; lana: Lana; texto: string }> {
  const out: Array<{ otra: string; lana: Lana; texto: string }> = [];
  for (const f of fallos.values()) {
    if (ahora >= f.hasta) continue;
    const o = otras.get(f.otra);
    const siguiente = o ? (decidirPareja(yo, o, { ...opciones, caidas: lanasCaidas(f.otra, ahora) }).lanas[0]?.lana ?? null) : null;
    out.push({ otra: f.otra, lana: f.lana, texto: textoFalloSenal(nombreDe(f.otra), f, siguiente) });
  }
  return out;
}
