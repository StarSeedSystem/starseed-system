// Recomendación de modelos locales por neurona y por caso (MOD1110A). PURA y determinista:
// misma entrada ⇒ misma salida; no lee red, disco ni reloj. Reglas propias, documentadas en
// architecture/modelos-recomendados.md. Nunca recomienda lo que no está comprobado ni lo que
// la neurona no puede ejecutar.

import { recomendable, requisitosDe } from "./catalogo";
import type { PerfilNeurona } from "./perfil-neurona";
import type { CasoUso, ModeloLocal, MotivoEncaje, Veredicto } from "./tipos";
import { CASOS, ETIQUETA_CASO } from "./tipos";

// ── Encaje de un modelo en una neurona ───────────────────────────────────────────────────────────

export interface Encaje {
  veredicto: Veredicto;
  motivo: MotivoEncaje;
  /** GB a liberar cuando falta disco (redondeado hacia arriba a 0,1). */
  liberarGb: number | null;
  /** Veredicto solo por memoria/hardware, antes de mirar el disco. */
  veredictoHw: "recomendado" | "justo" | "no-cabe";
}

const arriba1 = (n: number) => Math.ceil(n * 10) / 10;

function memoriaDeEstandar(m: ModeloLocal, p: PerfilNeurona): { v: "recomendado" | "justo" | "no-cabe"; motivo: MotivoEncaje } {
  const rq = requisitosDe(m);
  const ram = p.ramGb;
  if (ram === null) return { v: "no-cabe", motivo: "memoria-insuficiente" };
  // Apple silicon: memoria unificada, la GPU usa la misma RAM.
  if (p.chip === "apple-silicon") {
    if (ram >= rq.memoriaComodaGb) return { v: "recomendado", motivo: "ok" };
    if (ram >= rq.memoriaMinGb) return { v: "justo", motivo: "memoria-justa" };
    return { v: "no-cabe", motivo: "memoria-insuficiente" };
  }
  // GPU discreta con VRAM conocida.
  if ((p.chip === "nvidia" || p.chip === "amd") && p.vramGb !== null && rq.vramMinGb !== null && rq.vramComodaGb !== null) {
    if (p.vramGb >= rq.vramComodaGb && ram >= rq.memoriaMinGb) return { v: "recomendado", motivo: "ok" };
    if (p.vramGb >= rq.vramMinGb && ram >= rq.memoriaMinGb) return { v: "justo", motivo: "memoria-justa" };
    // Parte en GPU y parte en RAM: cabe, pero lento.
    if (ram >= rq.memoriaComodaGb) return { v: "justo", motivo: "memoria-justa" };
    return { v: "no-cabe", motivo: "memoria-insuficiente" };
  }
  // Sin GPU utilizable (CPU sola, móvil, o GPU de la que no sabemos la VRAM): solo lo pequeño.
  if (ram < rq.memoriaMinGb || m.descargaGb > 8) return { v: "no-cabe", motivo: m.descargaGb > 8 ? "sin-gpu" : "memoria-insuficiente" };
  if (m.descargaGb <= 3.5 && ram >= rq.memoriaComodaGb) return { v: "recomendado", motivo: "ok" };
  return { v: "justo", motivo: "sin-gpu" };
}

function memoriaDeCapa(m: ModeloLocal, p: PerfilNeurona): { v: "recomendado" | "justo" | "no-cabe"; motivo: MotivoEncaje } {
  const rq = requisitosDe(m);
  const ram = p.ramGb;
  // Las capas 1.58-bit y Needle están pensadas para CPU: no piden GPU.
  if (ram === null) return rq.memoriaMinGb <= 0.5 ? { v: "recomendado", motivo: "ok" } : { v: "no-cabe", motivo: "memoria-insuficiente" };
  if (ram >= rq.memoriaComodaGb) return { v: "recomendado", motivo: "ok" };
  if (ram >= rq.memoriaMinGb) return { v: "justo", motivo: "memoria-justa" };
  return { v: "no-cabe", motivo: "memoria-insuficiente" };
}

