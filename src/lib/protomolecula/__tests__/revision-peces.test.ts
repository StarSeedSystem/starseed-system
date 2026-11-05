import { describe, it, expect } from "vitest";
import { revisarCreacion } from "../revision-peces";

describe("revision-peces", () => {
  it("revisa cuando debe revisar con peces", () => {
    let guardadas: string[] = [];
    const guardar = (lecciones: string[]) => { guardadas = lecciones; };
    const result = revisarCreacion({
      creacion: {},
      perfil: {},
      ajustes: { revisionPeces: "siempre" },
      llamar: () => {},
      modelos: {},
      guardar,
    });
    expect(result.veredicto).toBe("rechaza");
    expect(result.objeciones.length).toBeGreaterThan(0);
    expect(result.lecciones.length).toBe(result.objeciones.length);
    expect(guardadas).toEqual(result.lecciones);
  });

  it("no revisa cuando está en nunca", () => {
    let guardadas: string[] = [];
    const guardar = (lecciones: string[]) => { guardadas = lecciones; };
    const result = revisarCreacion({
      creacion: {},
      perfil: {},
      ajustes: { revisionPeces: "nunca" },
      llamar: () => {},
      modelos: {},
      guardar,
    });
    expect(result.veredicto).toBe("acepta");
    expect(result.objeciones).toEqual([]);
    expect(result.lecciones).toEqual([]);
    expect(guardadas).toEqual([]);
  });
});
