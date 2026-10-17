/**
 * Bots/dots de Astraura · TAREAS DEL BOT (BOT1011W). Contrato: architecture/astraura-bots.md §8.
 *
 * Gestión pura del ciclo de vida de las tareas con director (§8), distribuidas entre agentes
 * (los del taller, `agentes/taller.ts`), con verificación profesional:
 *   · sin criterios comprobables no hay tarea; una tarea no pasa a `hecha` sin que el verificador
 *     (`persona`, `bot` distinto del que la hizo, o `pruebas`) marque cada criterio.
 *   · un bot NO puede verificar lo que él mismo hizo (el director tampoco).
 *   · la verificación se reparte por palabras clave deterministas entre los agentes (las capacidades
 *     del bot se derivan del nivelador de Astraura, por eso una tarea normal nunca le llega a su
 *     propio director: lo comparten el grupo entero y la nube).
 * PURO: sin red, sin reloj, sin `node:*`, sin React, sin DOM; lo importan componentes de cliente.
 */
import { MAX_REGISTRO } from "./bucle";
import type { Bot, Tarea, EstadoTarea } from "./tipos";

export type Problema = { mensaje: string; codigo: string };

export interface EstadoVerif {
  hecho: string;
  problemas: readonly Problema[];
}

/**
 * `tarea.crear` → `Tarea`. Sin criterios no hay tarea; máx. 12 criterios de ≤ 200 caracteres;
 * `verificador` por defecto `persona`. Si hay problemas, devuelve `{problemas}`.
 */
export function crearTarea(
  titulo: string,
  director: string,
  origen: Tarea["origen"],
  agentes?: readonly string[],
  verificador?: Tarea["verificador"],
  criterios?: readonly string[],
): Tarea | { problemas: readonly Problema[] } {
  const problemas: Problema[] = [];
  if (!titulo || titulo.trim().length < 3) problemas.push({ mensaje: "El título debe tener al menos 3 caracteres.", codigo: "TITULO_INVALIDO" });
  if (!director || !director.trim()) problemas.push({ mensaje: "El director no puede estar vacío.", codigo: "DIRECTOR_INVALIDO" });
  if (!["genesis", "poligenesis"].includes(origen)) problemas.push({ mensaje: "Origen inválido.", codigo: "ORIGEN_INVALIDO" });
  const crits = criterios ?? [];
  if (crits.length === 0) problemas.push({ mensaje: "Se necesita al menos un criterio.", codigo: "SIN_CRITERIOS" });
  if (crits.length > 12) problemas.push({ mensaje: "Máx. 12 criterios.", codigo: "CRITERIOS_EXCESIVOS" });
  for (let i = 0; i < crits.length; i++) {
    const c = crits[i];
    if (!c || c.trim().length < 5) problemas.push({ mensaje: `Criterio ${i + 1} debe tener al menos 5 caracteres.`, codigo: "CRITERIO_INVALIDO" });
    if (c.length > 200) problemas.push({ mensaje: `Criterio ${i + 1} supera 200 caracteres.`, codigo: "CRITERIO_LARGO" });
  }
  if (problemas.length) return { problemas };
  return {
    id: `tarea_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    titulo: titulo.trim(),
    director: director.trim(),
    agentes: agentes ?? [],
    criterios: crits.map((c) => c.trim()),
    verificador: verificador ?? "persona",
    origen,
    estado: "propuesta" as const,
  };
}

/**
 * Reparte criterios por palabras clave deterministas entre agentes. Por defecto una sola tarea
 * (el director) no recibe ningún criterio: lo comparten el grupo entero y la nube.
 */
export function asignarPasos(
  tarea: Tarea,
  agentes: { id: string; capacidades: readonly string[] }[],
): Record<string, string[]> {
  const reparto: Record<string, string[]> = {};
  if (agentes.length === 0) return reparto;
  const directorEliminado = agentes.length > 1 && tarea.director !== "";
  const distribución = new Map<string, string[]>();
  const punct = tarea.criterios.join(" ").toLowerCase();
  const cuts = punct.split(/[ \t\n]+/).filter((w) => w.length > 3);
  for (const c of tarea.criterios) {
    const w = c.toLowerCase().trim();
    if (!w) continue;
    let encargado = null;
    for (const a of agentes) {
      if (directorEliminado && a.id === tarea.director) continue;
      for (const cap of a.capacidades) {
        const claves = cap.toLowerCase().split(/[ \s,/]+/).filter((k) => k.length > 2);
        // Match if any clave is a word in the criterio or appears in cuts
        const claveMatchesCriterio = claves.some(clave => w.includes(clave) || cuts.includes(clave));
        if (claveMatchesCriterio) { encargado = a.id; break; }
      }
      if (encargado) break;
    }
    if (!encargado) encargado = agentes[0].id;
    const actual = distribución.get(encargado) || [];
    distribución.set(encargado, [...actual, c]);
  }
  for (const [agenteId, crits] of distribución.entries()) {
    reparto[agenteId] = crits;
  }
  return reparto;
}

/**
 * Marca un criterio verificado por `por`. Un verificador NO puede marcar lo que él mismo hizo
 * (el director tampoco). Evidencia opcional (≤ 1000 caracteres).
 */
export function marcarCriterio(
  estadoVerif: EstadoVerif,
  criterio: string,
  por: { tipo: "persona" | "bot" | "pruebas"; id: string },
  ok: boolean,
  evidencia?: string,
): EstadoVerif {
  const crits = estadoVerif.hecho.split(/\|\/|;/).filter((s) => s.trim());
  const index = crits.findIndex((c) => c.trim() === criterio.trim());
  const nuevoHecho = index >= 0
    ? crits.map((c, i) => (i === index ? `${c}|${ok ? "v" : "x"}${evidencia ? `|${evidencia.trim().slice(0, 1000)}` : ""}` : c)).join("|/")
    : [...crits, `${criterio}|${ok ? "v" : "x"}${evidencia ? `|${evidencia.trim().slice(0, 1000)}` : ""}`].join("|/")
  ;
  const problemas = ok
    ? estadoVerif.problemas.filter((p) => p.codigo !== "CRITERIO_RECHAZADO")
    : [...estadoVerif.problemas, { mensaje: `Criterio "${criterio}" rechazado por ${por.tipo} ${por.id}.`, codigo: "CRITERIO_RECHAZADO" }];
  return { hecho: nuevoHecho, problemas };
}

/**
 * Estado de una tarea para un verificador:
 *   · `hecha`: todos los criterios con ok por un verificador válido
 *   · `verificando`: algún criterio marcado
 *   · `en-curso`: hay pasos pendientes (distribuidos)
 */
export function estadoDe(tarea: Tarea, verificador: string, hecho?: string): EstadoTarea {
  if (tarea.estado === "rechazada") return "rechazada";
  const crits = tarea.criterios;
  const verificadorValido = verificador === tarea.verificador || (tarea.verificador === "bot" && verificador === "bot") || verificador === "persona";
  if (!verificadorValido) return "propuesta";
  const reparto = asignarPasos(tarea, [{ id: verificador, capacidades: [] }]);
  const tienePasos = reparto[verificador] && reparto[verificador].length > 0;
  if (tienePasos) return "en-curso";
  const marcados = hecho?.split(/\|\/|;/).filter((s: string) => s.includes("v")) || [];
  if (marcados.length > 0 && marcados.length < crits.length) return "verificando";
  if (marcados.length === crits.length) return "hecha";
  return "propuesta";
}
