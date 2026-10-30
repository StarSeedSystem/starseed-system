/**
 * StarSeed XR · VÍNCULOS DE LA PROTOMOLÉCULA EN EL VISOR (XR1010AP · contrato §3 e/h y
 * `architecture/protomolecula.md` §4). Módulo PURO: sin React, sin three, sin `node:*`.
 * Une el mapa XR (`vinculos-xr.ts`) con la superficie de control (`vinculos-control.ts`):
 * gatillos de mando → `FuenteControl` (0 izquierda, 1 derecha), gesto de deslizador/dial →
 * las MISMAS curvas, y agente en grupo/público → pendiente de confirmación (XR1010Q).
 */
import type {
  Accion,
  Ambito,
  Autor,
  Operacion,
  Parametro,
  ParametroRef,
  ValorParametro,
} from "@/lib/protomolecula/tipos";
import type { Controlador, Pendiente, ResultadoMover } from "@/lib/protomolecula/controlador";
import { valorPorDefecto } from "@/lib/protomolecula/parametros";
import { esAutomatico } from "@/lib/protomolecula/permisos";
import {
  CURVA_LINEAL,
  claveFuente,
  estadoInicial,
  procesar,
  type Curva,
  type FuenteControl,
  type Vinculo,
} from "@/lib/protomolecula/vinculos-control";
import { ACCIONES_XR, gatilloAFuente, type MapaEntrada } from "@/lib/xr/vinculos-xr";

export interface ContextoOperacionVisor {
  autor: Autor;
  ahora: number;
  id: () => string;
  origen?: Operacion["origen"];
}

/** Construye una `Operacion` del visor con autor, origen y reloj explícitos (nada de aleatorio). */
export function operacionEnVisor(ref: ParametroRef, accion: Accion, ctx: ContextoOperacionVisor): Operacion {
  return { id: ctx.id(), objetivo: ref, accion, autor: ctx.autor, origen: ctx.origen ?? "mano", t: ctx.ahora };
}

/** Las `FuenteControl` de gamepad del mapa XR, sin duplicados: gestos, teclas y frases no son mando. */
export function fuentesDeMapaXR(mapa: MapaEntrada): FuenteControl[] {
  const vistos = new Set<string>();
  const salida: FuenteControl[] = [];
  for (const accion of ACCIONES_XR) {
    for (const gatillo of mapa[accion] ?? []) {
      const fuente = gatilloAFuente(gatillo);
      if (!fuente) continue;
      const clave = claveFuente(fuente);
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      salida.push(fuente);
    }
  }
  return salida;
}

/** Eje neutro que representa el gesto continuo de un deslizador o un dial. */
const FUENTE_GESTO: FuenteControl = { tipo: "gamepad", control: "eje", numero: 0, indice: 0 };

/**
 * Gesto 0..1 (deslizador al 50 % = 0,5) → valor exacto del parámetro. No reimplementa curvas:
 * reutiliza `procesar` de `vinculos-control.ts` con zona muerta, forma, inversión, paso y enteros.
 */
export function rangoAGesto(p: Parametro, valorGesto: number, curva: Curva = CURVA_LINEAL): ValorParametro {
  const x = Math.min(1, Math.max(0, Number.isFinite(valorGesto) ? valorGesto : 0));
  if (p.tipo === "disparo") return x >= 0.5;
  const vinculo: Vinculo = {
    id: "visor-gesto",
    fuente: FUENTE_GESTO,
    objetivo: { atomoId: "visor", parametroId: p.id },
    modo: "absoluto",
    curva,
    activo: true,
    creadoPor: "visor",
  };
  const r = procesar(vinculo, p, estadoInicial(), x * 2 - 1, {
    autor: { tipo: "persona", id: "visor" },
    ahora: 0,
    id: "visor-gesto",
  });
  const accion = r.operacion?.accion;
  const valor = accion?.tipo === "exacta" ? accion.valor : undefined;
  if (valor === undefined) return valorPorDefecto(p);
  return p.tipo === "entero" && typeof valor === "number" ? Math.round(valor) : valor;
}

export const MOTIVO_PENDIENTE_GRUPO =
  "Un agente quiere cambiar un parámetro en un espacio de grupo: queda pendiente de tu confirmación.";

/** Un cambio automático (IA o agente) en grupo o espacio público nunca se aplica solo. */
export function requiereConfirmacionEnVisor(op: Operacion, ambito: Ambito): boolean {
  return esAutomatico(op.origen) && (ambito === "grupo" || ambito === "publica");
}

/**
 * Aplica una operación del visor delegando en el `Controlador` real. El objetivo siempre es el
 * parámetro con foco; si un agente opera en grupo/público, se devuelve como pendiente (XR1010Q)
 * en vez de aplicarlo. Un parámetro desconocido lo rechaza el controlador sin romper.
 */
export function aplicarEnVisor(
  controlador: Controlador,
  parametroRef: ParametroRef,
  op: Operacion,
  ambito?: Ambito,
): ResultadoMover {
  const operacion: Operacion = { ...op, objetivo: parametroRef };
  const efectivo = ambito ?? controlador.obtener().molecula.ambito;
  if (requiereConfirmacionEnVisor(operacion, efectivo)) {
    const pendiente: Pendiente = { operacion, motivo: MOTIVO_PENDIENTE_GRUPO };
    return { ok: false, motivo: MOTIVO_PENDIENTE_GRUPO, pendiente };
  }
  return controlador.mover(operacion);
}
