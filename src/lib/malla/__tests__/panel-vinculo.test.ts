import { describe, expect, it } from "vitest";
import {
  ambitoDeNeurona,
  capasAnunciadas,
  compararCapas,
  esCuentaPropia,
  filaDeVinculo,
  filasOrdenadas,
  haceCuanto,
  mejorVia,
  nivelLatencia,
  ordenarVias,
  resumenLista,
  separarCapacidades,
  textoLatencia,
  type VinculoMinimo,
} from "../panel-vinculo";
import type { LatenciaVia, SincronizacionResumen, ViaSync } from "../sincronizacion-neuronas";

const via = (v: ViaSync, disponible: boolean, latenciaMs: number | null = null): LatenciaVia => ({
  via: v,
  disponible,
  latenciaMs,
  medidoEn: latenciaMs == null ? null : 1,
  detalle: "",
});

const sinc = (estado: SincronizacionResumen["estado"]): SincronizacionResumen => ({
  id: estado,
  direccion: "saliente",
  estado,
  via: null,
  auto: false,
  desde: 0,
  actualizada: 0,
  texto: "",
});

const v = (p: Partial<VinculoMinimo> & { neurona: string }): VinculoMinimo => ({
  nombre: p.neurona,
  recordado: false,
  enRedLocal: false,
  vias: [],
  sincronizaciones: [],
  ...p,
});

describe("latencia", () => {
  it("dice «sin medir» cuando no hay medida, nunca un número inventado", () => {
    expect(textoLatencia(null)).toBe("sin medir");
    expect(textoLatencia(undefined)).toBe("sin medir");
    expect(textoLatencia(NaN)).toBe("sin medir");
    expect(textoLatencia(-3)).toBe("sin medir");
  });
  it("formatea ms y segundos", () => {
    expect(textoLatencia(0)).toBe("<1 ms");
    expect(textoLatencia(12.4)).toBe("12 ms");
    expect(textoLatencia(1234)).toBe("1,2 s");
  });
  it("niveles con umbrales 50 y 250 ms", () => {
    expect(nivelLatencia(null)).toBe("sin-medir");
    expect(nivelLatencia(50)).toBe("rapida");
    expect(nivelLatencia(51)).toBe("normal");
    expect(nivelLatencia(250)).toBe("normal");
    expect(nivelLatencia(251)).toBe("lenta");
  });
  it("haceCuanto", () => {
    expect(haceCuanto(null, 1000)).toBe("nunca");
    expect(haceCuanto(1000, 3000)).toBe("ahora");
    expect(haceCuanto(0, 30_000)).toBe("hace 30 s");
    expect(haceCuanto(0, 5 * 60_000)).toBe("hace 5 min");
    expect(haceCuanto(0, 3 * 3600_000)).toBe("hace 3 h");
  });
});

describe("mejor vía", () => {
  it("ninguna disponible → null", () => {
    expect(mejorVia([])).toBeNull();
    expect(mejorVia([via("rele", false, 10)])).toBeNull();
  });
  it("gana la de menor latencia medida", () => {
    expect(mejorVia([via("rele", true, 90), via("malla-cuenta", true, 20), via("red-local-nativa", true, 40)])?.via).toBe("malla-cuenta");
  });
  it("una vía medida gana a una sin medir", () => {
    expect(mejorVia([via("red-local-nativa", true, null), via("rele", true, 300)])?.via).toBe("rele");
  });
  it("sin ninguna medida, la más directa por el orden fijo", () => {
    expect(mejorVia([via("rele", true), via("enlace-local", true), via("malla-cuenta", true)])?.via).toBe("enlace-local");
  });
  it("una no disponible no gana aunque tenga buena medida vieja", () => {
    expect(mejorVia([via("red-local-nativa", false, 1), via("rele", true, 400)])?.via).toBe("rele");
  });
  it("ordenarVias: la mejor primero, luego las demás disponibles y al final las caídas", () => {
    const o = ordenarVias([via("lora", false), via("rele", true, 300), via("malla-cuenta", true, 20), via("enlace-local", true)]);
    expect(o.map((x) => x.via)).toEqual(["malla-cuenta", "enlace-local", "rele", "lora"]);
  });
});

