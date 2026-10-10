/**
 * modelo — el MODELO de una estación en vivo (copia fiel de `src/lib/estaciones/transmision-parametrica.ts`
 * del OS, sin depender del OS: mismo formato de ficha, línea de tiempo y enlaces).
 * La prueba `__tests__/compatibilidad-os.test.ts` comprueba que el kit y el OS se entienden.
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§1). Contrato §C de
 * `architecture/genesis-niveles-malla-universal-estaciones.md`.
 *
 * Lo que viaja no es sonido: es la FICHA (qué entonación o espiral, con todos sus parámetros) y una
 * LÍNEA DE TIEMPO de acciones (iniciar, pausar, reanudar, cambiar parámetros, volumen, terminar)
 * con su instante en el reloj común (`reloj-comun.ts`). De ahí, cualquier medio calcula sin
 * preguntar a nadie dónde va la sesión en cualquier instante —también quien llega tarde— y lo
 * genera en local. Por eso cabe en cualquier antena: una acción ocupa decenas de bytes.
 *
 * Este módulo es PURO (sin red, sin audio, sin DOM): modelo, cálculo de posición, transiciones,
 * saneado de todo lo que llega de fuera y enlaces. La red vive en `sesion-en-vivo.ts`; el sonido
 * en `motor-estacion.ts`.
 */

import { base64UrlATexto, textoABase64Url } from "./cripto";

/**
 * Oscilador tal como lo guardan Omnifrecuencias y su port del OS (`OscillatorState`). Solo lo que
 * viaja; definido aquí para que el kit no dependa de ninguna app.
 */
export interface OsciladorApp {
  id?: string;
  frequency?: number;
  type?: "sine" | "square" | "sawtooth" | "triangle";
  volume?: number;
  panX?: number;
  panY?: number;
  panZ?: number;
  name?: string;
  type2?: "sine" | "square" | "sawtooth" | "triangle";
  typeMix?: number;
  transition?: {
    enabled?: boolean;
    start: { frequency: number; volume: number; panX: number; panY: number; panZ: number; type?: "sine" | "square" | "sawtooth" | "triangle" };
    end: { frequency: number; volume: number; panX: number; panY: number; panZ: number; type?: "sine" | "square" | "sawtooth" | "triangle" };
    duration: number;
    loopCount: number | "infinite";
  } | null;
}

/* ═══════════════════════ Tipos ═══════════════════════ */

export const FUENTES_TRANSMISION = ["omnifrecuencias", "audiomorphic"] as const;
export type FuenteTransmision = (typeof FUENTES_TRANSMISION)[number];

export const ETIQUETA_FUENTE_TRANSMISION: Record<FuenteTransmision, string> = {
  omnifrecuencias: "Entonación de Omnifrecuencias",
  audiomorphic: "Espirales de Audiomorphic",
};

export const ONDAS = ["sine", "square", "triangle", "sawtooth"] as const;
export type Onda = (typeof ONDAS)[number];

export interface PuntoTransicion {
  f: number;
  vol: number;
  x: number;
  y: number;
  z: number;
  onda?: Onda;
}

/** Transición de ida y vuelta, igual que en la app: `vueltas` = idas/vueltas EXTRA tras la primera. */
export interface TransicionParam {
  a: PuntoTransicion;
  b: PuntoTransicion;
  /** Segundos de cada pasada. */
  dur: number;
  vueltas: number | "infinito";
}

export interface OsciladorParam {
  id: string;
  /** Frecuencia en Hz. */
  f: number;
  onda: Onda;
  /** Volumen 0..1. */
  vol: number;
  /** Posición 3D −1..1 (izquierda/derecha, abajo/arriba, detrás/delante). */
  x: number;
  y: number;
  z: number;
  /** Segunda onda y mezcla 0..1 entre las dos. */
  onda2?: Onda;
  mezcla?: number;
  /** Pulsos isocrónicos por segundo (0 = sin pulsos). */
  pulso?: number;
  nombre?: string;
  trans?: TransicionParam;
}

export interface EntonacionParam {
  osciladores: OsciladorParam[];
  /** Volumen general 0..1. */
  volumen: number;
}

export type ValorVisual = number | string | boolean;

export type ParametrosSesion =
  | { tipo: "omnifrecuencias"; entonacion: EntonacionParam }
  | { tipo: "audiomorphic"; visual: Record<string, ValorVisual> };

