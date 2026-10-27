import { describe, expect, it } from "vitest";
import { TipoEntidad } from "../politica";
import {
  decidirPolitica, politicaPorDefecto, sanearPolitica, VENTANA_NOCTURNA,
} from "../politica";

describe("política de actualización · casos del rescate no cubiertos en main", () => {
  it("los tipos que no son el OS comparten la política base", () => {
    const base = politicaPorDefecto("perfil");
    const otros: TipoEntidad[] = ["pagina", "grupo", "comunidad", "estudio", "evento"];
    for (const tipo of otros) expect(politicaPorDefecto(tipo)).toEqual(base);
  });

  it("programada sin ventana decide con la nocturna por defecto", () => {
    expect(decidirPolitica({ modo: "programada" }, { ahoraH: 3, esNeuronaElegida: false })).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada" }, { ahoraH: 12, esNeuronaElegida: false })).toBe("esperar");
  });

  it("ventana: hora de inicio incluida y de fin excluida", () => {
    const p = { modo: "programada" as const, ventana: { desdeH: 10, hastaH: 14 } };
    expect(decidirPolitica(p, { ahoraH: 10, esNeuronaElegida: false })).toBe("aplicar");
    expect(decidirPolitica(p, { ahoraH: 14, esNeuronaElegida: false })).toBe("esperar");
  });

  it("sanear conserva una ventana válida, incluso cruzando medianoche", () => {
    const p = sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } } });
    expect(p.modelos.ventana).toEqual({ desdeH: 22, hastaH: 4 });
    expect(sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 30, hastaH: -1 } } }).modelos)
      .toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
  });

  it("sanear: las seis capas en orden aunque la entrada sea basura", () => {
    expect(Object.keys(sanearPolitica(null))).toEqual(["datos", "interfaz", "sw", "servicios", "modelos", "nativa"]);
  });
});
