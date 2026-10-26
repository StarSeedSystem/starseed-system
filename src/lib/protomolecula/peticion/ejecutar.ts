/**
 * Petición a la Protomolécula · EJECUTAR (Ola 1026P · P3).
 * Motor puro: despacha cada operación del plan a lo que YA existe (las dependencias entran por parámetro; las reales
 * viven en `dependencias.ts`). Antes de aplicar, CADA paso que cambia algo pasa por `decidirCambio` (gobierno):
 *   · «denegar»  → no se hace y se dice por qué;
 *   · «proponer» / «votar» → NO se aplica: se devuelve el borrador de propuesta;
 *   · «aplicar»  → se ejecuta (llamar a esta función ES la confirmación de la persona: la ventana la pide antes; una
 *     IA nunca la llama, la herramienta `pedir` de Astraura solo planifica).
 * Lo que no tiene camino real se devuelve en `pendientes` con su motivo y su camino. El plan se REVALIDA con el esquema
 * estricto antes de tocar nada (lo que llegue de la interfaz no se da por bueno). Sin React, red ni `node:*`.
 */
import type { ProposalDraft } from "@/lib/governance/propuestas";
import type { ActorProto, ContextoProto, OperacionPedida, PlanPeticion, TipoCambioProto, VeredictoGobierno } from "./contrato";
import { MAX_PASOS, describirOperacion, validarPaso } from "./esquema";

export type EstadoPaso = "hecho" | "pendiente" | "propuesto" | "denegado" | "fallo";
/** Lo que devuelve el adaptador de UNA operación. */
export interface ResultadoPaso {
  estado: "hecho" | "pendiente" | "fallo";
  texto: string;
  borrador?: Omit<BorradorPeticion, "paso" | "decision" | "motivo">;
  /** Lo que de este paso NO se hizo (con su motivo): se suma a `pendientes` aunque el paso esté «hecho». */
  pendiente?: string;
  /** Ruta interna donde ver lo hecho (una escena, una pizarra, la Biblioteca…). */
  ruta?: string;
  /** Una imagen generada, para mostrarla en la ventana. */
  imagenUrl?: string;
}

export interface BorradorPeticion {
  /** Número del paso (1…) en el plan. */
  paso: number;
  decision: "proponer" | "votar";
  motivo: string;
  /** Borrador listo para el compositor de propuestas (lo pone el gobierno de la entidad). */
  propuesta?: ProposalDraft;
  /** Borrador de tarea para MetaGenesis (`proponer-metagenesis`). */
  metagenesis?: { id: string; titulo: string; prompt: string };
}

export interface DetallePaso {
  paso: number;
  operacion: OperacionPedida;
  estado: EstadoPaso;
  texto: string;
  veredicto?: VeredictoGobierno["decision"];
  ruta?: string;
  imagenUrl?: string;
}

export interface ResultadoEjecucion {
  ok: boolean;
  hechos: string[];
  pendientes: string[];
  motivo?: string;
  /** Propuestas que el gobierno exige en lugar de aplicar (siempre presente, vacío si no hubo). */
  borradores?: BorradorPeticion[];
  /** Una fila por paso, para que la ventana pinte el estado de cada uno. */
  detalle?: DetallePaso[];
}

export interface OpcionesEjecucion {
  /** Pantalla donde se pidió. Por defecto, la actual (`leerContexto`). */
  contexto?: ContextoProto;
  /** Quién pide (con su rol real en la entidad, si la ventana lo sabe). Por defecto, se deduce. */
  actor?: ActorProto;
  /** false = no aplicar nada que el gobierno marque «pide confirmación». Por defecto true: llamar es confirmar. */
  confirmado?: boolean;
  /** Cómo navegar dentro del OS (la ventana pasa `router.push`). Sin él, se usa la navegación del navegador. */
  abrirRuta?: (ruta: string) => void;
}

type De<T extends OperacionPedida["tipo"]> = Extract<OperacionPedida, { tipo: T }>;
type Paso<T> = (op: T, ctx: ContextoProto) => Promise<ResultadoPaso> | ResultadoPaso;

