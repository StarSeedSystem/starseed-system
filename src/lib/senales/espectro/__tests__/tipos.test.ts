/**
 * Tests de tipos exportados (MRA2/MAP1116).
 */

import { describe, it, expect } from "vitest";
import { type Compatibilidad, type SinFuente } from "../modelo";

describe("Tipos exportados", () => {
  it("Compatibilidad se puede instanciar", () => {
    const c: Compatibilidad = { con: "bluetooth", que: "emparejar", posible: true, motivo: "estándar" };
    expect(c.con).toBe("bluetooth");
  });

  it("SinFuente se puede instanciar", () => {
    const sf: SinFuente = { medio: "wifi", motivo: "sin adaptador" };
    expect(sf.medio).toBe("wifi");
  });
});