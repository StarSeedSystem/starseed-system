import { describe, it, expect } from "vitest";
import { puedeActuar } from "@/lib/mausbot/cursor-agente";

describe("puedeActuar", () => {
  it("niega si permisos están en falso", () => {
    const res = puedeActuar({ agent: false, screenVoice: true }, "aplicar", true);
    expect(res.permitido).toBe(false);
  });

  it("proponer nunca permite", () => {
    const res = puedeActuar({ agent: true, screenVoice: true }, "proponer", true);
    expect(res.permitido).toBe(false);
  });

  it("aplicar-bajo requiere reversibilidad", () => {
    const resOk = puedeActuar({ agent: true, screenVoice: true }, "aplicar-bajo", true);
    const resNo = puedeActuar({ agent: true, screenVoice: true }, "aplicar-bajo", false);
    expect(resOk.permitido).toBe(true);
    expect(resNo.permitido).toBe(false);
  });
});
