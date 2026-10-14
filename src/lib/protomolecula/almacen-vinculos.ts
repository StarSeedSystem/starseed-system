/**
 * Protomolécula · ALMACÉN DE VÍNCULOS Y ENRUTADOR MIDI.
 * Persistencia local por molécula (`starseed.protomolecula.vinculos.v1:<moleculaId>`),
 * con almacén inyectable y todo acceso envuelto en try/catch (un almacén que lanza
 * devuelve lista vacía; nunca rompe la sesión).
 * `crearEnrutador` recibe cada mensaje del adaptador, busca los vínculos con esa
 * `claveFuente`, conserva el `EstadoVinculo` de cada uno y pasa la operación a
 * `controlador.mover` (el origen `midi` lo pone `procesar` vía `origenDe`).
 */
import type { Autor, Operacion, Parametro, ParametroRef } from "./tipos";
import {
  claveFuente,
  estadoInicial,
  procesar,
  type EstadoVinculo,
  type Vinculo,
} from "./vinculos-control";
import type { MensajeMidi } from "./adaptador-midi";

export const PREFIJO_VINCULOS = "starseed.protomolecula.vinculos.v1:";

export interface AlmacenVinculosLocal {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Validación mínima: lo que no cuadre se descarta, no rompe la carga. */
export function esVinculoValido(x: unknown): x is Vinculo {
  if (!esObjeto(x) || typeof x.id !== "string" || !esObjeto(x.fuente) || !esObjeto(x.objetivo)) return false;
  const ob = x.objetivo;
  return (
    typeof x.fuente.tipo === "string" &&
    typeof ob.atomoId === "string" &&
    typeof ob.parametroId === "string" &&
    typeof x.modo === "string" &&
    esObjeto(x.curva) &&
    typeof x.activo === "boolean" &&
    typeof x.creadoPor === "string"
  );
}

export function cargarVinculos(almacen: AlmacenVinculosLocal, moleculaId: string): Vinculo[] {
  try {
    const bruto = almacen.getItem(PREFIJO_VINCULOS + moleculaId);
    if (!bruto) return [];
    const datos: unknown = JSON.parse(bruto);
    return Array.isArray(datos) ? datos.filter(esVinculoValido) : [];
  } catch {
    return [];
  }
}

export function guardarVinculos(almacen: AlmacenVinculosLocal, moleculaId: string, vinculos: Vinculo[]): boolean {
  try {
    almacen.setItem(PREFIJO_VINCULOS + moleculaId, JSON.stringify(vinculos));
    return true;
  } catch {
    return false;
  }
}

export function borrarVinculos(almacen: AlmacenVinculosLocal, moleculaId: string): void {
  try {
    almacen.removeItem(PREFIJO_VINCULOS + moleculaId);
  } catch {
    /* un almacén que lanza no rompe la sesión */
  }
}

/** Lo mínimo que el enrutador necesita del controlador (compatible con `Controlador`). */
export interface ControladorMinimo {
  mover(op: Operacion): unknown;
}

export interface OpcionesEnrutador {
  vinculos: Vinculo[];
  parametroDe: (ref: ParametroRef) => Parametro | undefined;
  controlador: ControladorMinimo;
  autor: Autor;
  ahora: () => number;
  nuevoId: () => string;
}

/**
 * Enruta cada mensaje MIDI a sus vínculos. Devuelve cuántas operaciones se movieron.
 * El estado (suavizado, flanco de nota) se conserva por vínculo entre mensajes.
 */
export function crearEnrutador(o: OpcionesEnrutador): (mensaje: MensajeMidi) => number {
  const estados = new Map<string, EstadoVinculo>();
  return (mensaje) => {
    const clave = claveFuente(mensaje.fuente);
    let movidas = 0;
    for (const v of o.vinculos) {
      if (claveFuente(v.fuente) !== clave) continue;
      const p = o.parametroDe(v.objetivo);
      if (!p) continue;
      const antes = estados.get(v.id) ?? estadoInicial();
      const r = procesar(v, p, antes, mensaje.bruto, { autor: o.autor, ahora: o.ahora(), id: o.nuevoId() });
      estados.set(v.id, r.estado);
      if (r.operacion) {
        o.controlador.mover(r.operacion);
        movidas += 1;
      }
    }
    return movidas;
  };
}
