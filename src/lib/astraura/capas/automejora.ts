/**
 * Config y datos de la automejora Meta^n de las capas (MTN1027K ·
 * `architecture/automejora-meta-n.md` §3 y §5): Meta^n propone dentro de una caja, el
 * juez de StarSeed decide fuera. PURO: sin `node:*`, red ni disco; lo lee y lo escribe
 * `/api/astraura/automejora` (solo servidor) y el cliente importa solo este módulo.
 */
import type { ArchivoDirectivas } from "./directivas";

export interface ConfigCapaAutomejora {
  encendida: boolean;
  aportar: boolean;
  preguntar: boolean;
  frecuencia: "noche" | "semana";
  topeLlamadas: number;
}

export type ConfigAutomejora = Record<string, ConfigCapaAutomejora>;

export const ACCIONES = ["encender", "apagar", "volver", "aportar", "preguntar"] as const;
export type AccionAutomejora = (typeof ACCIONES)[number];

/** La última noche de automejora (donde corrió, llamadas, qué propuso, qué aprobó el juez). */
export interface NocheAutomejora {
  fecha: string;
  donde: string;
  llamadas: number;
  propuso: string;
  aprobadas: number;
  propuestas: number;
  tareas: number;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Config por defecto de una capa: apagada (contrato §5, salvo la de Alex). */
export function configCapaDefecto(): ConfigCapaAutomejora {
  return { encendida: false, aportar: true, preguntar: false, frecuencia: "noche", topeLlamadas: 400 };
}

/** Sanea la config de una capa: valores desconocidos se caen, nunca explota. */
export function normalizarConfigCapa(v: unknown): ConfigCapaAutomejora {
  if (!esObjeto(v)) return configCapaDefecto();
  return {
    encendida: v.encendida === true,
    aportar: v.aportar !== false,
    preguntar: v.preguntar === true,
    frecuencia: v.frecuencia === "semana" ? "semana" : "noche",
    topeLlamadas:
      typeof v.topeLlamadas === "number" && Number.isFinite(v.topeLlamadas) && v.topeLlamadas >= 0
        ? Math.floor(v.topeLlamadas)
        : 400,
  };
}

/** Sanea el archivo entero `~/.starseed/automejora.json` (`Record<capa, config>`). */
export function normalizarConfigAutomejora(v: unknown): ConfigAutomejora {
  if (!esObjeto(v)) return {};
  const config: ConfigAutomejora = {};
  for (const [capa, crudo] of Object.entries(v)) if (capa) config[capa] = normalizarConfigCapa(crudo);
  return config;
}

/** La config guardada de una capa, o su defecto si aún no está en el archivo. */
export function configCapa(config: ConfigAutomejora, capa: string): ConfigCapaAutomejora {
  return esObjeto(config[capa] as unknown) ? (config[capa] as ConfigCapaAutomejora) : configCapaDefecto();
}

/** Sanea `ultima-noche.json`: sin fecha no hubo noche, y los números nunca bajan de 0. */
export function normalizarNocheAutomejora(v: unknown): NocheAutomejora | null {
  if (!esObjeto(v) || typeof v.fecha !== "string" || !v.fecha) return null;
  const num = (x: unknown): number =>
    typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
  return {
    fecha: v.fecha,
    donde: typeof v.donde === "string" ? v.donde : "",
    llamadas: num(v.llamadas),
    propuso: typeof v.propuso === "string" ? v.propuso : "",
    aprobadas: num(v.aprobadas),
    propuestas: num(v.propuestas),
    tareas: num(v.tareas),
  };
}

/**
 * Aplica una acción a la config y devuelve un archivo NUEVO (el original queda intacto).
 * `aportar`/`preguntar` aceptan `valor` (si no llegó, giran su estado actual); `volver`
 * no toca la config: la ruta escribe la vuelta en las directivas de la capa.
 */
export function aplicarAccion(
  config: ConfigAutomejora,
  capa: string,
  accion: AccionAutomejora,
  valor?: unknown,
): ConfigAutomejora {
  if (accion === "volver") return config;
  if (!capa) return config;
  const nueva: ConfigCapaAutomejora = { ...configCapa(config, capa) };
  if (accion === "encender") nueva.encendida = true;
  else if (accion === "apagar") nueva.encendida = false;
  else if (accion === "aportar" || accion === "preguntar")
    nueva[accion] = typeof valor === "boolean" ? valor : !nueva[accion];
  return { ...config, [capa]: nueva };
}

/** «52 % ahora · 48 % antes» del acierto de la capa, según su archivo de directivas. */
export function textoAcierto(archivo: ArchivoDirectivas | null): string {
  if (!archivo) return "";
  const activa =
    archivo.activa === null
      ? undefined
      : archivo.historial.find((d) => d.version === archivo.activa && d.estado === "activa");
  if (!activa) return "";
  const pcent = (d: { acierto: number }): string => `${Math.round(d.acierto * 100)} %`;
  const anterior = archivo.historial
    .filter((d) => d.estado === "anterior" && d.version < activa.version)
    .sort((a, b) => b.version - a.version)[0];
  return anterior ? `${pcent(activa)} ahora · ${pcent(anterior)} antes` : `${pcent(activa)} ahora`;
}
