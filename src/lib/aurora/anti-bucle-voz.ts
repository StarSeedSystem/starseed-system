/**
 * Anti-bucle de voz (2026-09-27): detector puro de eco propio, bucles y
 * repeticiones. Sin React, sin DOM, sin reloj propio: el tiempo entra por
 * parámetro para que las pruebas sean deterministas.
 *
 * Contexto: en la tablet la cola de la propia voz de Astraura entra por el
 * micro como si fuera el usuario y responde a sus propias palabras (bucle).
 * Además BitNet 2B sin penalización de repetición a veces genera la misma
 * frase varias veces seguidas.
 */

/** Segundos que se recuerda lo dicho por Astraura. */
const MEMORIA_DICHOS_MS = 45_000;
/** Máximo de textos dichos que se conservan. */
const MAX_DICHOS = 20;
/** Palabras mínimas para que una transcripción pueda considerarse eco. */
const MIN_PALABRAS_ECO = 3;
/** Porcentaje mínimo de palabras compartidas para considerar eco parcial. */
const RATIO_ECO = 0.6;
/** Tramo de palabras seguidas que delata el eco. */
const TRAMO_ECO = 4;
/** Turnos de voz seguidos tras los que se corta el bucle. */
const MAX_TURNOS_VOZ = 3;
/** Silencio máximo después de que ella calló para sospechar rebote. */
const REBOTE_MS = 4_000;
/** Parecido Jaccard mínimo entre una respuesta y una anterior para cortar. */
const JACCARD_REPETICION = 0.8;
/** Respuestas anteriores contra las que se compara la repetición. */
const RESPUESTAS_COMPARADAS = 2;
/** Tramo mínimo de palabras para detectar generación degenerada. */
const TRAMO_DEGENERADO = 6;
/** Repeticiones mínimas del tramo para considerar el texto degenerado. */
const VECES_DEGENERADO = 3;

export interface TurnoVoz {
  origen: "voz" | "texto";
  msDesdeQueCalló: number | null;
  respuesta: string;
  ahora: number;
}

export interface VeredictoTurno {
  cortar: boolean;
  motivo?: string;
}

export interface DetectorBucle {
  anotarTurno(turno: TurnoVoz): VeredictoTurno;
  reiniciar(): void;
}

export function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const dichos: { palabras: string[]; ahora: number }[] = [];

/** Registra un texto dicho por Astraura para futura detección de eco. */
export function registrarDicho(texto: string, ahora: number): void {
  const palabras = normalizar(texto);
  if (palabras.length === 0) return;
  podarDichos(ahora);
  dichos.push({ palabras, ahora });
  while (dichos.length > MAX_DICHOS) dichos.shift();
}

function podarDichos(ahora: number): void {
  while (dichos.length > 0 && ahora - dichos[0].ahora > MEMORIA_DICHOS_MS) {
    dichos.shift();
  }
}

/** Contiene `tramo` dentro de `texto` como sucesión de posiciones seguidas. */
function contieneTramo(texto: string[], tramo: string[]): boolean {
  if (tramo.length === 0 || texto.length < tramo.length) return false;
  for (let i = 0; i <= texto.length - tramo.length; i++) {
    let igual = true;
    for (let j = 0; j < tramo.length; j++) {
      if (texto[i + j] !== tramo[j]) { igual = false; break; }
    }
    if (igual) return true;
  }
  return false;
}

/**
 * Decide si la transcripción del micro es en realidad la propia voz de
 * Astraura entrando con retraso. Las órdenes cortas del usuario nunca son
 * eco aunque coincidan con algo dicho.
 */
export function esEcoPropio(transcripcion: string, ahora: number): boolean {
  podarDichos(ahora);
  const palabras = normalizar(transcripcion);
  if (palabras.length < MIN_PALABRAS_ECO) return false;
  const tramo = palabras.slice(0, TRAMO_ECO);
  for (const dicho of dichos) {
    const enDicho = new Set(dicho.palabras);
    const coinciden = palabras.filter((p) => enDicho.has(p)).length;
    if (coinciden / palabras.length >= RATIO_ECO) return true;
    if (contieneTramo(dicho.palabras, tramo)) return true;
  }
  return false;
}

/** Ventana de descarte tras hablar según dispositivo y latencia de salida. */
export function ventanaEcoMs(opciones: {
  movil: boolean;
  latenciaSalidaMs?: number;
}): number {
  const latencia = opciones.latenciaSalidaMs ?? 0;
  return Math.max(1200, opciones.movil ? 2200 : 0, latencia + 700);
}

function parecidoJaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const p of sa) if (sb.has(p)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Detector con estado de bucle de voz: rebotes de ella escuchándose a sí
 * misma y respuestas repetidas. Un turno de texto reinicia la cuenta.
 */
export function detectorBucle(): DetectorBucle {
  let rebotes = 0;
  let respuestas: string[][] = [];
  return {
    anotarTurno(turno: TurnoVoz): VeredictoTurno {
      const palabras = normalizar(turno.respuesta);
      for (const anterior of respuestas.slice(-RESPUESTAS_COMPARADAS)) {
        if (parecidoJaccard(palabras, anterior) >= JACCARD_REPETICION) {
          return { cortar: true, motivo: "respuesta repetida" };
        }
      }
      respuestas.push(palabras);
      if (respuestas.length > RESPUESTAS_COMPARADAS) respuestas.shift();
      if (turno.origen === "texto") {
        rebotes = 0;
        return { cortar: false };
      }
      const rebota =
        turno.msDesdeQueCalló !== null && turno.msDesdeQueCalló < REBOTE_MS;
      rebotes = rebota ? rebotes + 1 : 0;
      if (rebotes >= MAX_TURNOS_VOZ) {
        return { cortar: true, motivo: "bucle de voz: 3 turnos seguidos tras callar" };
      }
      return { cortar: false };
    },
    reiniciar(): void {
      rebotes = 0;
      respuestas = [];
    },
  };
}

/** Detecta generación degenerada: un tramo de 6+ palabras repetido 3+ veces. */
export function repeticionEnTexto(texto: string): boolean {
  const palabras = normalizar(texto);
  const tramos = new Map<string, number>();
  for (let i = 0; i + TRAMO_DEGENERADO <= palabras.length; i++) {
    const clave = palabras.slice(i, i + TRAMO_DEGENERADO).join(" ");
    tramos.set(clave, (tramos.get(clave) ?? 0) + 1);
    if ((tramos.get(clave) ?? 0) >= VECES_DEGENERADO) return true;
  }
  return false;
}
