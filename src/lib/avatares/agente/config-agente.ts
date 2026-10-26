/**
 * Configuración de un agente del Mundo de los avatares (Ola 1025U · U2) — módulo PURO.
 * Contrato: architecture/ficha-agente-mundo.md.
 *
 * Un agente es una personalidad de la cuenta, un bot de un grupo/página/comunidad o un agente de grupo
 * (`AgenteMundoRef`: todo habitante es una IA). Aquí viven las reglas de su ficha:
 *   · CEREBRO propio o vinculado a un `Brain` de la cuenta, con memoria individual, colectiva o telepática
 *     (la telepatía reutiliza `VinculoTelepatico` y `planSincronizacion`; no se reimplementa la sincronía);
 *   · CAPAS de conciencia con peso, ordenadas, que se añaden, se quitan y se conectan;
 *   · PERCEPCIÓN y evolución (ver `percepcion.ts`, reexportada desde aquí);
 *   · MOTORES por papel (reflejo → Needle, juicio → Jev, palabra → BitNet/Bonsai/enrutador, profundo opcional);
 *   · HERRAMIENTAS y habilidades que existen.
 *
 * Reglas que no se saltan: el alcance de memoria (personal › perfil › grupo › pública, nunca al revés), lo de pago
 * apagado hasta que la persona lo permite y un tope de llamadas por hora por agente.
 * Sin React, sin red, sin disco y sin reloj propio. Lo importa código de cliente: nada de `node:*`.
 */
import { ASTRAURA_BONSAI_LOCAL_SOURCE_ID, findSource } from "@/ai/astraura/free-catalog";
import type { PrimaryChoice } from "@/lib/astraura/primary-system";
import {
  alternarHerramienta, alternarTodasHerramientas, todasHerramientasActivas, type SeleccionHerramientas,
} from "@/lib/astraura/chat-herramientas";
import {
  ORDEN_ALCANCE, alcanceVisiblePara,
  type ActorMemoria, type AlcanceMemoria, type TipoActor,
} from "@/lib/nucleo/alcance-memoria";
import { planSincronizacion, validarVinculo, type VinculoTelepatico } from "@/lib/cerebros/telepatia";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import {
  PERCEPCION_DEFECTO, desarrolloVacio, filtroAPrompt, sanearDesarrollo, sanearPercepcion,
  type Desarrollo, type Percepcion,
} from "./percepcion";

export * from "./percepcion";

export const VERSION_CONFIG_AGENTE = 1;

/* ── Texto de la persona que acaba en pantalla o en un prompt ────────────── */

