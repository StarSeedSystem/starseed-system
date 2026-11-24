// Autoenrutamiento autorreparable multicapa (AST1123C · astraura-modelos-1123).
// Módulo PURO: sin red, sin disco, sin DOM, sin `any`; el reloj se inyecta.
// Salud por ruta y proveedor con circuit-breaker de enfriamiento exponencial:
// local → neurona en malla → servidor propio → nube permitida, y vuelta a la primaria.

export type RutaEnrutado = "local" | "neurona-malla" | "servidor-propio" | "nube";
export type EstadoCircuito = "cerrado" | "abierto";
export type EntidadEnrutada = "agente" | "bot";

export const ORDEN_RUTAS: readonly RutaEnrutado[] = ["local", "neurona-malla", "servidor-propio", "nube"];

export interface PoliticaCircuito {
  umbralLatenciaMs: number;
  enfriamientoBaseMs: number;
  enfriamientoMaximoMs: number;
}

export const POLITICA_POR_DEFECTO: PoliticaCircuito = {
  umbralLatenciaMs: 4_000, enfriamientoBaseMs: 30_000, enfriamientoMaximoMs: 15 * 60_000,
};

export interface SaludRuta {
  ruta: RutaEnrutado;
  proveedor: string;
  fallos: number;
  estado: EstadoCircuito;
  enfriamientoHasta: number;
  latenciaMs: number | null;
}

export interface DecisionRuta {
  ruta: RutaEnrutado | null;
  proveedor: string | null;
  entidad: EntidadEnrutada;
  motivo: string;
  salud: readonly SaludRuta[];
}

export interface EntradaAutoenrutado {
  salud: readonly SaludRuta[];
  ahora: number;
  entidad?: EntidadEnrutada;
  nubePermitida?: boolean;
}

export function crearSalud(
  ruta: RutaEnrutado,
  proveedor = `${ruta}-principal`,
  latenciaMs: number | null = null,
): SaludRuta {
  return { ruta, proveedor, fallos: 0, estado: "cerrado", enfriamientoHasta: 0, latenciaMs };
}
export function calcularEnfriamiento(
  fallos: number,
  politica: PoliticaCircuito = POLITICA_POR_DEFECTO,
): number {
  if (fallos <= 0) return 0;
  const factor = 2 ** Math.min(fallos - 1, 30);
  return Math.min(politica.enfriamientoBaseMs * factor, politica.enfriamientoMaximoMs);
}
export function registrarFallo(
  salud: SaludRuta,
  ahora: number,
  politica: PoliticaCircuito = POLITICA_POR_DEFECTO,
  latenciaMs: number | null = null,
): SaludRuta {
  const fallos = salud.fallos + 1;
  return {
    ...salud, fallos, estado: "abierto",
    enfriamientoHasta: ahora + calcularEnfriamiento(fallos, politica),
    latenciaMs: latenciaMs ?? salud.latenciaMs,
  };
}
export function registrarExito(
  salud: SaludRuta,
  latenciaMs: number,
  ahora: number,
  politica: PoliticaCircuito = POLITICA_POR_DEFECTO,
): SaludRuta {
  if (!Number.isFinite(latenciaMs) || latenciaMs > politica.umbralLatenciaMs) {
    return registrarFallo(salud, ahora, politica, latenciaMs);
  }
  return { ...salud, fallos: 0, estado: "cerrado", enfriamientoHasta: 0, latenciaMs };
}
export function estaDisponible(salud: SaludRuta, ahora: number): boolean {
  return salud.estado === "cerrado" || ahora >= salud.enfriamientoHasta;
}
export function recuperarRuta(salud: SaludRuta, ahora: number): SaludRuta {
  if (salud.estado === "abierto" && ahora >= salud.enfriamientoHasta) {
    return { ...salud, fallos: 0, estado: "cerrado", enfriamientoHasta: 0 };
  }
  return salud;
}
function ordenPorLatencia(salud: SaludRuta): number {
  return salud.latenciaMs === null ? Number.POSITIVE_INFINITY : salud.latenciaMs;
}
export function autoenrutar(entrada: EntradaAutoenrutado): DecisionRuta {
  const entidad = entrada.entidad ?? "agente";
  const nubePermitida = entrada.nubePermitida ?? true;
  const salud = entrada.salud.map((s) => recuperarRuta(s, entrada.ahora));
  for (const ruta of ORDEN_RUTAS) {
    if (ruta === "nube" && !nubePermitida) continue;
    const candidatas = salud
      .filter((s) => s.ruta === ruta && estaDisponible(s, entrada.ahora))
      .sort((a, b) => ordenPorLatencia(a) - ordenPorLatencia(b));
    if (candidatas.length === 0) continue;
    const elegida = candidatas[0];
    return {
      ruta, proveedor: elegida.proveedor, entidad, salud,
      motivo: `${entidad}: ${ruta}/${elegida.proveedor} disponible`,
    };
  }
  return {
    ruta: null, proveedor: null, entidad, salud,
    motivo: nubePermitida ? "ninguna ruta disponible" : "ninguna ruta permitida (nube vetada)",
  };
}
