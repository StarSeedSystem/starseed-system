"use client";

/*
 * bucle-fondo — la forma COMÚN de sondear Supabase en segundo plano (contrato «consumo», 2026-09-29).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Medido el 28-09 (4 h, solo pestañas del navegador en la Mac): 11.877 peticiones a
 * `os_mesh_relay`, 4.734 a `neuron_devices`, 3.269 a `os_mesh_vinculos`… con picos de 30.000/h,
 * hasta que Supabase bloqueó el proyecto por tráfico de salida. Cada módulo tenía su propio
 * `setInterval` de 8–60 s, en CADA pestaña, con la pestaña oculta y reintentando igual ante 400.
 *
 * Aquí vive la regla, una sola vez, para que ningún bucle tenga que acordarse de ella:
 *
 *   1. SOLO LA PESTAÑA LÍDER sondea (`esLider()` de G1). N pestañas del mismo dispositivo
 *      cuestan lo mismo que una: la líder DIFUNDE lo que lee por BroadcastChannel y las demás
 *      lo pintan sin tocar la red (`difundir` + `alRecibirDatos`).
 *   2. PAUSA CON EL DISPOSITIVO OCULTO: no hay vuelta mientras NINGUNA pestaña del dispositivo
 *      esté visible. Se mira el dispositivo y no solo esta pestaña porque la líder suele ser la
 *      primera que se abrió, que a menudo queda detrás de otra: si solo mirara su propio
 *      `visibilityState`, abrir una segunda pestaña congelaría la malla entera. Al volver a ser
 *      visible hay UNA vuelta de puesta al día si ya tocaba, nunca una ráfaga.
 *   3. FRENO REMOTO: mientras `frenoActivo()` (fila `os_freno`), no sale ninguna petición.
 *   4. FALLOS: 401/402/403/429/5xx/red → espera exponencial de 1 a 30 min. 400 (consulta mal
 *      formada) y 404 (tabla o función que no existe) no se arreglan solos: el bucle se PARA
 *      hasta recargar y lo dice UNA vez en consola, nombrando la consulta.
 *
 * Nunca lanza. Solo se arranca desde código de cliente; sin DOM (Node) la pestaña cuenta
 * como visible y líder.
 */

import { esLider, alCambiarLider } from "@/lib/consumo/lider-pestana";
import { frenoActivo } from "@/lib/consumo/freno";

export const MINUTO_MS = 60_000;
/** Primera espera tras un fallo que se puede arreglar solo. */
export const ESPERA_MIN_FALLO_MS = MINUTO_MS;
/** Techo de la espera exponencial. */
export const ESPERA_MAX_FALLO_MS = 30 * MINUTO_MS;

/* ------------------------------------------------------------------ */
/* Clasificación de fallos                                            */
/* ------------------------------------------------------------------ */

/** Lo mínimo de una respuesta fallida de PostgREST/Supabase (sin cuerpos ni claves). */
export interface FalloConsulta {
  status?: number;
  code?: string;
  message?: string;
}

export type ClaseFallo = "ok" | "reintentar" | "permanente";

/**
 * Códigos que dicen «esta consulta nunca va a funcionar contra esta base»: columna o tabla
 * inexistente, función ausente, filtro que no se puede interpretar, valor fuera del tipo.
 */
const CODIGOS_PERMANENTES = new Set([
  "42P01", // tabla no existe
  "42703", // columna no existe
  "42883", // función no existe
  "22P02", // valor inválido para el tipo (p. ej. enum)
  "PGRST100", // filtro/orden que PostgREST no sabe leer
  "PGRST200", // relación inexistente
  "PGRST201",
  "PGRST202", // función no está en la caché de esquema
  "PGRST204", // columna no está en la caché de esquema
  "PGRST205", // tabla no está en la caché de esquema
]);

/** ¿Se reintenta (con espera) o se para hasta recargar? */
export function clasificarFallo(f: FalloConsulta | null | undefined): ClaseFallo {
  if (!f) return "ok";
  if (f.code && CODIGOS_PERMANENTES.has(f.code)) return "permanente";
  if (f.status === 400 || f.status === 404) return "permanente";
  return "reintentar";
}

