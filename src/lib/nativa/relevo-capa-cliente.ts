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
