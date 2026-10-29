/** Herramientas MCP de Genesis abierto (Ola 1019G · GCA1019R).
 * Puras: definiciones (nombre, descripción, JSON Schema y permiso) con manejadores INYECTADOS;
 * sin red, reloj, Supabase ni almacenamiento. Contrato: architecture/genesis-conectores-abiertos.md §7. */
import type { CapacidadAmbito } from "@/lib/mando/ambito";
import type { HerramientaMcp } from "./protocolo";
export type NombreHerramienta = "estado" | "tareas_listar" | "tareas_crear" | "agentes_listar" | "medidores" | "proponer" | "biblioteca_buscar" | "opciones_sugerir" | "chat";
export type Manejador = (args: Record<string, unknown>, ctx?: unknown) => Promise<unknown>;
export type ManejadoresGenesis = Partial<Record<NombreHerramienta, Manejador>>;
export interface PropiedadEsquema {
  type: "object" | "string" | "integer" | "number" | "boolean" | "array"; description?: string;
  enum?: readonly string[]; minimum?: number; maximum?: number; maxLength?: number; maxItems?: number;
  default?: unknown; items?: PropiedadEsquema;
}
export interface EsquemaHerramienta {
  [clave: string]: unknown; type: "object"; properties: Record<string, PropiedadEsquema>;
  required: string[]; additionalProperties: false;
}
export interface DefinicionHerramienta {
  nombre: NombreHerramienta; descripcion: string; permiso: CapacidadAmbito; esquema: EsquemaHerramienta;
}
export interface OpcionesHerramientas {
  manejadores?: ManejadoresGenesis; permitidas?: ReadonlySet<CapacidadAmbito>;
}
const campo = (type: PropiedadEsquema["type"], extra: Omit<PropiedadEsquema, "type"> = {}): PropiedadEsquema => ({ type, ...extra });
const esquema = (properties: Record<string, PropiedadEsquema>, required: string[] = []): EsquemaHerramienta =>
  ({ type: "object", properties, required, additionalProperties: false });
