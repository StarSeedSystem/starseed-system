/**
 * StarSeed XR · PROTOMOLÉCULA EN EL VISOR (XR1010AP · contrato `architecture/starseed-xr.md` §3 e/h y
 * `architecture/protomolecula.md` §4/§11.1). Puente PURO entre la entrada del visor (`vinculos-xr.ts`)
 * y el control de la Protomolécula (`vinculos-control.ts`): los gatillos de mando se convierten en
 * `FuenteControl` de gamepad (0 = mano izquierda, 1 = derecha) para que el mismo «aprender» y las
 * mismas curvas sirvan en el visor. Sin React, sin red, sin `node:*`, sin WebGL.
 */
import type { Controlador, ResultadoMover } from "@/lib/protomolecula/controlador";
import type { Accion, Autor, Origen, Parametro, ParametroRef, Operacion, ValorParametro } from "@/lib/protomolecula/tipos";
import { aplicarCurva, CURVA_LINEAL, type Curva, type FuenteControl } from "@/lib/protomolecula/vinculos-control";
import { ACCIONES_XR, gatilloAFuente, type AccionXR, type Gatillo, type MapaEntrada } from "@/lib/xr/vinculos-xr";

/** Lo único que hace falta del controlador real: mover una operación (delega en `Controlador`). */
export type ControladorMolecula = Pick<Controlador, "mover">;

/** Gatillo del mapa XR que ya es de mando, con la acción a la que está asignado. */
export interface FuenteEnMapaXR {
  accion: AccionXR;
  gatillo: Gatillo;
  fuente: Extract<FuenteControl, { tipo: "gamepad" }>;
}

/**
 * `fuentesDeMapaXR(mapa)` devuelve SOLO los botones y ejes de mando del mapa, en orden de acción.
 * `gatilloAFuente` descarta gestos, teclas y frases; el índice 0 es la mano izquierda y el 1 la derecha.
 */
export function fuentesDeMapaXR(mapa: MapaEntrada): FuenteEnMapaXR[] {
  const salida: FuenteEnMapaXR[] = [];
  for (const accion of ACCIONES_XR) {
    for (const gatillo of mapa[accion] ?? []) {
      const fuente = gatilloAFuente(gatillo);
      if (fuente !== null) salida.push({ accion, gatillo, fuente });
    }
  }
  return salida;
}

/**
 * `rangoAGesto` lleva un gesto 0–1 (recorrido del deslizador o giro del dial) al valor del parámetro
 * con la MISMA curva de `vinculos-control.ts` (zona muerta → forma → invertir). No reimplementa curvas.
 * Los booleanos/disparos se activan a partir de la mitad; las opciones se eligen por tramos; los
 * números respetan `min`/`max` y redondean al `paso` de la interfaz.
 */
export function rangoAGesto(parametro: Parametro, valorGesto: number, curva: Curva = CURVA_LINEAL, bipolar = false): ValorParametro {
  const x = Number.isFinite(valorGesto) ? Math.min(1, Math.max(0, valorGesto)) : 0;
  const y = aplicarCurva(x, curva, bipolar);
  if (parametro.tipo === "booleano" || parametro.tipo === "disparo") return y >= 0.5;
  if (parametro.tipo === "opcion") {
    const opciones = parametro.opciones ?? [];
    return opciones.length ? opciones[Math.min(opciones.length - 1, Math.floor(y * opciones.length))] : "";
  }
  const lo = parametro.min ?? 0;
  const hi = parametro.max ?? 1;
  let valor = lo + y * (hi - lo);
  if (parametro.paso) valor = Math.round((valor - lo) / parametro.paso) * parametro.paso + lo;
  return Math.round(valor * 1e9) / 1e9;
}

/** Lo que necesita una operación que nace de un control del visor. */
export interface ContextoControl {
  autor: Autor;
  ahora: number;
  nuevoId: () => string;
  /** «mano» por defecto; «gamepad» cuando la mueve un mando. */
  origen?: Origen;
}

/** Construye la `Operacion` de un control 3D: exacta para deslizador/dial/interruptor, disparo para botón. */
export function operacionDeControl(ref: ParametroRef, parametro: Parametro, valorGesto: number, ctx: ContextoControl): Operacion {
  const accion: Accion = parametro.tipo === "disparo"
    ? { tipo: "disparo" }
    : { tipo: "exacta", valor: rangoAGesto(parametro, valorGesto) };
  return { id: ctx.nuevoId(), objetivo: ref, accion, autor: ctx.autor, origen: ctx.origen ?? "mano", t: ctx.ahora };
}

/**
 * `aplicarEnVisor` delega en el controlador real. Si la operación no apunta al control que la pidió,
 * no se mueve nada (así un deslizador no toca otro parámetro por un índice equivocado). El controlador
 * decide permisos, pendientes de confirmación y difusión: aquí no se reimplementa nada.
 */
export function aplicarEnVisor(controlador: ControladorMolecula, parametroRef: ParametroRef, op: Operacion): ResultadoMover {
  if (op.objetivo.atomoId !== parametroRef.atomoId || op.objetivo.parametroId !== parametroRef.parametroId) {
    return { ok: false, motivo: "La operación no apunta al parámetro de este control." };
  }
  return controlador.mover(op);
}
