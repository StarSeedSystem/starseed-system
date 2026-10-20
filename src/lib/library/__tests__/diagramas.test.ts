import { describe, it, expect } from "vitest";
import { STARSEED_CORE_REPO } from "../packages";

describe("Paquete de función: Diseño de Diagramas", () => {
  it("existe el paquete fn-diagram-design en el core repo", () => {
    const pkg = STARSEED_CORE_REPO.packages.find((p) => p.id === "fn-diagram-design");
    expect(pkg, "falta fn-diagram-design").toBeDefined();
    expect(pkg?.kind).toBe("function");
    expect(pkg?.name).toBe("Diseño de Diagramas");
    expect(pkg?.payload?.skillId).toBe("starseed-diagram-design");
    expect(pkg?.free).toBe(true);
  });
});