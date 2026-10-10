import { describe, it, expect } from "vitest";
import { tacharTrycloudflare } from "../tunel-metagenesis-estado";

describe("tacharTrycloudflare", () => {
  it("should replace trycloudflare URLs with [túnel]", () => {
    expect(
      tacharTrycloudflare("Visita https://ejemplo.trycloudflare.com para más info")
    ).toBe("Visita [túnel] para más info");

    expect(
      tacharTrycloudflare("Múltiple: https://uno.trycloudflare.com y https://dos.trycloudflare.com")
    ).toBe("Múltiple: [túnel] y [túnel]");

    expect(
      tacharTrycloudflare("Sin coincidencia: https://example.com")
    ).toBe("Sin coincidencia: https://example.com");

    expect(
      tacharTrycloudflare("")
    ).toBe("");

    expect(
      tacharTrycloudflare("https://subdominio-dash.trycloudflare.com/path?query=value")
    ).toBe("[túnel]/path?query=value");
  });
});