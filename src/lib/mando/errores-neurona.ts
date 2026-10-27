/**
 * Módulo PURO de eventos de error con formato del SDK de Sentry para la
 * autocuración de Genesis (Ola 1020S · RLB1020J). Sin red, sin `node: *` y sin
 * envío a terceros: el servidor Sentry no cabe autoalojado y Genesis adopta solo
 * el FORMATO del evento, para poder usar sus SDK o un servidor compatible si
 * Alex lo decide. Toda pieza es entrada → salida.
 */

export const AMBITOS = [
  "neurona",
  "cerebro",
  "perfil",
  "cuenta",
  "pagina",
  "proceso",
  "contenido",
] as const;

export type AmbitoEvento = (typeof AMBITOS)[number];

/** Un marco de la pila, al estilo `stacktrace.frames` de Sentry. */
export interface MarcoPila {
  archivo: string;
  funcion?: string;
  linea?: number;
  columna?: number;
  /** Marco del código del OS (bajo `/src/`), no de dependencias ni runtime. */
  propio: boolean;
}

export interface ValorExcepcion {
  type: string;
  value: string;
  stacktrace: { frames: MarcoPila[] };
}

export interface EventoError {
  event_id: string;
  timestamp: string;
  level: "error" | "warning" | "fatal";
  platform: string;
  exception: { values: ValorExcepcion[] };
  tags: { ambito: AmbitoEvento; neurona: string; proceso: string };
  fingerprint: string[];
}

export interface ContextoError {
  ambito: AmbitoEvento;
  neurona?: string;
  proceso?: string;
}

export function normalizarError(e: unknown, contexto: ContextoError): EventoError {
  const [valor] = valoresExcepcion(e);
  const evento: EventoError = {
    event_id: generarEventId(),
    timestamp: new Date().toISOString(),
    level: "error",
    platform: "javascript",
    exception: { values: [valor] },
    tags: { ambito: contexto.ambito, neurona: contexto.neurona ?? "", proceso: contexto.proceso ?? "" },
    fingerprint: [],
  };
  return { ...evento, fingerprint: huella(evento) };
}

export function limpiarDatosPersonales(evento: EventoError): EventoError {
  const values = evento.exception.values.map((v) => ({
    type: enmascarar(v.type),
    value: enmascarar(v.value),
    stacktrace: {
      frames: v.stacktrace.frames.map((m) => ({ ...m, archivo: enmascarar(m.archivo) })),
    },
  }));
  return { ...evento, exception: { values } };
}

export function huella(evento: EventoError): string[] {
  const ultimas = evento.exception.values;
  const valor = ultimas[ultimas.length - 1];
  const propio = valor.stacktrace.frames.find((m) => m.propio);
  const marco = propio ? `${propio.archivo}:${propio.linea ?? 0}` : "sin-marco-propio";
  return [valor.type, marco, evento.tags.ambito];
}

export interface GrupoEventos {
  huella: string;
  veces: number;
  primero: string;
  ultimo: string;
  ejemplo: EventoError;
}

export function agrupar(eventos: EventoError[]): GrupoEventos[] {
  const mapa = new Map<string, GrupoEventos>();
  for (const evento of eventos) {
    const clave = huella(evento).join("|");
    const grupo = mapa.get(clave);
    if (!grupo) {
      mapa.set(clave, {
        huella: clave,
        veces: 1,
        primero: evento.timestamp,
        ultimo: evento.timestamp,
        ejemplo: evento,
      });
    } else {
      grupo.veces += 1;
      grupo.primero = evento.timestamp < grupo.primero ? evento.timestamp : grupo.primero;
      grupo.ultimo = evento.timestamp > grupo.ultimo ? evento.timestamp : grupo.ultimo;
    }
  }
  return [...mapa.values()].sort(
    (a, b) => b.veces - a.veces || (a.primero < b.primero ? -1 : 1),
  );
}

// ——— helpers internos (todavía puros) ——

function generarEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "ev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function valoresExcepcion(e: unknown): ValorExcepcion[] {
  if (e instanceof Error) {
    return [
      {
        type: e.name || "Error",
        value: e.message,
        stacktrace: { frames: marcosDePila(e.stack) },
      },
    ];
  }
  return [
    {
      type: "Error",
      value: typeof e === "string" ? e : describirObjeto(e),
      stacktrace: { frames: [] },
    },
  ];
}

function describirObjeto(e: unknown): string {
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return "[objeto no serializable]";
  }
}

function marcosDePila(stack: string | undefined): MarcoPila[] {
  if (!stack) return [];
  const marcos: MarcoPila[] = [];
  for (const linea of stack.split("\n")) {
    const conFuncion = /^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/.exec(linea.trim());
    const sinFuncion = /^at\s+(.+?):(\d+):(\d+)$/.exec(linea.trim());
    if (conFuncion) {
      marcos.push({
        funcion: conFuncion[1],
        archivo: conFuncion[2],
        linea: Number(conFuncion[3]),
        columna: Number(conFuncion[4]),
        propio: esPropio(conFuncion[2]),
      });
    } else if (sinFuncion) {
      marcos.push({
        archivo: sinFuncion[1],
        linea: Number(sinFuncion[2]),
        columna: Number(sinFuncion[3]),
        propio: esPropio(sinFuncion[1]),
      });
    }
  }
  return marcos;
}

function esPropio(archivo: string): boolean {
  return archivo.includes("/src/") && !archivo.includes("node_modules");
}

/** Pares patrón → marcador, aplicados en orden: lo estructurado primero. */
const MASCARAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]"],
  [/\b(?:sk-|gsk_)[A-Za-z0-9_-]{8,}/g, "[token]"],
  [/\bBearer [A-Za-z0-9._-]+/g, "[token]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[correo]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
  [/\+\d[\d\s().-]{8,}\d/g, "[teléfono]"],
  [/\/Users\/[A-Za-z0-9._-]+/g, "/Users/[usuario]"],
  [/\/home\/[A-Za-z0-9._-]+/g, "/home/[usuario]"],
];

function enmascarar(texto: string): string {
  let resultado = texto;
  for (const [patron, marcador] of MASCARAS) {
    resultado = resultado.replace(patron, marcador);
  }
  return resultado;
}
