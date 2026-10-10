import { describe, expect, it } from "vitest";
import {
  acotar, aplicarOperacion, calcular, claveDe, convertirUnidad, deshacerCambio, deshacerUltimo, describirCambio,
  formatearValor, historialVacio, normalizar, rehacerUltimo, registrar, valorActual,
} from "../parametros";
import type { Accion, Autor, EstadoValores, Operacion, Parametro, ParametroRef } from "../tipos";

const reverb: Parametro = { id: "mezcla", nombre: "Reverberación", tipo: "numero", min: 0, max: 100, paso: 1, unidad: "%", defecto: 30 };
const brillo: Parametro = { id: "brillo", nombre: "Brillo", tipo: "numero", min: 0, max: 3, paso: 0.5, defecto: 1 };
const volumen: Parametro = { id: "vol", nombre: "Volumen", tipo: "numero", min: -60, max: 6, unidad: "dB", defecto: -6 };
const capas: Parametro = { id: "capas", nombre: "Capas", tipo: "entero", min: 1, max: 8, defecto: 2 };
const eco: Parametro = { id: "eco", nombre: "Eco", tipo: "booleano" };
const captura: Parametro = { id: "cap", nombre: "Captura", tipo: "disparo" };
const filtro: Parametro = { id: "tipo", nombre: "Tipo", tipo: "opcion", opciones: ["paso bajo", "paso alto", "banda"] };

const ana: Autor = { tipo: "persona", id: "ana" };
const luz: Autor = { tipo: "agente", id: "astraura" };
const ref = (parametroId: string): ParametroRef => ({ atomoId: "a1", parametroId });
let n = 0;
const op = (p: Parametro, accion: Accion, autor = ana): Operacion => ({ id: `o${++n}`, objetivo: ref(p.id), accion, autor, origen: "mano", t: n });
const aplicar = (est: EstadoValores, p: Parametro, accion: Accion, autor = ana) => {
  const r = aplicarOperacion(est, p, op(p, accion, autor));
  if (!r.ok) throw new Error(r.motivo);
  return r;
};

describe("valores y límites", () => {
  it("sin valor guardado usa el defecto, o el mínimo, o falso, o la primera opción", () => {
    expect(valorActual({}, ref("mezcla"), reverb)).toBe(30);
    expect(valorActual({}, ref("x"), { ...reverb, defecto: undefined })).toBe(0);
    expect(valorActual({}, ref("eco"), eco)).toBe(false);
    expect(valorActual({}, ref("tipo"), filtro)).toBe("paso bajo");
  });
  it("acota al rango y redondea los enteros; avisa de que acotó", () => {
    expect(acotar(brillo, 5)).toEqual({ valor: 3, acotado: true });
    expect(acotar(capas, 3.6)).toEqual({ valor: 4, acotado: false });
    expect(acotar(capas, 99)).toEqual({ valor: 8, acotado: true });
  });
  it("normaliza tildes y mayúsculas, y convierte unidades de la misma magnitud", () => {
    expect(normalizar("  Reverberación ")).toBe("reverberacion");
    expect(convertirUnidad(2, "kHz", "Hz")).toBe(2000);
    expect(convertirUnidad(500, "ms", "s")).toBe(0.5);
    expect(convertirUnidad(3, "dB", "Hz")).toBeNull();
  });
});

describe("operaciones exactas", () => {
  it("un valor exacto NO se ajusta al paso: 1,2 queda en 1,2 aunque el paso sea 0,5", () => {
    const r = aplicar({}, brillo, { tipo: "exacta", valor: 1.2 });
    expect(r.estado[claveDe(ref("brillo"))]).toBe(1.2);
    expect(r.cambio).toMatchObject({ antes: 1, despues: 1.2, acotado: false, reversible: true });
  });
  it("fuera de rango se deja en el límite y se cuenta", () => {
    const r = aplicar({}, brillo, { tipo: "exacta", valor: 10 });
    expect(r.cambio).toMatchObject({ despues: 3, acotado: true });
  });
  it("rechaza lo que no cuadra con el tipo", () => {
    expect(calcular(brillo, 1, { tipo: "exacta", valor: "mucho" }).ok).toBe(false);
    expect(calcular(eco, false, { tipo: "exacta", valor: 3 }).ok).toBe(false);
    expect(calcular(filtro, "banda", { tipo: "exacta", valor: "notch" }).ok).toBe(false);
    expect(calcular(brillo, 1, { tipo: "disparo" }).ok).toBe(false);
    expect(calcular(captura, false, { tipo: "exacta", valor: true }).ok).toBe(false);
  });
  it("una opción se acepta sin tildes ni mayúsculas y queda con su nombre canónico", () => {
    expect(calcular(filtro, "banda", { tipo: "exacta", valor: "PASO ALTO" })).toMatchObject({ ok: true, valor: "paso alto" });
  });
});