export interface FichaSesion {
  v: 1;
  /** Huella de la llave pública del anfitrión (`idDeLlave`). */
  id: string;
  fuente: FuenteTransmision;
  titulo: string;
  /** Enlace de la entonación o de la espiral en su app (https o ruta del OS). */
  enlace: string;
  /** Llave pública del anfitrión (base64url): con ella se verifica todo lo que firma. */
  pk: string;
  privada: boolean;
  params: ParametrosSesion;
  /** Hora común de creación. */
  creada: number;
}

export const TIPOS_ACCION = ["iniciar", "pausar", "reanudar", "parametros", "volumen", "terminar", "base"] as const;
export type TipoAccion = (typeof TIPOS_ACCION)[number];

export interface AccionLinea {
  /** Número de orden (desempata acciones del mismo instante). */
  n: number;
  /** Instante en el reloj común (ms). */
  t: number;
  tipo: TipoAccion;
  params?: ParametrosSesion;
  volumen?: number;
  /** Solo en `base`: la historia anterior resumida. */
  base?: { sonando: boolean; posicionMs: number; terminada: boolean; empezada: boolean };
}

export interface EstadoSesion {
  ficha: FichaSesion;
  linea: AccionLinea[];
  /** Sube con cada acción: el estado con `rev` mayor gana. */
  rev: number;
}

export type FaseSesion = "esperando" | "sonando" | "pausada" | "terminada";

export interface PosicionSesion {
  fase: FaseSesion;
  /** Instante común en que la reproducción valdría 0 (solo mientras suena). */
  ancla: number | null;
  /** Tiempo de reproducción acumulado en el instante pedido (ms). */
  posicionMs: number;
  params: ParametrosSesion;
  volumen: number;
  /** Primera acción programada DESPUÉS del instante pedido (para prepararla). */
  proxima: AccionLinea | null;
}

/* ═══════════════════════ Saneado (todo lo que llega de fuera) ═══════════════════════ */

const LIMITE_OSCILADORES = 16;
const LIMITE_LINEA = 64;
export const MAX_BYTES_ESTADO = 24_000;
const RE_B64URL = /^[A-Za-z0-9_-]+$/;

const num = (v: unknown, lo: number, hi: number, porDefecto: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(hi, Math.max(lo, n));
};

const esOnda = (v: unknown): v is Onda => typeof v === "string" && (ONDAS as readonly string[]).includes(v);

function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
  return t || undefined;
}

function sanearPunto(v: unknown): PuntoTransicion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const p: PuntoTransicion = {
    f: num(o.f, 0.1, 24_000, 432),
    vol: num(o.vol, 0, 1, 0.5),
    x: num(o.x, -1, 1, 0),
    y: num(o.y, -1, 1, 0),
    z: num(o.z, -1, 1, 0),
  };
  if (esOnda(o.onda)) p.onda = o.onda;
  return p;
}

function sanearOscilador(v: unknown, i: number): OsciladorParam | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const f = num(o.f, 0.1, 24_000, NaN);
  if (!Number.isFinite(f)) return null;
  const out: OsciladorParam = {
    id: texto(o.id, 40) ?? `o${i}`,
    f,
    onda: esOnda(o.onda) ? o.onda : "sine",
    vol: num(o.vol, 0, 1, 0.5),
    x: num(o.x, -1, 1, 0),
    y: num(o.y, -1, 1, 0),
    z: num(o.z, -1, 1, 0),
  };
  if (esOnda(o.onda2)) out.onda2 = o.onda2;
  if (o.mezcla !== undefined) out.mezcla = num(o.mezcla, 0, 1, 0);
  if (o.pulso !== undefined && num(o.pulso, 0, 40, 0) > 0) out.pulso = num(o.pulso, 0.5, 40, 0);
  const nombre = texto(o.nombre, 40);
  if (nombre) out.nombre = nombre;
  if (o.trans && typeof o.trans === "object") {
    const t = o.trans as Record<string, unknown>;
    const a = sanearPunto(t.a);
    const b = sanearPunto(t.b);
    if (a && b) {
      out.trans = {
        a,
        b,
        dur: num(t.dur, 0.05, 3600, 10),
        vueltas: t.vueltas === "infinito" ? "infinito" : Math.floor(num(t.vueltas, 0, 1000, 0)),
      };
    }
  }
  return out;
}

