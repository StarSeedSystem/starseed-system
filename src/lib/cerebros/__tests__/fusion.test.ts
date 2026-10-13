import { describe, expect, it } from "vitest";
import {
  quitarFrontmatter,
  normalizar,
  seccionesDe,
  planFusion
} from "../fusion";

describe("quitarFrontmatter", () => {
  it("removes frontmatter", () => {
    expect(quitarFrontmatter("---\ntest\n---\ncontent")).toBe("content");
  });
});

describe("normalizar", () => {
  it("normalizes text", () => {
    expect(normalizar("---\ntest\n---\n  content  ")).toBe("content");
  });
});

describe("seccionesDe", () => {
  it("divides by ## ", () => {
    expect(seccionesDe("## s1\nc1\n## s2\nc2")).toEqual(["## s1\nc1", "## s2\nc2"]);
  });
});

const fecha = "2026-10-13";
const prefs: Record<string, Record<string, unknown>> = {};

const destino = {
  id: "destino",
  includes: {
    vaults: ["v1"], backends: ["b1"], personalities: ["p1"], runtimes: ["r1"], tokens: ["t1"], memories: ["m1"], connections: ["c1"],
    bindScope: true,
    permissions: [{ who: "user1", level: "lectura" }],
    aiProvider: "prov1"
  },
  servers: [{ id: "s1", kind: "local", name: "Local", endpoint: "http://localhost" }],
  config: { existing: "value" }
};

const origen1 = {
  id: "origen1",
  includes: {
    vaults: ["v2"], backends: ["b2"], personalities: ["p2"], runtimes: ["r2"], tokens: ["t2"], memories: ["m2"], connections: ["c2"],
    bindScope: false,
    permissions: [{ who: "user2", level: "escritura" }],
    aiProvider: "prov2"
  },
  servers: [{ id: "s2", kind: "online", name: "Online", endpoint: "http://example.com" }],
  config: { new: "value" }
};

const origen2 = {
  id: "origen2",
  includes: {
    vaults: ["v3"], backends: ["b3"], personalities: ["p3"], runtimes: ["r3"], tokens: ["t3"], memories: ["m3"], connections: ["c3"],
    bindScope: true,
    permissions: [{ who: "user3", level: "admin" }],
    aiProvider: undefined
  },
  servers: [{ id: "s3", kind: "starseed", name: "StarSeed" }],
  config: { another: "value" }
};

const archivos = [
  { brain_id: "destino", name: "mem.md", content: "# D\n\n## Sec D\nCont D." },
  { brain_id: "origen1", name: "mem.md", content: "# O1\n\n## Sec O1\nCont O1." },
  { brain_id: "origen2", name: "mem.md", content: "# O2\n\n## Sec O2\nCont O2." },
  { brain_id: "origen1", name: "onlyO1.md", content: "# Only O1\n\nCont." },
  { brain_id: "destino", name: "same.md", content: "# Same\n\nMismo." },
  { brain_id: "origen1", name: "same.md", content: "# Same\n\nMismo." }
];

describe("planFusion", () => {
  it("copies file that destino doesn't have", () => {
    const r = planFusion({ destino, origenes: [origen1, origen2], archivos, prefs, fecha });
    const f = r.archivos.find(a => a.name === "onlyO1.md");
    expect(f?.accion).toBe("copiar");
    expect(f?.desde).toEqual(["origen1"]);
    expect(f?.idDestino).toBeUndefined();
    expect(f?.contenido).toContain("# Only O1");
    expect(f?.bytesQueEntran).toBeGreaterThan(0);
  });

  it("omits file with same normalized content", () => {
    const r = planFusion({ destino, origenes: [origen1, origen2], archivos, prefs, fecha });
    const f = r.archivos.find(a => a.name === "same.md");
    expect(f?.accion).toBe("omitir");
    expect(f?.desde).toEqual(["origen1"]);
    expect(f?.idDestino).toBe("destino");
    expect(f?.contenido).toBe("# Same\n\nMismo.");
    expect(f?.bytesQueEntran).toBe(0);
  });

  it("appends new sections", () => {
    const r = planFusion({ destino, origenes: [origen1, origen2], archivos, prefs, fecha });
    const f = r.archivos.find(a => a.name === "mem.md");
    expect(f?.accion).toBe("anexar");
    expect(f?.desde).toEqual(["origen1", "origen2"]);
    expect(f?.idDestino).toBe("destino");
    expect(f?.contenido).toContain("# D\n\n## Sec D\nCont D.");
    expect(f?.contenido).toContain("## Fusionado de «origen1» (origen1) · 2026-10-13");
    expect(f?.contenido).toContain("## Fusionado de «origen2» (origen2) · 2026-10-13");
    expect(f?.bytesQueEntran).toBeGreaterThan(0);
  });

  it("combines includes, servers, config, and prefs", () => {
    const r = planFusion({ destino, origenes: [origen1, origen2], archivos, prefs, fecha });
    // includes
    expect(r.includes.vaults).toEqual(expect.arrayContaining(["v1", "v2", "v3"]));
    expect(r.includes.bindScope).toBe(true);
    expect(r.includes.aiProvider).toBe("prov1");
    // servers
    expect(r.servers).toHaveLength(3);
    // config
    expect(r.config.fusionados).toEqual(expect.arrayContaining(["origen1", "origen2"]));
    expect(r.config.fusionadoEn).toBe("2026-10-13");
    // prefs
    const prefsWithDestino: Record<string, Record<string, unknown>> = {
      destino: { existingKey: "destinoValue" },
      origen1: { existingKey: "origenValue", origenOnly: "origenValue" },
      origen2: { otro: "otroValue" }
    };
    const r2 = planFusion({ destino, origenes: [origen1, origen2], archivos: [{ brain_id: "destino", name: "test.md", content: "test" }], prefs: prefsWithDestino, fecha });
    expect(r2.prefs.existingKey).toBe("destinoValue");
    expect(r2.prefs.origenOnly).toBe("origenValue");
    expect(r2.prefs.otro).toBe("otroValue");
  });
});