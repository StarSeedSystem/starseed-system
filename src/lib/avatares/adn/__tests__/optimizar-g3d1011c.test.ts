import { describe, it, expect } from "vitest";
import { parseArgs, escribirManifiesto, validarPesoMax } from "../../../../../servicios/taller-3d/optimizar.mjs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promises as fs } from "node:fs";

// Helper to create a mock GLB buffer with correct header
const createGlb = (size = 24) => {
  const buf = Buffer.alloc(size);
  // GLB header: "glTF" 0x46546c67 little endian
  buf.writeInt32LE(0x46546c67, 0);
  buf.writeInt32LE(2, 4); // version
  buf.writeInt32LE(size, 8); // total length
  return buf;
};

describe("optimizar.mjs expanded tests", () => {
  it("parseArgs throws on missing required --plan", async () => {
    let error: Error | undefined;
    try {
      parseArgs(["node", "script.mjs", "--entrada", "a.glb", "--output", "out.glb"]);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/plan.*required/i);
  });

  it("escribirManifiesto writes JSON with correct fields", async () => {
    const tmp = join(tmpdir(), `starseed-test-${Date.now()}`);
    await fs.mkdir(tmp, { recursive: true });
    const path = join(tmp, "manifiesto.json");
    const data = {
      destino: "bot",
      lods: [{ triangulos: 2000, archivo: "a.glb", pesoMB: 0.8 }],
    };
    await escribirManifiesto(data, path);
    const txt = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(txt);
    expect(parsed.destino).toBe("bot");
    expect(parsed.lods[0].triangulos).toBe(2000);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("validarPesoMax throws when limit exceeded", () => {
    expect(() => validarPesoMax([{ archivo: "a.glb", pesoMB: 8 }], 2)).toThrow(/pesoMaxMB/i);
  });

  it("validarPesoMax does not throw when within limit", () => {
    expect(() => validarPesoMax([{ archivo: "a.glb", pesoMB: 1 }], 2)).not.toThrow();
  });

  it("parseArgs correctly handles flags", () => {
    const args = parseArgs(["node", "script.mjs", "--entrada", "a.glb", "--plan", "p.json"]);
    expect(args.entrada).toBe("a.glb");
    expect(args.plan).toBe("p.json");
  });
});
