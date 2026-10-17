// Bots/dots de Astraura · TAREAS con director y verificación profesional (BOT1011W · astraura-bots.md §8).
// El director reparte los criterios por palabras clave (determinista); solo `hecha` con TODOS en ok por un
// verificador válido: un bot nunca verifica lo que él mismo hizo, ni el director. PURO: sin React, red, `node:*`, reloj ni azar.
import { tieneSecreto } from "./acciones";
import type { EstadoTarea, Tarea } from "./tipos";

export const MAX_CRITERIOS = 12, MAX_CRITERIO = 200, MAX_TITULO = 200, MAX_EVIDENCIA = 500;
export const VERIFICADORES = ["persona", "bot", "pruebas"] as const;
export type Verificador = Tarea["verificador"];
export interface AgenteTarea { id: string; capacidades: readonly string[] }
export interface Paso { criterio: string; agente: string; coincidencias: number }
export interface Marca { por: { tipo: Verificador; id: string }; ok: boolean; evidencia: string }
export interface EstadoVerificacion {
  tareaId: string; director: string; verificador: Verificador; criterios: readonly string[];
  /** Quién hizo cada criterio (el agente de su paso): ese bot no puede verificarlo. */
  hechoPor: Readonly<Record<string, string>>; marcas: Readonly<Record<string, Marca>>;
}
export type Problemas = { problemas: string[] };
const texto = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const esVerificador = (x: unknown): x is Verificador => (VERIFICADORES as readonly unknown[]).includes(x);
const clave = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VACIAS = new Set(["para", "como", "esta", "este", "todo", "toda", "cada", "sobre", "desde", "entre", "debe", "tiene", "donde", "cuando"]);
/** Raíces de 5 letras de las palabras con contenido: «imágenes» e «imagen» comparten «image». */
function raices(s: string): Set<string> {
  return new Set(clave(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !VACIAS.has(p)).map((p) => p.slice(0, 5)));
}
/** Id estable sin reloj ni azar (djb2); `semilla` (p. ej. el `at` del evento) separa tareas gemelas. */
function idDe(partes: readonly string[]): string {
  let h = 5381;
  for (const c of partes.join("\u0001")) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return `tarea-${h.toString(36)}`;
}

/** De los args de `tarea.crear`. El director y el origen los fija quien crea, no el texto del modelo. */
export function crearTarea(args: Readonly<Record<string, unknown>>, director: string, origen: Tarea["origen"], semilla = ""): Tarea | Problemas {
  const problemas: string[] = [], titulo = texto(args.titulo);
  if (!titulo) problemas.push("Falta el título de la tarea.");
  else if (titulo.length > MAX_TITULO) problemas.push(`El título supera ${MAX_TITULO} caracteres.`);
  if (!texto(director)) problemas.push("Falta el bot director.");
  if (origen !== "genesis" && origen !== "poligenesis") problemas.push("El origen ha de ser Genesis o PoliGenesis.");
  const bruto: readonly unknown[] = Array.isArray(args.criterios) ? args.criterios : [];
  const criterios = bruto.map(texto).filter(Boolean);
  if (criterios.length === 0) problemas.push("Sin criterios comprobables no hay tarea.");
  else if (criterios.length !== bruto.length) problemas.push("Cada criterio ha de ser un texto no vacío.");
  if (criterios.length > MAX_CRITERIOS) problemas.push(`Como mucho ${MAX_CRITERIOS} criterios.`);
  if (criterios.some((c) => c.length > MAX_CRITERIO)) problemas.push(`Cada criterio cabe en ${MAX_CRITERIO} caracteres.`);
  if (new Set(criterios.map(clave)).size !== criterios.length) problemas.push("Hay criterios repetidos.");
  const verificador = args.verificador === undefined ? "persona" : args.verificador;
  if (!esVerificador(verificador)) problemas.push("El verificador ha de ser persona, bot o pruebas.");
  if (tieneSecreto(JSON.stringify([titulo, criterios]))) problemas.push("Lleva algo con forma de clave o de ruta del disco.");
  if (problemas.length > 0 || !esVerificador(verificador)) return { problemas };
  const dir = director.trim();
  return { id: idDe([dir, origen, titulo, ...criterios, semilla]), titulo, director: dir, agentes: [], criterios, verificador, origen, estado: "propuesta" };
}