export function sanearEntonacion(v: unknown): EntonacionParam | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.osciladores)) return null;
  const osciladores = o.osciladores
    .slice(0, LIMITE_OSCILADORES)
    .map((x, i) => sanearOscilador(x, i))
    .filter((x): x is OsciladorParam => !!x);
  if (!osciladores.length) return null;
  return { osciladores, volumen: num(o.volumen, 0, 1, 0.7) };
}

export function sanearVisual(v: unknown): Record<string, ValorVisual> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, ValorVisual> = {};
  let n = 0;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (n >= 120) break;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k)) continue;
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
    else if (typeof val === "boolean") out[k] = val;
    else if (typeof val === "string" && val.length <= 60) out[k] = val;
    else continue;
    n++;
  }
  return out;
}

export function sanearParametros(v: unknown, fuente: FuenteTransmision): ParametrosSesion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.tipo !== fuente) return null;
  if (fuente === "omnifrecuencias") {
    const entonacion = sanearEntonacion(o.entonacion);
    return entonacion ? { tipo: "omnifrecuencias", entonacion } : null;
  }
  const visual = sanearVisual(o.visual);
  return visual ? { tipo: "audiomorphic", visual } : null;
}

/** Un enlace de entonación aceptable: https o ruta del OS (nunca `//`, `javascript:`, etc.). */
export function enlaceAceptable(v: unknown): v is string {
  if (typeof v !== "string" || !v || v.length > 500) return false;
  if (v.startsWith("/")) return !v.startsWith("//") && !v.startsWith("/\\");
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

export function sanearFicha(v: unknown): FichaSesion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.id !== "string" || o.id.length !== 22 || !RE_B64URL.test(o.id)) return null;
  if (typeof o.pk !== "string" || o.pk.length < 40 || o.pk.length > 120 || !RE_B64URL.test(o.pk)) return null;
  const fuente = o.fuente;
  if (fuente !== "omnifrecuencias" && fuente !== "audiomorphic") return null;
  const titulo = texto(o.titulo, 100);
  if (!titulo || titulo.length < 2) return null;
  if (!enlaceAceptable(o.enlace)) return null;
  const params = sanearParametros(o.params, fuente);
  if (!params) return null;
  return {
    v: 1,
    id: o.id,
    fuente,
    titulo,
    enlace: o.enlace,
    pk: o.pk,
    privada: o.privada === true,
    params,
    creada: num(o.creada, 0, 8.64e15, 0),
  };
}

export function sanearAccion(v: unknown, fuente: FuenteTransmision): AccionLinea | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.tipo !== "string" || !(TIPOS_ACCION as readonly string[]).includes(o.tipo)) return null;
  const t = num(o.t, 0, 8.64e15, NaN);
  const n = num(o.n, 0, Number.MAX_SAFE_INTEGER, NaN);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  const a: AccionLinea = { n: Math.floor(n), t, tipo: o.tipo as TipoAccion };
  if (a.tipo === "parametros" || (a.tipo === "base" && o.params)) {
    const p = sanearParametros(o.params, fuente);
    if (!p && a.tipo === "parametros") return null;
    if (p) a.params = p;
  }
  if (a.tipo === "volumen" || (a.tipo === "base" && o.volumen !== undefined)) {
    a.volumen = num(o.volumen, 0, 1, 0.7);
  }
  if (a.tipo === "base") {
    const b = (o.base ?? {}) as Record<string, unknown>;
    a.base = {
      sonando: b.sonando === true,
      posicionMs: num(b.posicionMs, 0, 8.64e15, 0),
      terminada: b.terminada === true,
      empezada: b.empezada === true,
    };
  }
  return a;
}

/* ═══════════════════════ Línea de tiempo ═══════════════════════ */

export function ordenarLinea(linea: AccionLinea[]): AccionLinea[] {
  return [...linea].sort((a, b) => a.t - b.t || a.n - b.n);
}

function volumenInicial(p: ParametrosSesion): number {
  return p.tipo === "omnifrecuencias" ? p.entonacion.volumen : 1;
}

interface Recorrido {
  sonando: boolean;
  terminada: boolean;
  empezada: boolean;
  acumuladoMs: number;
  desde: number | null;
  params: ParametrosSesion;
  volumen: number;
}

