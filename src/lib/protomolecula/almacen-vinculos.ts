/**
 * Protomolécula · ALMACÉN DE VÍNCULOS y ENRUTADOR de mandos (F6, contrato §4.4). Persistencia local por molécula
 * (`starseed.protomolecula.vinculos.v1:<moleculaId>`), almacén inyectado y try/catch como `almacen-moleculas.ts`.
 * `crearEnrutador`: cada mensaje busca sus vínculos por `claveFuente`, pasa por `procesar` (con el `EstadoVinculo`
 * de cada uno) y la operación va a `controlador.mover` (origen `midi`). Mientras se aprende, los mandos no mueven nada.
 */
import type { AlmacenLocal } from "./almacen-moleculas";
import type { Controlador, ResultadoMover } from "./controlador";
import type { Autor, Parametro, ParametroRef } from "./tipos";
import { claveFuente, esDiscreto, estadoInicial, procesar, siguienteAprender, vinculoAprendido } from "./vinculos-control";
import type { EstadoAprender, EstadoVinculo, EventoAprender, FuenteControl, Vinculo } from "./vinculos-control";

export interface MensajeControl { fuente: FuenteControl; bruto: number }

export const PREFIJO_VINCULOS = "starseed.protomolecula.vinculos.v1:";
export const MAX_VINCULOS = 256;
export const claveVinculos = (moleculaId: string): string => PREFIJO_VINCULOS + moleculaId;

const obj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const txt = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 200;
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const opc = (x: unknown, g: (y: unknown) => boolean): boolean => x === undefined || g(x);
const entre = (x: unknown, a: number, b: number): boolean => num(x) && x >= a && x <= b;
const unoDe = (x: unknown, xs: string[]): boolean => typeof x === "string" && xs.includes(x);

function esFuente(f: unknown): f is FuenteControl {
  if (!obj(f)) return false;
  if (f.tipo === "midi") return unoDe(f.mensaje, ["cc", "nota", "pitch"]) && entre(f.canal, 1, 16) && opc(f.numero, (n) => entre(n, 0, 127)) && opc(f.dispositivo, txt);
  if (f.tipo === "gamepad") return unoDe(f.control, ["eje", "boton"]) && num(f.numero) && opc(f.indice, num);
  if (f.tipo === "hid") return txt(f.dispositivo) && entre(f.byte, 0, 4096);
  if (f.tipo === "osc") return txt(f.direccion);
  return f.tipo === "sensor" && txt(f.sensorId) && opc(f.eje, (e) => typeof e === "string");
}

/** Lo que se lee del almacén no es de fiar: se comprueba campo a campo. */
export function esVinculoValido(x: unknown): x is Vinculo {
  if (!obj(x) || !txt(x.id) || !esFuente(x.fuente) || !obj(x.objetivo) || !obj(x.curva)) return false;
  const o = x.objetivo, c = x.curva;
  return txt(o.atomoId) && txt(o.parametroId) && unoDe(x.modo, ["absoluto", "relativo", "alternar", "disparo"])
    && typeof x.activo === "boolean" && typeof x.creadoPor === "string" && unoDe(c.forma, ["lineal", "log", "exp"])
    && typeof c.invertir === "boolean" && entre(c.zonaMuerta, 0, 0.5) && entre(c.suavizado, 0, 0.99)
    && opc(c.entradaMin, num) && opc(c.entradaMax, num);
}

/** Sin almacén, con JSON roto o con un almacén que lanza: lista vacía. Lo inválido se descarta. */
export function cargarVinculos(a: AlmacenLocal | null, moleculaId: string): Vinculo[] {
  try {
    const crudo = a?.getItem(claveVinculos(moleculaId));
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? datos.filter(esVinculoValido).slice(0, MAX_VINCULOS) : [];
  } catch { return []; }
}

/** false si no hay almacén, si algún vínculo no es válido, si son demasiados o si el almacén falla. */
export function guardarVinculos(a: AlmacenLocal | null, moleculaId: string, vs: Vinculo[]): boolean {
  if (!a || vs.length > MAX_VINCULOS || !vs.every(esVinculoValido)) return false;
  try { a.setItem(claveVinculos(moleculaId), JSON.stringify(vs)); return true; } catch { return false; }
}

