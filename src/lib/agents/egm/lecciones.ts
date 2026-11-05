/**
 * EGM · «Resolver = aprender» (contrato architecture/repos-libreria-1104.md §2).
 * Las objeciones bloquea/importa que el elefante corrige o rechaza vuelven al
 * cerebro del perfil como recuerdos de tipo «leccion». Hechos, no opiniones:
 * se guarda qué objetó el pez, con qué gravedad, qué se cambió o por qué se
 * rechazó, y la fecha. Las «menor» no se guardan.
 */
import type { CreateBrainMemoryInput } from "@/lib/cerebro/brain-memories";

export type GravedadObjeccion = "bloquea" | "importa" | "menor";

export interface Objeccion {
  id: string;
  gravedad: GravedadObjeccion;
  texto: string;
  pez?: string;
}

export interface Resolucion {
  objecionId: string;
  correccion: string;
}

export interface Rechazo {
  objecionId: string;
  porque: string;
}

export interface LeccionesEntrada {
  perfilId: string;
  cerebroId: string;
  objeciones: Objeccion[];
  resueltas: Resolucion[];
  rechazadas: Rechazo[];
  fecha: string;
}

function resumen(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > 60 ? `${limpio.slice(0, 57)}…` : limpio;
}

function contenido(
  objecion: Objeccion,
  fecha: string,
  estado: "resuelta" | "rechazada",
  final: string,
): string {
  const pez = objecion.pez ? ` · pez ${objecion.pez}` : "";
  return [
    `Lección de revisión EGM del ${fecha}.`,
    "",
    `Objeción (${objecion.gravedad}${pez}) — ${estado}: ${objecion.texto.trim()}`,
    "",
    `${final}`,
  ].join("\n");
}

export function leccionesDe(entrada: LeccionesEntrada): CreateBrainMemoryInput[] {
  const { perfilId, cerebroId, objeciones, resueltas, rechazadas, fecha } = entrada;
  if (!cerebroId) return [];
  const porId = new Map(objeciones.map((o) => [o.id, o]));

  const lecciones: CreateBrainMemoryInput[] = [];
  for (const { objecionId, correccion } of resueltas) {
    const o = porId.get(objecionId);
    if (!o || o.gravedad === "menor") continue;
    lecciones.push({
      brainId: cerebroId,
      name: `Lección EGM · ${resumen(o.texto)}`,
      kinds: ["leccion", "egm"],
      format: "markdown",
      content: contenido(o, fecha, "resuelta", `Corrección aplicada a «${perfilId}»: ${correccion.trim()}`),
    });
  }
  for (const { objecionId, porque } of rechazadas) {
    const o = porId.get(objecionId);
    if (!o || o.gravedad === "menor") continue;
    lecciones.push({
      brainId: cerebroId,
      name: `Lección EGM · ${resumen(o.texto)}`,
      kinds: ["leccion", "egm"],
      format: "markdown",
      content: contenido(o, fecha, "rechazada", `Rechazada en «${perfilId}» porque: ${porque.trim()}`),
    });
  }
  return lecciones;
}
