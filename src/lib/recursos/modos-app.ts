// Modos de apertura de apps por la malla (§5 · architecture/apps-en-la-malla.md).
// PURO: decide cómo abrir una app en una neurona con el plan de la bolsa.
import type { OfertaNeurona } from "./oferta";
import type { ResultadoPlanificacion } from "./bolsa";

/** Las cinco formas de abrir una app (§5). */
export type ModoApp =
  | "local"
  | "por-bandas"
  | "montada"
  | "transmitida"
  | "ramificada";

/** Lo que la app necesita para correr en una neurona. */
export interface RequisitosApp {
  ramMb?: number;
  gpu?: boolean;
  motores?: string[];
  /** Nombre del volumen por bandas que la app usa (§7). */
  volumen?: string;
}

/** Forma estructural mínima de una app del catálogo para decidir el modo. */
export interface AppConModos {
  id: string;
  /** Modos que la app admite. Sin campo = ['local'] (como hoy). */
  ejecucion?: ModoApp[];
  requisitos?: RequisitosApp;
}

/** Qué decide `comoAbrir`: el modo, dónde se abre y por qué (legible). */
export interface DecisionApertura {
  modo: ModoApp;
  destino: string;
  motivo: string;
}

/** Capacidad prestable mínima que se consulta (de `capacidadPrestable`). */
export type PrestableMin = Pick<OfertaNeurona, "computo" | "almacen">;

/**
 * Qué requisitos quedan sin cubrir en la neurona, en texto legible.
 * Sin requisitos → sin faltas.
 */
export function faltasDe(requisitos: RequisitosApp | undefined, prestable: PrestableMin): string[] {
  if (!requisitos) return [];
  const faltas: string[] = [];
  if (requisitos.ramMb !== undefined && prestable.computo.ramLibreMb < requisitos.ramMb) {
    faltas.push(`RAM ${requisitos.ramMb} MB`);
  }
  if (requisitos.gpu && !prestable.computo.gpu) faltas.push("GPU");
  for (const motor of requisitos.motores ?? []) {
    if (!prestable.computo.motores.includes(motor)) faltas.push(`motor ${motor}`);
  }
  if (requisitos.volumen && !prestable.almacen.volumenes.includes(requisitos.volumen)) {
    faltas.push(`volumen ${requisitos.volumen}`);
  }
  return faltas;
}

export function modosDe(app: AppConModos): ModoApp[] {
  return app.ejecucion ?? ["local"];
}

/**
 * Decide cómo abrir la app en la neurona (§5):
 * local si cabe · por-bandas si falta el volumen · transmitida si otra
 * neurona la presta y la latencia sirve · ramificada si solo falta
 * cómputo · suelo: local avisando de lo que falta.
 */
export function comoAbrir(
  app: AppConModos,
  neurona: OfertaNeurona,
  plan: ResultadoPlanificacion,
): DecisionApertura {
  const modos = modosDe(app);
  const prestable = { computo: neurona.computo, almacen: neurona.almacen };
  const faltas = faltasDe(app.requisitos, prestable);
  const casa = neurona.nodoId;

  if (faltas.length === 0) {
    return { modo: "local", destino: casa, motivo: "Cubre los requisitos en esta neurona" };
  }
  const faltaSoloVolumen = faltas.every((f) => f.startsWith("volumen "));
  const faltaSoloComputo = faltas.every((f) => f.startsWith("RAM ") || f === "GPU" || f.startsWith("motor "));

  if (modos.includes("por-bandas") && faltaSoloVolumen) {
    const fuente = plan.porParte.bytes?.[0];
    if (fuente) {
      return {
        modo: "por-bandas",
        destino: fuente.destino,
        motivo: `Solo falta el volumen: se baja por bandas de ${fuente.destino}`,
      };
    }
  }
  if (modos.includes("transmitida")) {
    const ventana = plan.porParte.ventana?.[0];
    if (ventana) {
      return {
        modo: "transmitida",
        destino: ventana.destino,
        motivo: `Corre en ${ventana.destino} y la ventana llega en directo por la malla`,
      };
    }
  }
  if (faltaSoloVolumen && modos.includes("montada")) {
    const fuente = plan.porParte.bytes?.[0];
    if (fuente) {
      return {
        modo: "montada",
        destino: fuente.destino,
        motivo: `El volumen de ${fuente.destino} se monta en la pasarela local`,
      };
    }
  }
  if (modos.includes("ramificada") && faltaSoloComputo) {
    const computo = plan.porParte.computo?.[0];
    if (computo) {
      return {
        modo: "ramificada",
        destino: computo.destino,
        motivo: `Interfaz en ${casa}; el cálculo va en ${computo.destino}`,
      };
    }
  }
  const avisos = faltas.join(", ");
  return {
    modo: "local",
    destino: casa,
    motivo: `Suelo: se abre en local con lo que hay; falta ${avisos}`,
  };
}
