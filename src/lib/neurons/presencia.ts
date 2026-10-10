"use client";

/*
 * presencia — qué neuronas y qué MEDIOS están abiertos AHORA, en tiempo real (2026-10-09).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Antes el panel de Neuronas decía «en línea» si la fila tenía un latido de los últimos 12 min
 * (el latido es cada 5 min) y abría su propio canal de presencia solo mientras el panel estaba
 * abierto — así que nadie aparecía presente salvo quien también mirase el panel.
 *
 * Ahora cada medio con sesión entra, desde que abre el OS, en un canal de PRESENCIA de Supabase
 * Realtime propio de la cuenta. Presencia no escribe en la base de datos: entrar, salir o cambiar
 * de estado llega a los demás medios al momento por el mismo socket que ya usa la sincronización.
 *
 *   · Tema: `neur:<token>`. El token es aleatorio, se crea una vez por cuenta y viaja con sus
 *     ajustes (`starseed.neuronas.canal.v1`): solo los medios de la cuenta lo conocen.
 *   · Clave de presencia: el id del MEDIO; carga: neurona, medio, visible/en segundo plano y
 *     sus señales (`senales-medio.ts`). Se reenvía solo si algo cambió (y como mucho cada 15 s).
 *   · Además escucha las fusiones de neuronas (evento de cuenta y ajustes sincronizados) para
 *     adoptar la neurona fundida sin esperar al siguiente latido.
 *
 * Nunca lanza. Sin sesión o sin Realtime, la lista queda vacía y el panel cae al latido.
 */

import { useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { safeGet } from "@/lib/safe-storage";
import { uidActual } from "@/lib/consumo/usuario";
import { describirMedio, type TipoMedio } from "@/lib/neurons/medio";
import { medirSenales, firmaSenales, type SenalesMedio } from "@/lib/neurons/senales-medio";
import { CLAVE_FUSIONES, EVENTO_FUSIONES } from "@/lib/neurons/fusion-alias";
import type { VersionesPorCapa } from "@/lib/actualizaciones/capas";
import { firmaVersiones } from "@/lib/actualizaciones/versiones-capa";

export const CLAVE_CANAL_NEURONAS = "starseed.neuronas.canal.v1";
const MIN_REENVIO_MS = 15_000;
const REVISION_MS = 60_000;

/** Lo que cada medio anuncia de sí mismo. Campos cortos: viaja a cada medio de la cuenta. */
export interface PresenciaMedio {
  /** Id de la neurona (aparato). */
  n: string;
  /** Id del medio. */
  m: string;
  tipo: TipoMedio;
  etiqueta: string;
  /** syncDeviceId de ESTE medio: el id con el que acepta el canal WebRTC de la malla. */
  sid?: string;
  plataforma?: string;
  /** La pestaña o la app está a la vista (false = abierta en segundo plano). */
  visible: boolean;
  /** Desde cuándo está abierto este medio (ISO). */
  desde: string;
  /** Hora de este anuncio (epoch ms). */
  t: number;
  s: SenalesMedio;
  /** (2026-10-10) Versión de cada capa que tiene este medio (lib/actualizaciones/versiones-locales.ts). */
  v?: VersionesPorCapa;
}

export interface EstadoPresencia {
  /** El canal está suscrito (la lista es de verdad en vivo). */
  conectado: boolean;
  medios: PresenciaMedio[];
}

const VACIO: EstadoPresencia = { conectado: false, medios: [] };
let estado: EstadoPresencia = VACIO;
const oyentes = new Set<() => void>();

function publicar(next: EstadoPresencia): void {
  estado = next;
  for (const f of oyentes) {
    try {
      f();
    } catch {
      /* */
    }
  }
}

/** Convierte el `presenceState()` de Supabase en la lista de medios (el anuncio más nuevo de cada uno). Pura. */
export function mediosDeEstado(st: Record<string, unknown[]> | null | undefined): PresenciaMedio[] {
  const out: PresenciaMedio[] = [];
  for (const metas of Object.values(st ?? {})) {
    const lista = (Array.isArray(metas) ? metas : []).filter(
      (x): x is PresenciaMedio => !!x && typeof (x as PresenciaMedio).n === "string" && typeof (x as PresenciaMedio).m === "string",
    );
    if (!lista.length) continue;
    out.push(lista.reduce((a, b) => (b.t > a.t ? b : a)));
  }
  return out.sort((a, b) => a.n.localeCompare(b.n) || a.m.localeCompare(b.m));
}

/** Agrupa los medios presentes por neurona. Pura. */
export function presentesPorNeurona(medios: readonly PresenciaMedio[]): Map<string, PresenciaMedio[]> {
  const mapa = new Map<string, PresenciaMedio[]>();
  for (const m of medios) mapa.set(m.n, [...(mapa.get(m.n) ?? []), m]);
  return mapa;
}

function tokenNuevo(): string {
  try {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32);
  }
}

