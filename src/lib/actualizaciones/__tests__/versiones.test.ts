import { describe, expect, it } from "vitest";
import { firmaVersiones, fusionarVersionesMedios, resumenVersionesTexto, sanearVersionesCapa } from "../versiones-capa";
import { versionSwDeCaches } from "../versiones-locales";

describe("versiones de cada capa que llegan de otros aparatos", () => {
  it("se sanean: solo capas conocidas y versiones cortas sin caracteres raros", () => {
    expect(sanearVersionesCapa({ interfaz: " 2026.10.10 ", sw: "v8-2026-07-29", magia: "1", datos: "a b", nativa: 3, modelos: "x".repeat(41) }))
      .toEqual({ interfaz: "2026.10.10", sw: "v8-2026-07-29" });
  });
  for (const x of [null, 3, "x", [], undefined]) expect(sanearVersionesCapa(x)).toEqual({});

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