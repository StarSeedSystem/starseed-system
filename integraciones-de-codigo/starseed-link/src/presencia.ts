/**
 * presencia — `presencia()`: la app aparece como un MEDIO de su neurona en el panel de Neuronas del
 * OS, en tiempo real (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Mismo canal y misma carga que el OS (`src/lib/neurons/presencia.ts`):
 *   · tema `neur:<token>`; el token es el de la cuenta (`user_settings.prefs` →
 *     `starseed.neuronas.canal.v1`), así que solo los medios de la cuenta lo conocen. El kit NO lo
 *     crea: si la cuenta aún no tiene (nunca abrió el OS con presencia), lo dice y no inventa uno;
 *   · clave de presencia = id del MEDIO; carga `PresenciaMedio` (neurona, medio, tipo, etiqueta,
 *     visible, desde, señales medidas). Se reenvía solo si algo cambió y como mucho cada 15 s.
 *
 * ¿Qué neurona? La del APARATO: el kit mide los mismos rasgos de hardware que el OS (sistema,
 * núcleos, memoria, GPU, pantalla) y los compara con las neuronas de la cuenta con la huella del OS
 * (`huella.ts`, copia fiel). Solo si hay EXACTAMENTE un aparato «mismo» lo adopta y se anota como
 * medio en su ficha (`capabilities.medios`, unión con lo que hay: el OS hace lo mismo). Si no, la
 * app sigue presente con su propio id y lo dice: abrir el OS una vez en ese aparato lo resuelve.
 * Nunca lanza. Nada de esto escribe claves ni tokens fuera de la cuenta.
 */

import { almacenPorDefecto, type Almacen } from "./config";
import { enlacesLocales } from "./emparejar";
import { candidatosParaEsteMedio, pantallaDe, reconocimientoSeguro, type CapsHuella, type NeuronaHuella } from "./huella";
import { usuarioDe, type CanalRealtime, type ClienteSupabase } from "./supabase";

export const CLAVE_CANAL_NEURONAS = "starseed.neuronas.canal.v1";
export const CLAVE_MEDIO_APP = "starseed.link.medio.v1";
const MIN_REENVIO_MS = 15_000;
const REVISION_MS = 60_000;

export type TipoMedio = "app-nativa" | "app-instalada" | "local" | "navegador-claude" | "navegador";

export interface SenalesMedio {
  internet: { enLinea: boolean; tipo?: string; efectivo?: string; mbps?: number };
  malla: { pares: number; otrasCuentas: number; sinInternet?: number };
  lora: { estado: "sin-radio"; transporte?: null; nodos: number };
  bluetooth: { disponible: boolean | null };
  serie: { disponible: boolean; puertos: number };
  reticulum: { disponible: false; motivo: string };
}

/** Lo que anuncia cada medio (mismos campos que el OS + `app`, que el OS deja pasar). */
export interface PresenciaMedio {
  n: string;
  m: string;
  tipo: TipoMedio;
  etiqueta: string;
  plataforma?: string;
  visible: boolean;
  desde: string;
  t: number;
  s: SenalesMedio;
  app?: { id: string; nombre: string; version?: string };
}

export interface AppPresente {
  id: string;
  nombre: string;
  version?: string;
}

/* ─────────────── piezas puras ─────────────── */

export function plataformaDe(ua: string): string | undefined {
  return /android/i.test(ua) ? "Android" : /iphone|ipod/i.test(ua) ? "iOS" : /ipad/i.test(ua) ? "iPadOS" : /mac os x|macintosh/i.test(ua) ? "macOS" : /windows/i.test(ua) ? "Windows" : /linux/i.test(ua) ? "Linux" : undefined;
}

export function navegadorDe(ua: string): string {
  const m = ua.match(/Edg\/(\d+)/) ?? null;
  if (m) return `Edge ${m[1]}`;
  const ff = ua.match(/(?:Firefox|FxiOS)\/(\d+)/);
  if (ff) return `Firefox ${ff[1]}`;
  const cr = ua.match(/(?:CriOS|Chrome)\/(\d+)/);
  if (cr) return `Chrome ${cr[1]}`;
  const sf = ua.match(/Version\/(\d+)(?:\.\d+)*.*Safari/);
  if (sf) return `Safari ${sf[1]}`;
  return "";
}

