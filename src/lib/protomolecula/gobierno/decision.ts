/**
 * Quién decide un cambio en la Protomolécula de una entidad (Ola 1026P · P2). Módulo PURO: toda la información entra
 * por parámetros (contexto, actor, reglas, modo de gobierno, reloj) y nunca lanza.
 *
 * Reutiliza lo que ya hay y no duplica el mapa de roles:
 *   · `decidirResultado` (ProtoGenesis) para lo personal y lo que no cuelga de ninguna entidad;
 *   · `decidirAplicacion` + `rangoDeRol` (PoliGenesis) para saber quién gestiona y quién colabora;
 *   · `proposalForChange` (motor de gobernanza) para el borrador que recibe el compositor de propuestas.
 *
 * Invariantes (no hay forma de configurarlas fuera): transparencia en todo veredicto, una IA nunca aprueba sola
 * (siempre `confirmar`), un permiso directo no cubre reglas ni permisos, la vía democrática no se cierra.
 */
import { TIPOS_CAMBIO_PROTO, type ActorProto, type ContextoProto, type EntidadProto, type TipoCambioProto, type VeredictoGobierno } from "../peticion/contrato";
import { decidirResultado } from "@/lib/protogenesis/decision";
import { decidirAplicacion, rangoDeRol, type Ambito as AmbitoGenesis } from "@/lib/genesis/operaciones";
import { proposalForChange, type ProposalDraft } from "@/lib/governance/propuestas";
import type { GovernanceMode } from "@/lib/governance/types";
import {
  CLAVE_REGLAS, ETIQUETA_NIVEL, ETIQUETA_TIPO, TIPOS_DELEGABLES, esEntidadGobernada, permisoVigente, reglasPorDefecto, scopeDeEntidad, valorNivel,
  type ModoCambio, type NivelAcceso, type PermisoDirecto, type ReglasProtomolecula, type TipoEntidadGobernada,
} from "./reglas";

/** Rango mínimo para aplicar DIRECTAMENTE cada tipo de cambio (2 colaboración · 3 gestión · 4 cuenta dueña). */
export const RANGO_DIRECTO: Record<TipoCambioProto, number> = { contenido: 2, creacion: 2, diseno: 3, funciones: 3, permisos: 3, reglas: 4 };

/** Rango que decide cuando el modo es «propuesta»: quien gestiona (o la dueña, si el tipo la exige). */
export const rangoQueDecide = (tipo: TipoCambioProto): number => Math.max(3, RANGO_DIRECTO[tipo]);

/** Lo que el gobierno de la entidad sabe además de las reglas (todo opcional). */
export interface EntornoGobierno {
  /** Reglas guardadas de la entidad; sin ellas rigen las de por defecto del OS. */
  reglas?: ReglasProtomolecula | null;
  /** Modo de gobierno de la entidad (`governance_configs.mode`); sin dato, democrático. */
  modoGobierno?: GovernanceMode;
  /** Umbral y quórum del gobierno de la entidad, para decirlos al llevar algo a votación. */
  votacion?: { umbral?: number; minParticipantes?: number; minPorcentaje?: number };
  /** Reloj (ms); para las caducidades. */
  ahora?: number;
  /** El cambio concreto, para el borrador de propuesta. */
  cambio?: { resumen?: string; clave?: string; valor?: string };
}

export type ViaDecision = "dueno" | "rango" | "permiso-directo" | "democratica" | "denegado" | "sin-persona" | "sin-acceso";

/** Veredicto del contrato más lo que hace falta para anotarlo y enseñarlo. */
export interface VeredictoDetallado extends VeredictoGobierno {
  via: ViaDecision;
  /** De dónde salen las reglas: las de la entidad o las de por defecto del OS (o ninguna, si no hay entidad). */
  reglas: "entidad" | "por-defecto" | "ninguna";
  modo?: ModoCambio;
  /** Permiso directo usado (para el registro de transparencia). */
  permisoId?: string;
  /** Siempre `true`: no hay regla que lo apague. */
  transparente: true;
}