/** ¿Cabe `m` en la neurona `p`? `instalado` salta la comprobación de disco (ya está descargado). */
export function encajar(m: ModeloLocal, p: PerfilNeurona, instalado = false): Encaje {
  const sin = (motivo: MotivoEncaje): Encaje => ({ veredicto: "no-cabe", motivo, liberarGb: null, veredictoHw: "no-cabe" });
  if (!m.runtimes.some((r) => p.runtimes.includes(r))) return sin("sin-runtime");
  if (m.soloApple === true && p.chip !== "apple-silicon") return sin("solo-apple");
  const mem = m.tipo === "estandar" ? memoriaDeEstandar(m, p) : memoriaDeCapa(m, p);
  if (mem.v === "no-cabe") return { veredicto: "no-cabe", motivo: mem.motivo, liberarGb: null, veredictoHw: "no-cabe" };
  let v: "recomendado" | "justo" = mem.v;
  let motivo = mem.motivo;
  // Con batería, un modelo grande se come la carga: se baja a «justo».
  if (v === "recomendado" && p.enchufada === false && m.descargaGb > 8) {
    v = "justo";
    motivo = "bateria";
  }
  if (!instalado && p.discoLibreGb !== null) {
    const falta = requisitosDe(m).discoGb - p.discoLibreGb;
    if (falta > 0) return { veredicto: "falta-disco", motivo: "disco", liberarGb: arriba1(falta), veredictoHw: v };
  }
  return { veredicto: v, motivo, liberarGb: null, veredictoHw: v };
}

// ── Casos de uso ─────────────────────────────────────────────────────────────────────────────────

const PAPELES_PALABRA = new Set(["palabra", "razon", "profunda"]);
const RANGO_PAPEL: Record<string, number> = { reflejo: 0, memoria: 0, palabra: 1, razon: 2, profunda: 3 };
const RANGO_TIPO: Record<string, number> = { needle: 0, "capa-158": 1, estandar: 2 };

function elegible(m: ModeloLocal, caso: CasoUso): boolean {
  const papel = m.papel ?? "";
  switch (caso) {
    case "conversacion":
    case "archivos-privados":
      return m.tipo === "estandar" || PAPELES_PALABRA.has(papel);
    case "codigo-agentes":
      return m.tipo === "estandar" && m.herramientas;
    case "vision":
      return m.vision;
    case "voz":
      return papel === "voz" || papel === "oído";
    case "bots-dots":
      return (m.tipo === "estandar" && m.herramientas && m.descargaGb <= 8) || papel === "palabra" || papel === "razon";
    case "capas-conciencia":
      return papel === "reflejo" || PAPELES_PALABRA.has(papel);
    case "segundo-plano":
      return m.tipo === "estandar" ? m.descargaGb <= 4 : papel === "reflejo" || papel === "memoria" || papel === "palabra";
  }
}

const tier = (e: Encaje): number => (e.veredicto === "recomendado" ? 0 : e.veredicto === "justo" ? 1 : 2);
const eci = (m: ModeloLocal): number => m.puntuacion?.eci ?? -1;

export interface Candidato {
  m: ModeloLocal;
  e: Encaje;
}

function comparador(caso: CasoUso, p: PerfilNeurona): (a: Candidato, b: Candidato) => number {
  const apple = (c: Candidato) => (p.chip === "apple-silicon" && c.m.soloApple === true ? 0 : 1);
  return (a, b) => {
    const t = tier(a.e) - tier(b.e);
    if (t !== 0) return t;
    let d = 0;
    switch (caso) {
      case "capas-conciencia":
        d = (RANGO_PAPEL[b.m.papel ?? ""] ?? 0) - (RANGO_PAPEL[a.m.papel ?? ""] ?? 0);
        break;
      case "segundo-plano":
        d = RANGO_TIPO[a.m.tipo] - RANGO_TIPO[b.m.tipo] || a.m.descargaGb - b.m.descargaGb;
        break;
      case "bots-dots":
        d = RANGO_TIPO[a.m.tipo] - RANGO_TIPO[b.m.tipo] || b.m.descargaGb - a.m.descargaGb;
        break;
      case "voz":
        d = b.m.descargaGb - a.m.descargaGb;
        break;
      default:
        d = eci(b.m) - eci(a.m) || apple(a) - apple(b) || (RANGO_PAPEL[b.m.papel ?? ""] ?? 0) - (RANGO_PAPEL[a.m.papel ?? ""] ?? 0) || b.m.descargaGb - a.m.descargaGb;
    }
    return d || a.m.id.localeCompare(b.m.id);
  };
}

