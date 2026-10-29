/**
 * Herramientas MCP de Genesis (Ola 1019G · tarea R, parte 1 de 2).
 * Contrato: architecture/genesis-conectores-abiertos.md §7. Definiciones puras
 * (nombre, descripción en español, `inputSchema` JSON Schema y el permiso de
 * `CapacidadAmbito` que declara) con manejadores INYECTADOS en `DependenciasMcp`:
 * sin red, sin disco ni reloj. La fábrica `crearHerramientasMcp` valida los
 * argumentos contra el esquema ANTES de llamar al manejador (se llama siempre a
 * lo validado) y solo entrega cada herramienta a quien tiene su permiso. Nunca
 * devuelve valores de claves ni tokens, solo nombres de variables.
 */
import type { HerramientaMcp } from "./protocolo";
import type { CapacidadAmbito } from "@/lib/mando/ambito";
import { validarOperacion, type ContextoValidacion, type Operacion } from "@/lib/genesis/operaciones";

export interface DefinicionHerramientaMcp {
  nombre: string;
  descripcion: string;
  permiso: CapacidadAmbito;
  esquema: Record<string, unknown>;
}

/** Manejadores que aporta la ruta MCP con permisos (tarea S): todos asíncronos. */
export interface DependenciasMcp {
  /** Permisos concedidos al llamante (los 12 de `CapacidadAmbito`). */
  permisos: readonly CapacidadAmbito[];
  /** Ámbito de Genesis con el que se valida la operación de «proponer». */
  ambito?: ContextoValidacion;
  estado?: () => Promise<unknown>;
  listarTareas?(limite: number): Promise<unknown>;
  crearTarea?(titulo: string, descripcion: string): Promise<unknown>;
  listarAgentes?(): Promise<unknown>;
  medidores?(): Promise<unknown>;
  proponer?(operacion: Operacion): Promise<unknown>;
  buscarBiblioteca?(consulta: string): Promise<unknown>;
  sugerirOpciones?(de: string): Promise<unknown>;
  chat?(mensaje: string): Promise<unknown>;
}

/** Validador JSON Schema mínimo y puro: object, properties, required y additionalProperties. */
function problemaDeEsquema(esquema: Record<string, unknown>, args: unknown): string | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return "Los argumentos no son un objeto.";
  const a = args as Record<string, unknown>;
  const props = (esquema.properties ?? {}) as Record<string, { type?: string }>;
  const requeridos = (esquema.required ?? []) as string[];
  for (const clave of requeridos) if (a[clave] === undefined) return `Falta «${clave}».`;
  for (const [clave, valor] of Object.entries(a)) {
    const tipo = props[clave]?.type;
    if (typeof tipo !== "string" && esquema.additionalProperties === false) return `Argumento desconocido: «${clave}».`;
    if (typeof tipo !== "string") continue;
    const bien = (tipo === "string" && typeof valor === "string") || (tipo === "number" && typeof valor === "number" && Number.isFinite(valor)) || (tipo === "boolean" && typeof valor === "boolean") || (tipo === "array" && Array.isArray(valor)) || (tipo === "object" && typeof valor === "object" && valor !== null && !Array.isArray(valor));
    if (!bien) return `«${clave}» debe ser ${tipo}.`;
  }
  return null;
}

const sinManejador = (nombre: string): Promise<never> => Promise.reject(new Error(`«${nombre}» no tiene manejador en este contexto.`));

const obj = (partes: Record<string, unknown>): Record<string, unknown> => ({ type: "object", additionalProperties: false, ...partes });

