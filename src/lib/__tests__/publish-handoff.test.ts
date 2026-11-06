import { describe, it, expect } from "vitest";
import {
  normalizarRefPublish,
  serializarRefPublish,
  parsearRefPublish,
} from "@/lib/library/publish-handoff";

describe("normalizarRefPublish", () => {
  it("conserva los campos útiles y recorta espacios", () => {
    expect(
      normalizarRefPublish({
        title: "  Mi lienzo  ",
        url: " https://starseed.example/a.png ",
        note: "  nota  ",
      }),
    ).toEqual({
      title: "Mi lienzo",
      url: "https://starseed.example/a.png",
      note: "nota",
    });
  });

  it("acepta una ruta interna aunque no haya título", () => {
    expect(normalizarRefPublish({ route: "/library?tab=mios" })).toEqual({
      title: "/library?tab=mios",
      route: "/library?tab=mios",
    });
  });

  it("descarta entradas sin url ni route, o que no son objetos", () => {
    expect(normalizarRefPublish({ title: "solo título" })).toBeNull();
    expect(normalizarRefPublish(null)).toBeNull();
    expect(normalizarRefPublish("texto")).toBeNull();
  });
});

describe("serializarRefPublish / parsearRefPublish", () => {
  it("ida y vuelta sin perder campos", () => {
    const ref = { title: "Cerebro", route: "/cerebro/1", note: "semilla" };
    expect(parsearRefPublish(serializarRefPublish(ref))).toEqual(ref);
  });

  it("devuelve null con JSON inválido, vacío o sin destino", () => {
    expect(parsearRefPublish("{no es json")).toBeNull();
    expect(parsearRefPublish("")).toBeNull();
    expect(parsearRefPublish(null)).toBeNull();
    expect(parsearRefPublish(JSON.stringify({ title: "sin destino" }))).toBeNull();
  });
});
