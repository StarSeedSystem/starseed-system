// Modos de ejecución de una app en la malla (architecture/apps-en-la-malla.md §5, tarea N · Ola 1017A)
// Puro: sin node:*, sin red, sin disco y sin reloj. La neurona y el plan de la bolsa llegan como datos.

import type { OfertaNeurona } from "./oferta";

/** Las cinco formas de abrir una app (§5). Sin campo, una app solo admite «local». */
export type ModoEjecucion = "local" | "por-bandas" | "montada" | "transmitida" | "ramificada";

/** Lo que la app necesita para correr; sin requisitos, cabe en cualquier neurona. */
export interface RequisitosApp {
  ramMb?: number;
  gpu?: boolean;
  /** Motores prestables que la app usa (imagen, voz, oído, palabra, transcodificar…). */
  motores?: string[];
  /** Volumen por bandas donde vive la app o sus recursos pesados (§7). */
  volumen?: string;
}

/** Lo que la red ofrece a la neurona para abrir la app (salida de la bolsa, §4). */
export interface PlanApertura {
  /** Nodos que sirven el volumen de la app, del más rápido al más lento. */
  fuentesVolumen?: string[];
  /** Otra neurona o servidor que tiene la app prestable y su latencia medida. */
  otraConLaApp?: { nodoId: string; latenciaMs: number };
  /** Parte de cálculo que otra neurona aporta a una apertura ramificada. */
  calculoRemoto?: { nodoId: string; ramMb: number; gpu: boolean; motores: string[] };
  /** Pasarela local (§7) disponible para ver el volumen como disco del sistema. */
  pasarelaLocal?: boolean;
}

/** Dónde se abre y por qué: el motivo es legible para el menú «Abrir en…» (§12). */
export interface DecisionApertura {
  modo: ModoEjecucion;
  destino: string;
  motivo: string;
}

/** Latencia máxima medida para aceptar una ventana transmitida (§9). */
export const TOPE_LATENCIA_TRANSMITIDA_MS = 80;

/** Lo mínimo que `comoAbrir` lee de una app del catálogo. */
export interface AppConModos {
  ejecucion?: ModoEjecucion[];
  requisitos?: RequisitosApp;
}

/** Formas que admite una app; sin campo, solo «local» (regla del catálogo). */
export function modosAdmitidos(app: AppConModos): ModoEjecucion[] {
  return app.ejecucion && app.ejecucion.length > 0 ? app.ejecucion : ["local"];
}

/** Recursos que a esta neurona le faltan para correr la app en local. */
function faltantesDe(app: AppConModos, neurona: OfertaNeurona): string[] {
  const req = app.requisitos ?? {};
  const faltan: string[] = [];
  if (req.ramMb !== undefined && neurona.computo.ramLibreMb < req.ramMb) faltan.push("RAM libre");
  if (req.gpu && !neurona.computo.gpu) faltan.push("GPU");
  if (req.motores) {
    const ausentes = req.motores.filter((m) => !neurona.computo.motores.includes(m));
    if (ausentes.length > 0) faltan.push("motores " + ausentes.join(", "));
  }
  return faltan;
}

/** Si el volumen de la app está en la neurona o lo sirve alguien de la red. */
function volumenAlcanzable(app: AppConModos, neurona: OfertaNeurona, plan: PlanApertura): boolean {
  const volumen = app.requisitos?.volumen;
  if (!volumen) return false;
  return neurona.almacen.volumenes.includes(volumen) || (plan.fuentesVolumen?.length ?? 0) > 0;
}

/** Si la parte remota de cálculo cubre los requisitos que aquí no se tienen. */
function cubreCalculo(req: RequisitosApp, calc: { ramMb: number; gpu: boolean; motores: string[] }): boolean {
  if (req.gpu && !calc.gpu) return false;
  if (req.ramMb !== undefined && calc.ramMb < req.ramMb) return false;
  return (req.motores ?? []).every((m) => calc.motores.includes(m));
}

/** Elige modo de apertura con su motivo: local si cabe; luego bandas, transmitida y ramificada; suelo local con aviso. */
export function comoAbrir(app: AppConModos, neurona: OfertaNeurona, plan: PlanApertura): DecisionApertura {
  const modos = modosAdmitidos(app);
  const admite = (m: ModoEjecucion) => modos.includes(m);
  const req = app.requisitos ?? {};
  const volumen = req.volumen;
  const faltan = faltantesDe(app, neurona);
  const fuente = plan.fuentesVolumen?.[0] ?? neurona.nodoId;
  if (faltan.length === 0 && volumen !== undefined && volumenAlcanzable(app, neurona, plan)) {
    if (admite("montada") && plan.pasarelaLocal) {
      return { modo: "montada", destino: fuente, motivo: `El volumen «${volumen}» se ve como disco por la pasarela local` };
    }
    if (admite("por-bandas")) {
      return { modo: "por-bandas", destino: fuente, motivo: `El volumen «${volumen}» llega por bandas y solo se baja lo que se usa` };
    }
  }
  if (faltan.length === 0) {
    if (admite("local")) {
      const sinVolumen = volumen !== undefined && !volumenAlcanzable(app, neurona, plan);
      const aviso = sinVolumen ? `; el volumen «${volumen}» aún sin fuente en la malla` : "";
      return { modo: "local", destino: neurona.nodoId, motivo: `La app cabe en esta neurona${aviso}` };
    }
  } else {
    const otra = plan.otraConLaApp;
    if (admite("transmitida") && otra && otra.latenciaMs <= TOPE_LATENCIA_TRANSMITIDA_MS) {
      return { modo: "transmitida", destino: otra.nodoId, motivo: `Aquí falta ${faltan.join(" ni ")}; ${otra.nodoId} tiene la app y sirve la ventana con ${otra.latenciaMs} ms` };
    }
    const calc = plan.calculoRemoto;
    if (admite("ramificada") && calc && cubreCalculo(req, calc)) {
      return { modo: "ramificada", destino: calc.nodoId, motivo: `La interfaz va en local y el cálculo va a ${calc.nodoId}, que aporta lo que aquí falta` };
    }
  }
  const modoSuelo: ModoEjecucion = admite("local") ? "local" : modos[0];
  const sinFuente = volumen !== undefined && !volumenAlcanzable(app, neurona, plan);
  const avisos: string[] = [];
  if (faltan.length > 0) avisos.push(`falta ${faltan.join(" ni ")}`);
  if (sinFuente) avisos.push(`el volumen «${volumen}» sin fuente en la malla`);
  if (avisos.length === 0) avisos.push("el modo pedido no está disponible");
  return { modo: modoSuelo, destino: neurona.nodoId, motivo: `Suelo: se abre como se pueda; ${avisos.join("; ")}` };
}