/** Candidatos ordenados (mejor primero) para un caso en una neurona; solo lo recomendable y ejecutable. */
export function candidatosPara(catalogo: readonly ModeloLocal[], p: PerfilNeurona, caso: CasoUso, instalados?: ReadonlySet<string>): Candidato[] {
  return catalogo
    .filter((m) => recomendable(m) && elegible(m, caso))
    .map((m) => ({ m, e: encajar(m, p, instalados?.has(m.id) === true) }))
    .filter((c) => c.e.veredicto !== "no-cabe")
    .sort(comparador(caso, p));
}

// ── Rutas ────────────────────────────────────────────────────────────────────────────────────────

export interface EleccionPrivacidad {
  /** Se puede usar un proveedor externo en general. */
  externoPermitido: boolean;
  /** La persona eligió expresamente que los archivos privados también puedan ir a un proveedor externo. */
  externoParaPrivados: boolean;
}

export const PRIVACIDAD_PREDETERMINADA: EleccionPrivacidad = { externoPermitido: true, externoParaPrivados: false };

export interface EntornoRuta {
  /** Otras neuronas de la misma cuenta. */
  pares: readonly PerfilNeurona[];
  servidorPropio?: { nombre: string } | null;
  externo?: { nombre: string } | null;
  privacidad: EleccionPrivacidad;
  instalados?: ReadonlySet<string>;
}

export type RutaIA =
  | { tipo: "local" }
  | { tipo: "neurona-malla"; neuronaId: string; nombre: string }
  | { tipo: "servidor-propio"; nombre: string }
  | { tipo: "externo"; proveedor: string }
  | { tipo: "ninguna"; porque: string };

export interface Recomendacion {
  caso: CasoUso;
  /** Mejor modelo para ejecutar EN ESTA neurona (null si ninguno cabe). */
  modelo: ModeloLocal | null;
  veredicto: Veredicto;
  motivo: MotivoEncaje;
  liberarGb: number | null;
  ruta: RutaIA;
  /** Modelo que se usaría por la ruta cuando no es local (p. ej. el de otra neurona). */
  modeloRuta: ModeloLocal | null;
  /** Una frase en español claro. */
  razon: string;
  /** Capa de reflejo (Needle) que acompaña, si procede. */
  reflejo: ModeloLocal | null;
  alternativas: ModeloLocal[];
  /** Cuántos modelos más abriría instalar Ollama (0 si no aplica). */
  abriria: number;
}

/** Casos exigentes: una neurona que solo llega «justo» prefiere la IA de otra neurona. */
const EXIGENTES: ReadonlySet<CasoUso> = new Set(["conversacion", "codigo-agentes", "archivos-privados", "vision"]);
/** Casos en los que, aun «justo», un proveedor externo gana (si la privacidad lo permite). */
const EXTERNO_SI_JUSTO: ReadonlySet<CasoUso> = new Set(["codigo-agentes", "vision"]);

const gb = (n: number) => `${n.toFixed(1).replace(".", ",")} GB`;
const memTxt = (p: PerfilNeurona) => (p.ramGb === null ? "la memoria de esta neurona" : `${p.ramGb} GB`);