export const DEFINICIONES: readonly DefinicionHerramienta[] = [
  { nombre: "estado", permiso: "ver-resumen", descripcion: "Devuelve el estado vivo del ámbito: olas, carriles, salud y avisos.", esquema: esquema({}) },
  { nombre: "tareas_listar", permiso: "ver-resumen", descripcion: "Lista las tareas del ámbito con su estado, su cola y su modelo.", esquema: esquema({
    limite: campo("integer", { minimum: 1, maximum: 200, default: 20, description: "Cuántas tareas devolver." }),
    cola: campo("string", { maxLength: 120, description: "Filtra por el id de una cola." }) }) },
  { nombre: "tareas_crear", permiso: "encolar", descripcion: "Encola una tarea nueva para el enjambre del ámbito.", esquema: esquema({
    titulo: campo("string", { maxLength: 200, description: "Título corto de la tarea." }),
    descripcion: campo("string", { maxLength: 2000, description: "Qué hay que hacer, en una o dos frases." }),
    cola: campo("string", { maxLength: 120, description: "Cola donde encolarla." }),
    modelo: campo("string", { maxLength: 120, description: "Modelo o motor preferido." }),
    prioridad: campo("string", { enum: ["alta", "normal", "baja"], default: "normal", description: "Orden de atención." }) }, ["titulo"]) },
  { nombre: "agentes_listar", permiso: "ver-resumen", descripcion: "Lista los agentes que escriben ahora mismo y desde cuándo.", esquema: esquema({
    limite: campo("integer", { minimum: 1, maximum: 200, default: 50, description: "Cuántos agentes devolver." }) }) },
  { nombre: "medidores", permiso: "ver-detalle", descripcion: "Lee los medidores del ámbito: tareas, agentes, colas y proveedores.", esquema: esquema({
    clave: campo("string", { maxLength: 80, description: "Un medidor concreto; sin clave, el resumen." }) }) },
  { nombre: "proponer", permiso: "encolar", descripcion: "Propone una operación tipada de Genesis (perfil, página, dock, bot o avatar).", esquema: esquema({
    operacion: campo("object", { description: "Operación del vocabulario cerrado de Genesis, con su motivo." }),
    ambito: campo("string", { maxLength: 120, description: "Ámbito donde aplicarla; lo fija el servidor." }) }, ["operacion"]) },
  { nombre: "biblioteca_buscar", permiso: "ver-resumen", descripcion: "Busca paquetes, habilidades y conectores en la Biblioteca del OS.", esquema: esquema({
    texto: campo("string", { maxLength: 200, description: "Qué buscar." }),
    limite: campo("integer", { minimum: 1, maximum: 100, default: 20, description: "Cuántos resultados devolver." }) }, ["texto"]) },
  { nombre: "opciones_sugerir", permiso: "ver-detalle", descripcion: "Sugiere opciones gratis y locales para los papeles del ámbito, con enlaces oficiales.", esquema: esquema({
    papel: campo("string", { enum: ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"], description: "Papel del que se piden opciones." }),
    ambito: campo("string", { maxLength: 120, description: "Ámbito consultado; lo fija el servidor." }) }) },
  { nombre: "chat", permiso: "chatear", descripcion: "Convierte con el chat del ámbito para dirigir Genesis en lenguaje natural.", esquema: esquema({
    mensaje: campo("string", { maxLength: 8000, description: "Lo que dice la persona." }),
    conversacion: campo("string", { maxLength: 120, description: "Id de la conversación, si ya existe." }) }, ["mensaje"]) },
];
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function validarPropiedad(nombre: string, valor: unknown, p: PropiedadEsquema): unknown {
  if (p.type === "string") {
    if (typeof valor !== "string") throw new Error(`«${nombre}» debe ser texto.`);
    if (p.maxLength !== undefined && valor.length > p.maxLength) throw new Error(`«${nombre}» supera ${p.maxLength} caracteres.`);
    if (p.enum && !p.enum.includes(valor)) throw new Error(`«${nombre}» no es un valor permitido.`);
    return valor;
  }
  if (p.type === "integer" || p.type === "number") {
    if (typeof valor !== "number" || !Number.isFinite(valor)) throw new Error(`«${nombre}» debe ser un número.`);
    if (p.type === "integer" && !Number.isInteger(valor)) throw new Error(`«${nombre}» debe ser entero.`);
    if (p.minimum !== undefined && valor < p.minimum) throw new Error(`«${nombre}» es menor que ${p.minimum}.`);
    if (p.maximum !== undefined && valor > p.maximum) throw new Error(`«${nombre}» es mayor que ${p.maximum}.`);
    return valor;
  }
  if (p.type === "boolean") {
    if (typeof valor !== "boolean") throw new Error(`«${nombre}» debe ser verdadero o falso.`);
    return valor;
  }
  if (p.type === "array") {
    if (!Array.isArray(valor)) throw new Error(`«${nombre}» debe ser una lista.`);
    if (p.maxItems !== undefined && valor.length > p.maxItems) throw new Error(`«${nombre}» supera ${p.maxItems} elementos.`);
    return p.items ? valor.map((v, i) => validarPropiedad(`${nombre}[${i}]`, v, p.items!)) : valor;
  }
  if (!esObjeto(valor)) throw new Error(`«${nombre}» debe ser un objeto.`);
  return valor;
}
export function validarArgumentos(esquema: EsquemaHerramienta, bruto: unknown): Record<string, unknown> {
  const entrada = bruto === undefined ? {} : bruto;
  if (!esObjeto(entrada)) throw new Error("Los argumentos deben ser un objeto.");
  for (const nombre of esquema.required) {
    if (entrada[nombre] === undefined || entrada[nombre] === null) throw new Error(`Falta «${nombre}».`);
  }
  const limpio: Record<string, unknown> = {};
  for (const [nombre, propiedad] of Object.entries(esquema.properties)) {
    const valor = entrada[nombre];
    if (valor === undefined || valor === null) {
      if (propiedad.default !== undefined) limpio[nombre] = propiedad.default;
      continue;
    }
    limpio[nombre] = validarPropiedad(nombre, valor, propiedad);
  }
  return limpio;
}
function textoDe(salida: unknown): string {
  if (typeof salida === "string") return salida;
  if (salida === undefined) return "Hecho.";
  try { return JSON.stringify(salida); } catch { return String(salida); }
}
export function crearHerramientasGenesis(opciones: OpcionesHerramientas = {}): HerramientaMcp[] {
  const { manejadores = {}, permitidas } = opciones;
  return DEFINICIONES.filter((d) => !permitidas || permitidas.has(d.permiso)).map((definicion) => ({
    nombre: definicion.nombre, descripcion: definicion.descripcion, esquema: definicion.esquema,
    ejecutar: async (args: Record<string, unknown>, ctx?: unknown) => {
      const manejador = manejadores[definicion.nombre];
      if (!manejador) return { contenido: [{ tipo: "texto" as const, texto: `La herramienta «${definicion.nombre}» no tiene manejador inyectado.` }], esError: true };
      try {
        const validado = validarArgumentos(definicion.esquema, args);
        return { contenido: [{ tipo: "texto" as const, texto: textoDe(await manejador(validado, ctx)) }] };
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return { contenido: [{ tipo: "texto" as const, texto: `Error: ${mensaje}` }], esError: true };
      }
    },
  }));
}
