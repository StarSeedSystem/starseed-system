"use client";

/*
 * neurona-bienvenida-acciones — lo que la ventana «Esta neurona» lee y escribe (NEU1107B · 2026-11-07).
 * Contrato: architecture/neurona-bienvenida.md. Las reglas puras están en `neurona-bienvenida.ts` y el
 * ranking en `duplicadas-aparato.ts`; aquí solo se reúnen los datos de verdad y se aplican los cambios
 * con las funciones que el OS ya tenía (fusión con respaldo, ajustes por neurona, capas de la cuenta,
 * medios de Mensajería, antenas de la app nativa). Nunca lanza.
 */

import {
  asegurarIdentidadAlArrancar,
  ensureThisNeuron,
  iconoElegido,
  invalidarListaNeuronas,
  listNeurons,
  permissionsFor,
  setNeuronKind,
  setNeuronName,
  setNeuronSettings,
  setPermission,
  settingsFor,
  thisDeviceId,
  type Neuron,
} from "@/lib/neurons/neurons";
import { leerFusiones } from "@/lib/neurons/fusion-alias";
import { presenciaActual } from "@/lib/neurons/presencia";
import { detectarDuplicadas, sugerirFusion, type FilaNeurona, type MedioPresente, type ResultadoDuplicadas, type SugerenciaFusion, type YoNeurona } from "@/lib/neurons/duplicadas-aparato";
import {
  CLAVE_BIENVENIDA_NEURONA,
  conBienvenidaVista,
  decidirBienvenida,
  leerRegistroBienvenida,
  limpiarNombre,
  type BorradorAjustes,
  type DecisionBienvenida,
  type PlanFusionBienvenida,
  type ResultadoBienvenida,
} from "@/lib/neurons/neurona-bienvenida";
import { CLAVE_NEURONA_ANTERIOR, leerNeuronaAnterior } from "@/lib/nativa/migracion-origen";
import { preferenciaCapasGuardada, type CamposCapas } from "@/lib/astraura/capas-conciencia";
import { cambiarPreferenciasNeurona, estadoPreferenciasMedio, propiasDeNeurona } from "@/lib/mensajeria/medios/preferencias-store";
import { guardarNeuronaElegida, leerNeuronaElegida } from "@/lib/actualizaciones/almacen-politicas";
import { marcarNeuronaConfigurada, neuronaConfiguradaAqui } from "@/lib/onboarding/primer-arranque";
import type { Medio } from "@/lib/actualizaciones/version-por-medio";

export interface DatosBienvenida {
  uid: string | null;
  yo: YoNeurona;
  todas: FilaNeurona[];
  presentes: MedioPresente[];
  idAnteriorMigracion: string | null;
  medio: Medio | null;
  configurada: boolean;
  resultado: ResultadoDuplicadas;
  sugerencia: SugerenciaFusion;
  ahora: number;
}

