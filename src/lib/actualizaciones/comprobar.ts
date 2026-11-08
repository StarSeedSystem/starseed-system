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
import { canalDe, canalPruebasDesdeApi, elegirPublicada, type Canal, type CanalPruebas } from "./canal-pruebas";

export interface ResultadoComprobar {
  medio: Medio;
  instalada: string | null;
  publicada: string | null;
  decision: DecisionAviso;
  /** Fecha y notas de la versión que se ofrecería (de la lista o del canal del updater). */
  fecha: string;
  notas: string;
  /** (ACT1108A) Canal de la versión ofrecida: «pruebas» solo para las apps del canal de pruebas. */
  canal?: Canal;
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
  let pruebas: CanalPruebas | null = null;
  try {
    const res = await fetch("/api/os/versiones", { cache: "no-store" });
    if (res.ok) {
      const datos = (await res.json()) as { versiones?: VersionPublicada[]; canalPruebas?: CanalPruebas | null };
      ultima = Array.isArray(datos?.versiones) ? datos.versiones[0] : undefined;
      // (ACT1108A) Solo cuenta para las apps del canal de pruebas (elegirPublicada lo decide).
      pruebas = canalPruebasDesdeApi(datos?.canalPruebas);
    }
  } catch {
    ultima = undefined;
  }
  if (!ultima && !(pruebas && canalDe(instalada) === "pruebas")) {
    const motivo = "No se pudo leer la lista de versiones publicadas (¿sin conexión?).";
    guardarUltimaComprobacion({ resultado: "error", instalada, publicada: null, texto: motivo });
    return sin({ tipo: "nada", motivo });
  }
  // (ACT1108A) La versión que cuenta para ESTA app: la oficial o, en una app de pruebas, la mayor
  // entre la oficial y la de su canal (0.5.1-prueba.24 > 0.5.1-prueba.23; la 0.5.1 oficial gana a ambas).
  const apkOficial = ultima
    ? decidirActualizacionAndroid(instalada, {
        tag_name: ultima.version,
        assets: (ultima.archivos?.os?.android ?? []).map((a) => ({ name: a.nombre, browser_download_url: a.href })),
      }).href
    : null;
  const elegida = elegirPublicada({
    medio,
    instalada,
    oficial: ultima ? { version: ultima.version, fecha: ultima.fecha, notas: ultima.notas, apk: apkOficial } : null,
    pruebas,
  });
  const canal: Canal = elegida.canal;
  const publicada = limpiarVersion(elegida.version) || null;
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
    // El .apk de la versión elegida (oficial: el del Release; pruebas: el de latest-prueba-android.json).
    apk = elegida.apk;
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
  // (ACT1108A) El updater de escritorio puede ofrecer una versión de su canal de pruebas.
  const canalOfrecido: Canal = deLaLista ? canal : canalDe(decision.version);
  const etiqueta = canalOfrecido === "pruebas" ? `${decision.version} (canal de pruebas)` : decision.version;
  guardarUltimaComprobacion({ resultado: "nueva", instalada, publicada: decision.version, texto: `StarSeed OS ${etiqueta} está lista para instalar.` });
  return {
    medio,
    instalada,
    publicada,
    decision,
    fecha: (deLaLista ? elegida.fecha : fechaUpdater?.slice(0, 10)) ?? "",
    notas: (deLaLista ? elegida.notas : notasUpdater) ?? "",
    canal: canalOfrecido,
  };
}
