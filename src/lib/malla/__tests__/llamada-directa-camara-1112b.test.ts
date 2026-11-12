import { describe, expect, it } from "vitest";
import { alternarCamaraDirecta } from "../llamada-directa";

describe("cámara en la llamada directa (LLA1112B)", () => {
  it("sin llamada conectada no hace nada y lo dice con palabras", async () => {
    expect(await alternarCamaraDirecta()).toBe("La llamada aún no está conectada.");
  });
});