/** Tipo y etiqueta del medio de la app. `nativa`: Capacitor, Electron o Tauri. Pura. */
export function describirMedioApp(app: AppPresente, e: { ua: string; nativa: boolean; instalada: boolean; host: string }): { tipo: TipoMedio; etiqueta: string } {
  if (e.nativa) return { tipo: "app-nativa", etiqueta: `${app.nombre} · app nativa${plataformaDe(e.ua) ? ` · ${plataformaDe(e.ua)}` : ""}` };
  const nav = navegadorDe(e.ua) || "Navegador";
  if (e.instalada) return { tipo: "app-instalada", etiqueta: `${app.nombre} · ${nav} · app instalada` };
  return { tipo: "navegador", etiqueta: `${app.nombre} · ${nav}${e.host ? ` · ${e.host}` : ""}` };
}

/** Token guardado en la cuenta (texto hex de 16–64), o null. Pura. */
export function tokenValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/^"|"$/g, "").trim();
  return /^[0-9a-f]{16,64}$/.test(t) ? t : null;
}

/** Firma corta de las señales (para no reenviar lo mismo). Pura. */
export function firmaSenales(s: SenalesMedio): string {
  return [s.internet.enLinea ? 1 : 0, s.internet.tipo ?? "", s.internet.efectivo ?? "", s.malla.sinInternet ?? 0, s.bluetooth.disponible ? 1 : 0, s.serie.puertos].join("|");
}

export const MOTIVO_RETICULUM = "aún no corre en ningún medio del OS";

/* ─────────────── medidas del medio ─────────────── */

function esNativa(): boolean {
  const g = globalThis as { Capacitor?: { isNativePlatform?: () => boolean }; __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown; process?: { versions?: { electron?: string } }; navigator?: Navigator };
  try {
    if (g.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    /* nada */
  }
  if (g.__TAURI__ || g.__TAURI_INTERNALS__) return true;
  if (g.process?.versions?.electron) return true;
  return /electron/i.test(g.navigator?.userAgent ?? "");
}

async function medirSenales(): Promise<SenalesMedio> {
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & {
    connection?: { type?: string; effectiveType?: string; downlink?: number };
    bluetooth?: { getAvailability?: () => Promise<boolean> };
    serial?: { getPorts?: () => Promise<unknown[]> };
  };
  let bt: boolean | null = null;
  try {
    bt = nav.bluetooth?.getAvailability ? await nav.bluetooth.getAvailability() : null;
  } catch {
    bt = null;
  }
  let puertos = 0;
  try {
    puertos = nav.serial?.getPorts ? (await nav.serial.getPorts()).length : 0;
  } catch {
    puertos = 0;
  }
  const c = nav.connection ?? null;
  const locales = enlacesLocales().length;
  return {
    internet: {
      enLinea: typeof nav.onLine === "boolean" ? nav.onLine : true,
      ...(c?.type && !["unknown", "other", "none"].includes(c.type) ? { tipo: c.type } : {}),
      ...(c?.effectiveType ? { efectivo: c.effectiveType } : {}),
      ...(typeof c?.downlink === "number" && c.downlink > 0 ? { mbps: Math.round(c.downlink * 10) / 10 } : {}),
    },
    malla: { pares: 0, otrasCuentas: 0, ...(locales > 0 ? { sinInternet: locales } : {}) },
    lora: { estado: "sin-radio", transporte: null, nodos: 0 },
    bluetooth: { disponible: bt },
    serie: { disponible: !!nav.serial, puertos },
    reticulum: { disponible: false, motivo: MOTIVO_RETICULUM },
  };
}

/** Rasgos de hardware de ESTE aparato que ve cualquier medio (los mismos que mira el OS). */
export function capsDeEsteAparato(): CapsHuella {
  const caps: CapsHuella = {};
  try {
    caps.platform = plataformaDe(navigator.userAgent || "") ?? "otro";
  } catch {
    /* nada */
  }
  try {
    caps.cores = navigator.hardwareConcurrency || undefined;
  } catch {
    /* nada */
  }
  try {
    caps.memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || undefined;
  } catch {
    /* nada */
  }
  try {
    caps.touch = window.matchMedia?.("(pointer: coarse)").matches;
  } catch {
    /* nada */
  }
  try {
    caps.pantalla = pantallaDe(window.screen?.width, window.screen?.height, window.devicePixelRatio);
  } catch {
    /* nada */
  }
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
    const r = dbg && gl ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    if (r) caps.gpuRenderer = String(r).slice(0, 90);
  } catch {
    /* nada */
  }
  return caps;
}

