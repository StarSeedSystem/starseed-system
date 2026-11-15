/**
 * timbre-sonido — UN solo sonido de timbre por aparato (TIM1115B).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Prueba 43 (15-11, 05:23-05:25): la Mac llamó a la tableta y nadie contestó; el «colgar» no llegó (`fallo señal colgar sin
 * enlace`). La segunda llamada sonó, se contestó… y el timbre siguió sonando. Cada tarjeta de timbre (`timbre.tsx`) tenía su
 * PROPIO tono y su propio temporizador: contestar la llamada B quitaba solo la tarjeta de B (`store.ponerActiva`) y el tono de
 * A, cuyo «colgar» nunca llegó, seguía hasta su propio plazo.
 *
 * Ahora quien quiere sonar lo PIDE aquí (`pedirSonido`) y este módulo mantiene como mucho un tono:
 *  · suena mientras haya al menos una petición viva; la última que se va lo para;
 *  · `silenciarTodos(motivo)` lo corta de golpe (contestar, rechazar o acabar cualquier llamada);
 *  · cada petición caduca sola a `SONIDO_MAX_MS` de su llegada (lo que espera quien llama + margen): si el «colgar» no llega,
 *    el sonido no se queda para siempre;
 *  · cada inicio y cada fin dejan su línea: `timbre-sonido inicio …` / `timbre-sonido fin motivo=…`.
 * Sin dependencias del almacén de llamadas (el almacén lo llama a él).
 */
import { ESPERA_RESPUESTA_MS } from "./adjunto";
import { crearTono, type Tono } from "./sonido";
import { anotarLlamada } from "./voz-datos/diagnostico";

/** Margen sobre lo que espera quien llama (relojes de dos aparatos, un reenvío tardío). */
export const MARGEN_SONIDO_MS = 10_000;
/** Lo más que suena un timbre desde que llegó si nadie contesta ni cuelga. */
export const SONIDO_MAX_MS = ESPERA_RESPUESTA_MS + MARGEN_SONIDO_MS;

interface Peticion {
  id: string;
  caduca: ReturnType<typeof setTimeout> | null;
}

export interface DepsSonido {
  crearTono: () => Tono;
  anotar: (detalle: string) => void;
  ahora: () => number;
}

const REAL: DepsSonido = {
  crearTono: () => crearTono("entrante"),
  anotar: (d) => anotarLlamada("timbre-sonido", null, d),
  ahora: () => Date.now(),
};

let deps: DepsSonido = REAL;
const peticiones = new Map<string, Peticion>();
let tono: Tono | null = null;
let desde = 0;

/** Solo pruebas. */
export function __fijarDepsSonido(d: Partial<DepsSonido> | null): void {
  silenciarTodos("pruebas");
  deps = d ? { ...REAL, ...d } : REAL;
}

/** ¿Está sonando algún timbre en este aparato? */
export function sonandoTimbre(): boolean {
  return tono !== null;
}

function anotar(detalle: string): void {
  try {
    deps.anotar(detalle);
  } catch {
    /* el registro nunca calla ni tumba el sonido */
  }
}

function pararTono(motivo: string, n: number): void {
  const t = tono;
  if (!t) return;
  tono = null;
  try {
    t.parar();
  } catch {
    /* ya parado */
  }
  anotar(`fin motivo=${motivo} duro-ms=${Math.max(0, deps.ahora() - desde)} restantes=${n}`);
}

function quitar(id: string, motivo: string): void {
  const p = peticiones.get(id);
  if (!p) return;
  if (p.caduca) clearTimeout(p.caduca);
  peticiones.delete(id);
  if (peticiones.size === 0) pararTono(`${motivo} sesion=${id.slice(0, 8)}`, 0);
}

/**
 * Pide que suene el timbre de `id` (la sesión). Devuelve «ya no hace falta». `llegadaMs`: cuándo llegó el timbre (el plazo
 * corre desde ahí, no desde que se pide). Pedir dos veces el mismo id no suma un segundo tono.
 */
export function pedirSonido(id: string, llegadaMs?: number): () => void {
  const llegada = typeof llegadaMs === "number" && Number.isFinite(llegadaMs) ? llegadaMs : deps.ahora();
  const resto = SONIDO_MAX_MS - (deps.ahora() - llegada);
  if (resto <= 0) {
    anotar(`caducado sesion=${id.slice(0, 8)} llegado-hace-ms=${deps.ahora() - llegada}`);
    return () => undefined;
  }
  if (!peticiones.has(id)) {
    peticiones.set(id, { id, caduca: setTimeout(() => quitar(id, "caducado"), resto) });
  }
  if (!tono) {
    try {
      tono = deps.crearTono();
      desde = deps.ahora();
      tono.iniciar();
      anotar(`inicio sesion=${id.slice(0, 8)} maximo-ms=${resto}`);
    } catch {
      tono = null;
    }
  }
  return () => quitar(id, "retirado");
}

/** Contestar, rechazar o acabar una llamada: corta TODO sonido de timbre de este aparato. */
export function silenciarTodos(motivo: string): void {
  if (peticiones.size === 0 && !tono) return;
  const n = peticiones.size;
  for (const p of peticiones.values()) if (p.caduca) clearTimeout(p.caduca);
  peticiones.clear();
  pararTono(`${motivo} cortados=${n}`, 0);
}
