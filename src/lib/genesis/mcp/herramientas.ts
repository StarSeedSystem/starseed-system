/**
 * GENESIS · Herramientas MCP (Ola 1019G · GCA1019R · §7 de architecture/genesis-conectores-abiertos.md).
 * Definiciones (nombre, descripción, inputSchema y permiso) y manejadores INYECTADOS de las nueve
 * herramientas: estado, tareas_listar, tareas_crear, agentes_listar, medidores, proponer (lote
 * validado con `validarLote`), biblioteca_buscar, opciones_sugerir y chat. Módulo PURO: sin red,
 * disco ni claves; la ruta inyecta cada manejador tras comprobar EN EL SERVIDOR su permiso; los
 * argumentos se validan contra su esquema y el manejador recibe SOLO lo validado, como texto.
 */

import type { HerramientaMcp } from "./protocolo";
import type { CapacidadAmbito } from "@/lib/mando/ambito";
import { validarLote, type ContextoValidacion } from "@/lib/genesis/operaciones";

export type NombreHerramientaGenesis =
  | "estado" | "tareas_listar" | "tareas_crear" | "agentes_listar" | "medidores"
  | "proponer" | "biblioteca_buscar" | "opciones_sugerir" | "chat";

/** Manejador de una herramienta: recibe los argumentos YA VALIDADOS y el contexto del ámbito. */
export type ManejadorGenesis = (args: Record<string, unknown>, ctx: unknown) => Promise<unknown> | unknown;
/** Manejadores que conecta quien arma el servidor MCP; los que falten responden con error. */
export type ManejadoresGenesis = Partial<Record<NombreHerramientaGenesis, ManejadorGenesis>>;
/** Una herramienta anunciada en tools/list: qué hace, su esquema y qué permiso necesita. */
export interface DefinicionHerramientaGenesis {
  nombre: NombreHerramientaGenesis;
  descripcion: string;
  esquema: Record<string, unknown>;
  /** Permiso (de los 12 de Genesis) que la ruta comprueba EN EL SERVIDOR antes de llamar. */
  permiso: CapacidadAmbito;
}

type TipoEsquema = "object" | "string" | "number" | "integer" | "boolean" | "array";
/** JSON Schema aceptado: enum; minimum/maximum (números), maxLength (texto) e items (listas). */
interface PropiedadEsquema {
  type: TipoEsquema;
  enum?: readonly unknown[];
  minimum?: number; maximum?: number; maxLength?: number; items?: PropiedadEsquema;
}
interface EsquemaHerramienta { type: "object"; properties?: Record<string, PropiedadEsquema>; required?: readonly string[] }

export type ResultadoValidacionArgs = { ok: true; valor: Record<string, unknown> } | { ok: false; problemas: string[] };

export const HERRAMIENTAS_GENESIS: readonly DefinicionHerramientaGenesis[] = [
  { nombre: "estado", permiso: "ver-resumen", descripcion: "Estado vivo del ámbito: ola activa, agentes escribiendo y salud de Genesis.", esquema: { type: "object", properties: {} } },
  { nombre: "tareas_listar", permiso: "ver-detalle", descripcion: "Lista las tareas del enjambre del ámbito, las más nuevas primero.", esquema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 100 } } } },
  { nombre: "tareas_crear", permiso: "encolar", descripcion: "Encola una tarea nueva en la ola del ámbito (la aprobadora decide si sale).", esquema: {
    type: "object", required: ["titulo"],
    properties: { titulo: { type: "string", maxLength: 160 }, prompt: { type: "string", maxLength: 4000 },
      ficheros: { type: "array", items: { type: "string", maxLength: 200 } }, depende: { type: "array", items: { type: "string", maxLength: 40 } } } } },
  { nombre: "agentes_listar", permiso: "ver-detalle", descripcion: "Lista los agentes del ámbito, su medio y desde hace cuánto trabajan.", esquema: { type: "object", properties: {} } },
  { nombre: "medidores", permiso: "ver-resumen", descripcion: "Medidores del ámbito: agentes en curso, tareas, integradas y consumo.", esquema: { type: "object", properties: {} } },
  { nombre: "proponer", permiso: "encolar", descripcion: "Propone operaciones de Genesis: quedan en vista previa o votación antes de aplicarse.",
    esquema: { type: "object", required: ["operaciones"], properties: { operaciones: { type: "array", items: { type: "object" } } } } },
  { nombre: "biblioteca_buscar", permiso: "ver-resumen", descripcion: "Busca fichas en la Biblioteca del OS por texto y tipo.", esquema: {
    type: "object", required: ["texto"],
    properties: { texto: { type: "string", maxLength: 120 }, tipo: { type: "string", maxLength: 40 }, limite: { type: "integer", minimum: 1, maximum: 50 } } } },
  { nombre: "opciones_sugerir", permiso: "ver-resumen", descripcion: "Sugiere qué activar y qué vincular en el ámbito: lo local potente primero y lo gratis después.", esquema: { type: "object", properties: {} } },
  { nombre: "chat", permiso: "chatear", descripcion: "Habla con el asistente técnico de Genesis y devuelve su respuesta.",
    esquema: { type: "object", required: ["mensaje"], properties: { mensaje: { type: "string", maxLength: 4000 } } } },
];