/** Extrae el fallo de una respuesta de supabase-js (`{ error, status }`), o null si fue bien. */
export function falloDe(res: { error?: unknown; status?: number } | null | undefined): FalloConsulta | null {
  if (!res || !res.error) return null;
  const e = res.error as { code?: unknown; message?: unknown; status?: unknown };
  const status =
    typeof res.status === "number" && res.status > 0
      ? res.status
      : typeof e.status === "number"
        ? e.status
        : undefined;
  return {
    status,
    code: typeof e.code === "string" && e.code ? e.code : undefined,
    message: typeof e.message === "string" ? e.message.slice(0, 240) : undefined,
  };
}

/** Espera tras `n` fallos seguidos: 1, 2, 4, 8, 16, 30, 30… minutos. */
export function esperaTrasFallos(n: number): number {
  if (n <= 0) return 0;
  return Math.min(ESPERA_MAX_FALLO_MS, ESPERA_MIN_FALLO_MS * 2 ** Math.min(n - 1, 10));
}

/* ------------------------------------------------------------------ */
/* Guardas (nunca lanzan: si G1 falla, el bucle se comporta como hoy)  */
/* ------------------------------------------------------------------ */

function liderSeguro(): boolean {
  try {
    return esLider();
  } catch {
    return true;
  }
}

function frenoSeguro(): boolean {
  try {
    return frenoActivo();
  } catch {
    return false;
  }
}

function documentoVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/* ------------------------------------------------------------------ */
/* Visibilidad del DISPOSITIVO + difusión de datos entre pestañas     */
/* ------------------------------------------------------------------ */

const NOMBRE_CANAL = "starseed-bucles";
/** Un anuncio de «estoy visible» caduca si la pestaña muere sin despedirse. */
const VIGENCIA_ANUNCIO_MS = 150_000;
const REANUNCIO_MS = 60_000;

type Mensaje =
  | { t: "vis"; id: string; visible: boolean }
  | { t: "quien" }
  | { t: "datos"; nombre: string; datos: unknown }
  | { t: "pide"; nombre: string };

const idPestana = `p-${Math.random().toString(36).slice(2, 10)}`;
let canal: BroadcastChannel | null = null;
let cableado = false;
const visiblesAjenas = new Map<string, number>();
const bucles = new Set<{ reevaluar: () => void }>();
const oyentesDatos = new Map<string, Set<(d: unknown) => void>>();
const ultimosDatos = new Map<string, unknown>();
const avisados = new Set<string>();

function publicar(m: Mensaje): void {
  try {
    canal?.postMessage(m);
  } catch {
    /* datos no clonables o canal cerrado: la difusión es un extra */
  }
}

function notificarCambio(): void {
  for (const b of bucles) {
    try {
      b.reevaluar();
    } catch {
      /* un bucle roto no para al resto */
    }
  }
}

function recibir(m: unknown): void {
  if (!m || typeof m !== "object") return;
  const msg = m as Mensaje;
  if (msg.t === "vis" && typeof msg.id === "string" && msg.id !== idPestana) {
    if (msg.visible) visiblesAjenas.set(msg.id, Date.now());
    else visiblesAjenas.delete(msg.id);
    notificarCambio();
  } else if (msg.t === "quien") {
    if (documentoVisible()) publicar({ t: "vis", id: idPestana, visible: true });
  } else if (msg.t === "datos" && typeof msg.nombre === "string") {
    ultimosDatos.set(msg.nombre, msg.datos);
    for (const cb of oyentesDatos.get(msg.nombre) ?? []) {
      try {
        cb(msg.datos);
      } catch {
        /* oyente roto */
      }
    }
  } else if (msg.t === "pide" && typeof msg.nombre === "string") {
    // Responde SOLO la líder: evita N respuestas iguales.
    if (liderSeguro() && ultimosDatos.has(msg.nombre)) {
      publicar({ t: "datos", nombre: msg.nombre, datos: ultimosDatos.get(msg.nombre) });
    }
  }
}

