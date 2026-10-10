/**
 * Elección de enlace del transporte universal y reparto multitrayecto (puro).
 * Contrato: architecture/transporte-universal-sin-internet.md.
 */
import { describe, expect, it } from "vitest";
import {
  crearSelectorPonderado,
  elegirEnlaces,
  enlacesParaReparto,
  LORA_MAX_BYTES,
  planReparto,
  rangoEnlace,
  type EnlaceDisponible,
} from "@/lib/malla/eleccion-enlace";

function enlace(p: Partial<EnlaceDisponible> & Pick<EnlaceDisponible, "id" | "tipo">): EnlaceDisponible {
  return {
    etiqueta: p.id,
    alcanza: { syncDeviceId: "B" },
    abierto: true,
    sinInternet: false,
    admite: { mensaje: true, archivo: true, flujo: false },
    ...p,
  };
}

const local = enlace({ id: "local:1", tipo: "local", sinInternet: true, admite: { mensaje: true, archivo: true, flujo: true } });
const cuentaLan = enlace({ id: "cuenta:B", tipo: "cuenta", ruta: "misma-red-local", rttMs: 4 });
const cuentaNet = enlace({ id: "cuenta:B2", tipo: "cuenta", ruta: "internet-directo", rttMs: 40 });
const cuentaTurn = enlace({ id: "cuenta:B3", tipo: "cuenta", ruta: "reenviado-turn", rttMs: 90 });
const rele = enlace({ id: "rele", tipo: "rele", alcanza: { difusion: true }, admite: { mensaje: true, archivo: false, flujo: false } });
const lora = enlace({ id: "lora", tipo: "lora", alcanza: { difusion: true }, sinInternet: true, maxBytes: LORA_MAX_BYTES, admite: { mensaje: true, archivo: false, flujo: false } });