function leerToken(): string | null {
  const t = safeGet(CLAVE_CANAL_NEURONAS);
  if (!t) return null;
  const limpio = t.replace(/^"|"$/g, "").trim();
  return /^[0-9a-f]{16,64}$/.test(limpio) ? limpio : null;
}

let arrancado = false;
let canal: RealtimeChannel | null = null;
let temaActual = "";
let ultimaFirma = "";
let ultimoEnvio = 0;
const desde = new Date().toISOString();

async function anuncio(): Promise<PresenciaMedio | null> {
  try {
    const { thisDeviceId, resolverAliasEsteMedio } = await import("@/lib/neurons/neurons");
    const n = resolverAliasEsteMedio() || thisDeviceId();
    const medio = describirMedio();
    if (!n || !medio.id) return null;
    const s = await medirSenales();
    let sid: string | undefined;
    try {
      sid = (await import("@/lib/network/identidad-dispositivo")).identidadDispositivo().syncDeviceId || undefined;
    } catch {
      sid = undefined;
    }
    let v: VersionesPorCapa | undefined;
    try {
      v = await (await import("@/lib/actualizaciones/versiones-locales")).versionesDeEsteMedio();
    } catch {
      v = undefined;
    }
    let plataforma: string | undefined;
    try {
      const ua = navigator.userAgent || "";
      plataforma = /android/i.test(ua) ? "Android" : /iphone|ipod/i.test(ua) ? "iOS" : /ipad/i.test(ua) ? "iPadOS" : /mac os x|macintosh/i.test(ua) ? "macOS" : /windows/i.test(ua) ? "Windows" : /linux/i.test(ua) ? "Linux" : undefined;
    } catch {
      plataforma = undefined;
    }
    return {
      n,
      m: medio.id,
      tipo: medio.tipo,
      etiqueta: medio.etiqueta,
      ...(sid ? { sid } : {}),
      plataforma,
      visible: typeof document === "undefined" ? true : document.visibilityState !== "hidden",
      desde,
      t: Date.now(),
      s,
      ...(v && Object.keys(v).length ? { v } : {}),
    };
  } catch {
    return null;
  }
}

async function enviar(forzar = false): Promise<void> {
  if (!canal) return;
  const a = await anuncio();
  if (!a || !canal) return;
  const firma = `${a.n}|${a.visible ? 1 : 0}|${firmaSenales(a.s)}|${a.v ? firmaVersiones(a.v) : ""}`;
  const ahora = Date.now();
  if (!forzar && firma === ultimaFirma) return;
  if (!forzar && ahora - ultimoEnvio < MIN_REENVIO_MS) {
    setTimeout(() => void enviar(false), MIN_REENVIO_MS - (ahora - ultimoEnvio) + 50);
    return;
  }
  ultimaFirma = firma;
  ultimoEnvio = ahora;
  try {
    await canal.track(a);
  } catch {
    ultimaFirma = "";
  }
}

function salirDelCanal(): void {
  if (!canal) return;
  const c = canal;
  canal = null;
  temaActual = "";
  ultimaFirma = "";
  try {
    void c.untrack().catch(() => undefined);
    void Promise.resolve(createClient().removeChannel(c)).catch(() => undefined);
  } catch {
    /* */
  }
  publicar({ conectado: false, medios: [] });
}

function entrarAlCanal(token: string): void {
  const tema = `neur:${token}`;
  if (canal && temaActual === tema) return;
  salirDelCanal();
  try {
    const medio = describirMedio();
    if (!medio.id) return;
    const c = createClient().channel(tema, { config: { presence: { key: medio.id } } });
    canal = c;
    temaActual = tema;
    c.on("presence", { event: "sync" }, () => {
      if (canal !== c) return;
      try {
        publicar({ conectado: true, medios: mediosDeEstado(c.presenceState() as Record<string, unknown[]>) });
      } catch {
        /* */
      }
    });
    c.subscribe((st: string) => {
      if (canal !== c) return;
      if (st === "SUBSCRIBED") {
        publicar({ ...estado, conectado: true });
        void enviar(true);
      } else if (st === "CLOSED" || st === "CHANNEL_ERROR" || st === "TIMED_OUT") {
        publicar({ ...estado, conectado: false });
      }
    });
  } catch {
    canal = null;
    temaActual = "";
  }
}