/* ── El actor ────────────────────────────────────────────────────────────── */

export const rangoDeActor = (a: ActorProto): number => (a.esDueno ? 4 : rangoDeRol(a.rol));
/** Roles que NO son membresía: una solicitud de ingreso sin resolver no da voz ni voto (igual que el censo del motor). */
const ROLES_SIN_MEMBRESIA: readonly string[] = ["pending", "pendiente", "none", "ninguno"];
export const esMiembro = (a: ActorProto): boolean =>
  a.esDueno === true || (typeof a.rol === "string" && a.rol.trim().length > 0 && !ROLES_SIN_MEMBRESIA.includes(a.rol.trim().toLowerCase()));
/** Observación: mira, no cambia (salvo permiso nombrado a su persona). */
export const esObservador = (a: ActorProto): boolean => !a.esDueno && rangoDeRol(a.rol) === 1;

export function nivelDeActor(a: ActorProto): NivelAcceso {
  if (!esMiembro(a)) return "cualquiera";
  const r = rangoDeActor(a);
  return r >= 4 ? "dueno" : r === 3 ? "gestion" : r === 2 ? "colaboracion" : "miembros";
}

/** La entidad cuyo gobierno aplica: la que gobierna la pantalla o, si es ella misma un grupo, comunidad o página, esa. */
export function entidadGobernante(c: ContextoProto): (EntidadProto & { tipo: TipoEntidadGobernada }) | null {
  if (esEntidadGobernada(c.gobernadaPor)) return c.gobernadaPor;
  if (esEntidadGobernada(c.entidad)) return c.entidad;
  return null;
}

function sujetoCoincide(p: PermisoDirecto, a: ActorProto): boolean {
  if (p.sujeto.tipo === "persona") return !!a.usuarioId && a.usuarioId === p.sujeto.usuarioId;
  return esMiembro(a) && !esObservador(a) && valorNivel(nivelDeActor(a)) >= valorNivel(p.sujeto.desde);
}

/** Permisos directos VIGENTES que son de esta persona (por su nombre o por su rol). */
export function permisosDelActor(reglas: ReglasProtomolecula, actor: ActorProto, ahora: number): PermisoDirecto[] {
  return reglas.permisosDirectos.filter((p) => permisoVigente(p, ahora) && sujetoCoincide(p, actor));
}

/** Permisos de esta persona que ya caducaron y cubrían este tipo (para explicarle por qué ya no le valen). */
export function permisosCaducados(reglas: ReglasProtomolecula, actor: ActorProto, tipo: TipoCambioProto, ahora: number): PermisoDirecto[] {
  return reglas.permisosDirectos.filter((p) => !permisoVigente(p, ahora) && p.tipos.includes(tipo) && sujetoCoincide(p, actor));
}

/** ¿Puede abrir o usar la Protomolécula de la entidad? (la visibilidad ya acotó el acceso al normalizar las reglas). */
export function puedeAcceder(reglas: ReglasProtomolecula, actor: ActorProto, que: "abrir" | "usar", ahora: number = Date.now()): { permitido: boolean; motivo: string } {
  const exigido = reglas.acceso[que];
  if (valorNivel(nivelDeActor(actor)) >= valorNivel(exigido)) return { permitido: true, motivo: "Tu rol alcanza." };
  if (permisosDelActor(reglas, actor, ahora).length > 0) return { permitido: true, motivo: "Tienes un permiso directo en esta entidad." };
  const verbo = que === "abrir" ? "abrirla" : "usarla";
  if (exigido === "miembros") return { permitido: false, motivo: `Para ${verbo} hay que formar parte de la entidad.` };
  return { permitido: false, motivo: `Solo puede ${verbo} quien tenga el nivel «${ETIQUETA_NIVEL[exigido]}».` };
}

/* ── Borrador de propuesta ───────────────────────────────────────────────── */

export function scopeDe(ent: EntidadProto & { tipo: TipoEntidadGobernada }): string {
  return scopeDeEntidad(ent.tipo);
}