function recorrer(ficha: FichaSesion, acciones: AccionLinea[]): Recorrido {
  const r: Recorrido = {
    sonando: false,
    terminada: false,
    empezada: false,
    acumuladoMs: 0,
    desde: null,
    params: ficha.params,
    volumen: volumenInicial(ficha.params),
  };
  for (const a of acciones) {
    switch (a.tipo) {
      case "base":
        r.sonando = !!a.base?.sonando;
        r.terminada = !!a.base?.terminada;
        r.empezada = !!a.base?.empezada;
        r.acumuladoMs = a.base?.posicionMs ?? 0;
        r.desde = r.sonando ? a.t : null;
        if (a.params) r.params = a.params;
        if (typeof a.volumen === "number") r.volumen = a.volumen;
        break;
      case "iniciar":
        r.sonando = true;
        r.terminada = false;
        r.empezada = true;
        r.acumuladoMs = 0;
        r.desde = a.t;
        break;
      case "reanudar":
        if (!r.sonando && !r.terminada) {
          r.sonando = true;
          r.empezada = true;
          r.desde = a.t;
        }
        break;
      case "pausar":
        if (r.sonando && r.desde !== null) {
          r.acumuladoMs += a.t - r.desde;
          r.sonando = false;
          r.desde = null;
        }
        break;
      case "terminar":
        if (r.sonando && r.desde !== null) r.acumuladoMs += a.t - r.desde;
        r.sonando = false;
        r.desde = null;
        r.terminada = true;
        break;
      case "parametros":
        if (a.params && a.params.tipo === r.params.tipo) r.params = a.params;
        break;
      case "volumen":
        if (typeof a.volumen === "number") r.volumen = a.volumen;
        break;
    }
  }
  return r;
}

/**
 * Dónde va la sesión en el instante común `t`. Es lo que calcula quien llega tarde: con la
 * ficha y la línea basta, no hace falta que nadie le «ponga al día».
 */
export function posicionEn(estado: EstadoSesion, t: number): PosicionSesion {
  const orden = ordenarLinea(estado.linea);
  const pasadas = orden.filter((a) => a.t <= t);
  const r = recorrer(estado.ficha, pasadas);
  const proxima = orden.find((a) => a.t > t) ?? null;
  const posicionMs = r.sonando && r.desde !== null ? r.acumuladoMs + (t - r.desde) : r.acumuladoMs;
  return {
    fase: r.terminada ? "terminada" : r.sonando ? "sonando" : r.empezada ? "pausada" : "esperando",
    ancla: r.sonando && r.desde !== null ? r.desde - r.acumuladoMs : null,
    posicionMs,
    params: r.params,
    volumen: r.volumen,
    proxima,
  };
}

/**
 * Número de una acción nueva: el instante común en µs más un azar de 3 cifras. Dos medios del
 * mismo anfitrión pueden crear acciones a la vez sin pisarse, y el orden sigue siendo el del tiempo.
 */
export function numeroAccion(tComun: number, azar = Math.floor(Math.random() * 1000)): number {
  return Math.floor(tComun) * 1000 + (Math.abs(Math.floor(azar)) % 1000);
}

/** Añade una acción (sin duplicar su número) y resume la historia si se alarga. */
export function aplicarAccion(estado: EstadoSesion, a: AccionLinea): EstadoSesion {
  if (estado.linea.some((x) => x.n === a.n)) return estado;
  const linea = compactarLinea(estado.ficha, ordenarLinea([...estado.linea, a]));
  return { ficha: estado.ficha, linea, rev: Math.max(estado.rev, a.n) };
}

/**
 * Une dos estados de la MISMA sesión (p. ej. el que traía y el que manda el anfitrión desde otro
 * medio): la unión de sus acciones por número. Una `base` lo resume todo lo anterior a ella, así
 * que acciones viejas repetidas no cuentan dos veces.
 */
export function fusionarEstados(a: EstadoSesion, b: EstadoSesion): EstadoSesion {
  if (a.ficha.id !== b.ficha.id) return a;
  const porN = new Map<number, AccionLinea>();
  for (const x of [...a.linea, ...b.linea]) if (!porN.has(x.n)) porN.set(x.n, x);
  const linea = compactarLinea(a.ficha, ordenarLinea([...porN.values()]));
  return { ficha: a.ficha, linea, rev: Math.max(a.rev, b.rev) };
}