describe("elegirEnlaces — del más directo al menos directo", () => {
  it("ordena local > P2P por la red local > P2P por internet > TURN > relé > LoRa", () => {
    const todos = [lora, rele, cuentaTurn, cuentaNet, cuentaLan, local];
    const r = elegirEnlaces(todos, { syncDeviceId: "B", identidadRele: "fp", nodoLora: 7 }, "mensaje", 50);
    expect(r.elegidos.map((e) => e.enlace.id)).toEqual(["local:1", "cuenta:B", "cuenta:B2", "cuenta:B3", "rele", "lora"]);
    expect(r.elegidos.map((e) => e.rango)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("dentro del mismo rango gana la menor latencia medida y la que no tiene medida va detrás", () => {
    const a = enlace({ id: "cuenta:a", tipo: "cuenta", rttMs: 80 });
    const b = enlace({ id: "cuenta:b", tipo: "cuenta", rttMs: 12 });
    const c = enlace({ id: "cuenta:c", tipo: "cuenta", rttMs: null });
    expect(elegirEnlaces([a, c, b], { syncDeviceId: "B" }, "mensaje").elegidos.map((e) => e.enlace.id)).toEqual(["cuenta:b", "cuenta:a", "cuenta:c"]);
  });

  it("LoRa solo lleva mensajes cortos y nunca archivos; el relé no lleva archivos", () => {
    const grande = elegirEnlaces([lora], { nodoLora: 3 }, "mensaje", LORA_MAX_BYTES + 1);
    expect(grande.elegidos).toHaveLength(0);
    expect(grande.descartados[0].motivo).toMatch(/supera/);
    const archivo = elegirEnlaces([lora, rele], { nodoLora: 3, identidadRele: "fp" }, "archivo", 10);
    expect(archivo.elegidos).toHaveLength(0);
    expect(archivo.descartados.map((d) => d.motivo).join(" ")).toMatch(/LoRa no lleva archivos.*relé del servidor no lleva archivos/);
  });

  it("relé y LoRa solo cuentan si el destino trae su identidad (huella o nodo)", () => {
    const r = elegirEnlaces([rele, lora], { uid: "u1" }, "mensaje", 10);
    expect(r.elegidos).toHaveLength(0);
    expect(r.descartados.every((d) => d.motivo === "no llega a ese destino")).toBe(true);
  });

  it("descarta lo cerrado y dice por qué; un destino por enlace concreto manda sobre todo", () => {
    const cerrado = enlace({ id: "local:2", tipo: "local", abierto: false });
    const r = elegirEnlaces([cerrado, cuentaNet], { syncDeviceId: "B" }, "mensaje");
    expect(r.elegidos.map((e) => e.enlace.id)).toEqual(["cuenta:B2"]);
    expect(r.descartados).toContainEqual({ id: "local:2", tipo: "local", motivo: "no está abierto ahora" });
    expect(elegirEnlaces([local, cuentaLan], { enlaceId: "cuenta:B" }, "mensaje").elegidos.map((e) => e.enlace.id)).toEqual(["cuenta:B"]);
  });

  it("las llamadas (flujo) solo van por el enlace local", () => {
    const r = elegirEnlaces([cuentaLan, local], { syncDeviceId: "B" }, "flujo");
    expect(r.elegidos.map((e) => e.enlace.id)).toEqual(["local:1"]);
    expect(r.descartados[0].motivo).toMatch(/audio ni vídeo/);
  });

  it("un destino «persona» llega por cualquiera de sus aparatos (uid)", () => {
    const otro = enlace({ id: "par:v1", tipo: "par", alcanza: { syncDeviceId: "Z", uid: "u9" } });
    expect(elegirEnlaces([otro, local], { uid: "u9" }, "mensaje").elegidos.map((e) => e.enlace.id)).toEqual(["par:v1"]);
    expect(rangoEnlace(otro)).toBe(2);
  });
});

describe("enlacesParaReparto — solo P2P y solo al MISMO aparato", () => {
  it("no reparte un archivo entre aparatos distintos de la misma persona", () => {
    const movil = enlace({ id: "local:m", tipo: "local", alcanza: { syncDeviceId: "M", uid: "u" } });
    const movilCuenta = enlace({ id: "cuenta:M", tipo: "cuenta", ruta: "misma-red-local", alcanza: { syncDeviceId: "M", uid: "u" } });
    const portatil = enlace({ id: "cuenta:P", tipo: "cuenta", ruta: "misma-red-local", rttMs: 1, alcanza: { syncDeviceId: "P", uid: "u" } });
    const r = elegirEnlaces([portatil, movilCuenta, movil, rele], { uid: "u", identidadRele: "fp" }, "archivo");
    expect(enlacesParaReparto(r).map((e) => e.id)).toEqual(["local:m", "cuenta:M"]);
  });
});

describe("planReparto — proporcional a la capacidad medida", () => {
  it("suma siempre el total y respeta la proporción", () => {
    const r = planReparto(16 * 1024 * 100, 16 * 1024, [
      { id: "a", capacidadKbps: 30_000 },
      { id: "b", capacidadKbps: 10_000 },
    ]);
    expect(r.trozos).toBe(100);
    expect(r.porEnlace).toEqual({ a: 75, b: 25 });
  });

  it("sin medida no inventa velocidad: cuenta como la mediana de los medidos, o todos iguales", () => {
    const r = planReparto(9, 1, [{ id: "a", capacidadKbps: 2000 }, { id: "b", capacidadKbps: null }, { id: "c" }]);
    expect(r.porEnlace).toEqual({ a: 3, b: 3, c: 3 });
    const sin = planReparto(10, 1, [{ id: "x" }, { id: "y" }]);
    expect(sin.porEnlace.x + sin.porEnlace.y).toBe(10);
    expect(Math.abs(sin.porEnlace.x - sin.porEnlace.y)).toBeLessThanOrEqual(1);
  });

  it("un archivo vacío no tiene trozos y uno pequeño tiene uno", () => {
    expect(planReparto(0, 1024, [{ id: "a" }]).trozos).toBe(0);
    expect(planReparto(5, 1024, [{ id: "a" }]).porEnlace).toEqual({ a: 1 });
  });
});

describe("crearSelectorPonderado — intercalado y con saltos", () => {
  it("intercala según el peso (3:1) en vez de agotar uno primero", () => {
    const s = crearSelectorPonderado([{ id: "a", peso: 3 }, { id: "b", peso: 1 }]);
    const orden = Array.from({ length: 8 }, () => s.siguiente());
    expect(orden.filter((x) => x === "a")).toHaveLength(6);
    expect(orden.filter((x) => x === "b")).toHaveLength(2);
    expect(orden.slice(0, 4)).toContain("b");
  });

  it("salta el enlace excluido y devuelve null si no queda ninguno", () => {
    const s = crearSelectorPonderado([{ id: "a", peso: 1 }, { id: "b", peso: 1 }]);
    expect(s.siguiente(new Set(["a"]))).toBe("b");
    expect(s.siguiente(new Set(["a", "b"]))).toBeNull();
  });
});