function frase(c: Candidato | undefined, p: PerfilNeurona, caso: CasoUso): string {
  if (!c) return `Ningún modelo local comprobado cabe en esta neurona para ${ETIQUETA_CASO[caso].toLowerCase()}.`;
  const { m, e } = c;
  if (e.veredicto === "falta-disco") {
    return `«${m.etiqueta}» es lo indicado, pero faltan ${gb(e.liberarGb ?? 0)} de disco: libera ${gb(e.liberarGb ?? 0)} para descargarlo.`;
  }
  if (e.veredicto === "justo") {
    const porque = e.motivo === "sin-gpu" ? "sin tarjeta gráfica" : e.motivo === "bateria" ? "con batería" : `en ${memTxt(p)}`;
    return `«${m.etiqueta}» es lo más capaz que entra, pero cabe justo ${porque} y irá lento.`;
  }
  if (m.tipo !== "estandar") return `«${m.etiqueta}» es una capa propia de Astraura: ligera y rápida, y deja libre la memoria.`;
  const punt = m.puntuacion ? ` y rinde como ${m.puntuacion.eci.toFixed(0)} en el índice de Epoch` : "";
  return `«${m.etiqueta}» es el modelo más capaz que cabe holgado en ${memTxt(p)}${punt}.`;
}

function elegirMejor(catalogo: readonly ModeloLocal[], p: PerfilNeurona, caso: CasoUso, instalados?: ReadonlySet<string>): { lista: Candidato[]; mejor: Candidato | undefined } {
  const lista = candidatosPara(catalogo, p, caso, instalados);
  return { lista, mejor: lista[0] };
}

function reflejoDe(catalogo: readonly ModeloLocal[], p: PerfilNeurona, principal: ModeloLocal | null): ModeloLocal | null {
  const c = candidatosPara(catalogo, p, "capas-conciencia").filter((x) => x.m.papel === "reflejo" && x.e.veredicto !== "falta-disco");
  const r = c[0]?.m ?? null;
  return r && r.id !== principal?.id ? r : null;
}

/**
 * Recomienda para una neurona y un caso. Orden de decisión:
 *  1. Si lo mejor cabe holgado en esta neurona ⇒ se queda en local.
 *  2. Si no (o solo cabe justo en un caso exigente) ⇒ la IA de otra neurona de la misma cuenta por la malla,
 *     luego el servidor propio, luego un proveedor externo SOLO si la privacidad lo permite.
 *  3. Los archivos privados nunca van a un proveedor externo salvo que la persona lo haya elegido.
 */
