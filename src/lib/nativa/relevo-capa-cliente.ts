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
import { decidirRelevoNativo, MIRAR_RELEVO_CADA_MS } from "./relevo-capa";

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

/** Una mirada: pide el relevo solo si la capa está lista y es momento seguro. */
export async function mirarRelevoNativo(): Promise<"nada" | "aplicar" | "esperar"> {
  try {
    if (!esAppNativa()) return "nada";
    const e = await consultarEstadoServidor();
    void mandarLineasCapas(e); // AND1114L
    const primera = decidirRelevoNativo(e, { ...(await medir()), yaPedidas });
    if (primera.accion !== "aplicar" || !primera.clave) return primera.accion;
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
    clearTimeout(t0);
    clearInterval(iv);
    try {
      document.removeEventListener("visibilitychange", alVolver);
    } catch {
      /* */
    }
  };
}
