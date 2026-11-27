/*
 * revision-identidad — revisión de identidad de un aparato que comparte neurona (NEU1126E · 2026-11-26).
 * Contrato: architecture/neuronas-y-aparatos.md y architecture/neurona-bienvenida.md.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Maggasukha, 26-11: la tableta Maggaboard y el móvil Maggadroid comparten la neurona e0b9faf2 y la
 * ventana de configuración no salió. La adopción por huella (`asegurarIdentidadAlArrancar`) y la
 * ventana existente (`neurona-bienvenida-acciones.ts`, `neuron-setup.tsx`, `aparato-en-neurona.tsx`)
 * miraban neuronas distintas, no los aparatos de UNA misma fila. Aquí, PURO, se decide la revisión
 * que sí ve el caso: la fila de la neurona tiene dos o más aparatos vivos con huella distinta.
 *
 * Reglas:
 *   · En CADA aparato de esa fila aparece la ventana, una vez por versión de la app.
 *   · Se propone que el aparato que se unió después cree su propia neurona; el primero conserva la
 *     neurona y su nombre.
 *   · Nunca se elige por la persona y nunca se borra nada: «Más tarde» deja un aviso visible.
 *
 * Puro: sin red, sin DOM, sin almacenamiento. Nunca lanza.
 */

import { estaVinculado, leerMapaAparatos, nombreAparatoPorDefecto } from "./aparatos-de-neurona";

/** Registro local de revisiones y avisos (no viaja con la cuenta: es de ESTE aparato). */
export const CLAVE_REVISION_IDENTIDAD = "starseed.neuron.revision-identidad.v1";
/** Evento para reabrir la revisión a mano desde Cuenta › Neuronas. */
export const EVENTO_REVISION_IDENTIDAD = "starseed:revision-identidad";

export type ResultadoRevision = "propia" | "fusionadas" | "mas-tarde";

export interface AvisoRevision {
  neuronaId: string;
  neuronaNombre: string;
  aparatoId: string;
  otroNombre: string;
  ts: number;
}

export interface RegistroRevisionIdentidad {
  v: 1;
  /** `claveRevision` → cuándo se revisó y qué eligió la persona. */
  revisiones: Record<string, { ts: number; resultado: ResultadoRevision }>;
  /** `claveAviso` → aviso que sigue visible en Cuenta › Neuronas. */
  avisos: Record<string, AvisoRevision>;
}

/** Un aparato vivo de la fila de la neurona, ya saneado. */
export interface AparatoRevision {
  id: string;
  nombre: string;
  huella?: string;
  /** Epoch ms en que se unió a esta neurona, si la fila lo guarda. */
  desde?: number;
  visto: number;
  vinculado: boolean;
}

/** Lo mínimo que este medio sabe de sí mismo. */
export interface AparatoActualRevision {
  id: string;
  nombre?: string;
  huella?: string;
  desde?: number;
}

export interface EntradaRevisionIdentidad {
  neuronaId: string;
  neuronaNombre: string;
  aparatoActual: AparatoActualRevision;
  /** `capabilities` de la fila de la neurona (jsonb tal cual). */
  capabilities: unknown;
  /** Versión de la app que estrena la revisión: cambia la clave para volver a revisar. */
  version?: string;
  registro?: RegistroRevisionIdentidad;
  ahora: number;
}

const RESULTADOS: readonly ResultadoRevision[] = ["propia", "fusionadas", "mas-tarde"];

function texto(v: unknown, max = 80): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
}