/** Si la línea pasa de `max` acciones, las más viejas se resumen en una acción `base`. */
export function compactarLinea(ficha: FichaSesion, linea: AccionLinea[], max = LIMITE_LINEA): AccionLinea[] {
  let out = compactarPorCuenta(ficha, linea, max);
  // (Kit, 2026-10-10) También por TAMAÑO: con parámetros visuales grandes (Audiomorphic manda
  // decenas de claves por acción), 64 acciones pasaban de `MAX_BYTES_ESTADO` y quien llegaba tarde
  // no podía leer el estado. Una línea más corta con su «base» es igual de válida para el OS.
  let m = Math.min(max, out.length);
  while (m > 2 && JSON.stringify({ ficha, linea: out, rev: 0 }).length > MAX_BYTES_ESTADO * 0.9) {
    m = Math.max(2, Math.floor(m * 0.7));
    out = compactarPorCuenta(ficha, linea, m);
  }
  return out;
}

function compactarPorCuenta(ficha: FichaSesion, linea: AccionLinea[], max: number): AccionLinea[] {
  if (linea.length <= max) return linea;
  const orden = ordenarLinea(linea);
  const corte = orden.length - max + 1;
  const viejas = orden.slice(0, corte);
  const ultima = viejas[viejas.length - 1];
  const r = recorrer(ficha, viejas);
  const posicionMs = r.sonando && r.desde !== null ? r.acumuladoMs + (ultima.t - r.desde) : r.acumuladoMs;
  const base: AccionLinea = {
    n: ultima.n,
    t: ultima.t,
    tipo: "base",
    params: r.params,
    volumen: r.volumen,
    base: { sonando: r.sonando, posicionMs, terminada: r.terminada, empezada: r.empezada },
  };
  return [base, ...orden.slice(corte)];
}

/* ═══════════════════════ Sonido: transiciones y fase ═══════════════════════ */

export interface ValoresOscilador extends PuntoTransicion {
  onda: Onda;
  onda2?: Onda;
  mezcla: number;
}

/**
 * Valores de un oscilador a `posicionS` segundos de reproducción. Las transiciones van de A a B
 * y vuelven, como en la app: `vueltas` pasadas extra tras la primera; al acabar se quedan en el
 * final de la última. Determinista: dos medios con la misma posición suenan igual.
 */
export function valoresOscilador(o: OsciladorParam, posicionS: number): ValoresOscilador {
  if (!o.trans) {
    return { f: o.f, vol: o.vol, x: o.x, y: o.y, z: o.z, onda: o.onda, onda2: o.onda2, mezcla: o.mezcla ?? 0 };
  }
  const { a, b, dur, vueltas } = o.trans;
  const d = Math.max(0.05, dur);
  const total = vueltas === "infinito" ? Infinity : vueltas + 1;
  const pos = Math.max(0, posicionS);
  let idx = Math.floor(pos / d);
  let frac = (pos - idx * d) / d;
  if (idx >= total) {
    idx = (total as number) - 1;
    frac = 1;
  }
  const p = idx % 2 === 0 ? frac : 1 - frac;
  const lerp = (u: number, v: number) => u + (v - u) * p;
  return {
    f: lerp(a.f, b.f),
    vol: lerp(a.vol, b.vol),
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y),
    z: lerp(a.z, b.z),
    onda: a.onda ?? o.onda,
    onda2: b.onda ?? o.onda2 ?? o.onda,
    mezcla: p,
  };
}

/**
 * Primer instante ≥ `desde` en que un oscilador de frecuencia fija `f` que sonara desde `ancla`
 * pasa por fase cero. Arrancar ahí deja a quien llega tarde en la MISMA fase que los demás
 * (con el error del reloj común). Con transiciones de frecuencia la fase no es exacta.
 */
export function inicioEnFase(ancla: number, desde: number, f: number): number {
  if (!(f > 0) || desde <= ancla) return Math.max(desde, ancla);
  const periodoMs = 1000 / f;
  const ciclos = Math.ceil((desde - ancla) / periodoMs - 1e-9);
  return ancla + ciclos * periodoMs;
}

/* ═══════════════════════ Conversión desde las apps ═══════════════════════ */