export interface RutaMando { vinculoId: string; resultado: ResultadoMover }
export type Confirmacion = { ok: true; vinculo: Vinculo } | { ok: false; motivo: string };
export interface Enrutador {
  recibir(m: MensajeMidi): RutaMando[];
  aprender(objetivo: ParametroRef, esperaMs?: number): EstadoAprender;
  tic(): EstadoAprender; cancelar(): EstadoAprender; estadoAprender(): EstadoAprender; confirmar(): Confirmacion;
  vinculos(): Vinculo[]; fijarVinculos(vs: Vinculo[]): void;
}
export interface OpcionesEnrutador {
  vinculos: Vinculo[]; parametroDe: (ref: ParametroRef) => Parametro | undefined; controlador: Pick<Controlador, "mover">;
  autor: Autor; ahora: () => number; nuevoId: () => string;
  /** Para guardar: p. ej. `(vs) => guardarVinculos(almacen, moleculaId, vs)`. */
  alCambiarVinculos?: (vs: Vinculo[]) => void;
}

export function crearEnrutador(o: OpcionesEnrutador): Enrutador {
  let lista = [...o.vinculos], aprendiendo: EstadoAprender = { fase: "inactivo" };
  const estados = new Map<string, EstadoVinculo>();
  const paso = (ev: EventoAprender) => (aprendiendo = siguienteAprender(aprendiendo, ev));
  const fijar = (vs: Vinculo[]) => {
    lista = [...vs];
    for (const id of [...estados.keys()]) if (!lista.some((v) => v.id === id)) estados.delete(id);
    o.alCambiarVinculos?.(lista);
  };
  function recibir(m: MensajeMidi): RutaMando[] {
    if (aprendiendo.fase === "escuchando" || aprendiendo.fase === "detectado") {
      paso({ tipo: "entrada", fuente: m.fuente, bruto: m.bruto, ahora: o.ahora() });
      return [];
    }
    // Un vínculo sin aparato («*») vale para el mismo control de cualquier aparato.
    const claves = [claveFuente(m.fuente), claveFuente({ ...m.fuente, dispositivo: undefined })];
    const rutas: RutaMando[] = [];
    for (const v of lista) {
      if (!claves.includes(claveFuente(v.fuente))) continue;
      const p = o.parametroDe(v.objetivo);
      if (!p) { rutas.push({ vinculoId: v.id, resultado: { ok: false, motivo: "El parámetro de este vínculo ya no existe" } }); continue; }
      // Una nota se «pulsa» con cualquier velocidad, no solo por encima de la mitad.
      const pulsa = esDiscreto(m.fuente) && (v.modo === "alternar" || v.modo === "disparo") && m.bruto > 0;
      const r = procesar(v, p, estados.get(v.id) ?? estadoInicial(), pulsa ? 127 : m.bruto, { autor: o.autor, ahora: o.ahora(), id: o.nuevoId() });
      estados.set(v.id, r.estado);
      if (r.operacion) rutas.push({ vinculoId: v.id, resultado: o.controlador.mover(r.operacion) });
    }
    return rutas;
  }
  function confirmar(): Confirmacion {
    if (aprendiendo.fase !== "detectado") return { ok: false, motivo: "Aún no se ha detectado ningún mando: mueve el control que quieres vincular" };
    const p = o.parametroDe(aprendiendo.objetivo);
    if (!p) return { ok: false, motivo: "El parámetro que querías vincular ya no existe" };
    const v = vinculoAprendido(aprendiendo, p, o.nuevoId(), o.autor.id), k = claveFuente(v.fuente);
    paso({ tipo: "confirmar" });
    // El mismo mando sobre el mismo parámetro no se duplica: el nuevo sustituye al viejo.
    fijar([...lista.filter((x) => claveFuente(x.fuente) !== k || x.objetivo.atomoId !== v.objetivo.atomoId || x.objetivo.parametroId !== v.objetivo.parametroId), v]);
    return { ok: true, vinculo: v };
  }

  return {
    recibir, confirmar, fijarVinculos: fijar, estadoAprender: () => aprendiendo, vinculos: () => lista,
    aprender: (objetivo, esperaMs) => paso({ tipo: "empezar", objetivo, ahora: o.ahora(), esperaMs }),
    tic: () => paso({ tipo: "tic", ahora: o.ahora() }),
    cancelar: () => paso({ tipo: "cancelar" }),
  };
}