function textoVotacion(e: EntornoGobierno): string {
  const v = e.votacion;
  if (!v) return "con el umbral y el quórum del gobierno de la entidad";
  const partes: string[] = [];
  if (typeof v.umbral === "number") partes.push(`umbral ${v.umbral} %`);
  if (typeof v.minParticipantes === "number" && v.minParticipantes > 0) partes.push(`al menos ${v.minParticipantes} ${v.minParticipantes === 1 ? "participante" : "participantes"}`);
  if (typeof v.minPorcentaje === "number" && v.minPorcentaje > 0) partes.push(`participación mínima ${v.minPorcentaje} %`);
  return partes.length ? `con ${partes.join(" y ")}` : "con el umbral y el quórum del gobierno de la entidad";
}

/** Borrador para el compositor existente: un `set_config` del motor de gobernanza. */
export function borradorDeCambio(ent: EntidadProto & { tipo: TipoEntidadGobernada }, tipo: TipoCambioProto, modo: ModoCambio, entorno: EntornoGobierno): ProposalDraft {
  const c = entorno.cambio;
  const esReglas = (tipo === "reglas" || tipo === "permisos") && typeof c?.valor === "string";
  const clave = esReglas ? (c?.clave ?? CLAVE_REGLAS) : (c?.clave ?? `protomolecula.cambio.${tipo}`);
  const valor = c?.valor ?? c?.resumen ?? "";
  const comoSeDecide =
    modo === "votacion"
      ? `Se decide en votación ${textoVotacion(entorno)}.`
      : "En esta entidad decide quien gestiona: la propuesta queda abierta y a la vista; la votación de las demás personas es orientativa y quien gestiona la aplica o la rechaza.";
  const queOcurre = esReglas
    ? "Si se aprueba, las reglas nuevas se aplican solas."
    : "Si se aprueba, queda anotada en la configuración de la entidad y se aplica desde la Protomolécula.";
  const nota = [c?.resumen ? `Cambio pedido: ${c.resumen}` : "", comoSeDecide, queOcurre].filter(Boolean).join("\n");
  const d = proposalForChange(scopeDe(ent), ent.id, { kind: "set_config", key: clave, value: valor, label: `${ETIQUETA_TIPO[tipo].toLowerCase()} de la Protomolécula${ent.nombre ? ` de «${ent.nombre}»` : ""}`, note: nota });
  // Solo las reglas nuevas se aplican solas al aprobarse; el resto queda anotado y se aplica desde la Protomolécula.
  return esReglas ? d : { ...d, description: d.description.replace("este cambio se aplicará automáticamente si la mayoría lo aprueba", "aprobarlo autoriza el cambio, que se aplica desde la Protomolécula") };
}

/* ── La decisión ─────────────────────────────────────────────────────────── */

function gestionAplica(ent: EntidadProto & { tipo: TipoEntidadGobernada }, rango: number): boolean {
  const ambito: AmbitoGenesis = { tipo: "entidad", entidad: { tipo: ent.tipo === "pagina" ? "pagina" : "grupo", id: ent.id, slug: ent.id, nombre: ent.nombre ?? ent.id } };
  return decidirAplicacion(ambito, rango, false).modo === "aplicar";
}
function colaboracionAplica(ent: EntidadProto & { tipo: TipoEntidadGobernada }, rango: number): boolean {
  const ambito: AmbitoGenesis = { tipo: "entidad", entidad: { tipo: ent.tipo === "pagina" ? "pagina" : "grupo", id: ent.id, slug: ent.id, nombre: ent.nombre ?? ent.id } };
  return decidirAplicacion(ambito, rango, true).modo === "proponer";
}

/** ¿Alcanza el rango para APLICAR este tipo con este modo? («votación» nunca: todas las personas pasan por el voto.) */
export function puedeAplicarPorRango(ent: EntidadProto & { tipo: TipoEntidadGobernada }, tipo: TipoCambioProto, modo: ModoCambio, rango: number): boolean {
  if (modo === "votacion") return false;
  const umbral = modo === "directo" ? RANGO_DIRECTO[tipo] : rangoQueDecide(tipo);
  if (umbral >= 4) return rango >= 4;
  if (umbral === 3) return gestionAplica(ent, rango);
  return colaboracionAplica(ent, rango);
}