/** De los osciladores de la app completa (port) a parámetros de la estación. */
export function entonacionDesdeOsciladores(oscs: Partial<OsciladorApp>[], volumen = 0.7): EntonacionParam | null {
  return sanearEntonacion({
    volumen,
    osciladores: oscs.map((o, i) => ({
      id: o.id ?? `o${i}`,
      f: o.frequency,
      onda: o.type,
      vol: o.volume ?? 0.5,
      x: o.panX ?? 0,
      y: o.panY ?? 0,
      z: o.panZ ?? 0,
      onda2: o.type2,
      mezcla: o.typeMix,
      nombre: o.name,
      trans:
        o.transition && o.transition.enabled
          ? {
              a: { f: o.transition.start.frequency, vol: o.transition.start.volume, x: o.transition.start.panX, y: o.transition.start.panY, z: o.transition.start.panZ, onda: o.transition.start.type },
              b: { f: o.transition.end.frequency, vol: o.transition.end.volume, x: o.transition.end.panX, y: o.transition.end.panY, z: o.transition.end.panZ, onda: o.transition.end.type },
              dur: o.transition.duration,
              vueltas: o.transition.loopCount === "infinite" ? "infinito" : o.transition.loopCount,
            }
          : undefined,
    })),
  });
}

/**
 * Lo inverso: de la entonación de una estación a osciladores con la forma de la app
 * (`OscillatorState` de Omnifrecuencias). `base` rellena lo que la estación no lleva (color,
 * enrutado…), para que la app no pierda sus campos propios.
 */
export function osciladoresDesdeEntonacion(
  e: EntonacionParam,
  base: (o: OsciladorParam, i: number) => Record<string, unknown> = () => ({}),
): Array<Record<string, unknown> & Required<Pick<OsciladorApp, "id" | "frequency" | "type" | "volume" | "panX" | "panY" | "panZ">>> {
  return e.osciladores.map((o, i) => ({
    ...base(o, i),
    id: o.id,
    frequency: o.f,
    type: o.onda,
    volume: o.vol,
    panX: o.x,
    panY: o.y,
    panZ: o.z,
    ...(o.nombre ? { name: o.nombre } : {}),
    ...(o.onda2 ? { type2: o.onda2 } : {}),
    ...(typeof o.mezcla === "number" ? { typeMix: o.mezcla } : {}),
    ...(o.trans
      ? {
          transition: {
            enabled: true,
            start: { frequency: o.trans.a.f, volume: o.trans.a.vol, panX: o.trans.a.x, panY: o.trans.a.y, panZ: o.trans.a.z, type: o.trans.a.onda ?? o.onda },
            end: { frequency: o.trans.b.f, volume: o.trans.b.vol, panX: o.trans.b.x, panY: o.trans.b.y, panZ: o.trans.b.z, type: o.trans.b.onda ?? o.onda2 ?? o.onda },
            duration: o.trans.dur,
            loopCount: o.trans.vueltas === "infinito" ? "infinite" : o.trans.vueltas,
            isPlaying: true,
            progress: 0,
            currentLoop: 0,
            direction: "forward",
          },
        }
      : {}),
  }));
}

/** Sufijo con el que viajan las listas en los parámetros visuales (solo admiten valores sueltos). */
export const SUFIJO_LISTA = "__lista";

/**
 * Parámetros de una app visual (Audiomorphic u otra) → `visual` de la estación. Los valores sueltos
 * viajan tal cual; las listas de textos cortos viajan como `<clave>__lista: "a,b,c"` (≤ 60
 * caracteres), que el OS acepta y deja pasar sin tocar. Lo demás (objetos, funciones) no viaja.
 */
export function visualDesdeParametros(p: Record<string, unknown>): Record<string, ValorVisual> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p ?? {})) {
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string" && !x.includes(","))) {
      const lista = v.join(",");
      if (lista.length <= 60 && (k + SUFIJO_LISTA).length <= 40) out[k + SUFIJO_LISTA] = lista;
    }
  }
  return sanearVisual(out) ?? {};
}

