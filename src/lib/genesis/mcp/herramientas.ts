/** GENESIS · HERRAMIENTAS MCP (Ola 1019G · architecture/genesis-conectores-abiertos.md §7).
 * Definiciones (nombre, descripción, JSON Schema) y manejadores INYECTADOS de `estado`,
 * `tareas_listar`, `tareas_crear`, `agentes_listar`, `medidores`, `proponer`, `biblioteca_buscar`,
 * `opciones_sugerir` y `chat`. Cada una declara el permiso de ámbito que necesita.
 * PURO: sin red, reloj ni almacenamiento; solo valida argumentos y llama a lo inyectado. Jamás devuelve valores de claves: los redacta. «proponer» valida con `../operaciones.ts`. */
import type { CapacidadAmbito } from "@/lib/mando/ambito";
import { validarLote, type ContextoValidacion, type Operacion } from "../operaciones";
import type { HerramientaMcp } from "./protocolo";
type Esquema = Record<string, unknown>;
export interface HerramientaGenesis extends HerramientaMcp { permiso: CapacidadAmbito }
export interface ArgumentosTareasListar { limite: number; estado?: string; cola?: string }
export interface ArgumentosTareasCrear { titulo: string; descripcion?: string; cola?: string; archivos?: string[] }
export interface ArgumentosAgentesListar { limite: number; soloActivos: boolean }
export interface ArgumentosBibliotecaBuscar { consulta: string; tipo?: string; limite: number }
export interface ArgumentosOpcionesSugerir { papel?: string; soloGratis: boolean; limite: number }
export interface ArgumentosChat { mensaje: string; director?: string }
export interface EntradaProponerValidada { operaciones: Operacion[]; avisos: string[]; rechazadas: { indice: number; problemas: string[] }[] }
export interface DependenciasGenesis {
  contexto: ContextoValidacion;
  estado(): unknown | Promise<unknown>;
  tareasListar(a: ArgumentosTareasListar): unknown | Promise<unknown>;
  tareasCrear(a: ArgumentosTareasCrear): unknown | Promise<unknown>;
  agentesListar(a: ArgumentosAgentesListar): unknown | Promise<unknown>;
  medidores(): unknown | Promise<unknown>;
  proponer(a: EntradaProponerValidada): unknown | Promise<unknown>;
  bibliotecaBuscar(a: ArgumentosBibliotecaBuscar): unknown | Promise<unknown>;
  opcionesSugerir(a: ArgumentosOpcionesSugerir): unknown | Promise<unknown>;
  chat(a: ArgumentosChat): unknown | Promise<unknown>;
}

const texto = (maxLength: number, extra: Esquema = {}): Esquema => ({ type: "string", maxLength, ...extra });
const entero = (minimum: number, maximum: number, porDefecto: number): Esquema => ({ type: "integer", minimum, maximum, default: porDefecto });
const lista = (tipo: string, extra: Esquema = {}): Esquema => ({ type: "array", items: { type: tipo }, ...extra });
const objeto = (properties: Esquema, required: string[] = []): Esquema => ({ type: "object", properties, required, additionalProperties: false });
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const respuesta = (textoSalida: string, esError = false) => ({ contenido: [{ tipo: "texto" as const, texto: textoSalida }], ...(esError ? { esError: true } : {}) });
const SECRETO = /^(api[_-]?key|key|token|secret|secreto|password|contraseña|clave|authorization)$/i;

/** Copia el resultado ocultando valores de claves: solo pasan nombres y huellas. */
export function redactar(v: unknown, profundidad = 0): unknown {
  if (profundidad > 8) return null;
  if (Array.isArray(v)) return v.map((x) => redactar(x, profundidad + 1));
  if (!esObjeto(v)) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRETO.test(k) ? "[redactado]" : redactar(x, profundidad + 1)]));
}

/** Valida con desconfianza los argumentos contra el `inputSchema` y descarta lo no declarado. */
export function validarArgumentos(esquema: Esquema, args: Record<string, unknown>):
  { ok: true; valor: Record<string, unknown> } | { ok: false; problemas: string[] } {
  const problemas: string[] = [];
  const valor: Record<string, unknown> = {};
  const props = (esquema.properties ?? {}) as Record<string, Esquema>;
  for (const req of (esquema.required as string[] | undefined) ?? []) if (args[req] === undefined) problemas.push(`Falta «${req}».`);
  for (const [k, p] of Object.entries(props)) {
    const v = args[k];
    if (v === undefined) { if (p.default !== undefined) valor[k] = p.default; continue; }
    if (p.type === "string") {
      if (typeof v !== "string") { problemas.push(`«${k}» debe ser texto.`); continue; }
      const t = v.trim();
      if (t.length < ((p.minLength as number) ?? 0) || t.length > ((p.maxLength as number) ?? 10000)) { problemas.push(`«${k}» tiene una longitud no válida.`); continue; }
      if (Array.isArray(p.enum) && !p.enum.includes(t)) { problemas.push(`«${k}» debe ser uno de: ${(p.enum as string[]).join(", ")}.`); continue; }
      valor[k] = t; continue;
    }
    if (p.type === "integer" || p.type === "number") {
      const n = typeof v === "string" ? Number(v.trim()) : v;
      const min = p.minimum as number | undefined, max = p.maximum as number | undefined;
      if (typeof n !== "number" || !Number.isFinite(n) || (p.type === "integer" && !Number.isInteger(n)) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
        problemas.push(`«${k}» debe ser un número entre ${min ?? "−∞"} y ${max ?? "∞"}.`); continue;
      }
      valor[k] = n; continue;
    }
    if (p.type === "boolean") { if (typeof v !== "boolean") problemas.push(`«${k}» debe ser verdadero o falso.`); else valor[k] = v; continue; }
    if (p.type === "array") {
      const items = p.items as Esquema | undefined;
      const largo = Array.isArray(v) ? v.length : -1;
      if (!Array.isArray(v) || (items?.type === "object" && !v.every(esObjeto)) || largo < ((p.minItems as number) ?? 0) || largo > ((p.maxItems as number) ?? Number.MAX_SAFE_INTEGER)) {
        problemas.push(`«${k}» no es una lista válida.`); continue;
      }
      valor[k] = v; continue;
    }
    valor[k] = v;
  }
  return problemas.length ? { ok: false, problemas } : { ok: true, valor };
}

