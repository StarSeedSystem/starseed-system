import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_MCP } from "../herramientas";

describe("herramientas MCP exports", () => {
  it("exports 10 herramientas e incluye variaciones_buscar", () => {
    expect(HERRAMIENTAS_MCP).toHaveLength(10);
    expect(HERRAMIENTAS_MCP.some((h) => h.nombre === "variaciones_buscar")).toBe(true);
  });
});