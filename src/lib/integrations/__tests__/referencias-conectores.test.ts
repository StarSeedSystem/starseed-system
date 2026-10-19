import { REFERENCIAS_DESCRIPTORS } from "../referencias-conectores";

describe("ReferenciasConectores", () => {
  it("should export at least one descriptor", () => {
    expect(Array.isArray(REFERENCIAS_DESCRIPTORS)).toBe(true);
    expect(REFERENCIAS_DESCRIPTORS.length).toBeGreaterThan(0);
  });
  it("should contain descriptor for higgsfield", () => {
    const higgs = REFERENCIAS_DESCRIPTORS.find((d) => d.id === "higgsfield");
    expect(higgs).toBeDefined();
    expect(higgs?.label).toBe("Higgsfield");
    expect(higgs?.category).toBe("data-ingest");
    expect(higgs?.needsKey).toBe(true);
  });
});
