"use client";

/**
 * puente-omnifrecuencias — la app OFICIAL de Omnifrecuencias (o Audiomorphic), abierta dentro
 * del OS en su marco, inicia y sigue la MISMA estación en vivo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§7). Lo que hay que añadir en el repo
 * de la app: `integraciones-de-codigo/omnifrecuencias/`.
 *
 * Protocolo `postMessage` (versión 1). Todos los mensajes son objetos `{ ss: "estacion", v: 1,
 * tipo, … }`. El OS SOLO atiende mensajes cuyo `origin` sea el de la web oficial
 * (`APPS_OFICIALES[…].web`) o uno declarado en `NEXT_PUBLIC_ORIGENES_PUENTE_ESTACION` (para
 * desarrollar la app en local), y que vengan de otro marco (nunca de la propia ventana). Contesta
 * siempre al marco que preguntó y con su `origin` exacto como destino.
 *
 *   app → OS                                   OS → app
 *   hola {app, version?, suena}                bienvenida {capacidades, estacion}
 *   latido {suena}                             (nada: solo mantiene vivo el «suena»)
 *   reloj-ping {id, t0}                        reloj-pong {id, t0, t1, t2}  (t1/t2 en hora COMÚN)
 *   crear {titulo, enlace, params|osciladores,  creada {id, enlace, enlaceControl, directorio}
 *          volumen?, privada}
 *   sintonizar {enlace}                         estado {…}  (y en cada cambio, ≤ 4 por segundo)
 *   accion {accion, params?|osciladores?,       resultado {ok, motivo?}
 *           volumen?}
 *   salir {}                                    estado {estacion: null}
 *                                               error {motivo}
 *
 * Con `suena: true` la app genera ella misma el sonido: el motor del OS se silencia en esta
 * pestaña para no sonar doble, y vuelve a sonar si la app deja de dar latidos 12 s.
 */

import { APPS_OFICIALES } from "@/lib/apps-oficiales/apps-oficiales";
import type { OscillatorState } from "@/components/dashboard/apps/omnifrecuencias/frecuencias/types";
import type { FotoEstacionGlobal } from "./estacion-global";
import {
  entonacionDesdeOsciladores,
  posicionEn,
  sanearParametros,
  type FuenteTransmision,
  type ParametrosSesion,
} from "./transmision-parametrica";

export const VERSION_PUENTE = 1;

export const TIPOS_DE_APP = ["hola", "latido", "reloj-ping", "crear", "sintonizar", "accion", "salir"] as const;
export type TipoDeApp = (typeof TIPOS_DE_APP)[number];

export interface MensajeDeApp {
  ss: "estacion";
  v: number;
  tipo: TipoDeApp;
  [k: string]: unknown;
}

const ACCIONES_APP = ["iniciar", "pausar", "reanudar", "parametros", "volumen", "terminar"] as const;

/** Orígenes permitidos: los de las webs oficiales + los declarados para desarrollo. */
export function origenesPermitidos(extra = process.env.NEXT_PUBLIC_ORIGENES_PUENTE_ESTACION ?? ""): Map<string, FuenteTransmision> {
  const m = new Map<string, FuenteTransmision>();
  const poner = (url: string | undefined, f: FuenteTransmision) => {
    try {
      if (url) m.set(new URL(url).origin, f);
    } catch {
      /* url rota: no entra */
    }
  };
  poner(APPS_OFICIALES.omnifrecuencias?.web, "omnifrecuencias");
  poner(APPS_OFICIALES.audiomorphic?.web, "audiomorphic");
  for (const o of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      const u = new URL(o);
      // Solo https, o http a localhost (desarrollo).
      if (u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) {
        m.set(u.origin, o.includes("audiomorphic") ? "audiomorphic" : "omnifrecuencias");
      }
    } catch {
      /* nada */
    }
  }
  return m;
}

