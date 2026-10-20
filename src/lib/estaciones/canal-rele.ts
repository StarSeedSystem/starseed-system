/**
 * canal-rele — el cliente del RELÉ PROPIO de estaciones en vivo (RTS1010-EV-ORACLE-2d, 2026-10-20).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§4.3).
 *
 * Tercer canal de una estación, junto a Supabase Realtime (`canales-estacion.ts`) y los enlaces
 * locales: un WebSocket a un servidor de salas propio (Oracle A1 Always Free, tarea ORACLE-1b) que
 * reparte cada texto `{"t":"est",…}` a los demás conectados al mismo tema. Existe para aliviar la
 * cuota de Realtime de Supabase Free (2 M de mensajes al mes, SOP §4.1): el relé no cuenta mensajes.
 *
 *   · ADITIVO y OPCIONAL: sin `NEXT_PUBLIC_ESTACIONES_RELE_URL` no se crea canal y el panel no pinta
 *     nada. Nunca sustituye a Supabase: `aplicarAccion`/`fusionarEstados` son idempotentes por `n`,
 *     así que oír lo mismo por dos canales es inocuo.
 *   · El relé NO es de confianza: solo reparte texto. Lo que llega por aquí pasa por la misma
 *     verificación de firma (y descifrado, en las privadas) que lo que llega por Supabase.
 *   · Protocolo con el servidor (el servidor aún no existe en main; este es el contrato que debe
 *     cumplir): se abre `<base>/ws?tema=<tema codificado>`; el servidor solo difunde textos que
 *     empiezan por `{"t":"est"` (≤ 40 000) y manda a cada conectado `{"t":"rele","n":N}` con N = los
 *     conectados a la sala contándole a él. Los oyentes son N − 1. Ver `servicios/estaciones-rele`.
 *   · Módulo puro: sin `node:*`, sin `window` y sin Supabase. El WebSocket y los temporizadores se
 *     inyectan, así que se prueba entero con un WebSocket falso.
 *
 * Honestidad: el estado que enseña `estado()` es el real del socket (conectando / abierto / error con
 * motivo / cerrado). Sin WebSocket, con una dirección no válida o con el servidor caído el canal dice
 * «error» y por qué; nunca finge estar abierto. Reconexión con espera 1, 2, 4… s (tope 30 s) hasta
 * que se llame a `cerrar()`.
 *
 * OPD1010: los temporizadores se llaman SIN receptor (`globalThis.setTimeout(fn, ms)`); guardados en un
 * campo y llamados como método, el navegador lanza «Illegal invocation».
 */

import type { CanalConEstado, EstadoCanalEstacion, FaseCanal } from "./canales-estacion";

const PREFIJO_SOBRE = '{"t":"est"';
const PREFIJO_PRESENCIA = '{"t":"rele"';
/** Mismo límite que el servidor (`servicios/estaciones-rele/salas.mjs`, `maxBytes`). */
export const MAX_TEXTO_RELE = 40_000;
/** `WebSocket.OPEN`; se usa el número para no depender de la clase inyectada. */
const ABIERTO = 1;
const MAX_CONECTADOS = 1_000_000;
const MAX_URL = 200;

export const VARIABLE_URL_RELE = "NEXT_PUBLIC_ESTACIONES_RELE_URL";
export const ESPERA_RECONEXION_MIN_MS = 1_000;
export const ESPERA_RECONEXION_MAX_MS = 30_000;
/** Espera máxima a que el socket abra antes de darlo por caído. */
export const ESPERA_CONEXION_RELE_MS = 10_000;
/** Una conexión que aguanta esto abierta se considera sana: la próxima caída vuelve a esperar 1 s. */
export const ESTABLE_RELE_MS = 10_000;

/**
 * Dirección base del relé: `wss://host[:puerto]` (o `ws://localhost|127.0.0.1` para probar). Sin ruta,
 * credenciales, parámetros ni fragmento. Devuelve la base normalizada o null.
 */
export function urlReleValida(url: unknown): string | null {
  if (typeof url !== "string" || url.length > MAX_URL) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== "/" && u.pathname !== "") return null;
  const local = u.protocol === "ws:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "wss:" && !local) return null;
  return `${u.protocol}//${u.host}`;
}