export function validarContraEsquema(valor: unknown, esquema: Record<string, unknown>): ResultadoValidacionArgs {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return { ok: false, problemas: ["Los argumentos deben ser un objeto."] };
  const e = esquema as unknown as EsquemaHerramienta;
  const args = valor as Record<string, unknown>;
  const props = e.properties ?? {};
  const problemas: string[] = [];
  for (const req of e.required ?? []) if (args[req] === undefined) problemas.push(`Falta «${req}».`);
  for (const [clave, prop] of Object.entries(props)) if (args[clave] !== undefined) validarPropiedad(clave, args[clave], prop, problemas);
  for (const clave of Object.keys(args)) if (!(clave in props)) problemas.push(`«${clave}» no es un argumento admitido.`);
  return problemas.length ? { ok: false, problemas } : { ok: true, valor: args };
}

function validarPropiedad(clave: string, v: unknown, prop: PropiedadEsquema, problemas: string[]): void {
  const cumple = prop.type === "object" ? v !== null && typeof v === "object" && !Array.isArray(v)
    : prop.type === "array" ? Array.isArray(v)
    : prop.type === "integer" ? typeof v === "number" && Number.isInteger(v)
    : typeof v === prop.type;
  const cae = (motivo: string) => problemas.push(`«${clave}» ${motivo}.`);
  if (!cumple) { cae(`debe ser ${prop.type}`); return; }
  if (prop.enum && !prop.enum.includes(v)) cae("no es un valor admitido");
  if (typeof v === "number" && prop.minimum !== undefined && v < prop.minimum) cae(`debe ser ≥ ${prop.minimum}`);
  if (typeof v === "number" && prop.maximum !== undefined && v > prop.maximum) cae(`debe ser ≤ ${prop.maximum}`);
  if (typeof v === "string" && prop.maxLength !== undefined && v.length > prop.maxLength) cae(`supera ${prop.maxLength} caracteres`);
  if (prop.items && Array.isArray(v)) v.forEach((x, i) => validarPropiedad(`${clave}[${i}]`, x, prop.items as PropiedadEsquema, problemas));
}

/* ── Construcción con manejador inyectado ────────────────────────────────── */

/** Si quien llamó pasa un ContextoValidacion (proponer) se usa; si no, cuenta de persona. */
export function contextoOperaciones(ctx: unknown): ContextoValidacion {
  if (ctx !== null && typeof ctx === "object" && "ambito" in ctx) return ctx as ContextoValidacion;
  return { ambito: { tipo: "persona" } };
}

/** Arma las HerramientaMcp del protocolo: valida los args y al manejador llega SOLO lo validado. */
export function construirHerramientasGenesis(manejadores: ManejadoresGenesis): HerramientaMcp[] {
  return HERRAMIENTAS_GENESIS.map((def) => ({
    nombre: def.nombre,
    descripcion: def.descripcion,
    esquema: def.esquema,
    ejecutar: async (args: Record<string, unknown>, ctx: unknown) => atenderHerramienta(def, args ?? {}, manejadores, ctx),
  }));
}

type ResultadoHerramienta = { contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean };

async function atenderHerramienta(def: DefinicionHerramientaGenesis, args: Record<string, unknown>, manejadores: ManejadoresGenesis, ctx: unknown): Promise<ResultadoHerramienta> {
  const mal = (texto: string): ResultadoHerramienta => ({ contenido: [{ tipo: "texto", texto }], esError: true });
  const validado = validarContraEsquema(args, def.esquema);
  if (!validado.ok) return mal(validado.problemas.join(" · "));
  let paraElManejador: Record<string, unknown> = validado.valor;
  if (def.nombre === "proponer") {
    const lote = validarLote(validado.valor.operaciones, contextoOperaciones(ctx));
    paraElManejador = { validas: lote.validas, rechazadas: lote.rechazadas };
  }
  const manejador = manejadores[def.nombre];
  if (!manejador) return mal(`Error: la herramienta «${def.nombre}» no tiene manejador conectado.`);
  const salida = await manejador(paraElManejador, ctx);
  return { contenido: [{ tipo: "texto", texto: typeof salida === "string" ? salida : JSON.stringify(salida) }] };
}