function leerLocal(clave: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function aFila(n: Neuron): FilaNeurona {
  return {
    id: n.id,
    name: n.name,
    kind: n.kind,
    capabilities: (n.capabilities ?? {}) as unknown as Record<string, unknown>,
    last_seen_at: n.last_seen_at ?? null,
    created_at: n.created_at ?? null,
  };
}

/** Lee todo lo que la ventana necesita. Sin red de más: la lista de neuronas se pide fresca una vez. */
export async function reunirDatosBienvenida(): Promise<DatosBienvenida> {
  const ahora = Date.now();
  let uid: string | null = null;
  try {
    uid = await (await import("@/lib/consumo/usuario")).uidActual();
  } catch {
    uid = null;
  }
  let local = await ensureThisNeuron().catch(() => null);
  // (NEU1108A) Antes de mirar: si este medio es un aparato que ya tenía neurona y hay una prueba fuerte e
  // inequívoca (pista de la migración, misma huella o mismo equipo), ya la adoptó en silencio y la ventana
  // se calcula con ese id (sin «neurona nueva» que fusionar). Si no estaba claro, decide la persona aquí.
  const vigente = await asegurarIdentidadAlArrancar(local?.capabilities.aparato ?? null).catch(() => "");
  if (vigente && local && vigente !== local.id) local = await ensureThisNeuron().catch(() => local);
  const lista = await listNeurons({ fresco: true }).catch(() => [] as Neuron[]);
  const id = thisDeviceId();
  const propia = lista.find((n) => n.id === id) ?? null;

  let medio: Medio | null = null;
  let equipo: string | null = null;
  let so: string | null = null;
  try {
    const inst = await (await import("@/lib/actualizaciones/version-por-medio")).leerInstalada();
    medio = inst.medio;
    equipo = inst.info?.modelo ?? inst.info?.equipo ?? null;
    so = inst.info?.plataforma ?? null;
  } catch {
    /* sin app nativa o sin respuesta: el medio queda sin saber (no se abre sola) */
  }

  const yo: YoNeurona = {
    id,
    name: propia?.name ?? local?.name ?? "",
    kind: propia?.kind ?? local?.kind ?? null,
    // Lo medido ahora (huella de máquina incluida) sobre lo que dice la fila.
    capabilities: { ...((propia?.capabilities ?? {}) as unknown as Record<string, unknown>), ...((local?.capabilities ?? {}) as unknown as Record<string, unknown>) },
    last_seen_at: propia?.last_seen_at ?? new Date(ahora).toISOString(),
    // Sin fila todavía: esta neurona nace ahora.
    created_at: propia?.created_at ?? new Date(ahora).toISOString(),
    equipo,
    so,
    // (NEU1108A) La identidad del aparato que mide este medio (huella incluida, si es la app nativa).
    aparato: local?.capabilities.aparato ?? null,
  };
  const todas = lista.map(aFila);
  let presentes: MedioPresente[] = [];
  try {
    presentes = presenciaActual().medios.map((m) => ({ n: m.n, plataforma: m.plataforma, t: m.t, d: m.d ?? null }));
  } catch {
    presentes = [];
  }
  const anterior = leerNeuronaAnterior(leerLocal(CLAVE_NEURONA_ANTERIOR));
  const idAnteriorMigracion = anterior && anterior !== id ? anterior : null;
  let alias = {};
  try {
    alias = leerFusiones().alias;
  } catch {
    alias = {};
  }
  const resultado = detectarDuplicadas({ yo, todas, presentes, idAnteriorMigracion, alias, ahora });
  const sugerencia = sugerirFusion(yo, todas, resultado.candidatas, ahora);
  let configurada = false;
  try {
    configurada = neuronaConfiguradaAqui(id);
  } catch {
    configurada = false;
  }
  return { uid, yo, todas, presentes, idAnteriorMigracion, medio, configurada, resultado, sugerencia, ahora };
}

/* ───────────────────────────── «Una vez por cuenta × aparato» ───────────────────────────── */

/** ¿Se abre sola? (con lo que ya se reunió). */
export function decidirConDatos(d: DatosBienvenida, manual = false): DecisionBienvenida {
  return decidirBienvenida({
    uid: d.uid,
    medio: d.medio,
    registro: leerRegistroBienvenida(leerLocal(CLAVE_BIENVENIDA_NEURONA)),
    hayCandidatas: d.resultado.candidatas.length > 0,
    configurada: d.configurada,
    manual,
  });
}

/** Apunta que esta cuenta ya vio la ventana en este aparato (solo aquí: no viaja con la cuenta). */
export function marcarBienvenidaVista(uid: string | null, neurona: string, resultado: ResultadoBienvenida): void {
  if (!uid) return;
  try {
    const reg = conBienvenidaVista(leerRegistroBienvenida(leerLocal(CLAVE_BIENVENIDA_NEURONA)), uid, neurona, resultado, Date.now());
    window.localStorage.setItem(CLAVE_BIENVENIDA_NEURONA, JSON.stringify(reg));
  } catch {
    /* modo privado: podrá volver a salir una vez más, nunca rompe */
  }
}

/* ───────────────────────────── Fusión ───────────────────────────── */

export interface ResultadoFusionBienvenida {
  ok: boolean;
  motivo?: string;
  /** Id del respaldo (para deshacer desde Ajustes › Neuronas). */
  respaldo?: number;
  /** Este medio pasó a usar el id que se quedó: hay que recargar al terminar. */
  cambioDeId: boolean;
}

/**
 * Aplica la fusión elegida SIN borrar filas: las absorbidas quedan como historial con su marca y su
 * alias, con respaldo para deshacer (`fusion.ts`). Luego pone el nombre elegido a la que se queda y,
 * en la app nativa, vuelve a repartir la clave de faro para que `conocidas` quede al día ya.
 */
export async function aplicarFusionBienvenida(plan: PlanFusionBienvenida): Promise<ResultadoFusionBienvenida> {
  const antes = thisDeviceId();
  try {
    const { fusionarNeuronas } = await import("@/lib/neurons/fusion");
    const r = await fusionarNeuronas(plan.principal, plan.absorbidas, { conservarFilas: true, por: "bienvenida" });
    if (!r.ok) return { ok: false, motivo: r.motivo ?? "No se pudo fusionar.", cambioDeId: false };
    const nombre = limpiarNombre(plan.nombre);
    if (nombre) setNeuronName(plan.principal, nombre);
    invalidarListaNeuronas();
    void import("@/lib/nativa/faro-clave-cuenta")
      .then(async (m) => m.sincronizarClaveFaro(await m.depsReales()))
      .catch(() => undefined);
    return { ok: true, respaldo: r.respaldo, cambioDeId: thisDeviceId() !== antes };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "No se pudo fusionar.", cambioDeId: false };
  }
}

