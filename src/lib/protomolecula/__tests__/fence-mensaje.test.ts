import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_ATOMOS_FENCE, moleculaDeFence } from "../fence-mensaje";
import { limpiarRegistro, registrarAtomo, type DefinicionAtomo } from "../registro-atomos";

const DEF: DefinicionAtomo = {
  herramientaId: "mezcla", nombre: "Mezclador", categoria: "audio", integracion: "libreria-js",
  control: "total", entradas: [], salidas: ["wav"], parametros: [
    { id: "volumen", nombre: "Volumen", tipo: "numero", min: -60, max: 6, paso: 0.5, unidad: "dB" },
    { id: "onda", nombre: "Onda", tipo: "opcion", opciones: ["seno", "cuadrada"], defecto: "seno" },
    { id: "silenciar", nombre: "Silenciar", tipo: "booleano", defecto: false },
  ],
};
const ahora = () => 1000;
const bloque = (valor: unknown): string => JSON.stringify(valor);
const ok = (r: ReturnType<typeof moleculaDeFence>) => {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.motivo);
  return r;
};

beforeEach(() => { limpiarRegistro(); expect(registrarAtomo(DEF)).toEqual({ ok: true }); });
afterEach(() => limpiarRegistro());

describe("fence-mensaje · lectura del bloque", () => {
  it("convierte un JSON válido en molécula con sus átomos", () => {
    const r = ok(moleculaDeFence(bloque({ titulo: "Sesión de voz", atomos: [{ herramienta: "mezcla" }, { herramienta: "mezcla", titulo: "Música" }] }), { ahora }));
    expect(r.molecula.titulo).toBe("Sesión de voz");
    expect(r.molecula.atomos).toHaveLength(2);
    expect(r.molecula.atomos[1]).toMatchObject({ id: "atomo-2", herramientaId: "mezcla", titulo: "Música", estado: "activo" });
    expect(r.avisos).toEqual([]);
  });

  it("da título por defecto y un id estable", () => {
    const entrada = bloque({ atomos: [{ herramienta: "mezcla" }] });
    const a = ok(moleculaDeFence(entrada, { ahora })), b = ok(moleculaDeFence(entrada, { ahora }));
    expect(a.molecula.titulo).toBe("Protomolécula del agente");
    expect(a.molecula.id).toBe(b.molecula.id);
    expect(a.molecula.id).toMatch(/^agente-[a-z0-9]+$/);
  });

  it("avisa y no añade una herramienta desconocida", () => {
    const r = ok(moleculaDeFence(bloque({ atomos: [{ herramienta: "no-existe" }] }), { ahora }));
    expect(r.molecula.atomos).toEqual([]);
    expect(r.avisos.join(" ")).toContain("no está registrada");
  });

  it("avisa cuando la herramienta es «próximamente»", () => {
    const futura: DefinicionAtomo = { ...DEF, herramientaId: "futura", proximamente: "falta el puente nativo" };
    const r = ok(moleculaDeFence(bloque({ atomos: [{ herramienta: "futura" }] }), { ahora, obtenerAtomo: (id) => (id === "futura" ? futura : undefined) }));
    expect(r.molecula.atomos).toEqual([]);
    expect(r.avisos.join(" ")).toContain("próximamente: falta el puente nativo");
  });

  it("devuelve «incompleto» mientras el mensaje se escribe en streaming", () => {
    expect(moleculaDeFence('{"titulo": "Sesión", "atomos": [{"herramienta": "mez')).toEqual({ ok: false, motivo: "incompleto" });
  });

  it("rechaza un bloque que supera los 8 KB", () => {
    const r = moleculaDeFence(bloque({ titulo: "x".repeat(9000), atomos: [{ herramienta: "mezcla" }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("8192");
  });

  it("rechaza JSON válido que no es un objeto o no trae átomos", () => {
    expect(moleculaDeFence("[1,2,3]")).toEqual({ ok: false, motivo: "El bloque debe ser un objeto JSON." });
    expect(moleculaDeFence('{"titulo":"x"}').ok).toBe(false);
  });

  it("rechaza JSON roto que sí parece cerrado", () => {
    expect(moleculaDeFence('{"atomos": }')).toEqual({ ok: false, motivo: "JSON no válido" });
  });
});

describe("fence-mensaje · valores del agente", () => {
  it("aplica el valor y lo acota al rango del parámetro", () => {
    const r = ok(moleculaDeFence(bloque({ atomos: [{ herramienta: "mezcla" }], valores: [{ atomo: 0, parametro: "volumen", valor: 999 }] }), { ahora }));
    expect(r.molecula.valores["atomo-1::volumen"]).toBe(6);
    expect(r.molecula.version).toBe(1);
    expect(r.avisos.join(" ")).toContain("se dejó en el límite");
  });

  it("aplica opciones y booleanos por nombre de parámetro", () => {
    const r = ok(moleculaDeFence(bloque({ atomos: [{ herramienta: "mezcla" }], valores: [
      { atomo: "atomo-1", parametro: "Onda", valor: "cuadrada" },
      { atomo: "atomo-1", parametro: "silenciar", valor: true },
    ] }), { ahora }));
    expect(r.molecula.valores["atomo-1::onda"]).toBe("cuadrada");
    expect(r.molecula.valores["atomo-1::silenciar"]).toBe(true);
  });

  it("resuelve el átomo por su título", () => {
    const r = ok(moleculaDeFence(bloque({ atomos: [{ herramienta: "mezcla", titulo: "Voz" }], valores: [{ atomo: "Voz", parametro: "volumen", valor: -20 }] }), { ahora }));
    expect(r.molecula.valores["atomo-1::volumen"]).toBe(-20);
  });

  it("corta en 12 átomos y lo avisa", () => {
    const atomos = Array.from({ length: MAX_ATOMOS_FENCE + 3 }, () => ({ herramienta: "mezcla" }));
    const r = ok(moleculaDeFence(bloque({ atomos }), { ahora }));
    expect(r.molecula.atomos).toHaveLength(MAX_ATOMOS_FENCE);
    expect(r.avisos.join(" ")).toContain("Solo se añadieron 12");
  });

  it.each([
    ["un átomo que no existe", { atomo: 7, parametro: "volumen", valor: -10 }, "átomo que no existe"],
    ["un parámetro que no existe", { atomo: 0, parametro: "inexistente", valor: 1 }, "no tiene el parámetro"],
    ["un átomo descartado por no estar registrado", { atomo: 0, parametro: "volumen", valor: 1 }, "átomo que no existe"],
  ])("avisa si un valor apunta a %s", (_caso, valor, esperado) => {
    const atomos = [{ herramienta: _caso.startsWith("un átomo descartado") ? "no-existe" : "mezcla" }];
    const r = ok(moleculaDeFence(bloque({ atomos, valores: [valor] }), { ahora }));
    expect(r.molecula.valores).toEqual({});
    expect(r.avisos.join(" ")).toContain(esperado);
  });
});