/** Cada criterio al agente con más raíces en común; empate → menos carga → id menor. Si hay más agentes, el director dirige y no se queda pasos. */
export function asignarPasos(tarea: Tarea, agentes: readonly AgenteTarea[]): { tarea: Tarea; pasos: Paso[] } | Problemas {
  if (tarea.estado === "hecha" || tarea.estado === "rechazada") return { problemas: ["La tarea ya está cerrada."] };
  if (tarea.criterios.length === 0) return { problemas: ["Sin criterios no hay pasos."] };
  const saber = new Map<string, Set<string>>();
  for (const a of agentes) {
    const id = texto(a.id);
    if (id) saber.set(id, new Set([...(saber.get(id) ?? []), ...a.capacidades.flatMap((c) => [...raices(c)])]));
  }
  const ids = [...saber.keys()].sort();
  const trabajan = ids.length > 1 ? ids.filter((i) => i !== tarea.director) : ids;
  if (trabajan.length === 0) return { problemas: ["No hay agentes a quien repartir los pasos."] };
  const carga = new Map(trabajan.map((i) => [i, 0]));
  const pasos = tarea.criterios.map((criterio): Paso => {
    const r = raices(criterio);
    let mejor = { agente: trabajan[0], coincidencias: -1, carga: Number.POSITIVE_INFINITY };
    for (const id of trabajan) {
      const n = [...(saber.get(id) ?? [])].filter((x) => r.has(x)).length, c = carga.get(id) ?? 0;
      if (n > mejor.coincidencias || (n === mejor.coincidencias && c < mejor.carga)) mejor = { agente: id, coincidencias: n, carga: c };
    }
    carga.set(mejor.agente, mejor.carga + 1);
    return { criterio, agente: mejor.agente, coincidencias: mejor.coincidencias };
  });
  return { tarea: { ...tarea, agentes: [...new Set(pasos.map((p) => p.agente))].sort(), estado: "en-curso" }, pasos };
}

export function verificacionInicial(tarea: Tarea, pasos: readonly Paso[]): EstadoVerificacion {
  const hechoPor = Object.fromEntries(pasos.filter((p) => tarea.criterios.includes(p.criterio)).map((p) => [p.criterio, p.agente]));
  return { tareaId: tarea.id, director: tarea.director, verificador: tarea.verificador, criterios: tarea.criterios, hechoPor, marcas: {} };
}

function rechazo(v: EstadoVerificacion, criterio: string, por: Marca["por"]): string | null {
  const quien = texto(por.id);
  if (!v.criterios.includes(criterio)) return `«${criterio}» no es un criterio de esta tarea.`;
  if (!esVerificador(por.tipo) || !quien) return "Falta quién verifica.";
  if (por.tipo !== v.verificador) return `Esta tarea la verifica: ${v.verificador}.`;
  if (por.tipo === "bot" && quien === v.director) return "El director no verifica su propia tarea.";
  if (por.tipo === "bot" && !v.hechoPor[criterio]) return `No consta quién hizo «${criterio}»: sin eso ningún bot puede verificarlo.`;
  if (por.tipo === "bot" && quien === v.hechoPor[criterio]) return "Un bot no verifica lo que él mismo hizo.";
  return null;
}

/** Marca un criterio (la última marca válida manda). Toda marca lleva su evidencia. */
export function marcarCriterio(v: EstadoVerificacion, criterio: string, por: Marca["por"], ok: boolean, evidencia: string): EstadoVerificacion | Problemas {
  const motivo = rechazo(v, criterio, por), ev = texto(evidencia);
  const problemas = motivo ? [motivo] : [];
  if (typeof ok !== "boolean") problemas.push("La marca ha de ser sí o no.");
  if (!ev) problemas.push("Toda marca lleva su evidencia: qué se comprobó y cómo.");
  else if (ev.length > MAX_EVIDENCIA) problemas.push(`La evidencia supera ${MAX_EVIDENCIA} caracteres.`);
  else if (tieneSecreto(ev)) problemas.push("La evidencia lleva algo con forma de clave o de ruta del disco.");
  if (problemas.length > 0) return { problemas };
  return { ...v, marcas: { ...v.marcas, [criterio]: { por: { tipo: por.tipo, id: texto(por.id) }, ok, evidencia: ev } } };
}

/** El estado guardado no manda: manda la verificación, revalidada contra la propia tarea (un `hechoPor` ajeno a sus agentes no cuenta). */
export function estadoDe(tarea: Tarea, verif?: EstadoVerificacion): EstadoTarea {
  if (tarea.estado === "rechazada") return "rechazada";
  const v = verif && verif.tareaId === tarea.id ? { ...verif, director: tarea.director, verificador: tarea.verificador, criterios: tarea.criterios,
    hechoPor: Object.fromEntries(Object.entries(verif.hechoPor).filter(([, a]) => tarea.agentes.includes(a))) } : undefined;
  const marcas = v ? Object.entries(v.marcas).filter(([c, m]) => !rechazo(v, c, m.por)) : [];
  const ok = new Set(marcas.filter(([, m]) => m.ok === true).map(([c]) => c));
  if (tarea.criterios.length > 0 && tarea.criterios.every((c) => ok.has(c))) return "hecha";
  if (marcas.length > 0) return "verificando";
  return tarea.agentes.length > 0 ? "en-curso" : "propuesta";
}
