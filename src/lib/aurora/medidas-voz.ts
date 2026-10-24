"use client";

/**
 * Medidas de voz por NEURONA y MOTOR (contrato `architecture/voz-fusionada-astraura.md`,
 * §4 «Medidas por neurona y motor» y §5 «Anuncio»). De aquí sale la `voz` que cada neurona
 * anuncia en su ficha (`vozMedida`, `capacidades-nodo.ts`): solo lo medido, nunca lo declarado.
 *
 * Unidad de `valor` según el tipo:
 *   · `primer-sonido` — ms desde que se pide la síntesis hasta que suena su primer audio.
 *   · `tiempo-real-oido` — ms desde la última voz oída (último parcial, o el fin del tramo)
 *     hasta el texto final: el retraso del oído. Menor = mejor (lo que ordena `elegirOido`).
 *   · `tiempo-real-voz` — factor de tiempo real que informa el propio motor (p. ej. Chatterbox).
 *   · `correccion` — 1 por cada vez que la persona corrige lo oído.
 *
 * Quien mide llama a `anotarMedida`, o a los cronómetros `cronometroHabla` (al pedir la
 * síntesis → `sono()` al primer sonido) y `cronometroOido` (`oyendo()` en cada parcial →
 * `final()` con el texto final). Almacenamiento, reloj y neurona son inyectables; nada lanza.
 * La lista se recorta al anotar (por neurona, motor y tipo, y con un tope total).
 */

import { safeGet, safeRemove, safeSet } from "@/lib/safe-storage";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";

export interface MedidaVoz {
  neurona: string;
  motor: string;
  tipo:
    | "primer-sonido"
    | "tiempo-real-oido"
    | "tiempo-real-voz"
    | "correccion";
  valor: number;
  timestamp: number;
  /** Idioma del tramo («es», «es-ES»…) si quien mide lo sabe. Las medidas viejas no lo traen. */
  idioma?: string;
  /** true si se midió en flujo (oído con parciales, voz frase a frase). Ausente = no consta. */
  flujo?: boolean;
}

export const CLAVE_MEDIDAS_VOZ = "starseed.voz.medidas.v2";
const CLAVE_V1 = "starseed.voz.medidas.v1";

/** Las más recientes que se guardan de cada neurona, motor y tipo (la ficha usa 20 y `medidasDe` 50). */
export const MAX_MEDIDAS_POR_MOTOR_Y_TIPO = 50;
/** Tope de todo el almacén: localStorage es pequeño y lo comparte todo el OS. */
export const MAX_MEDIDAS_TOTAL = 600;

const TIPOS: ReadonlySet<string> = new Set(["primer-sonido", "tiempo-real-oido", "tiempo-real-voz", "correccion"]);

/** Lo que el módulo toca fuera de sí mismo (las pruebas lo sustituyen). */
export interface DepsMedidas {
  leer: (clave: string) => string | null;
  /** Devuelve false si no quedó guardado en disco (cuota llena, modo privado). */
  escribir: (clave: string, valor: string) => boolean | void;
  borrar: (clave: string) => void;
  ahora: () => number;
  /** Id de ESTA neurona (por defecto, el del dispositivo). */
  neurona: () => string;
}

const DEPS: DepsMedidas = {
  leer: safeGet,
  escribir: safeSet,
  borrar: safeRemove,
  ahora: () => Date.now(),
  neurona: neuronDeviceIdActual,
};

const con = (d?: Partial<DepsMedidas>): DepsMedidas => (d ? { ...DEPS, ...d } : DEPS);

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esTexto = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && v.length <= max;

