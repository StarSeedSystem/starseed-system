/**
 * StarSeed XR · VÍNCULOS DE LA PROTOMOLÉCULA EN EL VISOR (XR1010AP).
 *
 * Contrato: `architecture/starseed-xr.md` §3 (e) y `architecture/protomolecula.md` §4 y §11.1.
 * Módulo PURO: no toca React, red, disco ni WebGL. Traduce los gatillos del mapa XR a las
 * `FuenteControl` de gamepad que ya entiende `vinculos-control.ts` (así el mismo «aprender» y las
 * mismas curvas sirven en el visor) y aplica las operaciones por el `Controlador` real.
 * En un espacio de grupo, lo que mueve un agente pasa antes por la tarjeta de confirmación.
 */
import type { Controlador } from "../../../lib/protomolecula/controlador";
import { claveFuente, procesar, estadoInicial, CURVA_LINEAL, type FuenteControl, type Vinculo } from "../../../lib/protomolecula/vinculos-control";
import { valorPorDefecto } from "../../../lib/protomolecula/parametros";
import type { Ambito, Cambio, Operacion, Parametro, ParametroRef, ValorParametro } from "../../../lib/protomolecula/tipos";
import { ACCIONES_XR, gatilloAFuente, type MapaEntrada } from "../../../lib/xr/vinculos-xr";

export type Control3D = "deslizador" | "dial" | "interruptor" | "disparo";

/** El control que se pinta para cada tipo de parámetro del núcleo. */
export function controlDeParametro(p: Parametro): Control3D {
  switch (p.tipo) {
    case "booleano": return "interruptor";
    case "disparo": return "disparo";
    case "opcion": return "dial";
    default: return "deslizador";
  }
}

/** Una posición UV (0–1) acotada; si el rayo no trae UV se queda en el centro. */
export function fraccionDesdeUv(uv: { x?: number } | null | undefined): number {
  const x = uv?.x;
  return typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5;
}

/** Los gatillos de mando del mapa XR como fuentes de gamepad (índice 0 = izquierda, 1 = derecha). */
export function fuentesDeMapaXR(mapa: MapaEntrada): FuenteControl[] {
  const salida: FuenteControl[] = [];
  const vistas = new Set<string>();
  for (const accion of ACCIONES_XR) {
    for (const gatillo of mapa[accion] ?? []) {
      const fuente = gatilloAFuente(gatillo);
      if (!fuente) continue;
      const clave = claveFuente(fuente);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      salida.push(fuente);
    }
  }
  return salida;
}

/** 0–1 del gesto → valor del parámetro usando la curva real de `vinculos-control.ts`. */
export function rangoAGesto(p: Parametro, valorGesto: number): ValorParametro {
  if (p.tipo === "disparo") return Math.min(1, Math.max(0, valorGesto)) >= 0.5;
  const vinculo: Vinculo = {
    id: "visor-rango",
    fuente: { tipo: "gamepad", control: "eje", numero: 0, indice: 0 },
    objetivo: { atomoId: "visor", parametroId: p.id },
    modo: "absoluto",
    curva: { ...CURVA_LINEAL },
    activo: true,
    creadoPor: "visor",
  };
  const r = procesar(vinculo, p, estadoInicial(), valorGesto * 2 - 1, {
    autor: { tipo: "persona", id: "visor" },
    ahora: 0,
    id: "visor-rango",
  });
  const accion = r.operacion?.accion;
  return accion?.tipo === "exacta" ? accion.valor : valorPorDefecto(p);
}

export interface ResultadoEnVisor {
  estado: "aplicado" | "pendiente" | "rechazado";
  motivo: string;
  operacion: Operacion;
  cambio?: Cambio;
}

/** Un agente en un espacio de grupo o público no mueve nada sin la tarjeta de confirmación. */
export function requiereTarjeta(op: Operacion, ambito: Ambito): boolean {
  return op.autor.tipo === "agente" && (ambito === "grupo" || ambito === "publica");
}

/** Aplica una operación del visor delegando en el controlador REAL de la molécula. */
export function aplicarEnVisor(controlador: Controlador, parametroRef: ParametroRef, op: Operacion): ResultadoEnVisor {
  const ambito = controlador.obtener().molecula.ambito;
  const operacion: Operacion = { ...op, objetivo: parametroRef };
  if (requiereTarjeta(operacion, ambito)) {
    return { estado: "pendiente", motivo: "Un agente quiere mover un control: confirma en la tarjeta.", operacion };
  }
  const r = controlador.mover(operacion);
  if (!r.ok) return { estado: r.pendiente ? "pendiente" : "rechazado", motivo: r.motivo, operacion };
  return { estado: "aplicado", motivo: "Aplicado.", operacion, cambio: r.cambio };
}

/** La persona ya vio la tarjeta: ahora sí se delega en el controlador real. */
export function confirmarEnVisor(controlador: Controlador, op: Operacion): ResultadoEnVisor {
  const r = controlador.mover(op);
  if (!r.ok) return { estado: r.pendiente ? "pendiente" : "rechazado", motivo: r.motivo, operacion: op };
  return { estado: "aplicado", motivo: "Confirmado y aplicado.", operacion: op, cambio: r.cambio };
}
