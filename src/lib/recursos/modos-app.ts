// Modos de apertura de una app en la malla (architecture/apps-en-la-malla.md §5 · tarea N).
// Puro: sin red, disco, procesos ni reloj. Todo lo medido llega en `plan`.

import type { StarseedApp } from "@/components/dashboard/apps/launcher-types";
import type { OfertaNeurona } from "./oferta";

export type ModoApp = NonNullable<StarseedApp["ejecucion"]>[number];

export interface PlanApertura {
  /** Otras neuronas ya filtradas por permisos que podrían tener o correr la app. */
  candidatas?: OfertaNeurona[];
  /** Tope de latencia para transmitir, en ms. Sin tope, la latencia no es crítica. */
  latenciaMaxMs?: number;
  /** Volumen del contexto; si falta se usa el de `app.requisitos.volumen`. */
  volumen?: string;
}

export interface AperturaApp {
  modo: ModoApp;
  /** Ruta o URL local, volumen o neurona que sirve la app. */
  destino: string;
  motivo: string;
}

export function modosDe(app: StarseedApp): ModoApp[] {
  return app.ejecucion && app.ejecucion.length > 0 ? app.ejecucion : ["local"];
}

function destinoLocal(app: StarseedApp): string {
  return app.open.route || app.open.href || "local";
}

/** Diagnóstico de lo que falta, y si lo que falta es solo cálculo (no almacenamiento). */
function diagnosticar(app: StarseedApp, neurona: OfertaNeurona): { falta: string[]; soloComputo: boolean } {
  const r = app.requisitos ?? {};
  const falta: string[] = [];
  let computo = false;
  if (r.ramMb !== undefined && neurona.computo.ramLibreMb < r.ramMb) {
    falta.push(`RAM libre para ${r.ramMb} MB`);
    computo = true;
  }
  if (r.gpu === true && !neurona.computo.gpu) { falta.push("GPU"); computo = true; }
  for (const motor of r.motores ?? []) {
    if (!neurona.computo.motores.includes(motor)) { falta.push(`motor «${motor}»`); computo = true; }
  }
  const faltaVolumen = r.volumen !== undefined && !neurona.almacen.volumenes.includes(r.volumen);
  if (faltaVolumen) falta.push(`volumen «${r.volumen}»`);
  return { falta, soloComputo: computo && !faltaVolumen };
}

function latenciaSirve(neurona: OfertaNeurona, otra: OfertaNeurona, tope?: number): boolean {
  if (tope === undefined) return true;
  const medida =
    neurona.enlaces.latenciaMs?.[otra.nodoId] ?? otra.enlaces.latenciaMs?.[neurona.nodoId];
  return medida !== undefined && medida <= tope;
}

export function comoAbrir(app: StarseedApp, neurona: OfertaNeurona, plan: PlanApertura = {}): AperturaApp {
  const modos = modosDe(app);
  const { falta, soloComputo } = diagnosticar(app, neurona);
  const volumen = plan.volumen ?? app.requisitos?.volumen;

  if (modos.includes("local") && falta.length === 0) {
    return {
      modo: "local",
      destino: destinoLocal(app),
      motivo: "Cabe en esta neurona: se abre en local con lo que ya tiene.",
    };
  }

  if (volumen && modos.includes("por-bandas")) {
    return {
      modo: "por-bandas",
      destino: volumen,
      motivo: "La app es un volumen por bandas: solo se baja lo que se usa, desde la malla.",
    };
  }

  if (volumen && modos.includes("montada")) {
    return {
      modo: "montada",
      destino: volumen,
      motivo: "App nativa fuera del disco: se monta su volumen y se abre como un disco del sistema.",
    };
  }

  if (modos.includes("transmitida")) {
    const otra = (plan.candidatas ?? []).find((c) =>
      c.nodoId !== neurona.nodoId && c.apps.some((a) => a.id === app.id) &&
      latenciaSirve(neurona, c, plan.latenciaMaxMs));
    if (otra) {
      return {
        modo: "transmitida",
        destino: otra.nodoId,
        motivo: "La corre otra neurona que ya la tiene: la ventana llega transmitida y la latencia sirve.",
      };
    }
  }

  if (modos.includes("ramificada") && soloComputo) {
    return {
      modo: "ramificada",
      destino: destinoLocal(app),
      motivo: `La interfaz va en local y el cálculo en la red; aquí falta ${falta.join(", ")}.`,
    };
  }

  return {
    modo: "local",
    destino: destinoLocal(app),
    motivo:
      falta.length > 0
        ? `Se abre en local con aviso: falta ${falta.join(", ")}.`
        : "Se abre en local: ningún otro modo está declarado o disponible.",
  };
}