describe("operaciones relativas", () => {
  it("delta en unidades del parámetro", () => {
    expect(calcular(volumen, -6, { tipo: "relativa", cantidad: -3, modo: "delta" })).toMatchObject({ valor: -9 });
  });
  it("N % del valor actual: +10 % de 1 son 1,1", () => {
    expect(calcular(brillo, 1, { tipo: "relativa", cantidad: 10, modo: "porcentaje-valor" })).toMatchObject({ valor: 1.1 });
  });
  it("N % sube siempre hacia arriba, también con valores negativos", () => {
    const p = { ...brillo, min: -10, max: 10 };
    expect(calcular(p, -2, { tipo: "relativa", cantidad: 50, modo: "porcentaje-valor" })).toMatchObject({ valor: -1 });
    expect(calcular(p, -2, { tipo: "relativa", cantidad: -50, modo: "porcentaje-valor" })).toMatchObject({ valor: -3 });
  });
  it("si el valor es 0 o va en dB, el porcentaje se toma sobre el rango y lo dice", () => {
    const desdeCero = calcular(brillo, 0, { tipo: "relativa", cantidad: 10, modo: "porcentaje-valor" });
    expect(desdeCero).toMatchObject({ ok: true, valor: 0.3 });
    expect(desdeCero.ok && desdeCero.nota).toMatch(/rango/);
    expect(calcular(volumen, -6, { tipo: "relativa", cantidad: 10, modo: "porcentaje-valor" })).toMatchObject({ valor: 0.6 });
  });
  it("porcentaje del rango y pasos (por defecto el paso del parámetro)", () => {
    expect(calcular(reverb, 30, { tipo: "relativa", cantidad: 10, modo: "porcentaje-rango" })).toMatchObject({ valor: 40 });
    expect(calcular(brillo, 1, { tipo: "relativa", cantidad: 2, modo: "pasos" })).toMatchObject({ valor: 2 });
    expect(calcular(capas, 2, { tipo: "relativa", cantidad: -5, modo: "pasos" })).toMatchObject({ valor: 1, acotado: true });
  });
  it("sin rango no hay porcentaje de rango", () => {
    const libre: Parametro = { id: "l", nombre: "Libre", tipo: "numero" };
    expect(calcular(libre, 5, { tipo: "relativa", cantidad: 10, modo: "porcentaje-rango" }).ok).toBe(false);
  });
  it("las opciones se mueven por pasos sin dar la vuelta", () => {
    expect(calcular(filtro, "paso bajo", { tipo: "relativa", cantidad: 1, modo: "pasos" })).toMatchObject({ valor: "paso alto" });
    expect(calcular(filtro, "banda", { tipo: "relativa", cantidad: 1, modo: "pasos" })).toMatchObject({ valor: "banda", acotado: true });
  });
  it("un interruptor se alterna y un botón se dispara sin guardar nada", () => {
    expect(calcular(eco, false, { tipo: "alternar" })).toMatchObject({ valor: true });
    const r = aplicar({}, captura, { tipo: "disparo" });
    expect(r.estado).toEqual({});
    expect(r.cambio.reversible).toBe(false);
  });
});

describe("deshacer y rehacer", () => {
  it("deshace el cambio y no pisa a quien tocó después", () => {
    const a = aplicar({}, brillo, { tipo: "exacta", valor: 2 });
    expect(deshacerCambio(a.estado, a.cambio)).toMatchObject({ ok: true, estado: { "a1::brillo": 1 } });
    const b = aplicar(a.estado, brillo, { tipo: "exacta", valor: 2.5 }, luz);
    expect(deshacerCambio(b.estado, a.cambio).ok).toBe(false);
    expect(deshacerCambio(b.estado, a.cambio, true).ok).toBe(true);
  });
  it("cada autor deshace lo suyo y rehacer vuelve a poner lo mismo", () => {
    let est: EstadoValores = {};
    let h = historialVacio();
    for (const [p, v, autor] of [[brillo, 2, ana], [reverb, 80, luz]] as const) {
      const r = aplicar(est, p, { tipo: "exacta", valor: v }, autor);
      est = r.estado;
      h = registrar(h, r.cambio);
    }
    const u = deshacerUltimo(h, est, "ana");
    expect(u.ok && u.estado).toEqual({ "a1::brillo": 1, "a1::mezcla": 80 });
    if (!u.ok) throw new Error(u.motivo);
    const rehecho = rehacerUltimo(u.historial, u.estado, "ana");
    expect(rehecho.ok && rehecho.estado).toEqual(est);
  });
  it("no registra disparos ni cambios que no cambian nada; y avisa si no hay nada que deshacer", () => {
    const igual = aplicar({}, brillo, { tipo: "exacta", valor: 1 });
    expect(registrar(historialVacio(), igual.cambio).hechos).toHaveLength(0);
    expect(registrar(historialVacio(), aplicar({}, captura, { tipo: "disparo" }).cambio).hechos).toHaveLength(0);
    expect(deshacerUltimo(historialVacio(), {})).toMatchObject({ ok: false });
    expect(rehacerUltimo(historialVacio(), {})).toMatchObject({ ok: false });
  });
});

describe("texto para leer", () => {
  it("formatea con coma española, unidad y estado", () => {
    expect(formatearValor(brillo, 1.25)).toBe("1,25");
    expect(formatearValor(reverb, 40)).toBe("40 %");
    expect(formatearValor(volumen, -3)).toBe("-3 dB");
    expect(formatearValor(eco, true)).toBe("activado");
  });
  it("describe un cambio y marca si quedó en el límite", () => {
    const r = aplicar({}, brillo, { tipo: "exacta", valor: 9 });
    expect(describirCambio(brillo, r.cambio)).toBe("Brillo: 1 → 3 (en el límite)");
  });
});