/** Todo lo que el motor necesita del mundo. Cada pieza real se apoya en algo que YA existe en el OS. */
export interface DependenciasEjecucion {
  decidir: (contexto: ContextoProto, actor: ActorProto, tipo: TipoCambioProto) => VeredictoGobierno;
  actorPorDefecto: (contexto: ContextoProto, origen: ActorProto["origen"]) => Promise<ActorProto>;
  dictar: Paso<De<"dictar-molecula">>;
  abrirEn: Paso<De<"abrir-en">>;
  generarImagen: Paso<De<"generar-imagen">>;
  crearObjeto3d: Paso<De<"crear-objeto-3d">>;
  editarEntidad: Paso<De<"editar-entidad">>;
  insertarEn: Paso<De<"insertar-en">>;
  fondo: Paso<De<"fondo">>;
  proponerMetagenesis: Paso<De<"proponer-metagenesis">>;
}

/** Operaciones que no cambian nada de la entidad (abrir una vista, redactar un borrador): no pasan por el gobierno. */
const SIN_GOBIERNO: ReadonlySet<OperacionPedida["tipo"]> = new Set(["abrir-en", "proponer-metagenesis"]);

/** Qué tipo de cambio es ESTE paso (decide la regla de gobierno que aplica). */
export function tipoDePaso(op: OperacionPedida, delPlan: TipoCambioProto): TipoCambioProto {
  switch (op.tipo) {
    case "crear-objeto-3d": case "generar-imagen": return "creacion";
    case "fondo": return "diseno";
    case "insertar-en": case "dictar-molecula": return "contenido";
    case "editar-entidad": return delPlan === "creacion" ? "contenido" : delPlan;
    default: return delPlan;
  }
}

/** El contexto con el que se juzga un paso: si toca otra entidad que la de la pantalla, esa es la que se mira. */
export function contextoDelPaso(op: OperacionPedida, ctx: ContextoProto): ContextoProto {
  const meta = op.tipo === "editar-entidad" ? op.objetivo : op.tipo === "insertar-en" ? op.destino : null;
  if (!meta || (ctx.entidad && ctx.entidad.tipo === meta.tipo && ctx.entidad.id === meta.id)) return ctx;
  return { ...ctx, entidad: meta, seleccion: undefined };
}

const fallo = (texto: string): ResultadoPaso => ({ estado: "fallo", texto });

async function despachar(op: OperacionPedida, ctx: ContextoProto, deps: DependenciasEjecucion): Promise<ResultadoPaso> {
  switch (op.tipo) {
    case "crear-objeto-3d": return deps.crearObjeto3d(op, ctx);
    case "generar-imagen": return deps.generarImagen(op, ctx);
    case "editar-entidad": return deps.editarEntidad(op, ctx);
    case "insertar-en": return deps.insertarEn(op, ctx);
    case "abrir-en": return deps.abrirEn(op, ctx);
    case "fondo": return deps.fondo(op, ctx);
    case "dictar-molecula": return deps.dictar(op, ctx);
    case "proponer-metagenesis": return deps.proponerMetagenesis(op, ctx);
  }
}