/**
 * La dirección del relé configurada para este despliegue (`NEXT_PUBLIC_ESTACIONES_RELE_URL`), ya
 * validada; null si no hay o no vale. `crudo` solo lo usan las pruebas.
 */
export function leerUrlRele(crudo?: string | null): string | null {
  const bruto =
    crudo !== undefined
      ? crudo
      : typeof process !== "undefined"
        ? process.env.NEXT_PUBLIC_ESTACIONES_RELE_URL
        : undefined;
  return bruto ? urlReleValida(bruto) : null;
}

/** El número de conectados del mensaje de presencia `{"t":"rele","n":N}`; null si no es uno válido. */
export function leerPresenciaRele(texto: string): number | null {
  if (typeof texto !== "string" || !texto.startsWith(PREFIJO_PRESENCIA)) return null;
  try {
    const o = JSON.parse(texto) as { t?: unknown; n?: unknown };
    if (o?.t !== "rele" || typeof o.n !== "number") return null;
    return Number.isInteger(o.n) && o.n >= 0 && o.n <= MAX_CONECTADOS ? o.n : null;
  } catch {
    return null;
  }
}

/** Por qué se cayó, sin direcciones ni el tema (solo el código de cierre, que no revela nada). */
function causaDeCierre(codigo: unknown): string {
  const c = typeof codigo === "number" ? codigo : null;
  if (c === 1008) return "el relé rechazó la sala (tema no válido o sala llena)";
  if (c === 1009) return "el relé rechazó un mensaje demasiado grande";
  if (c === 1013) return "el relé está saturado";
  return `no se pudo abrir o se cortó la conexión con el relé${c !== null ? ` (código ${c})` : ""}`;
}

export interface OpcionesCanalRele {
  /** Dirección base del relé (`wss://…`); se valida con `urlReleValida`. */
  url: string;
  /**
   * El constructor de WebSocket. Sin indicar (undefined) se usa `globalThis.WebSocket`; `null` dice
   * que no hay (el canal queda en «error» sin lanzar). En las pruebas, un WebSocket falso.
   */
  WebSocketImpl?: typeof WebSocket | null;
  /** Espera máxima a que el socket abra (10 s por defecto). */
  esperaConexionMs?: number;
  poner?: (fn: () => void, ms: number) => unknown;
  quitar?: (h: unknown) => void;
}

/** Lectores del estado de los canales de relé vivos en esta pestaña (el último manda). */
const vivosRele = new Set<() => EstadoCanalEstacion>();

/** Estado del canal del relé vivo de esta pestaña; null si no hay ninguno. */
export function estadoCanalRele(): EstadoCanalEstacion | null {
  const lectores = Array.from(vivosRele);
  const ultimo = lectores[lectores.length - 1];
  return ultimo ? ultimo() : null;
}

/**
 * Canal de una estación por el relé propio. `tema` es el MISMO que usa Supabase (`temaPublico` o
 * `temaPrivado`). Empieza a conectar al crearse; no lanza nunca: cualquier problema queda en `estado()`.
 */
