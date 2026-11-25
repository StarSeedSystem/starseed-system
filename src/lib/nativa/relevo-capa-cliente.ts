/**
 * ACT1114H · el pegamento del relevo de capa en la app de escritorio (con DOM y puente nativo).
 * La decisión es pura (`relevo-capa.ts`, que reutiliza `decision-build.ts` de ACT1113F). Aquí solo se mide el
 * momento (llamada en curso o sonando, escritura sin guardar, red) y se pide `servidor_local_actualizar`, que
 * reinicia SOLO el Node con la capa ya descargada y verificada y recarga la página. Todo o nada: si algo falla,
 * la app se queda con lo que tiene (el Rust lo deja escrito en servidor-local.log). Nunca lanza.
 */

import { puedeRecargarSuave } from "@/lib/pwa/aviso-version";
import { consultarEstadoServidor, pedirActualizarServidor } from "./estado-servidor-local";
import { esAppNativa } from "./puente";
import { etiquetaBuild } from "@/lib/pwa/build-corriendo";
import type { EstadoServidorLocal } from "./estado-servidor-local";
import { decidirPonerseAlDia, decidirRelevoNativo, MIRAR_RELEVO_CADA_MS, type AccionAlDia } from "./relevo-capa";

const yaPedidas = new Set<string>();

// ── (AND1114L) Las líneas `[capas]` del aparato viajan al Mac por el mismo camino que sus otras líneas (anotarLlamada → enlaces.log) ──
const CLAVE_ENVIADAS = "ss:capas-lineas-enviadas";
const enviadas = new Set<string>();
let enviadasCargadas = false;

function cargarEnviadas() {
  if (enviadasCargadas) return;
  enviadasCargadas = true;
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE_ENVIADAS) || "[]");
    if (Array.isArray(v)) for (const k of v) if (typeof k === "string") enviadas.add(k);
  } catch {
    /* sin almacén: se manda lo que haya (el Mac tolera repetidas) */
  }
}

/** Las líneas aún no mandadas, con su clave (`t:n`: el número se reinicia en cada proceso, la hora no). PURA salvo `enviadas`. */
export function lineasPorEnviar(lineas: readonly { n: number; t: number; texto: string }[] | undefined, ya: ReadonlySet<string>): Array<{ clave: string; texto: string }> {
  return (lineas ?? []).map((l) => ({ clave: `${l.t}:${l.n}`, texto: l.texto })).filter((l) => !ya.has(l.clave));
}

export async function mandarLineasCapas(e: Awaited<ReturnType<typeof consultarEstadoServidor>>): Promise<number> {
  try {
    cargarEnviadas();
    const nuevas = lineasPorEnviar(e?.capas_lineas, enviadas);
    if (!nuevas.length) return 0;
    const { anotarLlamada } = await import("@/lib/llamadas/voz-datos/diagnostico");
    for (const l of nuevas) {
      // Mismo hito que `web-version comprobada…` (ACT1114J): el Mac ya lo recoge. El texto lleva `[capas]` como en servidor-local.log.
      anotarLlamada("web-version", null, `[capas] ${l.texto}`);
      enviadas.add(l.clave);
    }
    try {
      sessionStorage.setItem(CLAVE_ENVIADAS, JSON.stringify([...enviadas].slice(-120)));
    } catch {
      /* */
    }
    return nuevas.length;
  } catch {
    return 0;
  }
}

async function medir() {
  let enLlamada = false;
  try {
    enLlamada = (await (await import("@/lib/actualizaciones/momento-navegador")).medirMomento()).enLlamada;
  } catch {
    /* sin módulo: no se sabe; se trata como «en llamada» abajo */
    enLlamada = true;
  }
  return {
    enLlamada,
    escribiendo: !puedeRecargarSuave(),
    enLinea: typeof navigator === "undefined" || navigator.onLine !== false,
  };
}

// ── (DIR1125C) Ponerse al día cuando la página corre una capa y el servidor local ya sirve otra ──────────────────────────────
// Tras un relevo la parte nativa recarga la página; si esa recarga cae en la copia guardada de la capa anterior (servidor
// recién arrancado y lento), la página se quedaba atrás hasta cerrar la app. Aquí se compara lo que corre ESTE código con lo
// que dice servir el servidor, se calienta el servidor y se recarga. Dos intentos como mucho por diferencia: nunca un bucle.
const CLAVE_AL_DIA = "ss:pagina-al-dia";
const CALENTAR_TOPE_MS = 120_000;

export interface DepsAlDia {
  /** La build de este código: «<compilación>/<sha>». */
  propia: () => string;
  medir: () => Promise<{ enLlamada: boolean; escribiendo: boolean }>;
  almacen: () => Pick<Storage, "getItem" | "setItem"> | null;
  /** Pide esta misma ruta al servidor local y espera a que conteste: la recarga ya no llega con el servidor frío. */
  calentar: () => Promise<boolean>;
  recargar: () => void;
  anotar: (texto: string) => void;
}

async function calentarServidor(): Promise<boolean> {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const reloj = setTimeout(() => ctl?.abort(), CALENTAR_TOPE_MS);
  try {
    // Sin «accept: text/html» el service worker la trata como petición corriente: red primero y SIN tope de espera; si sale
    // bien la guarda como copia de esta ruta, así que aunque la recarga cayera otra vez en la copia, ya sería la de esta capa.
    const r = await fetch(window.location.pathname + window.location.search, { cache: "no-store", credentials: "same-origin", signal: ctl?.signal });
    return r.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(reloj);
  }
}

