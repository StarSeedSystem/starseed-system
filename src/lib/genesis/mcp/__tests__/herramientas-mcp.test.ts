import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_MCP } from "../../herramientas";

describe("herramientas MCP exports", () => {
  it("exports 9 herramientas", () => {
    expect(HERRAMIENTAS_MCP).toHaveLength(9);
  });
});