/** Una medida bien formada (o null). Idioma y flujo solo si vienen bien; lo demás, fuera. */
function medidaValida(x: unknown): MedidaVoz | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (!esTexto(r.neurona, 128) || !esTexto(r.motor, 64) || typeof r.tipo !== "string" || !TIPOS.has(r.tipo)) return null;
  if (!esNumero(r.valor) || r.valor < 0 || !esNumero(r.timestamp)) return null;
  const m: MedidaVoz = {
    neurona: r.neurona,
    motor: r.motor.trim(),
    tipo: r.tipo as MedidaVoz["tipo"],
    valor: r.valor,
    timestamp: r.timestamp,
  };
  if (esTexto(r.idioma, 35)) m.idioma = r.idioma.trim();
  if (typeof r.flujo === "boolean") m.flujo = r.flujo;
  return m;
}

/**
 * recortarMedidas — deja las `maxPorGrupo` más recientes de cada (neurona, motor, tipo) y,
 * del total, las `maxTotal` más recientes. Conserva el orden (la más reciente, al final). Pura.
 */
export function recortarMedidas(
  lista: readonly MedidaVoz[],
  maxPorGrupo: number = MAX_MEDIDAS_POR_MOTOR_Y_TIPO,
  maxTotal: number = MAX_MEDIDAS_TOTAL,
): MedidaVoz[] {
  const cuenta = new Map<string, number>();
  const fuera: MedidaVoz[] = [];
  for (let i = lista.length - 1; i >= 0 && fuera.length < maxTotal; i--) {
    const m = lista[i];
    const clave = `${m.neurona}\u0000${m.motor}\u0000${m.tipo}`;
    const n = cuenta.get(clave) ?? 0;
    if (n >= maxPorGrupo) continue;
    cuenta.set(clave, n + 1);
    fuera.push(m);
  }
  return fuera.reverse();
}