const DEPS_AL_DIA: DepsAlDia = {
  propia: () => etiquetaBuild(),
  medir,
  almacen: () => {
    try {
      return sessionStorage;
    } catch {
      return null;
    }
  },
  calentar: calentarServidor,
  // Un respiro para que la línea del registro salga antes de recargar.
  recargar: () => void setTimeout(() => { try { window.location.reload(); } catch { /* */ } }, 400),
  anotar: (texto) => {
    void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("web-version", null, texto)).catch(() => { /* */ });
  },
};

interface MarcaAlDia { clave: string; n: number; dicho: boolean }

function leerMarca(a: Pick<Storage, "getItem" | "setItem"> | null, clave: string): MarcaAlDia {
  try {
    const v = JSON.parse(a?.getItem(CLAVE_AL_DIA) || "null");
    if (v && v.clave === clave && Number.isFinite(v.n)) return { clave, n: Math.max(0, Number(v.n)), dicho: v.dicho === true };
  } catch {
    /* sin almacén o dato roto: como si no hubiera intentos */
  }
  return { clave, n: 0, dicho: false };
}

function guardarMarca(a: Pick<Storage, "getItem" | "setItem"> | null, m: MarcaAlDia) {
  try {
    a?.setItem(CLAVE_AL_DIA, JSON.stringify(m));
  } catch {
    /* */
  }
}

const limpio = (x: string | null | undefined) => (x && /^[\w/-]{1,80}$/.test(x) ? x : "?");
let poniendoseAlDia = false;

/** Una mirada: si la página corre otra web que la que sirve su servidor local, calienta el servidor y recarga. Nunca lanza. */
export async function mirarPaginaAlDia(e: EstadoServidorLocal | null, deps: DepsAlDia = DEPS_AL_DIA): Promise<AccionAlDia> {
  if (poniendoseAlDia) return "esperar";
  poniendoseAlDia = true;
  try {
    const propia = deps.propia();
    const previa = decidirPonerseAlDia(propia, e, { enLlamada: false, escribiendo: false, intentos: 0 });
    if (previa.accion === "nada" || !previa.clave) return "nada";
    const almacen = deps.almacen();
    const marca = leerMarca(almacen, previa.clave);
    const d = decidirPonerseAlDia(propia, e, { ...(await deps.medir()), intentos: marca.n });
    const quien = `pagina-atrasada mia=${limpio(propia)} sirve=${limpio(e?.web_corre)}`;
    if (d.accion === "rendirse") {
      if (!marca.dicho) {
        deps.anotar(`${quien} accion=rendirse intentos=${marca.n}`);
        guardarMarca(almacen, { ...marca, dicho: true });
      }
      return "rendirse";
    }
    if (d.accion !== "recargar") return d.accion;
    if (!(await deps.calentar())) return "esperar"; // el servidor no contesta: se vuelve a mirar en la siguiente pasada
    // Se vuelve a medir: una llamada que sonó mientras se calentaba lo para.
    const ahora = await deps.medir();
    if (ahora.enLlamada || ahora.escribiendo) return "esperar";
    guardarMarca(almacen, { clave: marca.clave, n: marca.n + 1, dicho: false });
    deps.anotar(`${quien} accion=recargar intento=${marca.n + 1}`);
    deps.recargar();
    return "recargar";
  } catch {
    return "nada";
  } finally {
    poniendoseAlDia = false;
  }
}

/** Una mirada: pide el relevo solo si la capa está lista y es momento seguro. */
export async function mirarRelevoNativo(): Promise<"nada" | "aplicar" | "esperar"> {
  try {
    if (!esAppNativa()) return "nada";
    const e = await consultarEstadoServidor();
    void mandarLineasCapas(e); // AND1114L
    const primera = decidirRelevoNativo(e, { ...(await medir()), yaPedidas });
    if (primera.accion !== "aplicar" || !primera.clave) {
      // (DIR1125C) Sin relevo que pedir: ¿esta página corre ya lo que sirve el servidor local? Si no, se pone al día sola.
      if (primera.accion === "nada") await mirarPaginaAlDia(e);
      return primera.accion;
    }
    // Se vuelve a medir justo antes de pedirlo: una llamada que sonó mientras tanto lo para.
    const segunda = decidirRelevoNativo(e, { ...(await medir()), yaPedidas });
    if (segunda.accion !== "aplicar" || !segunda.clave) return segunda.accion;
    yaPedidas.add(segunda.clave);
    await pedirActualizarServidor();
    return "aplicar";
  } catch {
    return "nada";
  }
}

/** Arranca las miradas (al empezar, cada 30 s, al volver a la ventana). Devuelve cómo pararlas. */
export function iniciarRelevoNativo(): () => void {
  if (!esAppNativa()) return () => {};
  let parado = false;
  let enCurso = false;
  // (DIR1125F) El censo de cuadros: que el propio aparato diga quién ocupa el hilo principal. Solo cuenta; no cambia nada.
  let pararCenso: () => void = () => {};
  // (DIR1125H) El censo ya no se pone aquí: lo pone `censo-arranque` al cargar la página, antes de que se monte nada (así ve
  // también los relojes que la página arranca al montarse), y mide TIEMPO, no solo quién pide cuadros.
  const tick = async () => {
    if (parado || enCurso) return;
    enCurso = true;
    try {
      await mirarRelevoNativo();
    } finally {
      enCurso = false;
    }
  };
  const t0 = setTimeout(() => void tick(), 5000);
  const iv = setInterval(() => void tick(), MIRAR_RELEVO_CADA_MS);
  const alVolver = () => {
    if (document.visibilityState === "visible") void tick();
  };
  try {
    document.addEventListener("visibilitychange", alVolver);
  } catch {
    /* */
  }
  return () => {
    parado = true;
    pararCenso();
    clearTimeout(t0);
    clearInterval(iv);
    try {
      document.removeEventListener("visibilitychange", alVolver);
    } catch {
      /* */
    }
  };
}
