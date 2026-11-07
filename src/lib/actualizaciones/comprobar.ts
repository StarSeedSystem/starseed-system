/**
 * (VER1107B · 2026-11-07) Comprobar si ESTE medio tiene versión nueva, SIN instalar nada.
 * Lo usan la ventana «Hay una versión nueva» (`AvisoActualizacion`) y el botón «Buscar
 * actualizaciones» de Ajustes › Esta neurona: el mismo camino, la misma decisión (`decidirAviso`) y la
 * misma «última comprobación». Contrato: architecture/centro-versiones-1105.md §8.
 * Nunca lanza: sin red devuelve un resultado «error» con su motivo.
 */

import { leerInstalada, type Medio } from "./version-por-medio";
import { decidirAviso, limpiarVersion, MEDIOS_CON_VENTANA, type DecisionAviso, type RespuestaUpdater } from "./decision-aviso";
import { guardarUltimaComprobacion } from "./ultima-comprobacion";
import { decidirActualizacionAndroid } from "@/lib/nativa/actualizador-android";
import { buscarActualizacionNativa } from "@/lib/nativa/info-neurona";
import { esVersionMasNueva, esVersionSemver } from "@/lib/version/os-release";
import type { VersionPublicada } from "@/lib/version/versiones-publicadas";

export interface ResultadoComprobar {
  medio: Medio;
  instalada: string | null;
  publicada: string | null;
  decision: DecisionAviso;
  /** Fecha y notas de la versión que se ofrecería (de la lista o del canal del updater). */
  fecha: string;
  notas: string;
}

export interface OpcionesComprobar {
  /** Lo pide la persona o una neurona suya: se mira aunque esa versión ya se enseñara. */
  forzar?: boolean;
  /** Versiones ya enseñadas en la ventana. */
  vistas?: Record<string, unknown>;
}

/** null si este medio no tiene ventana propia (web, PWA, iOS: se actualizan solos). */
export async function comprobarActualizacion(opciones: OpcionesComprobar = {}): Promise<ResultadoComprobar | null> {
  const { medio, version } = await leerInstalada();
  if (!MEDIOS_CON_VENTANA.includes(medio)) return null;
  const instalada = esVersionSemver(version) ? limpiarVersion(version) : null;
  const sin = (decision: DecisionAviso, publicada: string | null = null): ResultadoComprobar => ({ medio, instalada, publicada, decision, fecha: "", notas: "" });
  if (!instalada) {
    guardarUltimaComprobacion({ resultado: "desconocida", instalada: null, publicada: null, texto: "Esta app no dice su versión: no se compara nada." });
    return sin({ tipo: "nada", motivo: "No se sabe la versión instalada de esta app." });
  }
  let ultima: VersionPublicada | undefined;
  try {
    const res = await fetch("/api/os/versiones", { cache: "no-store" });
    if (res.ok) {
      const datos = (await res.json()) as { versiones?: VersionPublicada[] };
      ultima = Array.isArray(datos?.versiones) ? datos.versiones[0] : undefined;
    }
  } catch {
    ultima = undefined;
  }
  if (!ultima) {
    const motivo = "No se pudo leer la lista de versiones publicadas (¿sin conexión?).";
    guardarUltimaComprobacion({ resultado: "error", instalada, publicada: null, texto: motivo });
    return sin({ tipo: "nada", motivo });
  }
  const publicada = limpiarVersion(ultima.version) || null;
  const vistas = opciones.forzar ? {} : (opciones.vistas ?? {});
  const nueva = !!publicada && esVersionSemver(publicada) && esVersionMasNueva(publicada, instalada);
  if (!nueva || (!opciones.forzar && publicada && vistas[publicada])) {
    guardarUltimaComprobacion({
      resultado: nueva ? "nueva" : "al-dia",
      instalada,
      publicada,
      texto: nueva ? `La ${publicada} ya se te enseñó; la tienes en la Librería.` : `Al día: tienes la ${instalada}.`,
    });
    return sin(nueva ? { tipo: "nada", motivo: `La ${publicada} ya se te enseñó.` } : { tipo: "nada", motivo: `Al día: tienes la ${instalada}.` }, publicada);
  }

  let updater: RespuestaUpdater | null = null;
  let notasUpdater: string | null = null;
  let fechaUpdater: string | null = null;
  let apk: string | null = null;
  if (medio === "escritorio") {
    const b = await buscarActualizacionNativa();
    if (b.estado === "ok") {
      updater = { estado: "ok", disponible: b.busqueda.disponible };
      notasUpdater = b.busqueda.notas;
      fechaUpdater = b.busqueda.fecha;
    } else updater = b.estado === "sin-comando" ? { estado: "sin-comando" } : { estado: "error", motivo: b.motivo };
  } else {
    apk = decidirActualizacionAndroid(instalada, {
      tag_name: ultima.version,
      assets: (ultima.archivos?.os?.android ?? []).map((a) => ({ name: a.nombre, browser_download_url: a.href })),
    }).href;
  }

  const decision = decidirAviso({ medio, instalada, publicada, vistas, updater, apk, forzar: opciones.forzar });
  if (decision.tipo === "nada") {
    guardarUltimaComprobacion({ resultado: "error", instalada, publicada, texto: decision.motivo });
    return sin(decision, publicada);
  }
  if (decision.tipo === "preparando") {
    guardarUltimaComprobacion({ resultado: "preparando", instalada, publicada, texto: decision.texto });
    return sin(decision, publicada);
  }
  const deLaLista = decision.version === publicada;
  guardarUltimaComprobacion({ resultado: "nueva", instalada, publicada: decision.version, texto: `StarSeed OS ${decision.version} está lista para instalar.` });
  return {
    medio,
    instalada,
    publicada,
    decision,
    fecha: (deLaLista ? ultima.fecha : fechaUpdater?.slice(0, 10)) ?? "",
    notas: (deLaLista ? ultima.notas : notasUpdater) ?? "",
  };
}