/* ───────────────────────────── Ajustes básicos ───────────────────────────── */

/** ¿Comparte carpetas (NAS)? Solo la app nativa lo sabe; si no (web, app anterior), null. */
export async function leerNasNativo(): Promise<boolean | null> {
  try {
    const { esAppNativa, puenteNativo } = await import("@/lib/nativa/puente");
    if (!esAppNativa()) return null;
    const r = await puenteNativo().antenasConfig();
    return r.ok ? r.valor.nas === true : null;
  } catch {
    return null;
  }
}

/** El borrador con lo que esta neurona tiene AHORA (todo leído de donde vive de verdad). */
export function borradorInicial(id: string, nombre: string, kind: string | null | undefined, nas: boolean | null): BorradorAjustes {
  const s = settingsFor(id);
  const p = permissionsFor(id);
  const capas = preferenciaCapasGuardada().capas;
  const medios = estadoPreferenciasMedio();
  const propias = propiasDeNeurona(medios, id);
  const base = propias ?? medios.global;
  return {
    nombre: limpiarNombre(nombre),
    funcion: s.role ?? "ambos",
    capas: { ...capas },
    motorLocal: s.astraura158?.enabled !== false,
    mediosPropios: !!propias,
    medios: { ...base, elegidos: [...base.elegidos] },
    escuchaFondo: s.auroraListening !== false,
    compartirComputo: p.compute !== false,
    compartirAlmacen: p.storage !== false,
    solicitudesArchivos: s.fileRequests !== false,
    nas,
    actualizaPrimero: leerNeuronaElegida() === id,
    icono: iconoElegido(s.icono) ?? iconoElegido(kind) ?? "other",
  };
}

export interface ResultadoAjustes {
  ok: boolean;
  /** Lo que no se pudo guardar (el resto sí). */
  avisos: string[];
}

/**
 * Guarda SOLO lo que cambió, cada cosa en su sitio de siempre, y deja la neurona como configurada.
 * Lo que no se pudo guardar se dice; lo demás queda guardado.
 */
