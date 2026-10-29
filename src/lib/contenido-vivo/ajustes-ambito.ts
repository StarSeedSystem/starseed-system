/**
 * Ajustes por ámbito y libro de créditos de «Contenido vivo» (CVV1028, tarea C).
 * Módulo PURO: sin red, sin React y sin `node:*`. La persistencia la decide quien llama.
 */
import type { TareaViva } from "./tipos";

export type AprobacionContenidoVivo = "yo" | "democratica" | "personas";

export interface AjustesContenidoVivo {
  localPrimero: boolean; externosPermitidos: string[]; topeCreditosMes: number;
  aprobacion: AprobacionContenidoVivo; personas?: string[];
}

/** Instante del libro: milisegundos de época, texto ISO o `Date`. */
export type InstanteCredito = number | string | Date;

export interface AsientoCreditos {
  t: InstanteCredito; ambito: string; servicio: string; modelo: string;
  creditos: number; tarea: TareaViva; aprobadoPor: string;
}

export interface DecisionGasto { si: boolean; motivo: string }

export const TOPE_CREDITOS_MAXIMO = 1_000_000;
export const MAX_EXTERNOS = 20;
export const MAX_PERSONAS = 50;
const MAX_TEXTO = 80;

export const AJUSTES_POR_DEFECTO: AjustesContenidoVivo = {
  localPrimero: true, externosPermitidos: [], topeCreditosMes: 0, aprobacion: "yo",
};

const texto = (valor: unknown): string =>
  typeof valor === "string" ? valor.trim().slice(0, MAX_TEXTO) : "";

/** Recorta, quita vacíos, deduplica sin distinguir mayúsculas y limita una lista de textos. */
const lista = (valor: unknown, maximo: number): string[] => {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>(); const salida: string[] = [];
  for (const item of valor) {
    const limpio = texto(item); const clave = limpio.toLowerCase();
    if (!limpio || vistos.has(clave)) continue;
    vistos.add(clave); salida.push(limpio);
    if (salida.length >= maximo) break;
  }
  return salida;
};

const aprobacionValida = (valor: unknown): AprobacionContenidoVivo =>
  valor === "democratica" || valor === "personas" ? valor : "yo";

export function validarAjustes(entrada?: Partial<AjustesContenidoVivo> | null): AjustesContenidoVivo {
  const bruto = entrada ?? {};
  const tope = typeof bruto.topeCreditosMes === "number" && Number.isFinite(bruto.topeCreditosMes)
    ? Math.min(TOPE_CREDITOS_MAXIMO, Math.max(0, bruto.topeCreditosMes)) : 0;
  const aprobacion = aprobacionValida(bruto.aprobacion);
  const personas = lista(bruto.personas, MAX_PERSONAS);
  const ajustes: AjustesContenidoVivo = {
    localPrimero: typeof bruto.localPrimero === "boolean" ? bruto.localPrimero : true,
    externosPermitidos: lista(bruto.externosPermitidos, MAX_EXTERNOS),
    topeCreditosMes: tope, aprobacion,
  };
  if (aprobacion === "personas" || personas.length > 0) ajustes.personas = personas;
  return ajustes;
}

/** Convierte un instante a milisegundos; `NaN` si no se puede leer. */
const aMs = (valor: InstanteCredito | null | undefined): number => {
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === "number") return valor;
  if (typeof valor === "string") return Date.parse(valor);
  return Number.NaN;
};

/** Créditos gastados en el mes natural (UTC) de `ahora`; ignora fechas y créditos ilegibles. */
export function gastadoEnMes(asientos: readonly AsientoCreditos[], ahora: InstanteCredito): number {
  const referencia = aMs(ahora);
  if (!Number.isFinite(referencia)) return 0;
  const fecha = new Date(referencia); const anio = fecha.getUTCFullYear(); const mes = fecha.getUTCMonth();
  let total = 0;
  for (const asiento of asientos ?? []) {
    if (!asiento || !Number.isFinite(asiento.creditos) || asiento.creditos <= 0) continue;
    const instante = aMs(asiento.t);
    if (!Number.isFinite(instante)) continue;
    const suya = new Date(instante);
    if (suya.getUTCFullYear() !== anio || suya.getUTCMonth() !== mes) continue;
    total += asiento.creditos;
  }
  return total;
}

/** Sin tope no se gasta; «democratica» pide propuesta; «personas» solo aprueba su lista. */
export function puedeGastar(
  ajustes: Partial<AjustesContenidoVivo> | null | undefined,
  gastado: number, cotizacion: number, quien: string,
): DecisionGasto {
  const config = validarAjustes(ajustes);
  const yaGastado = Number.isFinite(gastado) && gastado > 0 ? gastado : 0;
  const coste = Number.isFinite(cotizacion) && cotizacion > 0 ? cotizacion : 0;
  const pide = texto(quien);
  if (coste === 0) return { si: false, motivo: "La cotización no es válida: no se gasta sin saber cuántos créditos cuesta." };
  if (config.topeCreditosMes <= 0) return { si: false, motivo: "Sin tope de créditos configurado no se gasta." };
  if (config.aprobacion === "democratica") return { si: false, motivo: "Hace falta una propuesta democrática aprobada antes de gastar." };
  const restante = config.topeCreditosMes - yaGastado;
  if (coste > restante) return { si: false, motivo: `La cotización (${coste}) supera lo que queda del mes (${Math.max(0, restante)}).` };
  if (!pide) return { si: false, motivo: "Hace falta saber quién pide el gasto." };
  if (config.aprobacion === "personas") {
    const permitidas = config.personas ?? [];
    const autorizada = permitidas.some((persona) => persona.toLowerCase() === pide.toLowerCase());
    if (!autorizada) {
      return { si: false, motivo: permitidas.length > 0
        ? `Solo pueden aprobar: ${permitidas.join(", ")}.`
        : "No hay personas autorizadas para aprobar este gasto." };
    }
    return { si: true, motivo: `${pide} está en la lista de personas que aprueban.` };
  }
  return { si: true, motivo: "Lo apruebas tú: la cotización cabe en el tope del mes." };
}
