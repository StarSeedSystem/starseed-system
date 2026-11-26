export type Motivo = "nube-rechazada" | "sin-cambios" | "cerrada-por-otra-ola" | "sin-datos";
export type Accion = "corregir-y-verificar" | "no-repetir" | "reintentar";

export interface Vuelta {
  nota: string;
  estado?: string | null;
}

export interface Decision {
  accion: Accion;
  motivo: Motivo;
  razon: string;
}

const ESTADOS_CERRADOS = new Set([
  "rechazada", "integrada", "hecha", "cerrada", "duplicada", "superada",
]);

export function dichoPorLaNube(nota: string): string | null {
  const coincide = /la nube dijo «([^»]+)»/.exec(nota ?? "");
  return coincide ? coincide[1].trim().toLowerCase() : null;
}

export function cerradaPorOtraOla(estado?: string | null): boolean {
  return ESTADOS_CERRADOS.has((estado ?? "").trim().toLowerCase());
}

export function yaSeReabrioPorRechazo(notas: readonly string[], nota: string): boolean {
  const dicho = dichoPorLaNube(nota);
  if (dicho !== "rechazada") return false;
  return notas.some((anterior) => dichoPorLaNube(anterior) === dicho);
}

export function decidirVuelta({ nota, estado }: Vuelta): Decision {
  if (cerradaPorOtraOla(estado)) {
    return {
      accion: "no-repetir",
      motivo: "cerrada-por-otra-ola",
      razon: "progreso.json ya la cerró: no la repito, dejo cerrada la tarea y lo aviso en el canal.",
    };
  }
  const dicho = dichoPorLaNube(nota ?? "");
  if (dicho === "rechazada" || dicho === "sin_cambios") {
    return {
      accion: "corregir-y-verificar",
      motivo: dicho === "rechazada" ? "nube-rechazada" : "sin-cambios",
      razon: "La nube terminó el run sin entregar: corrijo la causa escrita, escribo el archivo declarado, paso tsc y vitest y no la relanzo igual.",
    };
  }
  return {
    accion: "reintentar",
    motivo: "sin-datos",
    razon: "Sin veredicto cerrado: reintento una vez con otro proveedor y relevo ante 429/402 sin insistir.",
  };
}
