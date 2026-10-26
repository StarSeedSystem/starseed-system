import { describe, it, expect } from "vitest";
import { sugerirVariaciones } from "../sugerir-astraura";

describe("sugerirVariaciones", () => {
  it("devuelve variaciones válidas del enrutador falso", async () => {
    const enrutador = {
      sugerirVariaciones: async () => [
        { variacion: { color: "#007FFF", nombre: "Zenith" }, motivo: "ajuste de acento" },
        { variacion: { color: "#10B981", nombre: "Horizonte" }, motivo: "variación de paleta" },
        { variacion: { color: "#FFBF00", nombre: "Lógica" }, motivo: "refresco de contraste" },
      ],
    };
    const resultado = await sugerirVariaciones("tema:synthwave", { payload: {} }, { enrutador });
    expect(resultado).toHaveLength(3);
    expect(resultado[0].motivo).toBe("ajuste de acento");
  });

  it("filtra variaciones que fallan validarVariacion", async () => {
    const enrutador = {
      sugerirVariaciones: async () => [
        { variacion: { enlace: "https://ejemplo.com" }, motivo: "buena" },
        { variacion: { "starseed.dock.items.v2": true }, motivo: "privada" },
        { variacion: { enlace: "javascript:alert(1)" }, motivo: "url mala" },
      ],
    };
    const resultado = await sugerirVariaciones("widget:clima", { payload: {} }, { enrutador });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].motivo).toBe("buena");
  });

  it("filtra variaciones que incumplen prohibiciones del ADN", async () => {
    const enrutador = {
      sugerirVariaciones: async () => [
        { variacion: { nota: "sin problemas" }, motivo: "ok" },
        { variacion: { nota: "contiene hex sueltos en texto" }, motivo: "prohibido" },
      ],
    };
    const adn = { prohibiciones: ["hex sueltos"] };
    const resultado = await sugerirVariaciones("tema:aurora", { payload: {}, adn }, { enrutador });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].motivo).toBe("ok");
  });

  it("devuelve vacío sin enrutador", async () => {
    const resultado = await sugerirVariaciones("app:notas", { payload: {} }, {});
    expect(resultado).toEqual([]);
  });
});