/**
 * Decide un cambio de `tipo` hecho por `actor` en `contexto`, con todo lo necesario a mano. Es la versión pura de
 * `decidirCambio`: las pruebas y los componentes que ya tienen el entorno cargado llaman a esta.
 */
export function decidirCambioConReglas(contexto: ContextoProto, actor: ActorProto, tipo: TipoCambioProto, entorno: EntornoGobierno = {}): VeredictoDetallado {
  const ahora = entorno.ahora ?? Date.now();
  const ia = actor.origen !== "humano";
  const denegar = (motivo: string, via: ViaDecision = "denegado", reglas: VeredictoDetallado["reglas"] = "ninguna", modo?: ModoCambio): VeredictoDetallado => ({
    decision: "denegar", motivo, confirmar: false, via, reglas, ...(modo ? { modo } : {}), transparente: true,
  });
  const aplicar = (motivo: string, via: ViaDecision, reglas: VeredictoDetallado["reglas"], modo?: ModoCambio, permisoId?: string): VeredictoDetallado => ({
    decision: "aplicar", motivo, confirmar: ia, via, reglas, ...(modo ? { modo } : {}), ...(permisoId ? { permisoId } : {}), transparente: true,
  });

  if (!(TIPOS_CAMBIO_PROTO as readonly string[]).includes(tipo)) return denegar("Ese tipo de cambio no existe.");
  // Una IA o un agente actúan EN NOMBRE de una persona: sin ella no hay nadie que confirme.
  if (ia && !(actor.usuarioId || actor.esDueno === true)) {
    return denegar("Una IA o un agente no cambia nada sin una persona detrás: que se lo pida alguien desde su cuenta.", "sin-persona");
  }

  // Lo personal (y el perfil) es siempre de su dueño.
  if (contexto.ambito === "personal" || contexto.ambito === "perfil") {
    const d = decidirResultado({ ambito: contexto.ambito, esDueno: actor.esDueno === true, rol: actor.rol, tocaFueraDeLaMolecula: false });
    return d.modo === "aceptar" ? aplicar(d.motivo, "dueno", "ninguna") : denegar(d.motivo);
  }

  const ent = entidadGobernante(contexto);
  if (!ent) {
    // Algo de ámbito grupo o público que no cuelga de ninguna entidad con gobierno propio.
    if (actor.esDueno) return aplicar("Es tuyo.", "dueno", "ninguna");
    const d = decidirResultado({ ambito: contexto.ambito, esDueno: false, rol: actor.rol, democratico: entorno.modoGobierno !== "hierarchical", tocaFueraDeLaMolecula: false });
    if (d.modo === "aceptar") return aplicar(d.motivo, "rango", "ninguna");
    if (d.modo === "proponer-voto") return { decision: "votar", motivo: `${d.motivo} No hay una entidad con reglas propias aquí: la propuesta se redacta en Decisiones.`, confirmar: ia, via: "democratica", reglas: "ninguna", transparente: true };
    return denegar(d.motivo);
  }

  const modoGob = entorno.modoGobierno ?? "democratic";
  const reglas = entorno.reglas ?? reglasPorDefecto(ent.tipo, modoGob);
  const origen: VeredictoDetallado["reglas"] = entorno.reglas ? "entidad" : "por-defecto";
  const defecto = origen === "por-defecto" ? " (reglas por defecto del OS: esta entidad aún no ha guardado las suyas)" : "";
  const modo = reglas.cambios[tipo];
  const etiqueta = ETIQUETA_TIPO[tipo].toLowerCase();

  // 1) ¿Puede usar la Protomolécula de esta entidad?
  const acceso = puedeAcceder(reglas, actor, "usar", ahora);
  if (!acceso.permitido) return denegar(`${acceso.motivo}${defecto}`, "sin-acceso", origen, modo);

  // 2) ¿Le basta su rango según el modo?
  const rango = rangoDeActor(actor);
  if (puedeAplicarPorRango(ent, tipo, modo, rango)) {
    const porque =
      modo === "directo"
        ? `Esta entidad deja que tu rol cambie ${etiqueta} directamente.`
        : "En esta entidad decide quien gestiona, y tú gestionas.";
    return aplicar(`${porque}${defecto}`, "rango", origen, modo);
  }

  // 3) ¿Tiene un permiso directo para este tipo? (nunca para reglas ni permisos)
  const delegable = (TIPOS_DELEGABLES as readonly string[]).includes(tipo);
  const permiso = delegable ? permisosDelActor(reglas, actor, ahora).find((p) => p.tipos.includes(tipo)) : undefined;
  if (permiso) {
    const hasta = permiso.caduca !== undefined ? `, vigente hasta el ${new Date(permiso.caduca).toLocaleDateString("es-ES")}` : "";
    return aplicar(
      `Tienes un permiso directo para ${etiqueta}${hasta}: no hace falta propuesta ni votación. Queda anotado en el registro de la entidad.${ia ? " Lo confirma la persona." : ""}`,
      "permiso-directo", origen, modo, permiso.id,
    );
  }
  const caducado = delegable ? permisosCaducados(reglas, actor, tipo, ahora)[0] : undefined;
  const avisoCaducado = caducado?.caduca !== undefined ? ` Tu permiso directo caducó el ${new Date(caducado.caduca).toLocaleDateString("es-ES")}.` : "";

  // 4) Sin rango ni permiso: la vía democrática sigue abierta a quien forma parte (menos a quien solo observa).
  if (!esMiembro(actor)) return denegar(`Para cambiar ${etiqueta} aquí hay que formar parte de la entidad.${avisoCaducado}${defecto}`, "denegado", origen, modo);
  if (esObservador(actor)) return denegar(`Con rol de observación se mira, no se cambia: pide a quien gestiona que te dé otro rol.${avisoCaducado}${defecto}`, "denegado", origen, modo);

  if (modo === "propuesta") {
    return {
      decision: "proponer",
      motivo: `Esto lo decide quien gestiona: tu propuesta queda abierta y a la vista en Decisiones.${avisoCaducado}${defecto}`,
      propuesta: borradorDeCambio(ent, tipo, modo, entorno), confirmar: ia, via: "democratica", reglas: origen, modo, transparente: true,
    };
  }
  const porque =
    modo === "votacion"
      ? `${ETIQUETA_TIPO[tipo]} se decide en votación ${textoVotacion(entorno)}.`
      : `Aquí lo aplica quien tenga rol suficiente; la vía democrática siempre está abierta, así que se lleva a votación ${textoVotacion(entorno)}.`;
  return {
    decision: "votar", motivo: `${porque}${avisoCaducado}${defecto}`,
    propuesta: borradorDeCambio(ent, tipo, modo, entorno), confirmar: ia, via: "democratica", reglas: origen, modo, transparente: true,
  };
}

/** El veredicto de cada tipo de cambio para esta persona (la tabla «para ti» de la interfaz). */
export function veredictosPara(contexto: ContextoProto, actor: ActorProto, entorno: EntornoGobierno = {}): Record<TipoCambioProto, VeredictoDetallado> {
  const out = {} as Record<TipoCambioProto, VeredictoDetallado>;
  for (const t of TIPOS_CAMBIO_PROTO) out[t] = decidirCambioConReglas(contexto, actor, t, entorno);
  return out;
}

const ORDEN: Record<VeredictoGobierno["decision"], number> = { aplicar: 0, proponer: 1, votar: 2, denegar: 3 };
/** De varios veredictos, el más restrictivo (denegar › votar › proponer › aplicar): un cambio que toca dos tipos sigue al más estricto. */
export function veredictoMasEstricto(vs: VeredictoDetallado[]): VeredictoDetallado | null {
  return vs.reduce<VeredictoDetallado | null>((acc, v) => (acc === null || ORDEN[v.decision] > ORDEN[acc.decision] ? v : acc), null);
}