function numero(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Clave de la revisión: cambia con la versión para revisar una vez por versión. Pura. */
export function claveRevision(neuronaId: string, aparatoId: string, version?: string): string {
  return [neuronaId, aparatoId, version?.trim() || "v1"].join("|");
}

/** Clave del aviso que queda en Cuenta › Neuronas. Pura. */
export function claveAvisoRevision(neuronaId: string, aparatoId: string): string {
  return [neuronaId, aparatoId].join("|");
}

/** Lee el registro local (o basura) y devuelve uno válido. Pura. Nunca lanza. */
export function leerRegistroRevision(crudo: string | null | undefined): RegistroRevisionIdentidad {
  const vacio: RegistroRevisionIdentidad = { v: 1, revisiones: {}, avisos: {} };
  if (!crudo) return vacio;
  try {
    const o = JSON.parse(crudo) as Partial<RegistroRevisionIdentidad> | null;
    const revisiones: RegistroRevisionIdentidad["revisiones"] = {};
    const avisos: RegistroRevisionIdentidad["avisos"] = {};
    if (o && typeof o === "object") {
      if (o.revisiones && typeof o.revisiones === "object") {
        for (const [clave, r] of Object.entries(o.revisiones)) {
          if (!clave || clave.length > 200 || !r || typeof r !== "object") continue;
          const ts = numero(r.ts) ?? 0;
          const resultado = RESULTADOS.includes(r.resultado) ? r.resultado : null;
          if (resultado) revisiones[clave] = { ts, resultado };
        }
      }
      if (o.avisos && typeof o.avisos === "object") {
        for (const [clave, a] of Object.entries(o.avisos)) {
          if (!clave || clave.length > 200 || !a || typeof a !== "object") continue;
          const neuronaId = texto(a.neuronaId);
          const aparatoId = texto(a.aparatoId);
          if (!neuronaId || !aparatoId) continue;
          avisos[clave] = {
            neuronaId,
            neuronaNombre: texto(a.neuronaNombre) ?? "esta neurona",
            aparatoId,
            otroNombre: texto(a.otroNombre) ?? "otro aparato",
            ts: numero(a.ts) ?? 0,
          };
        }
      }
    }
    return { v: 1, revisiones, avisos };
  } catch {
    return vacio;
  }
}

/** Serializa el registro para guardarlo en el almacén local. Pura. */
export function serializarRegistroRevision(reg: RegistroRevisionIdentidad): string {
  return JSON.stringify(reg);
}

/** Anota que esta revisión ya se hizo. Pura. */
export function conRevisionHecha(
  reg: RegistroRevisionIdentidad,
  clave: string,
  resultado: ResultadoRevision,
  ahora: number,
): RegistroRevisionIdentidad {
  if (!clave) return reg;
  return { ...reg, revisiones: { ...reg.revisiones, [clave]: { ts: ahora, resultado } } };
}

/** Deja el aviso visible en Cuenta › Neuronas. Pura. */
export function conAvisoPospuesto(
  reg: RegistroRevisionIdentidad,
  aviso: Omit<AvisoRevision, "ts">,
  ahora: number,
): RegistroRevisionIdentidad {
  if (!aviso.neuronaId || !aviso.aparatoId) return reg;
  const clave = claveAvisoRevision(aviso.neuronaId, aviso.aparatoId);
  return { ...reg, avisos: { ...reg.avisos, [clave]: { ...aviso, ts: ahora } } };
}

/** Quita un aviso (cuando la persona ya eligió). Pura. */
export function quitarAvisoRevision(reg: RegistroRevisionIdentidad, clave: string): RegistroRevisionIdentidad {
  if (!clave || !reg.avisos[clave]) return reg;
  const avisos = { ...reg.avisos };
  delete avisos[clave];
  return { ...reg, avisos };
}

/** ¿Ya se revisó esta clave? Devuelve qué eligió, o null. Pura. */
export function revisionHecha(reg: RegistroRevisionIdentidad, clave: string): ResultadoRevision | null {
  return reg.revisiones[clave]?.resultado ?? null;
}

/** El aviso pendiente de esta neurona × aparato, o null. Pura. */
export function avisoPendiente(reg: RegistroRevisionIdentidad, clave: string): AvisoRevision | null {
  return reg.avisos[clave] ?? null;
}

/** Los avisos que Cuenta › Neuronas debe enseñar, el más reciente primero. Pura. */
export function avisosDeRevision(reg: RegistroRevisionIdentidad): AvisoRevision[] {
  return Object.values(reg.avisos).sort((a, b) => b.ts - a.ts);
}

interface EntradaCruda {
  id: string;
  nombre: string;
  huella?: string;
  desde?: number;
  visto: number;
  vinculado: boolean;
}

function leerEntradas(capabilities: unknown): EntradaCruda[] {
  const base = leerMapaAparatos(capabilities);
  const crudo =
    capabilities && typeof capabilities === "object"
      ? (capabilities as Record<string, unknown>).aparatos
      : null;
  const out: EntradaCruda[] = [];
  for (const [id, e] of Object.entries(base)) {
    const raw = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>)[id] : null;
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const huella = texto(o.huella, 64);
    out.push({
      id,
      nombre: texto(e.n, 60) ?? nombreAparatoPorDefecto(e),
      huella,
      desde: numero(o.desde),
      visto: e.ts,
      vinculado: estaVinculado(e),
    });
  }
  return out;
}