describe("filas de la lista", () => {
  it("fila con camino: mejor vía y latencia; sincronizaciones en curso (no las terminales)", () => {
    const f = filaDeVinculo(
      v({
        neurona: "tab-1",
        nombre: "Tablet",
        plataforma: "Android",
        medio: "app-nativa",
        recordado: true,
        vias: [via("red-local-nativa", true, 3)],
        sincronizaciones: [sinc("enviada"), sinc("vinculada"), sinc("rechazada"), sinc("recibida")],
      }),
    );
    expect(f).toMatchObject({ activa: true, resumen: "Red local (app nativa) · 3 ms", nivel: "rapida", enCurso: 2, medioTexto: "Android · app nativa", recordado: true });
  });
  it("fila sin camino lo dice", () => {
    expect(filaDeVinculo(v({ neurona: "x", vias: [via("rele", false)] }))).toMatchObject({ activa: false, resumen: "sin camino ahora", nivel: "sin-medir", medioTexto: "medio desconocido" });
  });
  it("orden: activas por latencia (medidas antes), luego sin camino por nombre", () => {
    const filas = filasOrdenadas([
      v({ neurona: "z", nombre: "Zeta", vias: [] }),
      v({ neurona: "lenta", nombre: "Lenta", vias: [via("rele", true, 300)] }),
      v({ neurona: "sinmedir", nombre: "SinMedir", vias: [via("malla-cuenta", true)] }),
      v({ neurona: "rapida", nombre: "Rápida", vias: [via("red-local-nativa", true, 4)] }),
      v({ neurona: "a", nombre: "Alfa", vias: [] }),
    ]);
    expect(filas.map((f) => f.neurona)).toEqual(["rapida", "lenta", "sinmedir", "a", "z"]);
  });
  it("resumen de la lista", () => {
    expect(resumenLista([])).toBe("Ninguna neurona vinculada todavía.");
    const filas = filasOrdenadas([
      v({ neurona: "a", vias: [via("rele", true, 10)], sincronizaciones: [sinc("enviada")] }),
      v({ neurona: "b", vias: [] }),
    ]);
    expect(resumenLista(filas)).toBe("2 vinculadas · 1 con camino ahora · 1 sincronización en curso");
  });
});

describe("de quién es la neurona", () => {
  it("propia → personal y privada", () => {
    expect(ambitoDeNeurona({ propia: true })).toMatchObject({ cuenta: "propia", visibilidad: "privada", uso: "personal", etiqueta: "Personal · privada" });
  });
  it("ajena pública / ajena anónima: no se sabe si es comunitaria", () => {
    expect(ambitoDeNeurona({ propia: false, publico: true })).toMatchObject({ visibilidad: "publica", uso: "sin-dato", etiqueta: "De otra cuenta · pública" });
    expect(ambitoDeNeurona({ propia: false })).toMatchObject({ visibilidad: "anonima", uso: "sin-dato" });
    expect(ambitoDeNeurona({ propia: false }).detalle).toMatch(/no se sabe/);
  });
  it("sin dato lo dice y no inventa", () => {
    expect(ambitoDeNeurona({})).toMatchObject({ cuenta: "desconocida", visibilidad: "desconocida", etiqueta: "De quién es: sin dato" });
  });
  it("esCuentaPropia compara cuentas y devuelve undefined si falta una", () => {
    expect(esCuentaPropia("u1", "u1")).toBe(true);
    expect(esCuentaPropia("u2", "u1")).toBe(false);
    expect(esCuentaPropia(undefined, "u1")).toBeUndefined();
    expect(esCuentaPropia("u1", null)).toBeUndefined();
  });
});

describe("capas de conciencia compartidas", () => {
  it("se anuncian las encendidas, y NUNCA el contexto personal", () => {
    expect(capasAnunciadas({ activo: true, capas: { local: true, mesh: false, nube: true, colectiva: true, contextoPersonal: true } })).toEqual(["capa:local", "capa:nube", "capa:colectiva"]);
  });
  it("lo no guardado cuenta como encendido (misma regla que el enrutador); el interruptor general manda", () => {
    expect(capasAnunciadas({ activo: true, capas: {} })).toEqual(["capa:local", "capa:mesh", "capa:nube", "capa:colectiva"]);
    expect(capasAnunciadas({ activo: false, capas: { local: true } })).toEqual([]);
  });
  it("separa capas de otras capacidades e ignora capas desconocidas y repetidas", () => {
    expect(separarCapacidades(["WebRTC", "capa:mesh", "capa:mesh", "capa:inventada", "capa:local", " "])).toEqual({ capas: ["local", "mesh"], otras: ["WebRTC"] });
  });
  it("compara: compartidas, solo mías, solo suyas; sin anuncio no se sabe", () => {
    expect(compararCapas(["capa:local", "capa:mesh", "capa:nube"], ["capa:mesh", "capa:colectiva", "capa:nube"])).toEqual({
      compartidas: ["mesh", "nube"],
      soloMias: ["local"],
      soloSuyas: ["colectiva"],
      sinAnuncio: false,
    });
    expect(compararCapas(["capa:local"], ["WebRTC"])).toMatchObject({ compartidas: [], soloMias: ["local"], sinAnuncio: true });
  });
});
