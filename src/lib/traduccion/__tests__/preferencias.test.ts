import { describe, expect, it } from "vitest";
import {
  CLAVE_TRADUCCION,
  debeTraducir,
  guardarPreferencias,
  leerPreferencias,
  preferenciasPorDefecto,
  sanearPreferencias,
} from "@/lib/traduccion/preferencias";

describe("traduccion/preferencias", () => {
  it("clave sincronizada correcta", () => {
    expect(CLAVE_TRADUCCION).toBe("starseed.traduccion.v1");
  });

  it("por defecto todo en preguntar y sin lista entiende", () => {
    const p = preferenciasPorDefecto("es-ES");
    expect(p.idioma).toBe("es-ES");
    expect(p.entiende).toEqual([]);
    expect(p.auto.paginas).toBe("preguntar");
    expect(p.auto.mensajes).toBe("preguntar");
    expect(p.auto.publicaciones).toBe("preguntar");
    expect(p.auto.agentes).toBe("preguntar");
    expect(p.auto.astraura).toBe("preguntar");
  });

  it("sanear vuelve a por defecto si inválido", () => {
    const p = sanearPreferencias(null, "en-US");
    expect(p.idioma).toBe("en-US");
    expect(p.entiende).toEqual([]);
    expect(p.auto.paginas).toBe("preguntar");
  });

  it("sanear valida modos y entiende", () => {
    const p = sanearPreferencias(
      {
        idioma: "  fr-FR  ",
        entiende: ["en", " en ", "fr", 123, ""],
        auto: { paginas: "siempre", mensajes: "nunca", publicaciones: "raro" },
      },
      "es",
    );
    expect(p.idioma).toBe("fr-FR");
    expect(p.entiende).toEqual(["en", "fr"]);
    expect(p.auto.paginas).toBe("siempre");
    expect(p.auto.mensajes).toBe("nunca");
    expect(p.auto.publicaciones).toBe("preguntar");
  });

  it("debeTraducir no traduce si idioma en entiende", () => {
    const p = preferenciasPorDefecto("es");
    p.entiende = ["en"];
    expect(debeTraducir(p, "paginas", "en-US")).toBe(false);
    expect(debeTraducir(p, "mensajes", "en")).toBe(false);
  });

  it("debeTraducir respeta nunca/siempre/preguntar", () => {
    const p = preferenciasPorDefecto("es");
    p.auto.paginas = "nunca";
    expect(debeTraducir(p, "paginas", "en")).toBe(false);
    p.auto.paginas = "siempre";
    expect(debeTraducir(p, "paginas", "en")).toBe(true);
    p.auto.paginas = "preguntar";
    expect(debeTraducir(p, "paginas", "en")).toBe(false);
  });

  it("leer/guardar usan try/catch", () => {
    expect(() => guardarPreferencias(preferenciasPorDefecto("es"))).not.toThrow();
    expect(() => leerPreferencias("es")).not.toThrow();
  });
});