/** Clave física del aparato: su huella si la tiene; si no, su id. Pura. */
export function huellaDeAparato(a: Pick<AparatoRevision, "id" | "huella">): string {
  return a.huella ? `h:${a.huella}` : `id:${a.id}`;
}

/** Los aparatos vivos de la fila, del más antiguo al más nuevo. Pura. */
export function aparatosVivosDe(capabilities: unknown): AparatoRevision[] {
  return leerEntradas(capabilities)
    .filter((a) => a.vinculado)
    .sort((a, b) => (a.desde ?? a.visto) - (b.desde ?? b.visto) || a.id.localeCompare(b.id));
}

/** ¿Hay al menos dos huellas distintas entre los aparatos vivos? Pura. */
export function hayHuellasDistintas(aparatos: readonly AparatoRevision[]): boolean {
  return new Set(aparatos.map(huellaDeAparato)).size >= 2;
}

/** Nombre propuesto para la neurona propia: el nombre del aparato, o uno neutro. Pura. */
export function nombrePropuestoNeurona(nombreAparato: string | null | undefined): string {
  const t = (nombreAparato ?? "").replace(/\s+/g, " ").trim();
  return t || "Neurona nueva";
}

/** «A», «A y B», «A, B y C». Pura. */
export function listaNombres(nombres: readonly string[]): string {
  const limpios = nombres.map((n) => n.trim()).filter(Boolean);
  if (!limpios.length) return "otro aparato";
  if (limpios.length === 1) return limpios[0];
  return `${limpios.slice(0, -1).join(", ")} y ${limpios[limpios.length - 1]}`;
}

export type MotivoSinRevision =
  | "sin-neurona"
  | "sin-aparato"
  | "un-solo-aparato"
  | "misma-huella"
  | "ya-revisada";

/** Datos que la ventana necesita cuando toca mostrarla. */
export interface RevisionIdentidadVisible {
  mostrar: true;
  neuronaId: string;
  neuronaNombre: string;
  aparatoActual: { id: string; nombre: string };
  otros: Array<{ id: string; nombre: string }>;
  /** «Maggadroid» o «Maggadroid y MaggaBook». */
  otroNombre: string;
  /** El aparato que se unió después crea la suya; el primero conserva la neurona. */
  recomiendaPropia: boolean;
  /** Nombre propuesto para la neurona propia (el del aparato). */
  nombrePropuesto: string;
  claveRevision: string;
  claveAviso: string;
  /** La persona ya dijo «Más tarde»: el aviso sigue en Cuenta › Neuronas. */
  avisoPendiente: boolean;
}

export type DecisionRevisionIdentidad =
  | { mostrar: false; motivo: MotivoSinRevision; avisoPendiente: boolean }
  | RevisionIdentidadVisible;

function ordenLlegada(a: AparatoRevision): number {
  return a.desde ?? a.visto;
}

function representantes(aparatos: readonly AparatoRevision[]): AparatoRevision[] {
  const porHuella = new Map<string, AparatoRevision>();
  for (const a of aparatos) {
    const clave = huellaDeAparato(a);
    const previo = porHuella.get(clave);
    if (!previo || ordenLlegada(a) < ordenLlegada(previo)) porHuella.set(clave, a);
  }
  return [...porHuella.values()].sort((a, b) => ordenLlegada(a) - ordenLlegada(b) || a.id.localeCompare(b.id));
}