/** Sin controles, sin saltos de línea, sin comillas ni marcas y acotado. */
export function limpiarTexto(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[«»"'`<>{}[\]\\]/g, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

const esRegistro = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const peso01 = (x: unknown, defecto: number) => (typeof x === "number" && Number.isFinite(x) ? r3(Math.max(0, Math.min(1, x))) : defecto);

/* ═══════════════════════ Actor y alcance de memoria ═══════════════════════ */

/** Quién pregunta a la memoria cuando lo hace este agente (`nucleo/alcance-memoria.ts`). */
export function actorDeAgente(a: AgenteMundoRef): TipoActor {
  if (a.origen === "personalidad") return "agente-personal";
  if (a.origen === "agente-grupo") return "agente-grupo";
  switch (a.dueno.tipo) {
    case "grupo":
    case "comunidad":
      return "agente-grupo";
    case "pagina":
      return "agente-publico";
    default:
      return "agente-personal";
  }
}

export function actorMemoriaDe(a: AgenteMundoRef): ActorMemoria {
  const tipo = actorDeAgente(a);
  return tipo === "agente-grupo" ? { tipo, grupoId: a.dueno.id } : { tipo };
}

/** ¿Un recuerdo de ese alcance puede viajar a un destino de este otro? Solo a uno igual o más privado: nunca hacia lo más abierto. */
export function puedeFluir(origen: AlcanceMemoria, destino: AlcanceMemoria): boolean {
  return ORDEN_ALCANCE.indexOf(destino) <= ORDEN_ALCANCE.indexOf(origen);
}

/* ═══════════════════════════════ Cerebro ═══════════════════════════════ */

export const AMBITOS_CEREBRO = ["cuenta", "perfil", "grupo", "pagina", "publicacion"] as const;
export type AmbitoCerebro = (typeof AMBITOS_CEREBRO)[number];

export const ETIQUETA_AMBITO: Record<AmbitoCerebro, string> = {
  cuenta: "Cuenta", perfil: "Perfil", grupo: "Grupo", pagina: "Página", publicacion: "Publicación",
};

/** `Brain.scope` → ámbito de la ficha. Lo desconocido o vacío cuenta como cuenta (lo más privado: nada se abre por error). */
export function ambitoDeBrain(scope: string | null | undefined): AmbitoCerebro {
  switch ((scope ?? "").toLowerCase()) {
    case "profile": return "perfil";
    case "group": case "community": return "grupo";
    case "page": return "pagina";
    case "post": case "publication": case "publicacion": return "publicacion";
    default: return "cuenta";
  }
}

export function alcanceDeCerebro(ambito: AmbitoCerebro): AlcanceMemoria {
  switch (ambito) {
    case "cuenta": return "personal";
    case "perfil": return "perfil";
    case "grupo": return "grupo";
    default: return "publica";
  }
}

export type Veredicto = { ok: true } | { ok: false; motivo: string };

/** ¿Puede este agente tener como cerebro uno de ese ámbito? Solo si su actor puede VER esa memoria. */
export function puedeVincularAmbito(agente: AgenteMundoRef, ambito: AmbitoCerebro, ambitoRef: string | null | undefined): Veredicto {
  const alcance = alcanceDeCerebro(ambito);
  if (!alcanceVisiblePara({ tipo: actorDeAgente(agente) }).includes(alcance)) {
    return { ok: false, motivo: `Un agente así no puede leer memoria ${alcance === "personal" ? "personal" : alcance === "perfil" ? "de perfil" : "de grupo"}: solo ve lo de su ámbito y lo público.` };
  }
  const tipoDueno = agente.dueno.tipo;
  if (ambito === "grupo" && (tipoDueno === "grupo" || tipoDueno === "comunidad") && ambitoRef !== agente.dueno.id) {
    return { ok: false, motivo: "Ese cerebro es de otro grupo: un agente solo usa el de la entidad a la que sirve." };
  }
  if (ambito === "pagina" && tipoDueno === "pagina" && ambitoRef !== agente.dueno.id) {
    return { ok: false, motivo: "Ese cerebro es de otra página: un agente solo usa el de la entidad a la que sirve." };
  }
  if (ambito === "perfil" && tipoDueno === "perfil" && ambitoRef && ambitoRef !== agente.dueno.id) {
    return { ok: false, motivo: "Ese cerebro es de otro perfil." };
  }
  return { ok: true };
}

export interface CerebroLite { id: string; name: string; scope: string; scope_ref: string | null }

export function puedeVincularCerebro(agente: AgenteMundoRef, cerebro: Pick<CerebroLite, "scope" | "scope_ref">): Veredicto {
  return puedeVincularAmbito(agente, ambitoDeBrain(cerebro.scope), cerebro.scope_ref);
}

export const MODOS_MEMORIA = ["individual", "colectiva", "telepatica"] as const;
export type ModoMemoria = (typeof MODOS_MEMORIA)[number];

export const ETIQUETA_MODO: Record<ModoMemoria, { nombre: string; ayuda: string }> = {
  individual: { nombre: "Individual", ayuda: "Sus recuerdos son solo suyos." },
  colectiva: { nombre: "Colectiva", ayuda: "Comparte lo que aprende con su ámbito (capa colectiva), según el alcance de memoria." },
  telepatica: { nombre: "Telepática", ayuda: "Se vincula con otros cerebros tuyos y se sincroniza con ellos." },
};

export interface CerebroVinculado {
  brainId: string;
  nombre: string;
  ambito: AmbitoCerebro;
  ambitoRef: string | null;
}

export const MAX_VINCULOS = 8;

export interface CerebroAgente {
  tipo: "propio" | "vinculado";
  /** Nombre del cerebro propio. */
  nombre: string;
  vinculado: CerebroVinculado | null;
  memoria: ModoMemoria;
  /** Los vínculos nuevos y los actuales se sincronizan solos (`VinculoTelepatico.auto`). */
  sincronizacionAuto: boolean;
  /** Los recuerdos se transfieren solos entre las neuronas de la cuenta, con las reglas de `memoria-bot`. */
  transferenciaAuto: boolean;
  /** Telepatía de la memoria PROPIA con cerebros de la cuenta. Con cerebro vinculado se gestiona en el propio cerebro. */
  vinculos: VinculoTelepatico[];
}

export function cerebroPorDefecto(agente: Pick<AgenteMundoRef, "nombre">): CerebroAgente {
  return {
    tipo: "propio", nombre: limpiarTexto(`Cerebro de ${agente.nombre}`, 80) || "Cerebro del agente",
    vinculado: null, memoria: "individual", sincronizacionAuto: true, transferenciaAuto: true, vinculos: [],
  };
}

function copiarVinculo(v: VinculoTelepatico): VinculoTelepatico {
  return {
    id: v.id,
    destino: { tipo: "cerebro", id: v.destino.id },
    alcance: { completo: v.alcance.completo, memorias: [...v.alcance.memorias], carpetas: [...v.alcance.carpetas], configuraciones: [...v.alcance.configuraciones] },
    direccion: v.direccion, acceso: v.acceso, auto: v.auto, estado: v.estado, creadoEn: v.creadoEn,
    expiraEn: v.expiraEn ?? null, ultimaSync: v.ultimaSync ?? null,
  };
}

/** Los vínculos de la ficha son entre cerebros de la cuenta (los de otras cuentas, grupos y páginas se hacen en Cerebros → Telepatía). */
export function sanearVinculos(raw: unknown): VinculoTelepatico[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const out: VinculoTelepatico[] = [];
  for (const item of raw) {
    const r = validarVinculo(item);
    if (!r.ok || r.vinculo.destino.tipo !== "cerebro" || ids.has(r.vinculo.id)) continue;
    ids.add(r.vinculo.id);
    out.push(copiarVinculo(r.vinculo));
    if (out.length >= MAX_VINCULOS) break;
  }
  return out;
}

export function sanearCerebro(raw: unknown, agente: AgenteMundoRef): CerebroAgente {
  const base = cerebroPorDefecto(agente);
  const o = esRegistro(raw) ? raw : {};
  const memoria = (MODOS_MEMORIA as readonly string[]).includes(o.memoria as string) ? (o.memoria as ModoMemoria) : base.memoria;
  let vinculado: CerebroVinculado | null = null;
  if (o.tipo === "vinculado" && esRegistro(o.vinculado)) {
    const v = o.vinculado;
    const ambito = (AMBITOS_CEREBRO as readonly string[]).includes(v.ambito as string) ? (v.ambito as AmbitoCerebro) : null;
    const brainId = limpiarTexto(v.brainId, 160);
    const ref = typeof v.ambitoRef === "string" && v.ambitoRef ? limpiarTexto(v.ambitoRef, 160) : null;
    // Si hoy las reglas de alcance no lo permiten (cambió de dueño, de tipo…), vuelve a su cerebro propio.
    if (ambito && brainId && puedeVincularAmbito(agente, ambito, ref).ok) {
      vinculado = { brainId, nombre: limpiarTexto(v.nombre, 80) || "Cerebro", ambito, ambitoRef: ref };
    }
  }
  return {
    tipo: vinculado ? "vinculado" : "propio",
    nombre: limpiarTexto(o.nombre, 80) || base.nombre,
    vinculado,
    memoria,
    sincronizacionAuto: typeof o.sincronizacionAuto === "boolean" ? o.sincronizacionAuto : base.sincronizacionAuto,
    transferenciaAuto: typeof o.transferenciaAuto === "boolean" ? o.transferenciaAuto : base.transferenciaAuto,
    vinculos: vinculado ? [] : sanearVinculos(o.vinculos),
  };
}

export type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string };

/** Vincula el agente a un cerebro existente de la cuenta. Respeta el alcance de memoria. */
export function vincularCerebro(c: ConfigAgente, agente: AgenteMundoRef, cerebro: CerebroLite): Resultado<{ config: ConfigAgente }> {
  const v = puedeVincularCerebro(agente, cerebro);
  if (!v.ok) return v;
  const nombre = limpiarTexto(cerebro.name, 80) || "Cerebro";
  const vinculado: CerebroVinculado = { brainId: cerebro.id, nombre, ambito: ambitoDeBrain(cerebro.scope), ambitoRef: cerebro.scope_ref ?? null };
  return { ok: true, config: { ...c, cerebro: { ...c.cerebro, tipo: "vinculado", vinculado, vinculos: [] } } };
}

export function usarCerebroPropio(c: ConfigAgente): ConfigAgente {
  return { ...c, cerebro: { ...c.cerebro, tipo: "propio", vinculado: null } };
}

export function elegirModoMemoria(c: ConfigAgente, memoria: ModoMemoria): ConfigAgente {
  return (MODOS_MEMORIA as readonly string[]).includes(memoria) ? { ...c, cerebro: { ...c.cerebro, memoria } } : c;
}

export function ponerSincronizacionAuto(c: ConfigAgente, auto: boolean): ConfigAgente {
  return { ...c, cerebro: { ...c.cerebro, sincronizacionAuto: auto, vinculos: c.cerebro.vinculos.map((v) => ({ ...v, auto })) } };
}

export function ponerTransferenciaAuto(c: ConfigAgente, auto: boolean): ConfigAgente {
  return { ...c, cerebro: { ...c.cerebro, transferenciaAuto: auto } };
}

export interface OpcionesVinculo {
  direccion?: VinculoTelepatico["direccion"];
  acceso?: VinculoTelepatico["acceso"];
}

/** Un vínculo telepático de la memoria del agente con OTRO cerebro de la cuenta. Sincroniza memorias; no comparte configuración. */
export function nuevoVinculoAgente(destino: CerebroLite, ahora: number, auto: boolean, opciones: OpcionesVinculo = {}): VinculoTelepatico {
  return {
    id: `ag-${destino.id.slice(0, 8)}-${ahora}`,
    destino: { tipo: "cerebro", id: destino.id },
    alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
    direccion: opciones.direccion ?? "ambas",
    acceso: opciones.acceso ?? "leer",
    auto, estado: "activo", creadoEn: new Date(ahora).toISOString().replace(/\.\d{3}Z$/, ".000Z"), expiraEn: null, ultimaSync: null,
  };
}

export function agregarVinculo(
  c: ConfigAgente, agente: AgenteMundoRef, destino: CerebroLite, ahora: number, opciones: OpcionesVinculo = {},
): Resultado<{ config: ConfigAgente }> {
  if (c.cerebro.tipo === "vinculado") {
    return { ok: false, motivo: "Con un cerebro vinculado, la telepatía se gestiona en ese cerebro." };
  }
  const v = puedeVincularCerebro(agente, destino);
  if (!v.ok) return v;
  if (c.cerebro.vinculos.some((x) => x.destino.id === destino.id)) return { ok: false, motivo: "Ya está vinculado a ese cerebro." };
  if (c.cerebro.vinculos.length >= MAX_VINCULOS) return { ok: false, motivo: `Como mucho ${MAX_VINCULOS} vínculos.` };
  const vinculo = nuevoVinculoAgente(destino, ahora, c.cerebro.sincronizacionAuto, opciones);
  return { ok: true, config: { ...c, cerebro: { ...c.cerebro, vinculos: [...c.cerebro.vinculos, vinculo] } } };
}

export function quitarVinculo(c: ConfigAgente, id: string): ConfigAgente {
  return { ...c, cerebro: { ...c.cerebro, vinculos: c.cerebro.vinculos.filter((v) => v.id !== id) } };
}

export interface RecuerdoLike { id: string; texto: string; at: number; alcance: AlcanceMemoria }
export interface ArchivoMemoria { name: string; content: string; updated_at?: string | null }

/** Solo viajan al destino los recuerdos que no son más privados que él. */
export function recuerdosParaDestino<T extends { alcance: AlcanceMemoria }>(recuerdos: T[], ambitoDestino: AmbitoCerebro): T[] {
  const destino = alcanceDeCerebro(ambitoDestino);
  return recuerdos.filter((r) => puedeFluir(r.alcance, destino));
}

export function recuerdosComoArchivos(recuerdos: RecuerdoLike[]): ArchivoMemoria[] {
  return recuerdos.map((r) => ({ name: r.id, content: r.texto, updated_at: new Date(r.at).toISOString() }));
}

/** Qué se sincronizaría con ese cerebro: lo calcula `planSincronizacion` (no se reimplementa), sobre los recuerdos que pueden viajar. */
export function planTelepatiaAgente(
  vinculo: VinculoTelepatico, recuerdos: RecuerdoLike[], archivosDestino: ArchivoMemoria[], ambitoDestino: AmbitoCerebro,
): ReturnType<typeof planSincronizacion> {
  const origen = recuerdosComoArchivos(recuerdosParaDestino(recuerdos, ambitoDestino));
  return planSincronizacion(vinculo, { archivos: origen, prefs: {} }, { archivos: archivosDestino, prefs: {} });
}

/* ═══════════════════════════════ Capas ═══════════════════════════════ */

export const TIPOS_CAPA = ["local", "mesh", "nube", "colectiva", "red-os", "propia"] as const;
export type TipoCapa = (typeof TIPOS_CAPA)[number];
export const MAX_CAPAS = 12;
export const ID_CAPA_RED_OS = "todo-starseed-os";

export interface CapaAgente {
  id: string;
  tipo: TipoCapa;
  nombre: string;
  descripcion: string;
  /** Cuánto pesa en cómo piensa: 0 (nada) a 1 (todo). */
  peso: number;
  conectada: boolean;
}

type CapaIntegrada = Omit<CapaAgente, "peso" | "conectada"> & { peso: number; conectada: boolean };

/** Las capas que vienen con el OS: las cuatro de conciencia de Astraura y la colectiva de toda la red. */
export const CAPAS_INTEGRADAS: readonly CapaIntegrada[] = [
  { id: "local", tipo: "local", nombre: "Local", descripcion: "BitNet 1.58 en esta neurona, sin conexión y sin coste.", peso: 0.8, conectada: true },
  { id: "mesh", tipo: "mesh", nombre: "Mesh", descripcion: "Otras neuronas de la malla y de la red local.", peso: 0.5, conectada: true },
  { id: "nube", tipo: "nube", nombre: "Nube", descripcion: "El backend 1.58 publicado para la web y la app.", peso: 0.5, conectada: true },
  { id: "colectiva", tipo: "colectiva", nombre: "Colectiva", descripcion: "Memoria y aprendizaje que comparte con su ámbito, con permiso.", peso: 0.5, conectada: true },
  {
    id: ID_CAPA_RED_OS, tipo: "red-os", nombre: "Todo StarSeed OS",
    descripcion: "La conciencia colectiva de toda la red: aprende de lo que ya es público en StarSeed OS. Nunca lleva lo personal ni lo de un grupo ajeno.",
    peso: 0.5, conectada: false,
  },
];

export function capasPorDefecto(): CapaAgente[] {
  return CAPAS_INTEGRADAS.map((c) => ({ ...c }));
}

const integrada = (id: string) => CAPAS_INTEGRADAS.find((c) => c.id === id);

export function sanearCapas(raw: unknown): CapaAgente[] {
  if (!Array.isArray(raw)) return capasPorDefecto();
  const ids = new Set<string>();
  const out: CapaAgente[] = [];
  for (const item of raw) {
    if (!esRegistro(item) || typeof item.id !== "string") continue;
    const id = limpiarTexto(item.id, 60);
    if (!id || ids.has(id)) continue;
    const base = integrada(id);
    if (base) {
      ids.add(id);
      out.push({ ...base, peso: peso01(item.peso, base.peso), conectada: typeof item.conectada === "boolean" ? item.conectada : base.conectada });
    } else if (id.startsWith("propia-")) {
      const nombre = limpiarTexto(item.nombre, 40);
      if (!nombre) continue;
      ids.add(id);
      out.push({ id, tipo: "propia", nombre, descripcion: limpiarTexto(item.descripcion, 160), peso: peso01(item.peso, 0.5), conectada: item.conectada !== false });
    }
    if (out.length >= MAX_CAPAS) break;
  }
  return out;
}

/** Las integradas que se quitaron y se pueden volver a añadir. */
export function capasQueSePuedenAnadir(capas: CapaAgente[]): CapaAgente[] {
  const hay = new Set(capas.map((c) => c.id));
  return CAPAS_INTEGRADAS.filter((c) => !hay.has(c.id)).map((c) => ({ ...c }));
}

/** Vuelve a poner una integrada (conectada, con su peso de fábrica) o crea una propia con ese nombre. */
export function agregarCapa(capas: CapaAgente[], entrada: { id: string } | { nombre: string; descripcion?: string }): Resultado<{ capas: CapaAgente[] }> {
  if (capas.length >= MAX_CAPAS) return { ok: false, motivo: `Como mucho ${MAX_CAPAS} capas.` };
  if ("id" in entrada) {
    const base = integrada(entrada.id);
    if (!base) return { ok: false, motivo: "Esa capa no existe." };
    if (capas.some((c) => c.id === base.id)) return { ok: false, motivo: "Esa capa ya está en la lista." };
    return { ok: true, capas: [...capas, { ...base, conectada: true }] };
  }
  const nombre = limpiarTexto(entrada.nombre, 40);
  if (!nombre) return { ok: false, motivo: "Ponle un nombre a la capa." };
  if (capas.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) return { ok: false, motivo: "Ya hay una capa con ese nombre." };
  const n = capas.reduce((m, c) => (c.id.startsWith("propia-") ? Math.max(m, Number(c.id.slice(7)) || 0) : m), 0) + 1;
  return { ok: true, capas: [...capas, { id: `propia-${n}`, tipo: "propia", nombre, descripcion: limpiarTexto(entrada.descripcion, 160), peso: 0.5, conectada: true }] };
}

export const quitarCapa = (capas: CapaAgente[], id: string): CapaAgente[] => capas.filter((c) => c.id !== id);
export const conectarCapa = (capas: CapaAgente[], id: string, conectada: boolean): CapaAgente[] => capas.map((c) => (c.id === id ? { ...c, conectada } : c));
export const ajustarPesoCapa = (capas: CapaAgente[], id: string, peso: number): CapaAgente[] => capas.map((c) => (c.id === id ? { ...c, peso: peso01(peso, c.peso) } : c));

export function moverCapa(capas: CapaAgente[], id: string, paso: -1 | 1): CapaAgente[] {
  const i = capas.findIndex((c) => c.id === id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= capas.length) return capas;
  const copia = [...capas];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

export type CampoCapaBase = "local" | "mesh" | "nube" | "colectiva";

/**
 * Lo que las capas de la ficha APLICAN hoy en el OS: `capas-entidad` (ámbito «agente») decide qué capas de conciencia
 * usa este agente. `true`/`false` = fijado por la ficha; `null` = no está en la lista, hereda de la cuenta.
 * «Todo StarSeed OS» conectada necesita la colectiva encendida, así que la enciende.
 */
export function ajustesCapasBase(capas: CapaAgente[]): Record<CampoCapaBase, boolean | null> {
  const salida: Record<CampoCapaBase, boolean | null> = { local: null, mesh: null, nube: null, colectiva: null };
  for (const campo of ["local", "mesh", "nube", "colectiva"] as const) {
    const c = capas.find((x) => x.id === campo);
    if (c) salida[campo] = c.conectada;
  }
  const red = capas.find((x) => x.id === ID_CAPA_RED_OS);
  if (red?.conectada) salida.colectiva = true;
  return salida;
}

export function pesoEnPalabras(p: number): "alto" | "medio" | "bajo" {
  return p >= 0.67 ? "alto" : p <= 0.33 ? "bajo" : "medio";
}

/** Las capas que dan una PERSPECTIVA (colectiva, red, propias) entran en el prompt; local/mesh/nube son dónde se piensa, no cómo. */
export function capasAPrompt(capas: CapaAgente[]): string {
  const activas = capas.filter((c) => c.conectada && c.peso >= 0.1 && (c.tipo === "colectiva" || c.tipo === "red-os" || c.tipo === "propia"));
  if (!activas.length) return "";
  const lineas = ["Capas de conciencia activas (de más a menos prioridad):"];
  for (const c of activas) {
    lineas.push(`- ${limpiarTexto(c.nombre, 40)} (peso ${pesoEnPalabras(c.peso)})${c.descripcion ? `: ${limpiarTexto(c.descripcion, 160)}` : ""}`);
  }
  if (activas.some((c) => c.tipo === "colectiva" || c.tipo === "red-os")) {
    lineas.push("- La conciencia colectiva solo aporta lo que ya es público: nunca lo personal ni lo de un grupo ajeno.");
  }
  return lineas.join("\n");
}

/* ═══════════════════════════════ Motores ═══════════════════════════════ */

export const ROLES_MOTOR = ["reflejo", "juicio", "palabra", "profundo"] as const;
export type RolMotor = (typeof ROLES_MOTOR)[number];

export const ETIQUETA_ROL: Record<RolMotor, { nombre: string; ayuda: string }> = {
  reflejo: { nombre: "Reflejo", ayuda: "Decide al instante qué herramienta usar." },
  juicio: { nombre: "Juicio", ayuda: "Elige entre opciones y dice «sí» o «no» con probabilidad." },
  palabra: { nombre: "Palabra", ayuda: "Escribe lo que dice. Es el sistema que va primero en su cadena." },
  profundo: { nombre: "Profundo", ayuda: "Para lo difícil o largo. Opcional: apagado, no se usa." },
};

export const MOTORES_ID = ["needle", "jev", "bitnet-158", "bonsai", "enrutador", "externo", "heredar"] as const;
export type MotorId = (typeof MOTORES_ID)[number];

export interface InfoMotor { nombre: string; donde: "local" | "enrutador" | "externo" | "herencia"; nota: string }

export const MOTORES: Record<MotorId, InfoMotor> = {
  needle: { nombre: "Cactus Needle", donde: "local", nota: "Reflejo local y gratis; si este aparato no lo tiene, responde el siguiente de la cadena." },
  jev: { nombre: "Jev", donde: "local", nota: "Juicio con probabilidad sobre BitNet; consejero con umbral, nunca oráculo." },
  "bitnet-158": { nombre: "BitNet 1.58 (Astraura)", donde: "local", nota: "El sistema primario del OS: soberano, local y sin coste." },
  bonsai: { nombre: "Bonsai (ternario)", donde: "local", nota: "Inferencia ternaria local (1,7 a 27 B); pide el servidor Bonsai de este aparato." },
  enrutador: { nombre: "Enrutador económico", donde: "enrutador", nota: "Gratis primero: elige la mejor fuente gratuita con cupo y cambia solo si una se agota." },
  externo: { nombre: "Fuente externa", donde: "externo", nota: "Una fuente concreta del catálogo. Las de pago están apagadas hasta que lo permitas." },
  heredar: { nombre: "Heredar", donde: "herencia", nota: "Sin ajuste propio: manda la personalidad, la neurona o la cuenta; si no hay, BitNet 1.58." },
};

/** Qué motores puede cumplir cada papel. BitNet y Bonsai están siempre entre las opciones. */
export const MOTORES_POR_ROL: Record<RolMotor, readonly MotorId[]> = {
  reflejo: ["needle", "bitnet-158"],
  juicio: ["jev", "bitnet-158"],
  palabra: ["heredar", "bitnet-158", "bonsai", "enrutador", "externo"],
  profundo: ["bitnet-158", "bonsai", "enrutador", "externo"],
};

export interface EleccionMotor { motor: MotorId; fuente?: string; modelo?: string }

export const TOPE_POR_HORA_DEFECTO = 20;
export const TOPE_POR_HORA_MAX = 120;

export interface Motores {
  /** `null` = papel apagado (no se usa). */
  roles: Record<RolMotor, EleccionMotor | null>;
  /** Las fuentes de pago están apagadas hasta que la persona lo permite. */
  permitirPago: boolean;
  /** Llamadas a modelos que este agente puede hacer por hora, locales y externas. */
  topePorHora: number;
}

export function motoresPorDefecto(): Motores {
  return {
    roles: { reflejo: { motor: "needle" }, juicio: { motor: "jev" }, palabra: { motor: "heredar" }, profundo: null },
    permitirPago: false, topePorHora: TOPE_POR_HORA_DEFECTO,
  };
}

export function esFuentePago(id: string): boolean {
  return findSource(id)?.tier === "paid";
}

function sanearEleccion(raw: unknown, rol: RolMotor, permitirPago: boolean): EleccionMotor | null | undefined {
  if (raw === null) return null;
  if (!esRegistro(raw) || typeof raw.motor !== "string") return undefined;
  const motor = raw.motor as MotorId;
  if (!MOTORES_POR_ROL[rol].includes(motor)) return undefined;
  if (motor !== "externo") return { motor };
  const fuente = limpiarTexto(raw.fuente, 120);
  const fuenteCatalogo = fuente ? findSource(fuente) : undefined;
  if (!fuenteCatalogo || (fuenteCatalogo.tier === "paid" && !permitirPago)) return undefined;
  const modelo = limpiarTexto(raw.modelo, 200);
  return { motor, fuente, ...(modelo ? { modelo } : {}) };
}

export function sanearMotores(raw: unknown): Motores {
  const base = motoresPorDefecto();
  const o = esRegistro(raw) ? raw : {};
  const permitirPago = o.permitirPago === true;
  const r = esRegistro(o.roles) ? o.roles : {};
  const roles = { ...base.roles };
  for (const rol of ROLES_MOTOR) {
    if (!(rol in r)) continue;
    const e = sanearEleccion(r[rol], rol, permitirPago);
    if (e !== undefined) roles[rol] = e;
  }
  const tope = typeof o.topePorHora === "number" && Number.isFinite(o.topePorHora) ? Math.round(o.topePorHora) : base.topePorHora;
  return { roles, permitirPago, topePorHora: Math.max(1, Math.min(TOPE_POR_HORA_MAX, tope)) };
}

/** Elige el motor de un papel (o lo apaga con `null`, salvo «palabra»: ese siempre tiene uno, aunque sea heredar). */
export function elegirMotor(m: Motores, rol: RolMotor, eleccion: EleccionMotor | null): Resultado<{ motores: Motores }> {
  if (eleccion === null) {
    if (rol === "palabra") return { ok: false, motivo: "La palabra siempre tiene un sistema; elige «Heredar» si no quieres ajuste propio." };
    return { ok: true, motores: { ...m, roles: { ...m.roles, [rol]: null } } };
  }
  if (!MOTORES_POR_ROL[rol].includes(eleccion.motor)) return { ok: false, motivo: `${MOTORES[eleccion.motor].nombre} no cumple el papel de ${ETIQUETA_ROL[rol].nombre.toLowerCase()}.` };
  if (eleccion.motor === "externo") {
    const fuente = eleccion.fuente ? findSource(eleccion.fuente) : undefined;
    if (!fuente) return { ok: false, motivo: "Elige una fuente del catálogo." };
    if (fuente.tier === "paid" && !m.permitirPago) return { ok: false, motivo: "Esa fuente es de pago: permítelo primero (nunca se gasta sin tu permiso)." };
  }
  const limpio = sanearEleccion(eleccion, rol, m.permitirPago);
  if (!limpio) return { ok: false, motivo: "Elección no válida." };
  return { ok: true, motores: { ...m, roles: { ...m.roles, [rol]: limpio } } };
}

/** Al quitar el permiso de pago, todo papel que usara una fuente de pago se apaga (palabra vuelve a heredar). */
export function permitirPago(m: Motores, permitido: boolean): Motores {
  if (permitido) return { ...m, permitirPago: true };
  const roles = { ...m.roles };
  for (const rol of ROLES_MOTOR) {
    const e = roles[rol];
    if (e?.motor === "externo" && e.fuente && esFuentePago(e.fuente)) roles[rol] = rol === "palabra" ? { motor: "heredar" } : null;
  }
  return { ...m, permitirPago: false, roles };
}

export function ponerTopePorHora(m: Motores, n: number): Motores {
  const v = Number.isFinite(n) ? Math.round(n) : m.topePorHora;
  return { ...m, topePorHora: Math.max(1, Math.min(TOPE_POR_HORA_MAX, v)) };
}

/** Economía: ninguna IA se llama sin tope. `llamadasEstaHora` son las de los últimos 60 minutos de ESTE agente. */
export function puedeLlamar(m: Motores, llamadasEstaHora: number): boolean {
  return Number.isFinite(llamadasEstaHora) && llamadasEstaHora < m.topePorHora;
}

export type EleccionPrimaria = { aplicar: false } | { aplicar: true; choice: PrimaryChoice };

/**
 * Lo que el papel «palabra» APLICA hoy: el sistema primario del ámbito «agente» (`primary-system.ts`). `heredar` no
 * escribe nada (y quien llama borra el ajuste propio). Una fuente de pago sin permiso nunca sale de aquí.
 */
export function eleccionPrimaria(m: Motores): EleccionPrimaria {
  const e = m.roles.palabra;
  if (!e || e.motor === "heredar") return { aplicar: false };
  switch (e.motor) {
    case "bitnet-158": return { aplicar: true, choice: { modo: "astraura-158" } };
    case "bonsai": return { aplicar: true, choice: { modo: "fuente", fuente: ASTRAURA_BONSAI_LOCAL_SOURCE_ID } };
    case "enrutador": return { aplicar: true, choice: { modo: "auto" } };
    case "externo": {
      if (!e.fuente || (esFuentePago(e.fuente) && !m.permitirPago)) return { aplicar: false };
      return { aplicar: true, choice: { modo: "fuente", fuente: e.fuente, ...(e.modelo ? { modelo: e.modelo } : {}) } };
    }
    default: return { aplicar: false };
  }
}

export interface PreferenciasRepartoAgente {
  /** 0 = todo en Astraura local … 1 = APIs primero. Ausente si el agente hereda. */
  nivelador?: number;
  externaFija?: string;
  apagadas: ("reflejo" | "razon" | "profunda")[];
}

/** Lo que este agente le dice a `repartir()` (`astraura-bots/reparto-de-modelo.ts`): papeles apagados y hacia dónde inclinarse. */
export function preferenciasReparto(m: Motores): PreferenciasRepartoAgente {
  const apagadas: PreferenciasRepartoAgente["apagadas"] = [];
  if (!m.roles.reflejo) apagadas.push("reflejo");
  if (!m.roles.juicio) apagadas.push("razon");
  if (!m.roles.profundo) apagadas.push("profunda");
  const p = m.roles.palabra;
  const fuera = p?.motor === "enrutador" || p?.motor === "externo";
  const local = p?.motor === "bitnet-158" || p?.motor === "bonsai";
  return {
    apagadas,
    ...(fuera ? { nivelador: 0.8 } : local ? { nivelador: 0.2 } : {}),
    ...(p?.motor === "externo" && p.fuente && (!esFuentePago(p.fuente) || m.permitirPago) ? { externaFija: p.fuente } : {}),
  };
}

/* ═════════════════════ Herramientas y habilidades ═════════════════════ */

/** `null` = todas (el valor por defecto: lo que se añada más adelante entra solo, como en `chat-herramientas`). */
export interface Herramientas {
  familias: string[] | null;
  habilidades: string[] | null;
}

export function herramientasPorDefecto(): Herramientas {
  return { familias: null, habilidades: null };
}

function sanearSeleccion(raw: unknown): string[] | null {
  if (raw === null || raw === undefined || !Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    const id = limpiarTexto(x, 80);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= 200) break;
  }
  return out;
}

export function sanearHerramientas(raw: unknown): Herramientas {
  const o = esRegistro(raw) ? raw : {};
  return { familias: sanearSeleccion(o.familias), habilidades: sanearSeleccion(o.habilidades) };
}

const aSeleccion = (s: string[] | null): SeleccionHerramientas => (s === null ? undefined : s);
const deSeleccion = (s: SeleccionHerramientas): string[] | null => (s === undefined ? null : s);

export function alternarFamilia(h: Herramientas, todas: string[], id: string): Herramientas {
  return { ...h, familias: deSeleccion(alternarHerramienta(aSeleccion(h.familias), todas, id)) };
}

export function alternarHabilidad(h: Herramientas, todas: string[], id: string): Herramientas {
  return { ...h, habilidades: deSeleccion(alternarHerramienta(aSeleccion(h.habilidades), todas, id)) };
}

export function alternarTodasFamilias(h: Herramientas, todas: string[]): Herramientas {
  return { ...h, familias: deSeleccion(alternarTodasHerramientas(aSeleccion(h.familias), todas)) };
}

export function alternarTodasHabilidades(h: Herramientas, todas: string[]): Herramientas {
  return { ...h, habilidades: deSeleccion(alternarTodasHerramientas(aSeleccion(h.habilidades), todas)) };
}

/** ¿Está elegida esa familia? Sin selección propia (`null`) lo están todas. */
export const familiaElegida = (h: Herramientas, id: string): boolean => h.familias === null || h.familias.includes(id);
export const habilidadElegida = (h: Herramientas, id: string): boolean => h.habilidades === null || h.habilidades.includes(id);
export const todasLasFamilias = (h: Herramientas, todas: string[]): boolean => todasHerramientasActivas(aSeleccion(h.familias), todas);
export const todasLasHabilidades = (h: Herramientas, todas: string[]): boolean => todasHerramientasActivas(aSeleccion(h.habilidades), todas);

/** Quita lo que ya no existe en la Librería o en Astraura (solo se ofrece, y solo se guarda, lo que existe). */
export function depurarHerramientas(h: Herramientas, existentes: { familias: string[]; habilidades: string[] }): Herramientas {
  const filtra = (sel: string[] | null, ok: string[]) => (sel === null ? null : sel.filter((x) => ok.includes(x)));
  return { familias: filtra(h.familias, existentes.familias), habilidades: filtra(h.habilidades, existentes.habilidades) };
}

/** Para `skillsSystemPrompt(only)`: `undefined` = todas las activas. */
export function habilidadesPermitidas(h: Herramientas): string[] | undefined {
  return h.habilidades === null ? undefined : h.habilidades;
}

/* ═════════════════════════ Configuración completa ═════════════════════════ */

export interface ConfigAgente {
  v: typeof VERSION_CONFIG_AGENTE;
  cerebro: CerebroAgente;
  capas: CapaAgente[];
  percepcion: Percepcion;
  motores: Motores;
  herramientas: Herramientas;
  desarrollo: Desarrollo;
  /** Milisegundos de la última vez que la persona cambió algo (0 = nunca). */
  actualizado: number;
}

export function configPorDefecto(agente: AgenteMundoRef): ConfigAgente {
  return {
    v: VERSION_CONFIG_AGENTE,
    cerebro: cerebroPorDefecto(agente),
    capas: capasPorDefecto(),
    percepcion: { rasgos: { ...PERCEPCION_DEFECTO.rasgos }, temas: [], sentidos: [...PERCEPCION_DEFECTO.sentidos] },
    motores: motoresPorDefecto(),
    herramientas: herramientasPorDefecto(),
    desarrollo: desarrolloVacio(),
    actualizado: 0,
  };
}

/** Lee lo guardado sin fiarse de nada: lo roto vuelve a su valor por defecto, nunca lanza. */
export function sanearConfig(raw: unknown, agente: AgenteMundoRef): ConfigAgente {
  const o = esRegistro(raw) ? raw : {};
  return {
    v: VERSION_CONFIG_AGENTE,
    cerebro: sanearCerebro(o.cerebro, agente),
    capas: "capas" in o ? sanearCapas(o.capas) : capasPorDefecto(),
    percepcion: sanearPercepcion(o.percepcion),
    motores: sanearMotores(o.motores),
    herramientas: sanearHerramientas(o.herramientas),
    desarrollo: sanearDesarrollo(o.desarrollo),
    actualizado: typeof o.actualizado === "number" && Number.isFinite(o.actualizado) && o.actualizado >= 0 ? o.actualizado : 0,
  };
}

/* ═════════════════════════ Prompt para el modelo ═════════════════════════ */

/**
 * Todo lo que la ficha le dice al modelo, en un fragmento: quién es, sus capas con perspectiva y su filtro de
 * percepción. Siempre termina con los límites honestos, y siempre dice que es una IA.
 */
export function promptDeAgente(c: ConfigAgente, agente: Pick<AgenteMundoRef, "nombre">): string {
  const partes = [`Eres «${limpiarTexto(agente.nombre, 60) || "un agente"}», una IA (bot) del Mundo de los avatares de StarSeed OS.`];
  const capas = capasAPrompt(c.capas);
  if (capas) partes.push(capas);
  partes.push(filtroAPrompt(c));
  return partes.join("\n\n");
}
