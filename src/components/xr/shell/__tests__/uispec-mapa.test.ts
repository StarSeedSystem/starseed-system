import { describe, it, expect } from "vitest";
import { aEscena3D } from "../uispec-mapa";
import { UiSpec } from "../../../../lib/nucleo/ui-spec";

describe("uispec-mapa", () => {
  it("mapea un panel a tarjeta", () => {
    const spec: UiSpec = {
      version: 1,
      superficie: "test",
      bloques: [{ tipo: "panel", id: "p1", props: { titulo: "Hola" } }]
    };
    const escena = aEscena3D(spec);
    expect(escena[0].tipo).toBe("tarjeta");
    expect(escena[0].bloqueId).toBe("p1");
  });

  it("mapea acciones a botones", () => {
    const spec: UiSpec = {
      version: 1,
      superficie: "test",
      bloques: [{ 
        tipo: "acciones", 
        id: "a1", 
        props: { acciones: ["btn1", "btn2"] } 
      }]
    };
    const escena = aEscena3D(spec);
    expect(escena[0].hijos.length).toBe(2);
    expect(escena[0].hijos[0].tipo).toBe("boton");
    expect(escena[0].hijos[0].bloqueId).toBe("btn1");
  });
});