function envolver(esquema: Esquema, accion: (a: Record<string, unknown>) => unknown): HerramientaMcp["ejecutar"] {
  return async (args) => {
    const r = validarArgumentos(esquema, args);
    if (!r.ok) return respuesta(`Argumentos no válidos: ${r.problemas.join(" ")}`, true);
    try {
      return respuesta(JSON.stringify(redactar(await accion(r.valor)) ?? null));
    } catch (e) {
      return respuesta(`Error: ${e instanceof Error ? e.message : "desconocido"}`, true);
    }
  };
}

/** `proponer` valida el lote con el vocabulario cerrado y entrega SOLO lo validado al manejador. */
function proponer(d: DependenciasGenesis, a: { operaciones: Record<string, unknown>[] }): unknown {
  const lote = validarLote(a.operaciones, d.contexto);
  if (!lote.validas.length) throw new Error(`No hay operaciones válidas: ${lote.rechazadas.flatMap((x) => x.problemas).join(" ")}.`);
  return d.proponer({ operaciones: lote.validas.map((x) => x.op), avisos: lote.validas.flatMap((x) => x.avisos), rechazadas: lote.rechazadas });
}

/** Arma las nueve herramientas con sus manejadores inyectados y su permiso de ámbito. */
export function crearHerramientasMcp(d: DependenciasGenesis): HerramientaGenesis[] {
  const t = (nombre: string, descripcion: string, permiso: CapacidadAmbito, esquema: Esquema, accion: (a: Record<string, unknown>) => unknown): HerramientaGenesis =>
    ({ nombre, descripcion, permiso, esquema, ejecutar: envolver(esquema, accion) });
  return [
    t("estado", "Resumen del estado del Genesis y su ámbito: qué hay vivo, en curso y pendiente.", "ver-resumen", objeto({}), () => d.estado()),
    t("tareas_listar", "Lista las tareas del ámbito, con su estado y la ola a la que pertenecen.", "ver-detalle", objeto({ limite: entero(1, 100, 20), estado: texto(24, { enum: ["pendiente", "en-curso", "hecha", "fallida", "bloqueada"] }), cola: texto(60) }), (a) => d.tareasListar(a as unknown as ArgumentosTareasListar)),
    t("tareas_crear", "Encola una tarea nueva y pequeña para el enjambre del ámbito, con sus archivos.", "encolar", objeto({ titulo: texto(160, { minLength: 1 }), descripcion: texto(2000), cola: texto(60), archivos: lista("string", { maxItems: 12 }) }, ["titulo"]), (a) => d.tareasCrear(a as unknown as ArgumentosTareasCrear)),
    t("agentes_listar", "Lista los agentes del ámbito y desde cuándo escriben, si se piden solo los activos.", "ver-detalle", objeto({ limite: entero(1, 200, 50), soloActivos: { type: "boolean", default: true } }), (a) => d.agentesListar(a as unknown as ArgumentosAgentesListar)),
    t("medidores", "Medidores del ámbito: puertas, coste, uso de modelos y salud del repositorio.", "ver-resumen", objeto({}), () => d.medidores()),
    t("proponer", "Propone operaciones tipadas de Genesis (perfil, páginas, apariencia, dock, agentes y bots) para que se validen y se aprueben.", "administrar", objeto({ operaciones: lista("object", { minItems: 1, maxItems: 8 }) }, ["operaciones"]), (a) => proponer(d, a as unknown as { operaciones: Record<string, unknown>[] })),
    t("biblioteca_buscar", "Busca en la Biblioteca del ámbito opciones por tipo: modelo, proveedor, contenedor, herramienta, habilidad o conector.", "ver-detalle", objeto({ consulta: texto(200, { minLength: 1 }), tipo: texto(20, { enum: ["modelo", "proveedor", "contenedor", "herramienta", "habilidad", "conector"] }), limite: entero(1, 50, 10) }, ["consulta"]), (a) => d.bibliotecaBuscar(a as unknown as ArgumentosBibliotecaBuscar)),
    t("opciones_sugerir", "Sugiere, local primero, las opciones que faltan activar o vincular para un papel o para todo el ámbito.", "ver-resumen", objeto({ papel: texto(40), soloGratis: { type: "boolean", default: true }, limite: entero(1, 50, 20) }), (a) => d.opcionesSugerir(a as unknown as ArgumentosOpcionesSugerir)),
    t("chat", "Habla con el director del ámbito: recibe el mensaje y devuelve su respuesta.", "chatear", objeto({ mensaje: texto(8000, { minLength: 1 }), director: texto(40) }, ["mensaje"]), (a) => d.chat(a as unknown as ArgumentosChat)),
  ];
}