function primeroDe(aparatos: readonly AparatoRevision[], neuronaId: string): AparatoRevision | null {
  const delId = aparatos.find((a) => a.id === neuronaId);
  if (delId) return delId;
  return representantes(aparatos)[0] ?? null;
}

function entradaActual(
  a: AparatoActualRevision,
  existente: AparatoRevision | undefined,
  ahora: number,
): AparatoRevision {
  return {
    id: a.id,
    nombre: texto(a.nombre, 60) ?? existente?.nombre ?? "Este aparato",
    huella: texto(a.huella, 64) ?? existente?.huella,
    desde: numero(a.desde) ?? existente?.desde,
    visto: existente?.visto ?? ahora,
    vinculado: true,
  };
}

function unirActual(vivos: readonly AparatoRevision[], actual: AparatoRevision): AparatoRevision[] {
  const i = vivos.findIndex((a) => a.id === actual.id);
  if (i < 0) return [...vivos, actual];
  const copia = vivos.slice();
  copia[i] = { ...copia[i], ...actual, visto: copia[i].visto || actual.visto };
  return copia;
}

/** El texto exacto de la ventana, con la neurona y el otro aparato. Pura. */
export function textoComparteNeurona(v: RevisionIdentidadVisible): string {
  return `Este aparato comparte la neurona «${v.neuronaNombre}» con «${v.otroNombre}». Recomendado: una neurona por aparato.`;
}

/**
 * ¿Toca enseñar la ventana en ESTE aparato? Pura. Nunca lanza.
 * Solo cuando la fila tiene dos o más aparatos vivos con huella distinta, no se revisó ya esta
 * versión y este aparato está entre ellos (o es uno nuevo que acaba de llegar a la fila).
 */
export function decidirRevisionIdentidad(e: EntradaRevisionIdentidad): DecisionRevisionIdentidad {
  const reg = e.registro ?? leerRegistroRevision(null);
  const aparatoId = texto(e.aparatoActual?.id) ?? "";
  const clave = claveRevision(e.neuronaId ?? "", aparatoId, e.version);
  const claveAviso = claveAvisoRevision(e.neuronaId ?? "", aparatoId);
  const aviso = !!avisoPendiente(reg, claveAviso);
  if (!e.neuronaId) return { mostrar: false, motivo: "sin-neurona", avisoPendiente: aviso };
  if (!aparatoId) return { mostrar: false, motivo: "sin-aparato", avisoPendiente: aviso };
  if (revisionHecha(reg, clave)) return { mostrar: false, motivo: "ya-revisada", avisoPendiente: aviso };

  const vivos = aparatosVivosDe(e.capabilities);
  const existente = vivos.find((a) => a.id === aparatoId);
  const actual = entradaActual(e.aparatoActual, existente, e.ahora);
  const distintos = representantes(unirActual(vivos, actual));
  if (distintos.length < 2) {
    const motivo: MotivoSinRevision = vivos.length + (existente ? 0 : 1) >= 2 ? "misma-huella" : "un-solo-aparato";
    return { mostrar: false, motivo, avisoPendiente: aviso };
  }

  const claveActual = huellaDeAparato(actual);
  const primero = primeroDe(distintos, e.neuronaId);
  const otros = distintos.filter((a) => huellaDeAparato(a) !== claveActual);
  const nombreAparato = texto(e.aparatoActual.nombre, 60) ?? existente?.nombre;
  return {
    mostrar: true,
    neuronaId: e.neuronaId,
    neuronaNombre: texto(e.neuronaNombre, 60) ?? "esta neurona",
    aparatoActual: { id: actual.id, nombre: actual.nombre },
    otros: otros.map((a) => ({ id: a.id, nombre: a.nombre })),
    otroNombre: listaNombres(otros.map((a) => a.nombre)),
    recomiendaPropia: !!primero && huellaDeAparato(primero) !== claveActual,
    nombrePropuesto: nombrePropuestoNeurona(nombreAparato),
    claveRevision: clave,
    claveAviso,
    avisoPendiente: aviso,
  };
}