export const DEFINICIONES_HERRAMIENTAS_MCP: readonly DefinicionHerramientaMcp[] = [
  { nombre: "estado", permiso: "ver-resumen", descripcion: "Lee un resumen del sistema: nivel Genesis activo, tareas en curso y salud de los carriles.", esquema: obj({ properties: {} }) },
  { nombre: "agentes_listar", permiso: "ver-resumen", descripcion: "Lista los agentes del enjambre que están escribiendo en el ámbito, con qué motor y desde hace cuánto.", esquema: obj({ properties: {} }) },
  { nombre: "medidores", permiso: "ver-resumen", descripcion: "Devuelve los medidores del puente de mando: agentes vivos, tareas en curso, crédito y listas.", esquema: obj({ properties: {} }) },
  { nombre: "tareas_listar", permiso: "ver-detalle", descripcion: "Lista las tareas de la cola del ámbito, las más nuevas primero.", esquema: obj({ properties: { limite: { type: "number", description: "Cuántas tareas enseñar (1–100, por defecto 10)." } } }) },
  { nombre: "tareas_crear", permiso: "encolar", descripcion: "Crea una tarea nueva en la cola del ámbito; queda a la espera de la aprobación humana.", esquema: obj({ properties: { titulo: { type: "string" }, descripcion: { type: "string" } }, required: ["titulo", "descripcion"] }) },
  { nombre: "proponer", permiso: "encolar", descripcion: "Propone una operación del vocabulario cerrado de Genesis; se valida con desconfianza y queda a la espera de la aprobación (persona) o la votación (entidad).", esquema: obj({ properties: { operacion: { type: "object", description: "Operación del vocabulario de Genesis, con su tipo y motivo." } }, required: ["operacion"] }) },
  { nombre: "biblioteca_buscar", permiso: "ver-detalle", descripcion: "Busca paquetes y habilidades en la Biblioteca del OS por texto libre.", esquema: obj({ properties: { consulta: { type: "string" } }, required: ["consulta"] }) },
  { nombre: "opciones_sugerir", permiso: "ver-detalle", descripcion: "Sugiere opciones del catálogo vivo (modelos, contenedores, conectores y herramientas) para el ámbito: gratis primero, con sus enlaces para vincular y su límite verificado (null si no lo está).", esquema: obj({ properties: { de: { type: "string", description: "Origen del cruce: cuenta, grupo o página." } }, required: ["de"] }) },
  { nombre: "chat", permiso: "chatear", descripcion: "Manda un mensaje al chat del ámbito y devuelve la respuesta del motor que lo atiende.", esquema: obj({ properties: { mensaje: { type: "string" } }, required: ["mensaje"] }) },
];

/** «proponer» valida la operación con `validarOperacion` y solo pasa la SANEADA al manejador. */
function proponerOperacion(d: DependenciasMcp, a: Record<string, unknown>): Promise<unknown> {
  if (!d.proponer) return sinManejador("proponer");
  if (!d.ambito) throw new Error("«proponer» necesita el ámbito de Genesis para validar la operación.");
  const v = validarOperacion(a.operacion, d.ambito);
  if (!v.ok) throw new Error(v.problemas.join(" "));
  return d.proponer(v.op);
}

/** Llama SIEMPRE a lo validado: da forma a los argumentos ya validados y exige el manejador. */
function ejecutarDefinicion(nombre: string, d: DependenciasMcp, a: Record<string, unknown>): Promise<unknown> {
  switch (nombre) {
    case "estado": return d.estado ? d.estado() : sinManejador(nombre);
    case "agentes_listar": return d.listarAgentes ? d.listarAgentes() : sinManejador(nombre);
    case "medidores": return d.medidores ? d.medidores() : sinManejador(nombre);
    case "tareas_listar": return d.listarTareas ? d.listarTareas(a.limite as number) : sinManejador(nombre);
    case "tareas_crear": return d.crearTarea ? d.crearTarea(a.titulo as string, a.descripcion as string) : sinManejador(nombre);
    case "biblioteca_buscar": return d.buscarBiblioteca ? d.buscarBiblioteca(a.consulta as string) : sinManejador(nombre);
    case "opciones_sugerir": return d.sugerirOpciones ? d.sugerirOpciones(a.de as string) : sinManejador(nombre);
    case "chat": return d.chat ? d.chat(a.mensaje as string) : sinManejador(nombre);
    case "proponer": return proponerOperacion(d, a);
    default: return sinManejador(nombre);
  }
}

export type HerramientaMcpConPermiso = HerramientaMcp & { permiso: CapacidadAmbito };

const errorMcp = (texto: string): { contenido: { tipo: "texto"; texto: string }[]; esError: boolean } =>
  ({ contenido: [{ tipo: "texto", texto: `Error: ${texto}` }], esError: true });

/** Junta definición y manejador: solo entra la herramienta de la que el llamante tiene el permiso. */
export function crearHerramientasMcp(deps: DependenciasMcp): HerramientaMcpConPermiso[] {
  return DEFINICIONES_HERRAMIENTAS_MCP.filter((def) => deps.permisos.includes(def.permiso)).map((def) => ({
    ...def,
    ejecutar: async (args: Record<string, unknown>) => {
      const problema = problemaDeEsquema(def.esquema, args);
      if (problema) return errorMcp(problema);
      try {
        const datos = await ejecutarDefinicion(def.nombre, deps, args);
        return { contenido: [{ tipo: "texto", texto: JSON.stringify(datos ?? null) }] };
      } catch (e) {
        return errorMcp(e instanceof Error ? e.message : "Error desconocido");
      }
    },
  }));
}