/** ¿Es un mensaje del protocolo? (filtro barato; el contenido se sanea después). */
export function esMensajeDeApp(d: unknown): d is MensajeDeApp {
  if (!d || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  return o.ss === "estacion" && o.v === VERSION_PUENTE && typeof o.tipo === "string" && (TIPOS_DE_APP as readonly string[]).includes(o.tipo);
}

/** Parámetros que manda la app: en formato de estación o como osciladores de la app. */
export function parametrosDeApp(m: Record<string, unknown>, fuente: FuenteTransmision): ParametrosSesion | null {
  if (m.params) return sanearParametros(m.params, fuente);
  if (fuente === "omnifrecuencias" && Array.isArray(m.osciladores)) {
    const volumen = typeof m.volumen === "number" ? m.volumen : 0.7;
    const e = entonacionDesdeOsciladores(m.osciladores.slice(0, 16) as Partial<OscillatorState>[], volumen);
    return e ? { tipo: "omnifrecuencias", entonacion: e } : null;
  }
  return null;
}

/** Lo que la app recibe del estado (sin llaves ni tokens). */
export function fotoParaApp(f: FotoEstacionGlobal, ahoraComun: number): Record<string, unknown> | null {
  const s = f.sesion;
  if (!s) return null;
  const p = posicionEn(s.estado, ahoraComun);
  return {
    id: s.ficha.id,
    titulo: s.ficha.titulo,
    fuente: s.ficha.fuente,
    enlaceEntonacion: s.ficha.enlace,
    privada: s.ficha.privada,
    fase: p.fase,
    ancla: p.ancla,
    posicionMs: Math.round(p.posicionMs),
    params: p.params,
    volumen: p.volumen,
    linea: s.estado.linea.slice(-16),
    control: s.control,
    reloj: { modo: s.reloj.modo, precisionMs: s.reloj.precisionMs, cotaMs: s.reloj.cotaMs },
    conectados: s.oyentes,
    ahoraComun,
  };
}

/* ═══════════════════════ Instalación en el navegador ═══════════════════════ */

interface MarcoApp {
  origen: string;
  fuente: FuenteTransmision;
  suena: boolean;
  visto: number;
}

let instalado = false;
let permitidos: Map<string, FuenteTransmision> | null = null;
const marcos = new Map<MessageEventSource, MarcoApp>();
let ultimoEnvio = 0;
let envioPendiente: ReturnType<typeof setTimeout> | null = null;
/** Lo que el PUENTE decidió silenciar (no pisa el silencio que la persona puso a mano). */
let silencioPorApp = false;

const global = () => import("./estacion-global").then((m) => m.estacionGlobal());

function responder(src: MessageEventSource, origen: string, tipo: string, datos: Record<string, unknown> = {}): void {
  try {
    (src as Window).postMessage({ ss: "estacion", v: VERSION_PUENTE, tipo, ...datos }, origen);
  } catch {
    /* el marco se fue */
  }
}

async function difundirEstado(): Promise<void> {
  const est = await global();
  const s = est.sesionActual();
  const foto = fotoParaApp(est.foto(), s ? s.ahora() : Date.now());
  for (const [src, m] of marcos) responder(src, m.origen, "estado", { estacion: foto });
  ultimoEnvio = Date.now();
}

function programarEstado(): void {
  if (envioPendiente || !marcos.size) return;
  const espera = Math.max(0, 250 - (Date.now() - ultimoEnvio));
  envioPendiente = setTimeout(() => {
    envioPendiente = null;
    void difundirEstado();
  }, espera);
}

async function revisarMarcos(): Promise<void> {
  const ahora = Date.now();
  for (const [src, m] of marcos) if (ahora - m.visto > 60_000) marcos.delete(src);
  const algunaSuena = [...marcos.values()].some((m) => m.suena && ahora - m.visto < 12_000);
  if (algunaSuena === silencioPorApp) return;
  silencioPorApp = algunaSuena;
  (await global()).silenciar(algunaSuena);
}

async function atender(ev: MessageEvent): Promise<void> {
  if (!esMensajeDeApp(ev.data) || !ev.source || ev.source === window) return;
  permitidos ??= origenesPermitidos();
  const fuente = permitidos.get(ev.origin);
  if (!fuente) return; // origen no permitido: ni se contesta
  const t1Local = Date.now(); // ANTES de cualquier trabajo
  const m = ev.data;
  const src = ev.source;
  const reg = marcos.get(src) ?? { origen: ev.origin, fuente, suena: false, visto: 0 };
  reg.visto = Date.now();
  marcos.set(src, reg);
  const est = await global();

  switch (m.tipo) {
    case "hola":
    case "latido": {
      const suena = m.suena === true;
      if (suena !== reg.suena) {
        reg.suena = suena;
        void revisarMarcos();
      }
      if (m.tipo === "hola") {
        const s = est.sesionActual();
        responder(src, reg.origen, "bienvenida", {
          os: "starseed-os",
          capacidades: ["crear", "sintonizar", "accion", "reloj"],
          estacion: fotoParaApp(est.foto(), s ? s.ahora() : Date.now()),
        });
      }
      break;
    }
    case "reloj-ping": {
      const s = est.sesionActual();
      const id = typeof m.id === "string" ? m.id.slice(0, 40) : "";
      const t0 = typeof m.t0 === "number" ? m.t0 : NaN;
      if (!id || !Number.isFinite(t0)) break;
      // Hora COMÚN: la de la sesión si hay una (referencia o sincronizada); si no, la local.
      const desfase = s ? s.ahora() - Date.now() : 0;
      const comun = !!s && s.reloj.estado().modo !== "sin-referencia";
      responder(src, reg.origen, "reloj-pong", { id, t0, t1: t1Local + desfase, t2: Date.now() + desfase, comun });
      break;
    }
    case "crear": {
      const params = parametrosDeApp(m, reg.fuente);
      if (!params) {
        responder(src, reg.origen, "error", { motivo: "Los parámetros de la entonación no son válidos." });
        break;
      }
      const { crearSesionEnVivo } = await import("./crear-sesion");
      const r = await crearSesionEnVivo({
        fuente: reg.fuente,
        titulo: typeof m.titulo === "string" ? m.titulo : "Entonación en vivo",
        enlace: typeof m.enlace === "string" ? m.enlace : `${reg.origen}/`,
        params,
        privada: m.privada === true,
        categorias: [reg.fuente, "en-vivo"],
      });
      if (!r.ok) {
        responder(src, reg.origen, "error", { motivo: r.error });
        break;
      }
      await est.sintonizar(r.enlace, { ficha: r.ficha });
      responder(src, reg.origen, "creada", {
        id: r.ficha.id,
        enlace: new URL(r.enlace, window.location.origin).toString(),
        enlaceControl: new URL(r.enlaceControl, window.location.origin).toString(),
        directorio: r.estacion ? "publicada" : r.ficha.privada ? "privada" : r.avisoDirectorio ?? "no publicada",
      });
      programarEstado();
      break;
    }
    case "sintonizar": {
      const enlace = typeof m.enlace === "string" ? m.enlace : "";
      const r = await est.sintonizar(enlace);
      if (!r.ok) responder(src, reg.origen, "error", { motivo: r.motivo });
      programarEstado();
      break;
    }
    case "accion": {
      const accion = typeof m.accion === "string" ? m.accion : "";
      if (!(ACCIONES_APP as readonly string[]).includes(accion)) {
        responder(src, reg.origen, "resultado", { ok: false, motivo: "Acción desconocida." });
        break;
      }
      const s = est.sesionActual();
      const params = accion === "parametros" && s ? parametrosDeApp(m, s.ficha.fuente) ?? undefined : undefined;
      const r = await est.controlar(accion as (typeof ACCIONES_APP)[number], {
        params,
        volumen: typeof m.volumen === "number" ? m.volumen : undefined,
      });
      responder(src, reg.origen, "resultado", { ok: r.ok, motivo: r.motivo });
      break;
    }
    case "salir":
      est.salir();
      programarEstado();
      break;
  }
}

/**
 * Instala el puente (una vez por pestaña). `primero` es el mensaje que despertó la carga perezosa
 * desde el montaje del layout: se atiende igual que los demás.
 */
export function instalarPuenteEstaciones(primero?: MessageEvent): void {
  if (typeof window === "undefined") return;
  if (!instalado) {
    instalado = true;
    window.addEventListener("message", (ev) => void atender(ev));
    void global().then((est) => {
      est.suscribir(programarEstado);
      // Si una app que «suena» deja de dar latidos, el OS vuelve a sonar.
      setInterval(() => void revisarMarcos(), 5_000);
    });
  }
  if (primero) void atender(primero);
}