export function crearCanalRele(tema: string, op: OpcionesCanalRele): CanalConEstado {
  const base = urlReleValida(op.url);
  const poner = op.poner ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const quitar = op.quitar ?? ((h: unknown) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  const esperaConexionMs = op.esperaConexionMs ?? ESPERA_CONEXION_RELE_MS;
  const Impl = op.WebSocketImpl === undefined ? globalThis.WebSocket : op.WebSocketImpl;

  const oyentes = new Set<(t: string) => void>();
  const alAbrirCbs = new Set<() => void>();
  let socket: WebSocket | null = null;
  let fase: FaseCanal = "conectando";
  let motivo: string | null = null;
  let conectados: number | null = null;
  let cerrado = false;
  let intentos = 0;
  let abiertoDesde = 0;
  let reintento: unknown = null;
  let espera: unknown = null;

  const soltar = (h: unknown) => {
    if (h !== null) quitar(h);
  };
  const leer = (): EstadoCanalEstacion => ({ fase, motivo });
  const abierto = (): boolean => fase === "abierto" && socket !== null && socket.readyState === ABIERTO;

  const fallo = (causa: string) => {
    fase = "error";
    motivo = causa;
  };

  /** Suelta un socket sin que sus eventos vuelvan a tocar el canal. */
  const abandonar = (s: WebSocket) => {
    s.onopen = null;
    s.onmessage = null;
    s.onclose = null;
    try {
      s.close();
    } catch {
      /* ya estaba cerrado */
    }
  };

  /** El socket se cayó o no llegó a abrir: anota por qué y programa la reconexión. */
  const perdido = (este: WebSocket, causa: string) => {
    if (cerrado || este !== socket) return;
    socket = null;
    soltar(espera);
    espera = null;
    conectados = null;
    if (fase === "abierto" && Date.now() - abiertoDesde >= ESTABLE_RELE_MS) intentos = 0;
    const siguiente = Math.min(ESPERA_RECONEXION_MAX_MS, ESPERA_RECONEXION_MIN_MS * 2 ** Math.min(intentos, 16));
    intentos++;
    fallo(`${causa}; reintenta en ${Math.round(siguiente / 1000)} s`);
    reintento = poner(conectar, siguiente);
  };

  function conectar(): void {
    reintento = null;
    if (cerrado) return;
    if (!base) return fallo("la dirección del relé no es válida (debe ser wss://…)");
    if (typeof Impl !== "function") return fallo("este navegador no trae WebSocket");
    // Tras una caída se sigue diciendo «error» (con su motivo) hasta que abra: no parpadea.
    if (fase !== "error") fase = "conectando";
    let s: WebSocket;
    try {
      s = new Impl(`${base}/ws?tema=${encodeURIComponent(tema)}`);
    } catch {
      // Contenido mixto, política de seguridad, etc.: el navegador no dejó ni intentarlo.
      fallo("el navegador no dejó abrir la conexión con el relé");
      reintento = poner(conectar, ESPERA_RECONEXION_MAX_MS);
      return;
    }
    socket = s;
    s.onopen = () => {
      if (s !== socket) return;
      soltar(espera);
      espera = null;
      fase = "abierto";
      motivo = null;
      abiertoDesde = Date.now();
      for (const cb of Array.from(alAbrirCbs)) {
        try {
          cb();
        } catch {
          /* un avisado roto no tumba el canal */
        }
      }
    };
    s.onmessage = (ev) => {
      if (s !== socket) return;
      const x: unknown = ev?.data;
      if (typeof x !== "string" || x.length > MAX_TEXTO_RELE) return;
      if (x.startsWith(PREFIJO_SOBRE)) {
        for (const cb of Array.from(oyentes)) {
          try {
            cb(x);
          } catch {
            /* nada */
          }
        }
        return;
      }
      const n = leerPresenciaRele(x);
      if (n !== null) conectados = Math.max(0, n - 1);
    };
    s.onclose = (ev?: CloseEvent) => perdido(s, causaDeCierre(ev?.code));
    soltar(espera);
    espera = poner(() => {
      espera = null;
      if (s !== socket || fase === "abierto") return;
      abandonar(s);
      perdido(s, `sin respuesta del relé en ${Math.round(esperaConexionMs / 1000)} s`);
    }, esperaConexionMs);
  }

  vivosRele.add(leer);
  conectar();

  return {
    estado: leer,
    tipo: "rele",
    etiqueta: "Relé propio (WebSocket)",
    enviar(texto) {
      const s = socket;
      if (!s || !abierto()) return;
      // El relé solo reparte sobres de estación de tamaño razonable: lo demás se descartaría allí.
      if (typeof texto !== "string" || texto.length > MAX_TEXTO_RELE || !texto.startsWith(PREFIJO_SOBRE)) return;
      try {
        s.send(texto);
      } catch {
        /* se cayó entre medias: lo dirá el cierre */
      }
    },
    alRecibir(cb) {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    abierto,
    oyentes: () => (fase === "abierto" ? conectados : null),
    alAbrir(cb) {
      alAbrirCbs.add(cb);
      return () => {
        alAbrirCbs.delete(cb);
      };
    },
    cerrar() {
      cerrado = true;
      soltar(reintento);
      soltar(espera);
      reintento = null;
      espera = null;
      vivosRele.delete(leer);
      const s = socket;
      socket = null;
      if (s) abandonar(s);
      fase = "cerrado";
      motivo = null;
      conectados = null;
      oyentes.clear();
      alAbrirCbs.clear();
    },
  };
}
