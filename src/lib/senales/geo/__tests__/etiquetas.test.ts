import { describe, expect, it } from "vitest";
import { direccionEtiqueta } from "../etiquetas";

const TAM = { x: 360, y: 520 };
describe("direccionEtiqueta", () => {
  it("en el centro: arriba (abajo para este aparato)", () => {
    expect(direccionEtiqueta({ x: 180, y: 260 }, TAM, false)).toBe("top");
    expect(direccionEtiqueta({ x: 180, y: 260 }, TAM, true)).toBe("bottom");
  });
  it("pegada a un lado: la etiqueta se abre hacia dentro", () => {
    expect(direccionEtiqueta({ x: 20, y: 260 }, TAM, false)).toBe("right");
    expect(direccionEtiqueta({ x: 350, y: 260 }, TAM, false)).toBe("left");
  });
  it("pegada arriba: debajo; fuera del mapa: sin etiqueta", () => {
    expect(direccionEtiqueta({ x: 180, y: 10 }, TAM, false)).toBe("bottom");
    expect(direccionEtiqueta({ x: 400, y: 260 }, TAM, false)).toBe("fuera");
    expect(direccionEtiqueta({ x: 180, y: -30 }, TAM, true)).toBe("fuera");
  });
});
