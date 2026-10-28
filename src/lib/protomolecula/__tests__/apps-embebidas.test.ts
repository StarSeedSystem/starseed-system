import { APPS_EMBEBIDAS } from "../apps-embebidas";
import { esUrlEmbebible } from "../puente-herramientas";
import type { DefinicionAtomo } from "../registro-atomos";

const testURL = (app: DefinicionAtomo, index: number) => {
  if (!app.vista || app.vista.tipo !== "externa") throw new Error(`app ${index} no tiene vista externa`);
  const { url } = app.vista;
  if (!url) throw new Error(`app ${index} sin url`);
  const res = esUrlEmbebible(url, "http://localhost:9002");
  if (!res.ok) throw new Error(`url no embevale ${url}: ${res.motivo}`);
};

describe("Apps Embebidas", () => {
  it("debe exportar APPS_EMBEBIDAS con estructura válida", () => {
    expect(APPS_EMBEBIDAS).toBeInstanceOf(Array);
    expect(APPS_EMBEBIDAS.length).toBe(4);
    const ids = new Set<string>();
    APPS_EMBEBIDAS.forEach((app, i) => {
      expect(app).toHaveProperty("herramientaId");
      expect(app.herramientaId).toMatch(/^[a-z0-9][a-z0-9._-]{0,63}$/));
      ids.add(app.herramientaId);
      expect(app.control).toBe("ventana");
      expect(app.parametros).toEqual([]);
      expect(app.vista?.tipo).toBe("externa");
      expect(app.proximamente).toBeUndefined();
      expect(app.ficha).toBeDefined();
      expect(app.ficha?.web).toBeDefined();
      expect(app.ficha?.repo).toBeDefined();
      expect(app.ficha?.licencia).toBeDefined();
      testURL(app, i);
    });
    expect(ids.size).toBe(APPS_EMBEBIDAS.length);
  });
});