/** Token del canal: el de la cuenta; si la cuenta aún no tiene, se crea uno (viaja con sus ajustes). */
async function asegurarToken(): Promise<string | null> {
  const ya = leerToken();
  if (ya) return ya;
  // Esperar a que lleguen los ajustes de la cuenta: si otro medio ya creó el token, viene ahí.
  try {
    const rs = await import("@/lib/sync/realtime-sync");
    await new Promise<void>((resolve) => {
      const cancelar = rs.cuandoCuentaFiable(() => resolve(), 6000);
      setTimeout(() => {
        cancelar();
        resolve();
      }, 6500);
    });
  } catch {
    /* sin motor de sync: se crea igual */
  }
  const tras = leerToken();
  if (tras) return tras;
  const nuevo = tokenNuevo();
  try {
    // setItem directo: el parche de realtime-sync lo sube a la cuenta.
    window.localStorage.setItem(CLAVE_CANAL_NEURONAS, nuevo);
  } catch {
    return null;
  }
  return nuevo;
}

/**
 * Arranca la presencia de ESTE medio (una vez por pestaña). Devuelve la parada. Nunca lanza.
 */
export function iniciarPresenciaNeuronas(): () => void {
  if (typeof window === "undefined" || arrancado) return () => undefined;
  arrancado = true;
  let vivo = true;
  const limpiezas: Array<() => void> = [];

  void (async () => {
    const uid = await uidActual().catch(() => null);
    if (!uid || !vivo) return;
    const token = await asegurarToken();
    if (!token || !vivo) return;
    entrarAlCanal(token);

    const alVisibilidad = () => void enviar(true);
    document.addEventListener("visibilitychange", alVisibilidad);
    limpiezas.push(() => document.removeEventListener("visibilitychange", alVisibilidad));
    const alRed = () => void enviar(false);
    window.addEventListener("online", alRed);
    window.addEventListener("offline", alRed);
    limpiezas.push(() => {
      window.removeEventListener("online", alRed);
      window.removeEventListener("offline", alRed);
    });

    // Una fusión hecha en otro medio: adoptar ya (si nos tocó) y reanunciarse con el id nuevo.
    const trasFusion = () => {
      void import("@/lib/neurons/neurons").then((m) => {
        m.resolverAliasEsteMedio();
        void enviar(true);
      });
    };
    window.addEventListener(EVENTO_FUSIONES, trasFusion);
    limpiezas.push(() => window.removeEventListener(EVENTO_FUSIONES, trasFusion));
    try {
      const rs = await import("@/lib/sync/realtime-sync");
      const alAplicar = (e: Event) => {
        const claves = ((e as CustomEvent).detail?.keys ?? []) as string[];
        if (claves.includes(CLAVE_FUSIONES)) trasFusion();
        if (claves.includes(CLAVE_CANAL_NEURONAS)) {
          const t = leerToken();
          if (t) entrarAlCanal(t);
        }
      };
      window.addEventListener(rs.SYNC_APPLY_EVENT, alAplicar);
      limpiezas.push(() => window.removeEventListener(rs.SYNC_APPLY_EVENT, alAplicar));
      limpiezas.push(rs.onAccountBroadcast("neuronas:fusion", trasFusion));
    } catch {
      /* sin motor de sync */
    }
    try {
      const m = await import("@/lib/network/malla-neuronas");
      limpiezas.push(m.alCambiarResumenMalla(() => void enviar(false)));
    } catch {
      /* sin malla */
    }
    try {
      const st = await import("@/ai/astraura/mesh/store");
      limpiezas.push(st.subscribeMeshState(() => void enviar(false)));
    } catch {
      /* sin radio */
    }
    const revision = setInterval(() => void enviar(false), REVISION_MS);
    limpiezas.push(() => clearInterval(revision));
    const alAdoptar = () => void enviar(true);
    window.addEventListener("starseed:neurona-adoptada", alAdoptar);
    limpiezas.push(() => window.removeEventListener("starseed:neurona-adoptada", alAdoptar));
  })();

  return () => {
    vivo = false;
    arrancado = false;
    for (const f of limpiezas.splice(0)) {
      try {
        f();
      } catch {
        /* */
      }
    }
    salirDelCanal();
  };
}

/** Estado en vivo (hook). Sin `iniciarPresenciaNeuronas` montado, lista vacía y desconectado. */
export function usePresenciaNeuronas(): EstadoPresencia {
  return useSyncExternalStore(
    (cb) => {
      oyentes.add(cb);
      return () => oyentes.delete(cb);
    },
    () => estado,
    () => VACIO,
  );
}

/** Lectura síncrona (sin React). */
export function presenciaActual(): EstadoPresencia {
  return estado;
}
