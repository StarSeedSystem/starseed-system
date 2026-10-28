// Modos de apertura de apps en la malla (architecture/apps-en-la-malla.md §5 · Ola 1017A).
// Puro: decide cómo abrir una app con lo que ofrece la neurona local y el plan que ya
// calculó la bolsa (src/lib/recursos/bolsa.ts). Sin node:*, sin red, sin disco, sin reloj.

import type { ResultadoParte, ResultadoPlanificacion } from "./bolsa";
import type { OfertaNeurona } from "./oferta";

/** Las cinco formas de abrir una app desde cualquier neurona (§5). */
export type ModoEjecucion = "local" | "por-bandas" | "montada" | "transmitida" | "ramificada";

/** Lo que la app necesita para poder correr; el volumen se lee por bandas (§7). */
export interface RequisitosApp {
  ramMb?: number;
  gpu?: boolean;
  motores?: string[];
  volumen?: string;
}

/** Lo mínimo que comoAbrir necesita de una app: estructura, sin copiar el catálogo. */
export interface AppParaAbrir {
  id: string;
  ejecucion?: ModoEjecucion[];
  requisitos?: RequisitosApp;
}

/** Cómo la malla abre la app: modo, destino (nodo o «local») y el motivo legible. */
export interface EleccionApertura {
  modo: ModoEjecucion;
  destino: string;
  motivo: string;
}

/** Lo que la neurona local no cumple de lo que la app pide. */
type Falta =
  | { clase: "ram"; pedidaMb: number; disponibleMb: number }
  | { clase: "gpu" }
  | { clase: "motores"; faltan: string[] };

function faltaEnLocal(req: RequisitosApp, neurona: OfertaNeurona): Falta[] {
  const falta: Falta[] = [];
  const { computo } = neurona;
  if (req.ramMb !== undefined && computo.ramLibreMb < req.ramMb)
    falta.push({ clase: "ram", pedidaMb: req.ramMb, disponibleMb: computo.ramLibreMb });
  if (req.gpu && !computo.gpu) falta.push({ clase: "gpu" });
  const faltan = (req.motores ?? []).filter((m) => !computo.motores.includes(m));
  if (faltan.length > 0) falta.push({ clase: "motores", faltan });
  return falta;
}

/** La falta en palabras, para el aviso del suelo. */
function faltaLegible(f: Falta): string {
  if (f.clase === "ram") return `RAM ${f.pedidaMb} MB (libres ${f.disponibleMb} MB)`;
  if (f.clase === "gpu") return "GPU";
  return `motores ${f.faltan.join(", ")}`;
}

/** Solo falta memoria: las bandas y el montaje la ahorran; sin GPU ni motores, no hay modo. */
function soloMemoria(falta: Falta[]): boolean {
  return falta.every((f) => f.clase === "ram");
}

/** Primera fuente del plan para una parte de la petición (computo, bytes o ventana). */
function primeraFuente(plan: ResultadoPlanificacion, clase: string): ResultadoParte | undefined {
  return plan.porParte[clase]?.[0];
}

/** Elige modo, destino y motivo por la regla del §5; suelo «local» con lo que falta (§4 regla 7). */
export function comoAbrir(
  app: AppParaAbrir,
  neurona: OfertaNeurona,
  plan: ResultadoPlanificacion = { porParte: {} }
): EleccionApertura {
  const permitidos: ModoEjecucion[] = app.ejecucion ?? ["local"];
  const req: RequisitosApp = app.requisitos ?? {};
  const falta = faltaEnLocal(req, neurona);
  const orden = ["local", "por-bandas", "montada", "transmitida", "ramificada"] as const;
  for (const modo of orden) {
    if (!permitidos.includes(modo)) continue;
    const fuente = primeraFuente(plan, "bytes");
    if (modo === "local" && falta.length === 0) {
      return { modo, destino: "local", motivo: "La neurona cumple lo que pide la app: se abre en local." };
    }
    if (modo === "por-bandas" && req.volumen && soloMemoria(falta)) {
      const destino = fuente?.destino ?? "local";
      const deDonde = neurona.almacen.volumenes.includes(req.volumen)
        ? "las bandas ya están aquí"
        : fuente
          ? `las bandas vienen de ${destino}`
          : "se piden solo cuando se usan";
      return { modo, destino, motivo: `Web/WASM por bandas: del volumen ${req.volumen} solo se baja lo que se usa (${deDonde}).` };
    }
    if (modo === "montada" && req.volumen && soloMemoria(falta)) {
      const destino = fuente?.destino ?? "local";
      return { modo, destino, motivo: `App nativa guardada como volumen ${req.volumen}: la pasarela local la monta como disco${fuente ? ` (bandas de ${destino})` : ""}.` };
    }
    const ventana = primeraFuente(plan, "ventana");
    if (modo === "transmitida" && ventana) {
      return { modo, destino: ventana.destino, motivo: `Otra neurona la tiene prestada: la ventana llega en vídeo desde ${ventana.destino} y la latencia sirve.` };
    }
    const calculo = plan.porParte.computo ?? [];
    if (modo === "ramificada" && falta.length > 0 && calculo.length > 0) {
      return { modo, destino: "local", motivo: `La interfaz va en local; el cálculo sale de ${calculo.map((r) => r.destino).join(", ")}.` };
    }
  }
  const aviso = falta.length > 0
    ? `Falta: ${falta.map(faltaLegible).join("; ")}.`
    : "Ni esta neurona ni el plan cubren otra forma; se abre igualmente.";
  return { modo: permitidos[0] ?? "local", destino: "local", motivo: `Se abre en local con lo que hay. ${aviso}` };
}