export function recomendar(entrada: {
  catalogo: readonly ModeloLocal[];
  perfil: PerfilNeurona;
  caso: CasoUso;
  entorno?: Partial<EntornoRuta>;
}): Recomendacion {
  const { catalogo, perfil: p, caso } = entrada;
  const entorno: EntornoRuta = { pares: [], privacidad: PRIVACIDAD_PREDETERMINADA, ...entrada.entorno };
  const { lista, mejor } = elegirMejor(catalogo, p, caso, entorno.instalados);
  const privado = caso === "archivos-privados";
  const externoOk = entorno.privacidad.externoPermitido && (!privado || entorno.privacidad.externoParaPrivados) && !!entorno.externo;

  // Cuánto abriría Ollama (solo si esta neurona puede instalarlo y hoy no lo tiene).
  let abriria = 0;
  if (p.puedeInstalarOllama && !p.runtimes.includes("ollama")) {
    const conOllama: PerfilNeurona = { ...p, runtimes: [...p.runtimes, "ollama"] };
    abriria = candidatosPara(catalogo, conOllama, caso).filter((c) => c.m.tipo === "estandar" && c.e.veredicto !== "falta-disco").length;
  }

  const base = {
    caso,
    modelo: mejor?.m ?? null,
    veredicto: (mejor?.e.veredicto ?? "no-cabe") as Veredicto,
    motivo: (mejor?.e.motivo ?? "memoria-insuficiente") as MotivoEncaje,
    liberarGb: mejor?.e.liberarGb ?? null,
    reflejo: reflejoDe(catalogo, p, mejor?.m ?? null),
    alternativas: lista.slice(1, 4).map((c) => c.m),
    abriria,
  };
  const ollamaTxt = abriria > 0 ? ` Con Ollama instalado se abrirían ${abriria} modelos más.` : "";

  // 1 · Cabe holgado.
  if (mejor && mejor.e.veredicto === "recomendado") {
    return { ...base, ruta: { tipo: "local" }, modeloRuta: null, razon: frase(mejor, p, caso) };
  }

  // 2 · Otra neurona de MI cuenta (privado y cifrado por la malla).
  const quiereMalla = !mejor || (mejor.e.veredicto === "justo" && EXIGENTES.has(caso)) || mejor.e.veredicto === "falta-disco";
  if (quiereMalla) {
    let mejorPar: { par: PerfilNeurona; c: Candidato } | null = null;
    for (const par of entorno.pares) {
      if (par.id === p.id || !par.enLinea || !par.iaMalla) continue;
      const r = elegirMejor(catalogo, par, caso).mejor;
      if (!r || r.e.veredicto !== "recomendado") continue;
      if (!mejorPar || eci(r.m) > eci(mejorPar.c.m)) mejorPar = { par, c: r };
    }
    if (mejorPar) {
      return {
        ...base,
        ruta: { tipo: "neurona-malla", neuronaId: mejorPar.par.id, nombre: mejorPar.par.nombre },
        modeloRuta: mejorPar.c.m,
        razon: `Esta neurona no lo mueve bien: usa la IA de ${mejorPar.par.nombre}, donde «${mejorPar.c.m.etiqueta}» cabe holgado.`,
      };
    }
  }

  // 3 · Servidor propio.
  if ((!mejor || (mejor.e.veredicto === "justo" && EXIGENTES.has(caso))) && entorno.servidorPropio) {
    return {
      ...base,
      ruta: { tipo: "servidor-propio", nombre: entorno.servidorPropio.nombre },
      modeloRuta: null,
      razon: `Esta neurona no lo mueve bien: usa tu servidor ${entorno.servidorPropio.nombre}, que sigue siendo tuyo.`,
    };
  }

  // 4 · Proveedor externo (nunca para privados sin permiso expreso).
  if (externoOk && (!mejor || (mejor.e.veredicto === "justo" && EXTERNO_SI_JUSTO.has(caso)))) {
    return {
      ...base,
      ruta: { tipo: "externo", proveedor: entorno.externo!.nombre },
      modeloRuta: null,
      razon: `Esta neurona no lo mueve bien y no hay otra tuya a mano: ${entorno.externo!.nombre} lo resuelve fuera.${ollamaTxt}`,
    };
  }

  // 5 · Local aunque sea justo (o falta disco).
  if (mejor) return { ...base, ruta: { tipo: "local" }, modeloRuta: null, razon: frase(mejor, p, caso) };

  // 6 · Nada.
  const porque = privado && !entorno.privacidad.externoParaPrivados
    ? "No cabe aquí y tus archivos privados no saldrán a un proveedor externo sin tu permiso."
    : "No cabe aquí y no hay otra neurona, servidor propio ni proveedor disponible.";
  return { ...base, ruta: { tipo: "ninguna", porque }, modeloRuta: null, razon: `${frase(undefined, p, caso)} ${porque}${ollamaTxt}` };
}

/** Recomendación para los ocho casos a la vez. */
export function recomendarTodos(entrada: { catalogo: readonly ModeloLocal[]; perfil: PerfilNeurona; entorno?: Partial<EntornoRuta> }): Record<CasoUso, Recomendacion> {
  const out = {} as Record<CasoUso, Recomendacion>;
  for (const caso of CASOS) out[caso] = recomendar({ ...entrada, caso });
  return out;
}

/** Casos de uso para los que sirve un modelo (para las tarjetas de la Biblioteca). */
export function casosDe(m: ModeloLocal): CasoUso[] {
  return CASOS.filter((c) => elegible(m, c));
}