/** Todas las medidas válidas. Lanza si el almacén no se puede leer (texto ilegible = vacío). */
function leerTodas(d: DepsMedidas): MedidaVoz[] {
  const raw = d.leer(CLAVE_MEDIDAS_VOZ);
  if (!raw) return [];
  let todas: unknown;
  try {
    todas = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(todas) ? todas.map(medidaValida).filter((m): m is MedidaVoz => m !== null) : [];
}

export function leerMedidas(neurona?: string, deps?: Partial<DepsMedidas>): MedidaVoz[] {
  try {
    const validas = leerTodas(con(deps));
    return neurona ? validas.filter((m) => m.neurona === neurona) : validas;
  } catch {
    return [];
  }
}

/** Anota una medida (con la hora del reloj) y recorta la lista. Devuelve si quedó anotada. */
export function anotarMedida(
  p: {
    neurona?: string;
    motor: string;
    tipo: MedidaVoz["tipo"];
    valor: number;
    idioma?: string;
    flujo?: boolean;
  },
  deps?: Partial<DepsMedidas>,
): boolean {
  try {
    const d = con(deps);
    const medida = medidaValida({
      neurona: p.neurona ?? d.neurona(),
      motor: p.motor,
      tipo: p.tipo,
      valor: p.valor,
      timestamp: d.ahora(),
      idioma: p.idioma,
      flujo: p.flujo,
    });
    if (!medida) return false;
    // Si el almacén no se deja leer, no se escribe: reescribirlo borraría lo medido.
    d.escribir(CLAVE_MEDIDAS_VOZ, JSON.stringify(recortarMedidas([...leerTodas(d), medida])));
    return true;
  } catch {
    return false; // sin almacenamiento: la voz sigue igual
  }
}

/** Lo que identifica una medida aparte de su tipo y su valor. */
export interface BaseMedida {
  motor: string;
  idioma?: string;
  flujo?: boolean;
  neurona?: string;
}

/**
 * cronometroHabla — se crea al pedir la síntesis; `sono()` anota UNA vez el «primer-sonido»
 * (ms desde la creación, mínimo 1). Las llamadas siguientes no anotan y devuelven false.
 */
export function cronometroHabla(base: BaseMedida, deps?: Partial<DepsMedidas>): { sono: () => boolean } {
  const d = con(deps);
  const desde = d.ahora();
  let hecho = false;
  return {
    sono: () => {
      if (hecho) return false;
      hecho = true;
      return anotarMedida({ ...base, tipo: "primer-sonido", valor: Math.max(1, d.ahora() - desde) }, d);
    },
  };
}

/**
 * cronometroOido — `oyendo(haceMs)` cada vez que se oye voz (un parcial; `haceMs` si se oyó
 * antes de avisar); `final()` al llegar el texto final anota «tiempo-real-oido» = ms desde la
 * última voz oída (mínimo 1) y vuelve a empezar. Un final sin voz oída antes no anota (false):
 * no hay desde dónde medir.
 */
export function cronometroOido(
  base: BaseMedida,
  deps?: Partial<DepsMedidas>,
): { oyendo: (haceMs?: number) => void; final: () => boolean } {
  const d = con(deps);
  let ultimaVoz: number | null = null;
  return {
    oyendo: (haceMs = 0) => {
      ultimaVoz = d.ahora() - (esNumero(haceMs) && haceMs > 0 ? haceMs : 0);
    },
    final: () => {
      if (ultimaVoz === null) return false;
      const valor = Math.max(1, d.ahora() - ultimaVoz);
      ultimaVoz = null;
      return anotarMedida({ ...base, tipo: "tiempo-real-oido", valor }, d);
    },
  };
}

export function medidasDe(neurona: string, deps?: Partial<DepsMedidas>): {
  mediaMovil: number;
  p90: number;
  recientes: number;
} | null {
  const medidas = leerMedidas(neurona, deps);
  if (!medidas.length) return null;

  const ultimos50 = medidas.slice(-50);

  const valores = ultimos50.map((m) => m.valor).filter((v) => typeof v === "number" && isFinite(v));
  if (!valores.length) return null;

  const media = valores.reduce((a, b) => a + b, 0) / valores.length;

  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.ceil(ordenados.length * 0.9) - 1;
  const p90 = ordenados[Math.max(0, idx)];

  return { mediaMovil: media, p90, recientes: valores.length };
}

/** Una entrada de la v1: sin motor no se puede atribuir a nadie y se descarta. */
function desdeV1(x: unknown, neurona: string): MedidaVoz | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  return medidaValida({
    ...r,
    neurona: esTexto(r.neurona, 128) ? r.neurona : neurona,
    tipo: typeof r.tipo === "string" && TIPOS.has(r.tipo) ? r.tipo : "correccion",
  });
}

/**
 * migrarDeV1 — pasa la lista vieja (texto JSON en `starseed.voz.medidas.v1`) a la v2, SUMADA
 * a lo que ya hubiera en la v2 (por orden de hora y recortada), y borra la clave vieja solo si
 * la v2 quedó guardada. Lo que no se puede leer se descarta. Devuelve cuántas migró.
 */
export function migrarDeV1(deps?: Partial<DepsMedidas>): number {
  try {
    const d = con(deps);
    const raw = d.leer(CLAVE_V1);
    if (raw === null) return 0;
    let datos: unknown = null;
    try {
      datos = JSON.parse(raw);
    } catch {
      datos = null; // texto ilegible (o el "" que dejaba la versión anterior)
    }
    const neurona = d.neurona();
    const convertidas = (Array.isArray(datos) ? datos : [])
      .map((x) => desdeV1(x, neurona))
      .filter((m): m is MedidaVoz => m !== null);
    if (convertidas.length) {
      const juntas = [...leerTodas(d), ...convertidas].sort((a, b) => a.timestamp - b.timestamp);
      if (d.escribir(CLAVE_MEDIDAS_VOZ, JSON.stringify(recortarMedidas(juntas))) === false) return 0;
    }
    d.borrar(CLAVE_V1);
    return convertidas.length;
  } catch {
    return 0; // migrar sin almacenamiento
  }
}

if (typeof window !== "undefined") migrarDeV1();