export async function aplicarAjustesBienvenida(id: string, antes: BorradorAjustes, despues: BorradorAjustes): Promise<ResultadoAjustes> {
  const avisos: string[] = [];
  const paso = (que: string, f: () => void) => {
    try {
      f();
    } catch {
      avisos.push(que);
    }
  };
  if (!id) return { ok: false, avisos: ["Esta neurona aún no tiene id."] };
  const nombre = limpiarNombre(despues.nombre);
  if (nombre && nombre !== limpiarNombre(antes.nombre)) paso("el nombre", () => setNeuronName(id, nombre));
  if (despues.funcion !== antes.funcion) paso("la función principal", () => setNeuronSettings(id, { role: despues.funcion }));
  if (despues.motorLocal !== antes.motorLocal) paso("el motor local", () => setNeuronSettings(id, { astraura158: { enabled: despues.motorLocal } }));
  if (despues.escuchaFondo !== antes.escuchaFondo) paso("la escucha de fondo", () => setNeuronSettings(id, { auroraListening: despues.escuchaFondo }));
  if (despues.solicitudesArchivos !== antes.solicitudesArchivos) {
    paso("las solicitudes de archivos", () => setNeuronSettings(id, { fileRequests: despues.solicitudesArchivos }));
  }
  if (despues.compartirComputo !== antes.compartirComputo) paso("prestar el procesador", () => setPermission(id, "compute", despues.compartirComputo));
  if (despues.compartirAlmacen !== antes.compartirAlmacen) paso("guardar copias", () => setPermission(id, "storage", despues.compartirAlmacen));
  if (despues.icono !== antes.icono) paso("el icono", () => setNeuronKind(id, despues.icono));
  if (despues.actualizaPrimero !== antes.actualizaPrimero) {
    paso("las actualizaciones", () => {
      if (despues.actualizaPrimero) guardarNeuronaElegida(id);
      else if (leerNeuronaElegida() === id) guardarNeuronaElegida(null);
    });
  }
  const mediosCambiaron =
    despues.mediosPropios !== antes.mediosPropios ||
    (despues.mediosPropios &&
      (despues.medios.modo !== antes.medios.modo ||
        despues.medios.siNinguno !== antes.medios.siNinguno ||
        despues.medios.elegidos.join("|") !== antes.medios.elegidos.join("|")));
  if (mediosCambiaron) paso("los medios de transmisión", () => cambiarPreferenciasNeurona(id, despues.mediosPropios ? despues.medios : null));

  const capas = (["local", "mesh", "nube", "colectiva"] as const).filter((c) => despues.capas[c] !== antes.capas[c]);
  if (capas.length) {
    try {
      const { saveIntelligenceSettings } = await import("@/ai/astraura/router");
      const campos: CamposCapas = {
        capa158Local: despues.capas.local,
        capa158Mesh: despues.capas.mesh,
        capa158Nube: despues.capas.nube,
        capa158Colectiva: despues.capas.colectiva,
      };
      saveIntelligenceSettings(campos as Parameters<typeof saveIntelligenceSettings>[0]);
    } catch {
      avisos.push("las capas de conciencia");
    }
  }
  if (despues.nas !== null && antes.nas !== null && despues.nas !== antes.nas) {
    try {
      const { puenteNativo } = await import("@/lib/nativa/puente");
      const puente = puenteNativo();
      const cfg = await puente.antenasConfig();
      // `antenasConfigurar` sustituye la config entera: se manda la que hay con un solo campo cambiado.
      const r = cfg.ok ? await puente.antenasConfigurar({ ...cfg.valor, nas: despues.nas }) : cfg;
      if (!r.ok) avisos.push("compartir carpetas (NAS)");
    } catch {
      avisos.push("compartir carpetas (NAS)");
    }
  }
  paso("la marca de neurona configurada", () => marcarNeuronaConfigurada(id));
  return { ok: avisos.length === 0, avisos };
}
