/**
 * StarSeed XR · PUENTE DE CONTROL DE LA PROTOMOLÉCULA EN EL VISOR (XR1010AP).
 * Contrato: `architecture/starseed-xr.md` §3 (e) y (h); `architecture/protomolecula.md` §4 y §11.1.
 * Módulo PURO: sin React, sin DOM, sin `node:*`. Reutiliza `gatilloAFuente` del mapa XR y las
 * curvas reales de `vinculos-control.ts`; no reimplementa ninguna curva ni permiso.
 */
import type { Controlador } from "@/lib/protomolecula/controlador";
import type { Ambito, Autor, Cambio, Operacion, Parametro, ParametroRef, Rol, ValorParametro } from "@/lib/protomolecula/tipos";
import { aplicarCurva, CURVA_LINEAL, claveFuente, type Curva, type FuenteControl } from "@/lib/protomolecula/vinculos-control";
import { gatilloAFuente, type MapaEntrada } from "@/lib/xr/vinculos-xr";

/** Fuente de mando del visor: índice 0 = mano izquierda, 1 = derecha (lo fija `gatilloAFuente`). */
export type FuenteGamepadXR = Extract<FuenteControl, { tipo: "gamepad" }>;

/** Solo botones y ejes de mando del mapa XR, sin repetir la misma fuente (0 izquierda, 1 derecha). */
export function fuentesDeMapaXR(mapa: MapaEntrada): FuenteGamepadXR[] {
  const vistas = new Set<string>();
  const fuentes: FuenteGamepadXR[] = [];
  for (const accion of Object.keys(mapa)) {
    for (const gatillo of mapa[accion as keyof MapaEntrada] ?? []) {
      const fuente = gatilloAFuente(gatillo);
      if (!fuente || vistas.has(claveFuente(fuente))) continue;
      vistas.add(claveFuente(fuente));
      fuentes.push(fuente);
    }
  }
  return fuentes;
}

const acotar01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * Gesto continuo 0..1 → valor del parámetro. La zona muerta, la forma (lineal/log/exp) y el
 * invertir los pone `aplicarCurva`; aquí solo se traduce el resultado al tipo del parámetro.
 */
export function rangoAGesto(parametro: Parametro, valorGesto: number, curva: Curva = CURVA_LINEAL): ValorParametro {
  const y = aplicarCurva(acotar01(valorGesto), curva, false);
  if (parametro.tipo === "booleano" || parametro.tipo === "disparo") return y >= 0.5;
  if (parametro.tipo === "opcion") {
    const opciones = parametro.opciones ?? [];
    return opciones.length ? opciones[Math.min(opciones.length - 1, Math.floor(y * opciones.length))] : "";
  }
  const lo = parametro.min ?? 0, hi = parametro.max ?? 1;
  let valor = lo + y * (hi - lo);
  if (parametro.paso) valor = Math.round((valor - lo) / parametro.paso) * parametro.paso + lo;
  if (parametro.tipo === "entero") valor = Math.round(valor);
  return Math.round(valor * 1e9) / 1e9;
}

export interface ContextoGesto {
  autor?: Autor;
  ahora?: number;
  nuevoId?: () => string;
  origen?: Operacion["origen"];
}

/** Gesto de deslizador/dial → `Operacion` exacta con autor y origen (la mano, por defecto). */
export function operacionDeGesto(
  ref: ParametroRef,
  parametro: Parametro,
  valorGesto: number,
  ctx: ContextoGesto = {},
): Operacion {
  return {
    id: ctx.nuevoId?.() ?? "op-visor",
    objetivo: ref,
    accion: { tipo: "exacta", valor: rangoAGesto(parametro, valorGesto) },
    autor: ctx.autor ?? { tipo: "persona", id: "visor" },
    origen: ctx.origen ?? "mano",
    t: ctx.ahora ?? 0,
  };
}

export interface ContextoVisor {
  /** Ámbito de la molécula con foco: personal, perfil, grupo o pública. */
  ambito?: Ambito;
  rol?: Rol | null;
}

export type ResultadoVisor =
  | { ok: true; cambio: Cambio; difundir: boolean }
  | { ok: false; motivo: string; pendiente?: Operacion };

const esEspacioCompartido = (ambito: Ambito): boolean => ambito === "grupo" || ambito === "publica";
const mismoObjetivo = (a: ParametroRef, b: ParametroRef): boolean =>
  a.atomoId === b.atomoId && a.parametroId === b.parametroId;

/**
 * Aplica una operación del visor en el `Controlador` real. Una operación de un AGENTE en un
 * espacio compartido no se ejecuta: queda pendiente para la tarjeta de confirmación (XR1010Q).
 * Un parámetro desconocido lo rechaza el propio controlador con su motivo; aquí no se lanza.
 */
export function aplicarEnVisor(
  controlador: Controlador,
  parametroRef: ParametroRef,
  op: Operacion,
  ctx: ContextoVisor = {},
): ResultadoVisor {
  if (!mismoObjetivo(op.objetivo, parametroRef)) {
    return { ok: false, motivo: "La operación no apunta a este parámetro." };
  }
  if (op.origen === "agente" && esEspacioCompartido(ctx.ambito ?? "personal")) {
    return { ok: false, motivo: "Una operación de un agente en un espacio compartido espera tu confirmación.", pendiente: op };
  }
  const r = controlador.mover(op);
  return r.ok ? r : { ok: false, motivo: r.motivo, pendiente: r.pendiente?.operacion };
}
