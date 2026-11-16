import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER } from "../index";

describe("registro de abliteration", () => {
  it("proviene en el registro" , () => {
    expect(PROVIDERS).toHaveProperty("abliteration");
    const p = PROVIDERS["abliteration"];
    expect(p).toBeDefined();
    expect(p.info).toBeDefined();
    expect(p.info.requiresKey).toBe(true);
  });

  it("se coloca al final de la lista de orden", () => {
    const last = PROVIDER_ORDER[PROVIDER_ORDER.length - 1];
    expect(last).toBe("abliteration");
  });
});
