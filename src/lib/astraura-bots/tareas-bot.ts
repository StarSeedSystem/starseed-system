/**
 * Bots/dots de Astraura · TAREAS con director (BOT1011W · 2026-10-11).
 * Contrato: architecture/astraura-bots.md §8 (tareas con director y verificación profesional).
 *
 * Una tarea la crea Genesis (persona) o PoliGenesis (entidad); el director reparte los criterios
 * entre los agentes y SOLO se cierra cuando un verificador válido marca cada criterio:
 * `persona`, `pruebas`, o un `bot` distinto del que hizo ese paso y distinto del director.
 * Módulo PURO: sin red, sin reloj, sin `node:*`.
 */
import type { EstadoTarea, Tarea } from "./tipos";

export const MAX_CRITERIOS = 12;
export const MAX_LARGO_CRITERIO = 200;

/** Quién firma la verificación de un criterio. */
export interface Verificante {
  tipo: "persona" | "bot" | "pruebas";
  id: string;
}

/** Paso asignado: qué criterio trabaja qué agente. */
export interface Paso {
  criterio: string;
  agenteId: string;
}

/** Marca de verificación de un criterio. */
export interface Marca {
  ok: boolean;
  por: Verificante;
  evidencia?: string;
}

/** Estado vivo de la verificación: pasos repartidos y marcas recibidas. */
export interface EstadoVerif {
  director: string;
  pasos: readonly Paso[];
  marcas: Readonly<Record<string, Marca>>;
}

export type Resultado<T> = { ok: T } | { problemas: string[] };

/* Palabras clave deterministas por capacidad (orden estable, sin azar ni reloj). */
const CLAVES: readonly [string, string][] = [
  ["codigo", "código"], ["test", "prueba"], ["diseno", "diseño"], ["ui", "interfaz"],
  ["datos", "datos"], ["red", "red"], ["texto", "redactar"], ["voz", "audio"],
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Crea una tarea válida o devuelve los problemas. Sin criterios no hay tarea. */
export function crearTarea(
  args: { titulo: string; agentes: readonly string[]; criterios: readonly string[]; verificador?: Tarea["verificador"]; id?: string },
  director: string,
  origen: "genesis" | "poligenesis",
): Resultado<Tarea> {
  const problemas: string[] = [];
  const criterios = args.criterios.map((c) => c.trim()).filter(Boolean);
  if (!args.titulo.trim()) problemas.push("Falta el título de la tarea.");
  if (!director.trim()) problemas.push("La tarea necesita un bot director.");
  if (criterios.length === 0) problemas.push("Sin criterios comprobables no hay tarea.");
  if (criterios.length > MAX_CRITERIOS) problemas.push(`Máximo ${MAX_CRITERIOS} criterios por tarea.`);
  if (criterios.some((c) => c.length > MAX_LARGO_CRITERIO))
    problemas.push(`Cada criterio cabe en ${MAX_LARGO_CRITERIO} caracteres.`);
  if (problemas.length > 0) return { problemas };
  return {
    ok: {
      id: args.id ?? `tarea-${norm(args.titulo).replace(/[^a-z0-9]+/g, "-")}`,
      titulo: args.titulo.trim(),
      director,
      agentes: args.agentes,
      criterios,
      verificador: args.verificador ?? "persona",
      origen,
      estado: "propuesta",
    },
  };
}

/**
 * Reparte los criterios entre agentes por palabras clave, de forma determinista:
 * mismo criterio + mismos agentes → mismo reparto. El director solo trabaja si no hay más agentes.
 */
export function asignarPasos(
  tarea: Pick<Tarea, "criterios" | "director">,
  agentes: readonly { id: string; capacidades: string[] }[],
): Paso[] {
  const lista = agentes.filter((a) => a.id !== tarea.director);
  const obreros = lista.length > 0 ? lista : agentes.filter((a) => a.id === tarea.director);
  if (obreros.length === 0) return tarea.criterios.map((c) => ({ criterio: c, agenteId: tarea.director }));
  return tarea.criterios.map((criterio, i) => {
    const texto = norm(criterio);
    const elegido =
      obreros.find((a) => a.capacidades.some((cap) => texto.includes(norm(cap)))) ??
      obreros.find((a) =>
        CLAVES.some(([cap, clave]) => a.capacidades.includes(cap) && texto.includes(clave)),
      ) ??
      obreros[i % obreros.length];
    return { criterio, agenteId: elegido.id };
  });
}

/** Estado de verificación vacío, listo para recibir marcas. */
export function iniciarVerificacion(tarea: Pick<Tarea, "director">, pasos: readonly Paso[]): EstadoVerif {
  return { director: tarea.director, pasos, marcas: {} };
}

/**
 * Marca un criterio como superado (o no). Un `bot` NO puede verificar lo que él mismo hizo:
 * ni el criterio que tenía asignado, ni nada si es el director. Devuelve el estado nuevo o el problema.
 */
export function marcarCriterio(
  estado: EstadoVerif,
  criterio: string,
  por: Verificante,
  ok: boolean,
  evidencia?: string,
): Resultado<EstadoVerif> {
  const paso = estado.pasos.find((p) => p.criterio === criterio);
  if (!paso) return { problemas: [`El criterio «${criterio}» no pertenece a esta tarea.`] };
  if (por.tipo === "bot" && por.id === estado.director)
    return { problemas: ["El director no verifica su propia tarea: lo hace una persona, pruebas u otro bot."] };
  if (por.tipo === "bot" && por.id === paso.agenteId)
    return { problemas: ["Un bot no puede verificar lo que él mismo hizo."] };
  const marca: Marca = { ok, por, ...(evidencia ? { evidencia } : {}) };
  return { ok: { ...estado, marcas: { ...estado.marcas, [criterio]: marca } } };
}

/**
 * Estado de la tarea: `hecha` solo con TODOS los criterios marcados ok por un verificador válido;
 * `verificando` si hay marcas; `en-curso` si hay pasos; si no, sigue `propuesta`.
 */
export function estadoDe(tarea: Pick<Tarea, "criterios">, verif: EstadoVerif): EstadoTarea {
  const marcas = tarea.criterios.map((c) => verif.marcas[c]);
  if (marcas.length > 0 && marcas.every((m) => m?.ok)) return "hecha";
  if (marcas.some(Boolean)) return "verificando";
  if (verif.pasos.length > 0) return "en-curso";
  return "propuesta";
}