function idMedio(almacen: Almacen | null, app: string): string {
  const clave = `${CLAVE_MEDIO_APP}:${app}`;
  try {
    const ya = almacen?.getItem(clave);
    if (ya && /^m-[A-Za-z0-9-]{8,60}$/.test(ya)) return ya;
  } catch {
    /* nada */
  }
  let id: string;
  try {
    id = `m-${globalThis.crypto.randomUUID()}`;
  } catch {
    id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  try {
    almacen?.setItem(clave, id);
  } catch {
    /* nada */
  }
  return id;
}

/* ─────────────── API ─────────────── */

export interface Presencia {
  /** Neurona (aparato) a la que se anunció; null si no se pudo reconocer el aparato. */
  neurona: string | null;
  medio: string;
  /** Por qué no hay neurona reconocida (si no la hay). */
  aviso: string | null;
  conectado(): boolean;
  /** Medios presentes de la cuenta ahora (de todas las neuronas). */
  medios(): PresenciaMedio[];
  alCambiar(cb: (medios: PresenciaMedio[]) => void): () => void;
  detener(): void;
}

export type ResultadoPresencia = { ok: true; presencia: Presencia } | { ok: false; motivo: string };

export interface OpcionesPresencia {
  cliente: ClienteSupabase | null | undefined;
  app: AppPresente;
  almacen?: Almacen | null;
  /** Anotar la app como medio en la ficha de su neurona (por defecto sí). */
  anotarMedio?: boolean;
}

/** Medios presentes a partir del `presenceState()` (el anuncio más nuevo de cada uno). Pura. */
export function mediosDeEstado(st: Record<string, unknown[]> | null | undefined): PresenciaMedio[] {
  const out: PresenciaMedio[] = [];
  for (const metas of Object.values(st ?? {})) {
    const lista = (Array.isArray(metas) ? metas : []).filter(
      (x): x is PresenciaMedio => !!x && typeof (x as PresenciaMedio).n === "string" && typeof (x as PresenciaMedio).m === "string",
    );
    if (lista.length) out.push(lista.reduce((a, b) => (b.t > a.t ? b : a)));
  }
  return out.sort((a, b) => a.n.localeCompare(b.n) || a.m.localeCompare(b.m));
}

/** `presencia()`: entra en el canal de presencia de la cuenta como medio de su neurona. */
export async function presencia(op: OpcionesPresencia): Promise<ResultadoPresencia> {
  const { cliente, app } = op;
  if (!cliente) return { ok: false, motivo: "La app no tiene conexión con StarSeed OS." };
  const u = await usuarioDe(cliente);
  if (!u) return { ok: false, motivo: "Entra con tu cuenta de StarSeed OS para aparecer en tus neuronas." };
  let token: string | null = null;
  try {
    const { data } = await cliente.from("user_settings").select(`canal:prefs->>"${CLAVE_CANAL_NEURONAS}"`).eq("user_id", u.id).maybeSingle();
    token = tokenValido(data?.canal);
  } catch {
    token = null;
  }
  if (!token) return { ok: false, motivo: "Tu cuenta aún no tiene presencia de neuronas: abre StarSeed OS una vez con ella y vuelve a entrar." };

  const almacen = op.almacen === undefined ? almacenPorDefecto() : op.almacen;
  const medio = idMedio(almacen, app.id);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  let instalada = false;
  try {
    instalada = window.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    instalada = false;
  }
  const host = (() => {
    try {
      return /^https?:$/.test(location.protocol) ? location.host : "";
    } catch {
      return "";
    }
  })();
  const desc = describirMedioApp(app, { ua, nativa: esNativa(), instalada, host });

  // ¿Qué aparato es este? Las neuronas de la cuenta, comparadas con la huella del OS.
  let neurona: string | null = null;
  let aviso: string | null = null;
  try {
    const { data } = await cliente.from("neuron_devices").select("id,name,kind,capabilities,last_seen_at,created_at").limit(60);
    const filas = (Array.isArray(data) ? data : []) as (NeuronaHuella & { capabilities?: Record<string, unknown> | null })[];
    const propia: NeuronaHuella = { id: `link-${medio}`, capabilities: capsDeEsteAparato() };
    const seguro = reconocimientoSeguro(candidatosParaEsteMedio(propia, filas));
    if (seguro) {
      neurona = seguro.neurona.id;
      if (op.anotarMedio !== false) {
        const actual = filas.find((f) => f.id === neurona)?.capabilities ?? {};
        const medios = { ...((actual as { medios?: Record<string, unknown> }).medios ?? {}) };
        medios[medio] = { tipo: desc.tipo, etiqueta: desc.etiqueta, ...(navegadorDe(ua) ? { navegador: navegadorDe(ua) } : {}), ...(host ? { origen: host } : {}), visto: new Date().toISOString() };
        void Promise.resolve(cliente.from("neuron_devices").update({ capabilities: { ...actual, medios } }).eq("id", neurona)).catch(() => undefined);
      }
    } else {
      aviso = filas.length
        ? "No se reconoció con seguridad qué neurona es este aparato: abre StarSeed OS en él una vez y se unirán."
        : "Tu cuenta aún no tiene neuronas: abre StarSeed OS en este aparato.";
    }
  } catch {
    aviso = "No se pudieron leer tus neuronas ahora.";
  }

  const n = neurona ?? `app-${medio.slice(2)}`;
  const desde = new Date().toISOString();
  let medios: PresenciaMedio[] = [];
  let conectado = false;
  let ultimaFirma = "";
  let ultimoEnvio = 0;
  let parado = false;
  const oyentes = new Set<(m: PresenciaMedio[]) => void>();
  let canal: CanalRealtime;
  try {
    canal = cliente.channel(`neur:${token}`, { config: { presence: { key: medio } } }) as CanalRealtime;
  } catch {
    return { ok: false, motivo: "Realtime no está disponible en este medio." };
  }
  const anuncio = async (): Promise<PresenciaMedio> => ({
    n,
    m: medio,
    tipo: desc.tipo,
    etiqueta: desc.etiqueta,
    plataforma: plataformaDe(ua),
    visible: typeof document === "undefined" ? true : document.visibilityState !== "hidden",
    desde,
    t: Date.now(),
    s: await medirSenales(),
    app: { id: app.id, nombre: app.nombre, ...(app.version ? { version: app.version } : {}) },
  });
  const enviar = async (forzar = false) => {
    if (parado || !conectado) return;
    const a = await anuncio();
    const firma = `${a.n}|${a.visible ? 1 : 0}|${firmaSenales(a.s)}`;
    const ahora = Date.now();
    if (!forzar && firma === ultimaFirma) return;
    if (!forzar && ahora - ultimoEnvio < MIN_REENVIO_MS) return;
    ultimaFirma = firma;
    ultimoEnvio = ahora;
    try {
      await canal.track(a as unknown as Record<string, unknown>);
    } catch {
      ultimaFirma = "";
    }
  };
  canal.on("presence", { event: "sync" }, () => {
    try {
      medios = mediosDeEstado(canal.presenceState());
      for (const cb of Array.from(oyentes)) cb(medios);
    } catch {
      /* nada */
    }
  });
  canal.subscribe((st: string) => {
    if (st === "SUBSCRIBED") {
      conectado = true;
      void enviar(true);
    } else if (st === "CLOSED" || st === "CHANNEL_ERROR" || st === "TIMED_OUT") conectado = false;
  });
  const alVisibilidad = () => void enviar(true);
  const alRed = () => void enviar(false);
  try {
    document.addEventListener("visibilitychange", alVisibilidad);
    window.addEventListener("online", alRed);
    window.addEventListener("offline", alRed);
  } catch {
    /* sin DOM */
  }
  const revision = setInterval(() => void enviar(false), REVISION_MS);
  return {
    ok: true,
    presencia: {
      neurona,
      medio,
      aviso,
      conectado: () => conectado,
      medios: () => medios,
      alCambiar: (cb) => {
        oyentes.add(cb);
        return () => {
          oyentes.delete(cb);
        };
      },
      detener: () => {
        parado = true;
        clearInterval(revision);
        try {
          document.removeEventListener("visibilitychange", alVisibilidad);
          window.removeEventListener("online", alRed);
          window.removeEventListener("offline", alRed);
        } catch {
          /* nada */
        }
        try {
          void Promise.resolve(canal.untrack()).catch(() => undefined);
          void Promise.resolve(cliente.removeChannel(canal)).catch(() => undefined);
        } catch {
          /* nada */
        }
      },
    },
  };
}
