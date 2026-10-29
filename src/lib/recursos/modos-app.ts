// Modos de ejecución de una app en la malla (§5 · architecture/apps-en-la-malla.md).
// Módulo PURO: sin node:*, sin red, sin disco, sin reloj. Recibe la oferta de la
// neurona y el plan de la bolsa ya hechos; solo decide modo, destino y motivo.
import type { ResultadoPlanificacion } from "./bolsa";
import type { OfertaNeurona } from "./oferta";

/** Las cinco formas de abrir una app (§5). */
export type ModoEjecucion =
  | "local"       // corre en esta neurona (navegador, PWA o app nativa ya local)
  | "por-bandas"  // web/WASM que se baja de su volumen por bandas lo que usa
  | "montada"     // app nativa servida por la pasarela local del volumen (§7)
  | "transmitida" // corre en otra neurona y llega como ventana en vídeo (§9)
  | "ramificada"; // interfaz en local, cálculo prestado de la red

/** Recursos que una app necesita para correr en local. */
export interface RequisitosApp {
  ramMb?: number;
  gpu?: boolean;
  motores?: string[];
  /** Id del volumen por bandas que alimenta la app (§7). */
  volumen?: string;
}

/** Parte del catálogo (StarseedApp) que el lanzador necesita aquí. */
export interface AppEjecutable {
  id: string;
  /** Modos que admite. Sin campo = ["local"], como hasta hoy. */
  ejecucion?: ModoEjecucion[];
  requisitos?: RequisitosApp;
}

/** Qué abrir, dónde y por qué (frase legible para el menú «Abrir en…»). */
export interface AperturaModo {
  modo: ModoEjecucion;
  /** "local", el nodoId del anfitrión o "volumen:<id>". */
  destino: string;
  motivo: string;
}

/** Modos de la app; sin campo declarado todos hoy son ["local"]. */
export function modosDe(app: AppEjecutable): ModoEjecucion[] {
  return app.ejecucion ?? ["local"];
}

/** Lo que exige la app y esta neurona no tiene por sí sola. */
function faltasLocales(app: AppEjecutable, neurona: OfertaNeurona): string[] {
  const r = app.requisitos;
  const faltas: string[] = [];
  if (r?.ramMb !== undefined && neurona.computo.ramLibreMb < r.ramMb) {
    faltas.push(`RAM ${r.ramMb} MB`);
  }
  if (r?.gpu === true && !neurona.computo.gpu) {
    faltas.push("GPU");
  }
  for (const motor of r?.motores ?? []) {
    if (!neurona.computo.motores.includes(motor)) {
      faltas.push(`motor ${motor}`);
    }
  }
  return faltas;
}

export function comoAbrir(
  app: AppEjecutable,
  neurona: OfertaNeurona,
  plan?: ResultadoPlanificacion
): AperturaModo {
  const modos = modosDe(app);
  const faltas = faltasLocales(app, neurona);
  // 1. Local si cabe (§5: primero lo propio y gratuito).
  if (modos.includes("local") && faltas.length === 0) {
    return { modo: "local", destino: "local", motivo: "La neurona cubre los requisitos de la app" };
  }
  // 2. Por bandas si es web/WASM con volumen: solo se baja lo que se usa.
  if (modos.includes("por-bandas") && app.requisitos?.volumen) {
    const destino = plan?.porParte["bytes"]?.[0]?.destino ?? neurona.nodoId;
    return {
      modo: "por-bandas",
      destino,
      motivo: `Volumen ${app.requisitos.volumen} por bandas; solo se baja lo que se usa`,
    };
  }
  // 3. Transmitida si otra neurona la tiene prestada y la latencia sirve.
  const ventana = plan?.porParte["ventana"]?.[0];
  if (modos.includes("transmitida") && ventana) {
    return {
      modo: "transmitida",
      destino: ventana.destino,
      motivo: `La app corre en ${ventana.destino} y llega como ventana en vídeo`,
    };
  }
  // 4. Ramificada si solo falta cálculo: interfaz local, cómputo prestado.
  const computo = plan?.porParte["computo"]?.[0];
  if (modos.includes("ramificada") && computo) {
    return {
      modo: "ramificada",
      destino: "local",
      motivo: `Interfaz en local; cálculo prestado de ${computo.destino}`,
    };
  }
  // 5. Montada: app nativa fuera del disco por la pasarela local (§7).
  if (modos.includes("montada") && app.requisitos?.volumen) {
    return {
      modo: "montada",
      destino: `volumen:${app.requisitos.volumen}`,
      motivo: "App nativa servida por la pasarela local del volumen",
    };
  }
  // 6. Suelo: nunca «nada». Se abre en local y se dice qué falta.
  const motivo =
    faltas.length > 0
      ? `Se abre en local con avisos; falta: ${faltas.join(", ")}`
      : "Se abre en local con avisos; la red no presta un modo alternativo";
  return { modo: "local", destino: "local", motivo };
}