function cablear(): void {
  if (cableado || typeof window === "undefined") return;
  cableado = true;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      canal = new BroadcastChannel(NOMBRE_CANAL);
      canal.onmessage = (ev: MessageEvent) => recibir(ev.data);
      (canal as unknown as { unref?: () => void }).unref?.();
    }
  } catch {
    canal = null;
  }
  try {
    document.addEventListener("visibilitychange", () => {
      publicar({ t: "vis", id: idPestana, visible: documentoVisible() });
      notificarCambio();
    });
    window.addEventListener("pagehide", () => publicar({ t: "vis", id: idPestana, visible: false }));
    // Reanuncio LOCAL (sin red) para que la líder sepa que seguimos aquí.
    const t = setInterval(() => {
      if (documentoVisible()) publicar({ t: "vis", id: idPestana, visible: true });
    }, REANUNCIO_MS);
    (t as unknown as { unref?: () => void }).unref?.();
  } catch {
    /* sin DOM completo: solo cuenta la propia pestaña */
  }
  try {
    alCambiarLider(() => notificarCambio());
  } catch {
    /* sin elección de líder: cada pestaña decide por sí misma */
  }
  if (documentoVisible()) publicar({ t: "vis", id: idPestana, visible: true });
  publicar({ t: "quien" });
}

/**
 * ¿Alguna pestaña de ESTE dispositivo está a la vista? (la propia o una que lo haya anunciado
 * hace menos de 150 s). Sin BroadcastChannel se reduce a la propia pestaña.
 */
