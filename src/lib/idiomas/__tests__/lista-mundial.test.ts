import { describe, it, expect } from "vitest";
import { listaMundial, agrupar, IdiomaMundial } from "../lista-mundial";
import { IDIOMAS } from "../idiomas";
import { CON_CATALOGO } from "../idiomas";

class MockDisplayNames {
  constructor(public locales: string[], public options: { type: string }) {}
  of(code: string): string | undefined {
    if (code === "invalid-code") return undefined;
    if (code === "es") return this.locales.includes("en") ? "Spanish" : "español";
    if (code === "en") return this.locales.includes("es") ? "inglés" : "English";
    if (code === "ar") return this.locales.includes("es") ? "árabe" : "Arabic";
    if (code === "fr") return this.locales.includes("es") ? "francés" : "French";
    // Si Intl falso no conoce el código, devuelve el mismo código o lanza error
    if (code === "xx" || code === "yy") {
      throw new Error("Unknown");
    }
    return code; // Omitible si devuelve el propio código
  }
}

class MockCollator {
  constructor(public locale: string, public options?: { sensitivity?: string }) {}
  compare(a: string, b: string): number {
    return a.localeCompare(b, this.locale, { sensitivity: this.options?.sensitivity ?? "base" });
  }
}

describe("lista-mundial", () => {
  it("omite códigos que no pueden ser nombrados", () => {
    const mockDN = MockDisplayNames as unknown as typeof Intl.DisplayNames;
    const mockColl = MockCollator as unknown as typeof Intl.Collator;

    const lista = listaMundial({
      idiomaActual: "es",
      displayNames: mockDN,
      collator: mockColl,
    });

    // Si of(code) devuelve code exactamente o lanza, se omite.
    // Vamos a verificar que incluye los idiomas válidos y los 36 actuales.
    expect(lista.length).toBeGreaterThan(0);
    const codigos = lista.map((i) => i.codigo);
    for (const id of IDIOMAS) {
      expect(codigos).toContain(id.codigo);
    }
  });

  it("ordena alfabéticamente según el idioma actual (es vs en)", () => {
    const mockDN = MockDisplayNames as unknown as typeof Intl.DisplayNames;
    const mockColl = MockCollator as unknown as typeof Intl.Collator;

    const listaEs = listaMundial({
      idiomaActual: "es",
      displayNames: mockDN,
      collator: mockColl,
    });

    const listaEn = listaMundial({
      idiomaActual: "en",
      displayNames: mockDN,
      collator: mockColl,
    });

    expect(listaEs.length).toBe(listaEn.length);
    // Verificar orden alfabético de nombreActual
    for (let i = 0; i < listaEs.length - 1; i++) {
      const actualA = listaEs[i].nombreActual;
      const actualB = listaEs[i + 1].nombreActual;
      expect(actualA.localeCompare(actualB, "es", { sensitivity: "base" })).toBeLessThanOrEqual(0);
    }
  });

  it("marca masHablado, dir RTL para ar, y conCatalogo correctamente", () => {
    const mockDN = MockDisplayNames as unknown as typeof Intl.DisplayNames;
    const mockColl = MockCollator as unknown as typeof Intl.Collator;

    const lista = listaMundial({
      idiomaActual: "es",
      displayNames: mockDN,
      collator: mockColl,
    });

    const arabe = lista.find((i) => i.codigo === "ar");
    expect(arabe).toBeDefined();
    expect(arabe?.dir).toBe("rtl");
    expect(arabe?.masHablado).toBe(true);

    const ingles = lista.find((i) => i.codigo === "en");
    expect(ingles?.conCatalogo).toBe(true);

    const desconocido = lista.find((i) => i.codigo === "xx");
    expect(desconocido).toBeUndefined();
  });

  it("agrupa correctamente en masHablados y todos", () => {
    const mockDN = MockDisplayNames as unknown as typeof Intl.DisplayNames;
    const mockColl = MockCollator as unknown as typeof Intl.Collator;

    const lista = listaMundial({
      idiomaActual: "es",
      displayNames: mockDN,
      collator: mockColl,
    });

    const grupos = agrupar(lista);
    expect(grupos.todos).toEqual(lista);
    expect(grupos.masHablados.every((i) => i.masHablado)).toBe(true);
  });
});
