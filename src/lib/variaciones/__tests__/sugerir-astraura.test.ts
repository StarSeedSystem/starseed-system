import { describe, it, expect } from "vitest";
import { sugerirVariaciones, ESCALERA_LOCAL_PRIMERO, type AdnContexto, type PeticionAstraura } from "../sugerir-astraura";

const ADN: AdnContexto = {
  meta: { nombre: "Genesis" },
  prohibiciones: ["hex sueltos", "WebGL"],
  pruebas: [
    { id: "p1", comprobacion: "radio 0.85rem", auto: true },
    { id: "p2", comprobacion: "max 3 tamanos", auto: true },
    { id: "p3", comprobacion: "acento 20-30%", auto: true },
    { id: "p4", comprobacion: "acento cian <15%", auto: true },
    { id: "p9", comprobacion: "jugada rara 1 vez", auto: false },
  ],
};
const candidato = (extra: Record<string, unknown> = {}) => ({
  titulo: "Aurora", descripcion: "Una aurora serena", etiquetas: ["aurora"],
  payload: { fondo: "aurora" }, motivo: "encaja con el contexto",
  medidas: { p1: 0.85, p2: 3, p3: 25, p4: 10 }, ...extra,
});
async function correr(
  variaciones: unknown,
  adn: AdnContexto | null = ADN,
  contexto: { payload: unknown; codigo?: boolean } = { payload: { fondo: "aurora" } },
) {
  const peticiones: PeticionAstraura[] = [];
  const resultado = await sugerirVariaciones("fondo:aurora", { ...contexto, identidad: "Genesis" }, {
    adn,
    enrutar: async (peticion) => { peticiones.push(peticion); return { variaciones }; },
  });
  return { peticiones, resultado };
}

describe("sugerirVariaciones", () => {
  it("pide 3 con la escalera local primero y devuelve solo las que pasan validación y ADN", async () => {
    const { peticiones, resultado } = await correr([
      candidato(),
      candidato({ titulo: "Con secreto", payload: { enlace: "Bearer abcdefgh12345" } }),
      candidato({ titulo: "Fuera del ADN", medidas: { p1: 0.85, p2: 3, p3: 25, p4: 20 } }),
      candidato({ titulo: "Noche", payload: { fondo: "noche" } }),
    ]);
    expect(resultado.map((v) => v.titulo)).toEqual(["Aurora", "Noche"]);
    expect(resultado[0]).toMatchObject({ clave: "fondo:aurora", requiereAislamiento: false });
    expect(resultado[0].motivo).toContain("encaja con el contexto");
    expect(resultado[0].motivo).toContain("ADN: p1, p2, p3, p4");
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]).toMatchObject({ clave: "fondo:aurora", maximo: 3, sistema: "variaciones-publicas" });
    expect(peticiones[0].escalera).toEqual(ESCALERA_LOCAL_PRIMERO);
    expect(peticiones[0].prompt).toContain("exactamente 3");
    expect(peticiones[0].prompt).toContain("local primero");
  });

  it("no llama al enrutador si el payload capturado ya lleva un secreto", async () => {
    let llamadas = 0;
    const resultado = await sugerirVariaciones("ajuste:token", { payload: { token: "Bearer abcdefgh12345" } }, {
      adn: ADN,
      enrutar: async () => { llamadas += 1; return { variaciones: [candidato()] }; },
    });
    expect(resultado).toEqual([]);
    expect(llamadas).toBe(0);
  });

  it("sin ADN no inventa pruebas y una prueba automática sin medición no pasa", async () => {
    const sinAdn = await correr([candidato({ medidas: {} })], null);
    const sinMedida = await correr([candidato({ medidas: { p2: 3, p3: 25, p4: 10 } })]);
    expect(sinAdn.resultado[0].motivo).toContain("sin pruebas de ADN");
    expect(sinMedida.resultado).toEqual([]);
  });

  it("prohíbe hexadecimales sueltos pero permite una paleta", async () => {
    const adn: AdnContexto = { prohibiciones: ["hex sueltos"] };
    const { resultado } = await correr([
      candidato({ titulo: "Suelto", payload: { color: "#123456" } }),
      candidato({ titulo: "Paleta", payload: { paleta: ["#123456"] } }),
    ], adn);
    expect(resultado.map((v) => v.titulo)).toEqual(["Paleta"]);
  });

  it("el código se devuelve aislado y con su motivo", async () => {
    const { resultado } = await correr(
      [candidato({ payload: { html: "<p>hola</p>" } })],
      null,
      { payload: { fondo: "aurora" }, codigo: true },
    );
    expect(resultado[0]).toMatchObject({ requiereAislamiento: true });
    expect(resultado[0].motivo).toContain("se abre aislada");
  });

  it("acepta JSON en texto, no devuelve más de tres y no lanza con respuestas rotas", async () => {
    const cuatro = [1, 2, 3, 4].map((n) => candidato({ titulo: `V${n}`, medidas: {} }));
    const peticiones: PeticionAstraura[] = [];
    const resultado = await sugerirVariaciones("fondo:aurora", { payload: { fondo: "aurora" } }, {
      adn: null,
      enrutar: async (peticion) => { peticiones.push(peticion); return JSON.stringify({ variaciones: cuatro }); },
    });
    const rota = await sugerirVariaciones("fondo:aurora", { payload: { fondo: "aurora" } }, {
      adn: null, enrutar: async () => "esto no es JSON",
    });
    const caida = await sugerirVariaciones("fondo:aurora", { payload: { fondo: "aurora" } }, {
      adn: null, enrutar: async () => { throw new Error("429"); },
    });
    expect(resultado.map((v) => v.titulo)).toEqual(["V1", "V2", "V3"]);
    expect(peticiones).toHaveLength(1);
    expect(rota).toEqual([]);
    expect(caida).toEqual([]);
  });
});