export function dispositivoVisible(): boolean {
  if (documentoVisible()) return true;
  const ahora = Date.now();
  for (const [id, at] of visiblesAjenas) {
    if (ahora - at < VIGENCIA_ANUNCIO_MS) return true;
    visiblesAjenas.delete(id);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* El bucle                                                           */
/* ------------------------------------------------------------------ */

export interface ResultadoVuelta<T = unknown> {
  /** Fallo de la consulta (null/ausente = fue bien). */
  fallo?: FalloConsulta | null;
  /** Lo leído, para difundirlo a las demás pestañas (solo si `difundir`). */
  datos?: T;
  /** Próxima vuelta en este plazo en vez de `intervaloMs` (cadencia adaptativa). */
  siguienteMs?: number;
}

export interface OpcionesBucle<T = unknown> {
  /** Nombre humano y ÚNICO del bucle (clave de difusión y del aviso en consola). */
  nombre: string;
  /** La consulta en palabras, para el aviso de parada (sin claves ni ids). */
  consulta?: string;
  /** Cadencia con el dispositivo visible. */
  intervaloMs: number;
  /** Una vuelta. Puede devolver el fallo de la consulta; si lanza, cuenta como fallo reintentable. */
  tarea: () => Promise<ResultadoVuelta<T> | void>;
  /** Solo la pestaña líder corre el bucle (por defecto true). */
  soloLider?: boolean;
  /** Sin vueltas mientras el dispositivo esté oculto (por defecto true). */
  pausarOculta?: boolean;
  /** Primera vuelta en cuanto se pueda (por defecto true); false = tras un intervalo. */
  arrancarYa?: boolean;
  /** Difunde `datos` a las demás pestañas por BroadcastChannel. */
  difundir?: boolean;
  /** Recibe lo que otra pestaña leyó (y, al iniciar, lo último que tenga la líder). */
  alRecibirDatos?: (datos: T) => void;
}

export interface EstadoBucle {
  activo: boolean;
  fallosSeguidos: number;
  /** Parado hasta recargar por un fallo que no se arregla solo. */
  detenido: boolean;
  motivo: string | null;
  ultimaVuelta: number;
  proximaVuelta: number;
}

export interface BucleFondo {
  iniciar(): void;
  detener(): void;
  /**
   * Vuelta INMEDIATA pedida por el usuario (p. ej. refrescar tras su propia acción): no mira
   * líder ni visibilidad, pero respeta el freno y la parada permanente. Si el bucle no está
   * iniciado, no hace nada.
   */
  ahora(): Promise<void>;
  /**
   * Adelanta la próxima vuelta a YA, pero respetando líder, visibilidad y freno (p. ej. un
   * aviso por broadcast de que hay algo nuevo). Con el dispositivo oculto espera a que vuelva.
   */
  adelantar(): void;
  estado(): EstadoBucle;
}

function avisarParada(op: OpcionesBucle<unknown>, f: FalloConsulta | null | undefined): void {
  if (avisados.has(op.nombre)) return;
  avisados.add(op.nombre);
  try {
    const cual = [f?.status ? `HTTP ${f.status}` : null, f?.code || null].filter(Boolean).join(" · ");
    // eslint-disable-next-line no-console
    console.warn(
      `[consumo] ${op.nombre}: ${op.consulta ? `la consulta «${op.consulta}»` : "la consulta"} ` +
        `responde ${cual || "un error"}${f?.message ? ` (${f.message})` : ""}. ` +
        "No se arregla sola: el sondeo queda parado hasta recargar la página.",
    );
  } catch {
    /* consola ausente */
  }
}

export function crearBucle<T = unknown>(op: OpcionesBucle<T>): BucleFondo {
  const soloLider = op.soloLider !== false;
  const pausarOculta = op.pausarOculta !== false;
  let activo = false;
  let enCurso = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fallos = 0;
  let detenido = false;
  let motivo: string | null = null;
  let ultima = 0;
  let proxima = 0;
  let quitarOyente: (() => void) | null = null;

  const elegible = () => (!soloLider || liderSeguro()) && (!pausarOculta || dispositivoVisible());

  const limpiar = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const reevaluar = () => {
    limpiar();
    if (!activo || detenido || enCurso) return;
    if (!elegible()) return; // se retoma con el evento de visibilidad / cambio de líder
    const espera = Math.max(0, proxima - Date.now());
    timer = setTimeout(() => {
      timer = null;
      void vuelta(false);
    }, espera);
  };

  const vuelta = async (forzada: boolean): Promise<void> => {
    if (!activo || detenido || enCurso) return;
    if (!forzada && !elegible()) {
      reevaluar();
      return;
    }
    if (frenoSeguro()) {
      // Freno remoto: ni una petición. Se vuelve a mirar dentro de un intervalo (sin red).
      proxima = Date.now() + op.intervaloMs;
      reevaluar();
      return;
    }
    enCurso = true;
    let res: ResultadoVuelta<T> | undefined;
    try {
      res = (await op.tarea()) ?? undefined;
    } catch (e) {
      res = { fallo: { message: e instanceof Error ? e.message : String(e) } };
    }
    enCurso = false;
    ultima = Date.now();
    const clase = clasificarFallo(res?.fallo ?? null);
    if (clase === "permanente") {
      detenido = true;
      motivo = res?.fallo?.code || (res?.fallo?.status ? `HTTP ${res.fallo.status}` : "consulta rechazada");
      avisarParada(op as OpcionesBucle<unknown>, res?.fallo);
      limpiar();
      return;
    }
    if (clase === "reintentar") {
      fallos += 1;
      proxima = ultima + Math.max(op.intervaloMs, esperaTrasFallos(fallos));
    } else {
      fallos = 0;
      const sig = res?.siguienteMs;
      proxima = ultima + (typeof sig === "number" && sig > 0 ? sig : op.intervaloMs);
      if (op.difundir && res && "datos" in res) {
        ultimosDatos.set(op.nombre, res.datos);
        publicar({ t: "datos", nombre: op.nombre, datos: res.datos });
      }
    }
    reevaluar();
  };

  const api = { reevaluar };

  return {
    iniciar() {
      // Sin `window` (Node en pruebas) también corre: sin DOM, la pestaña cuenta como visible
      // y líder. Solo se arranca desde código de cliente (efectos / arranques con guarda).
      if (activo) return;
      activo = true;
      cablear();
      bucles.add(api);
      if (op.alRecibirDatos) {
        const cb = op.alRecibirDatos as (d: unknown) => void;
        let set = oyentesDatos.get(op.nombre);
        if (!set) {
          set = new Set();
          oyentesDatos.set(op.nombre, set);
        }
        set.add(cb);
        quitarOyente = () => oyentesDatos.get(op.nombre)?.delete(cb);
        publicar({ t: "pide", nombre: op.nombre });
      }
      proxima = op.arrancarYa === false ? Date.now() + op.intervaloMs : 0;
      reevaluar();
    },
    detener() {
      activo = false;
      limpiar();
      bucles.delete(api);
      quitarOyente?.();
      quitarOyente = null;
    },
    async ahora() {
      if (!activo || detenido) return;
      if (enCurso) return;
      limpiar();
      await vuelta(true);
    },
    adelantar() {
      if (!activo || detenido) return;
      proxima = Math.min(proxima, Date.now());
      reevaluar();
    },
    estado() {
      return { activo, fallosSeguidos: fallos, detenido, motivo, ultimaVuelta: ultima, proximaVuelta: proxima };
    },
  };
}