/** Lo inverso: `visual` de la estación → parámetros de la app, sobre `base` (sus valores actuales). */
export function parametrosDesdeVisual<T extends Record<string, unknown>>(visual: Record<string, ValorVisual>, base: T): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(visual ?? {})) {
    if (k.endsWith(SUFIJO_LISTA) && typeof v === "string") {
      const clave = k.slice(0, -SUFIJO_LISTA.length);
      if (!(clave in base) || Array.isArray(base[clave])) out[clave] = v ? v.split(",") : [];
      continue;
    }
    // Solo se pisa un campo si el tipo coincide con el de la app (o la app no lo tenía).
    if (!(k in base) || typeof base[k] === typeof v) out[k] = v;
  }
  return out as T;
}

/* ═══════════════════════ Serialización y enlaces ═══════════════════════ */

export function serializarEstado(e: EstadoSesion): string {
  return JSON.stringify({ ficha: e.ficha, linea: ordenarLinea(e.linea), rev: e.rev });
}

/** Lee un estado de fuera: sanea todo y descarta lo que pase de 24 KB. */
export function leerEstado(json: string): EstadoSesion | null {
  if (typeof json !== "string" || json.length > MAX_BYTES_ESTADO) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const ficha = sanearFicha(o.ficha);
    if (!ficha || !Array.isArray(o.linea)) return null;
    const linea = o.linea
      .slice(-LIMITE_LINEA)
      .map((a) => sanearAccion(a, ficha.fuente))
      .filter((a): a is AccionLinea => !!a);
    return { ficha, linea: ordenarLinea(linea), rev: Math.floor(num(o.rev, 0, Number.MAX_SAFE_INTEGER, 0)) };
  } catch {
    return null;
  }
}

export function codificarFicha(f: FichaSesion): string {
  return textoABase64Url(JSON.stringify(f));
}

export function leerFichaCodificada(b64: string): FichaSesion | null {
  try {
    if (!b64 || b64.length > 16_000 || !RE_B64URL.test(b64)) return null;
    return sanearFicha(JSON.parse(base64UrlATexto(b64)));
  } catch {
    return null;
  }
}

export const PREFIJO_VIVO = "/estaciones/vivo/";

/**
 * Enlace de una sesión. Pública: la ficha va en `?f=` (es pública igual). Privada: TODO va en
 * el fragmento `#f=…&k=…`, que el navegador nunca manda a ningún servidor. `control` (la llave
 * privada) solo se añade al enlace para tus OTROS aparatos.
 */
export function enlaceDeSesion(f: FichaSesion, op: { token?: string; control?: string } = {}): string {
  const base = `${PREFIJO_VIVO}${f.id}`;
  const ficha = codificarFicha(f);
  const frag: string[] = [];
  if (f.privada && op.token) frag.push(`k=${op.token}`);
  if (op.control) frag.push(`c=${op.control}`);
  if (f.privada) return `${base}#f=${ficha}${frag.length ? `&${frag.join("&")}` : ""}`;
  return `${base}?f=${ficha}${frag.length ? `#${frag.join("&")}` : ""}`;
}

export interface EnlaceLeido {
  id: string;
  ficha: FichaSesion | null;
  token: string | null;
  control: string | null;
}

/** Lee un enlace de sesión (ruta, query y fragmento). Null si no es de una sesión en vivo. */
export function leerEnlaceSesion(href: string): EnlaceLeido | null {
  try {
    const u = new URL(href, "https://starseed.local");
    if (!u.pathname.startsWith(PREFIJO_VIVO)) return null;
    const id = decodeURIComponent(u.pathname.slice(PREFIJO_VIVO.length)).replace(/\/$/, "");
    if (id.length !== 22 || !RE_B64URL.test(id)) return null;
    const frag = new URLSearchParams(u.hash.replace(/^#/, ""));
    const fB64 = frag.get("f") ?? u.searchParams.get("f");
    const ficha = fB64 ? leerFichaCodificada(fB64) : null;
    const token = frag.get("k");
    const control = frag.get("c");
    return {
      id,
      ficha: ficha && ficha.id === id ? ficha : null,
      token: token && RE_B64URL.test(token) && token.length <= 64 ? token : null,
      control: control && RE_B64URL.test(control) && control.length <= 600 ? control : null,
    };
  } catch {
    return null;
  }
}

/** ¿Este enlace de estación es una sesión en vivo sincronizada? */
export function esEnlaceEnVivo(enlace: string | null | undefined): boolean {
  return typeof enlace === "string" && enlace.startsWith(PREFIJO_VIVO);
}