export async function ejecutarConDependencias(plan: PlanPeticion, o: OpcionesEjecucion & { contexto: ContextoProto }, deps: DependenciasEjecucion): Promise<ResultadoEjecucion> {
  const contexto = o.contexto;
  const hechos: string[] = [], pendientes: string[] = [], borradores: BorradorPeticion[] = [], detalle: DetallePaso[] = [];
  const crudos = Array.isArray(plan?.pasos) ? plan.pasos.slice(0, MAX_PASOS) : [];
  if (!crudos.length) return { ok: false, hechos, pendientes, borradores, detalle, motivo: "El plan no tiene ningún paso que ejecutar." };

  const origen: ActorProto["origen"] = typeof plan.motor === "string" && plan.motor.startsWith("reglas") ? "humano" : "ia";
  let actor: ActorProto;
  try { actor = o.actor ?? await deps.actorPorDefecto(contexto, origen); } catch { actor = { usuarioId: null, origen }; }
  const tipoPlan: TipoCambioProto = plan.tipoCambio;

  for (let i = 0; i < crudos.length; i++) {
    const n = i + 1;
    // 1. Revalidar: lo que llega a ejecutarse siempre cumple el esquema estricto.
    const v = validarPaso(crudos[i], contexto, { conservarModo: true });
    if (!v.ok) {
      const texto = `Paso ${n} no ejecutado: ${v.motivo}.`;
      detalle.push({ paso: n, operacion: crudos[i] as OperacionPedida, estado: "denegado", texto });
      pendientes.push(texto);
      continue;
    }
    const op = v.paso, etiqueta = describirOperacion(op);
    const anotar = (estado: EstadoPaso, texto: string, veredicto?: VeredictoGobierno["decision"], extra?: Pick<ResultadoPaso, "ruta" | "imagenUrl" | "pendiente">): void => {
      detalle.push({ paso: n, operacion: op, estado, texto, ...(veredicto ? { veredicto } : {}), ...(extra?.ruta ? { ruta: extra.ruta } : {}), ...(extra?.imagenUrl ? { imagenUrl: extra.imagenUrl } : {}) });
      if (estado === "hecho") hechos.push(texto); else pendientes.push(texto);
      if (extra?.pendiente) pendientes.push(extra.pendiente);
    };

    // 2. Gobierno de la entidad.
    let veredicto: VeredictoGobierno | null = null;
    if (!SIN_GOBIERNO.has(op.tipo)) {
      try { veredicto = deps.decidir(contextoDelPaso(op, contexto), actor, tipoDePaso(op, tipoPlan)); }
      catch { veredicto = { decision: "denegar", motivo: "No pude consultar las reglas de esta entidad.", confirmar: false }; }
      if (veredicto.decision === "denegar") { anotar("denegado", `${etiqueta}: no permitido. ${veredicto.motivo}`, "denegar"); continue; }
      if (veredicto.decision === "proponer" || veredicto.decision === "votar") {
        const texto = `${etiqueta}: no se aplica; ${veredicto.decision === "votar" ? "hay que votarlo" : "se propone"}. ${veredicto.motivo}`;
        borradores.push({ paso: n, decision: veredicto.decision, motivo: veredicto.motivo, ...(veredicto.propuesta ? { propuesta: veredicto.propuesta } : {}) });
        anotar("propuesto", texto, veredicto.decision);
        continue;
      }
      if (veredicto.confirmar && o.confirmado === false) { anotar("pendiente", `${etiqueta}: lo propone una IA y pide tu confirmación antes de aplicarse.`, "aplicar"); continue; }
    }

    // 3. Hacerlo de verdad.
    let r: ResultadoPaso;
    try { r = await despachar(op, contexto, deps); } catch (e) { r = fallo(`${etiqueta}: falló (${e instanceof Error ? e.message.slice(0, 120) : "error inesperado"}).`); }
    if (r.borrador) borradores.push({ paso: n, decision: "proponer", motivo: r.texto, ...r.borrador });
    anotar(r.estado === "hecho" ? "hecho" : r.estado === "fallo" ? "fallo" : r.borrador ? "propuesto" : "pendiente", r.texto, veredicto?.decision, r);
  }

  const huboFallo = detalle.some((d) => d.estado === "fallo");
  const ok = hechos.length > 0 && !huboFallo;
  const motivo = ok ? undefined
    : huboFallo ? "Algún paso falló; lo demás se hizo tal como se dice."
    : borradores.length ? "Nada se aplicó: el gobierno de esta entidad pide propuesta o votación."
    : "Nada se aplicó: ningún paso tiene camino real todavía (los motivos están abajo).";
  return { ok, hechos, pendientes, borradores, detalle, ...(motivo ? { motivo } : {}) };
}
