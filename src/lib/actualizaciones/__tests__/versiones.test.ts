import { describe, expect, it } from "vitest";
import { neuronasAtrasadas } from "../atrasadas";
import { firmaVersiones, fusionarVersionesMedios, resumenVersionesTexto, sanearVersionesCapa } from "../versiones-capa";
import { versionSwDeCaches } from "../versiones-locales";

describe("versiones de cada capa que llegan de otros aparatos", () => {
  it("se sanean: solo capas conocidas y versiones cortas sin caracteres raros", () => {
    expect(sanearVersionesCapa({ interfaz: " 2026.10.10 ", sw: "v8-2026-07-29", magia: "1", datos: "a b", nativa: 3, modelos: "x".repeat(41) }))
      .toEqual({ interfaz: "2026.10.10", sw: "v8-2026-07-29" });
    for (const x of [null, 3, "x", [], undefined]) expect(sanearVersionesCapa(x)).toEqual({});
  });

  it("una neurona con varios medios declara la más alta de cada capa", () => {
    const v = fusionarVersionesMedios([{ v: { interfaz: "2026.10.09", nativa: "0.3.0" } }, { v: { interfaz: "2026.10.10" } }, { v: "basura" }, {}]);
    expect(v).toEqual({ interfaz: "2026.10.10", nativa: "0.3.0" });
  });

  it("texto con «sin dato» y firma estable", () => {
    expect(resumenVersionesTexto({ interfaz: "2026.10.10" }, ["datos", "interfaz"])).toBe("Datos sin dato · Interfaz 2026.10.10");
    expect(firmaVersiones({ interfaz: "1" })).toBe(firmaVersiones({ interfaz: "1" }));
    expect(firmaVersiones({ interfaz: "1" })).not.toBe(firmaVersiones({ interfaz: "2" }));
  });

  it("la versión del service worker sale del nombre de su caché", () => {
    expect(versionSwDeCaches(["otra", "starseed-runtime-v8-2026-07-29", "starseed-precache-v8-2026-07-29"])).toBe("v8-2026-07-29");
    expect(versionSwDeCaches([])).toBeNull();
  });
});

describe("neuronas atrasadas y por qué", () => {
  const ultima = { interfaz: "2026.10.10", nativa: "0.3.0" };

  it("al día no aparece; atrasada dice qué tiene, qué debería y por qué", () => {
    const r = neuronasAtrasadas(
      [
        { neuronaId: "m", nombre: "Mac", online: true, versiones: { interfaz: "2026.10.10", nativa: "0.3.0" } },
        { neuronaId: "t", nombre: "Tablet", online: true, versiones: { interfaz: "2026.10.01" }, pospuestaPor: "espera-wifi" },
      ],
      ultima,
    );
    expect(r.map((a) => [a.nombre, a.capa, a.motivo])).toEqual([
      ["Tablet", "interfaz", "espera-wifi"],
      ["Tablet", "nativa", "espera-wifi"],
    ]);
    expect(r[0].texto).toBe("Tablet va atrasada en interfaz (2026.10.01 → 2026.10.10): esperando Wi-Fi.");
  });

  it("prioridad de motivos: fallo > fuera de línea > Wi-Fi > pospuesta > manual > sin-motivo", () => {
    const base = { neuronaId: "x", nombre: "X", online: true, versiones: {} };
    const motivo = (o: object) => neuronasAtrasadas([{ ...base, ...o }], { interfaz: "2" })[0].motivo;
    expect(motivo({ fallo: "humo", online: false })).toBe("fallo");
    expect(motivo({ online: false, pospuestaPor: "llamada" })).toBe("offline");
    expect(motivo({ pospuestaPor: "llamada", manual: true })).toBe("pospuesta");
    expect(motivo({ manual: true })).toBe("manual");
    expect(motivo({})).toBe("sin-motivo");
    expect(motivo({ versiones: { interfaz: "1" } })).toBe("sin-motivo");
  });

  it("orden por nombre y capas sin versión de referencia se ignoran", () => {
    const r = neuronasAtrasadas(
      [
        { neuronaId: "2", nombre: "Zeta", online: true, versiones: {} },
        { neuronaId: "1", nombre: "Alfa", online: true, versiones: {} },
      ],
      { sw: "v9" },
    );
    expect(r.map((a) => a.nombre)).toEqual(["Alfa", "Zeta"]);
    expect(r.every((a) => a.capa === "sw")).toBe(true);
  });
});

describe("más casos de atrasos", () => {
  it("texto cuando está fuera de línea", () => {
    const ultima = { interfaz: "2026.10.10" };
    const r = neuronasAtrasadas(
      [
        { neuronaId: "o1", nombre: "Offline", online: false, versiones: {} },
      ],
      ultima,
    );
    expect(r.length).toBe(1);
    expect(r[0].motivo).toBe("offline");
    expect(r[0].texto).toBe("Offline va atrasada en interfaz (? → 2026.10.10): no está en línea.");
  });

  it("texto cuando hay fallo", () => {
    const ultima = { interfaz: "2026.10.10" };
    const r = neuronasAtrasadas(
      [
        { neuronaId: "f1", nombre: "Fallo", online: true, versiones: {}, fallo: "algo se rompió" },
      ],
      ultima,
    );
    expect(r.length).toBe(1);
    expect(r[0].motivo).toBe("fallo");
    expect(r[0].texto).toBe("Fallo va atrasada en interfaz (? → 2026.10.10): falló: algo se rompió.");
  });

  it("texto cuando está pospuesta por llamada", () => {
    const ultima = { interfaz: "2026.10.10" };
    const r = neuronasAtrasadas(
      [
        { neuronaId: "p1", nombre: "Pospuesta", online: true, versiones: {}, pospuestaPor: "llamada" },
      ],
      ultima,
    );
    expect(r.length).toBe(1);
    expect(r[0].motivo).toBe("pospuesta");
    expect(r[0].texto).toBe("Pospuesta va atrasada en interfaz (? → 2026.10.10): pospuesta por una llamada.");
  });

  it("texto cuando está en manual", () => {
    const ultima = { interfaz: "2026.10.10" };
    const r = neuronasAtrasadas(
      [
        { neuronaId: "m1", nombre: "Manual", online: true, versiones: {}, manual: true },
      ],
      ultima,
    );
    expect(r.length).toBe(1);
    expect(r[0].motivo).toBe("manual");
    expect(r[0].texto).toBe("Manual va atrasada en interfaz (? → 2026.10.10): en manual: espera a que la apliques.");
  });

  it("orden estable por nombre y luego capa con múltiples neuronas y capas", () => {
    const ultima = { datos: "1", interfaz: "1", sw: "1" };
    const r = neuronasAtrasadas(
      [
        { neuronaId: "a1", nombre: "AAA", online: true, versiones: {} },
        { neuronaId: "a2", nombre: "AAA", online: true, versiones: {} },
        { neuronaId: "b1", nombre: "BBB", online: true, versiones: {} },
      ],
      ultima,
    );
    expect(r.length).toBe(9);
    const expected = [
      ["AAA", "datos"],
      ["AAA", "datos"],
      ["AAA", "interfaz"],
      ["AAA", "interfaz"],
      ["AAA", "sw"],
      ["AAA", "sw"],
      ["BBB", "datos"],
      ["BBB", "interfaz"],
      ["BBB", "sw"],
    ];
    const actual = r.map(a => [a.nombre, a.capa]);
    expect(actual).toEqual(expected);
  });
});
