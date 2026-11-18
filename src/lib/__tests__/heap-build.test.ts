import { describe, it, expect } from "vitest";
import { heapBuildMb } from "../heap-build";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("heapBuildMb", () => {
  it("devuelve STARSEED_BUILD_HEAP_MB cuando es entero entre 2048 y 7168", () => {
    expect(heapBuildMb({ STARSEED_BUILD_HEAP_MB: "3000", VERCEL: "1" })).toBe(3000);
    expect(heapBuildMb({ STARSEED_BUILD_HEAP_MB: "2048", VERCEL: "1" })).toBe(2048);
    expect(heapBuildMb({ STARSEED_BUILD_HEAP_MB: "7168", VERCEL: "1" })).toBe(7168);
  });

  it("ignora STARSEED_BUILD_HEAP_MB fuera de rango o no numérico y pasa al siguiente caso", () => {
    expect(heapBuildMb({ STARSEED_BUILD_HEAP_MB: "1000", VERCEL: "1" })).toBe(5120);
    expect(heapBuildMb({ STARSEED_BUILD_HEAP_MB: "8000", VERCEL: "1" })).toBe(5120);
    expect(heapBuildMb({ STARSEED_BUILD_HEAP_MB: "abc", VERCEL: "1" })).toBe(5120);
    expect(heapBuildMb({ STARSEED_BUILD_HEAP_MB: "", VERCEL: "1" })).toBe(5120);
    expect(heapBuildMb({ STARSEED_BUILD_HEAP_MB: "3000.5", VERCEL: "1" })).toBe(5120);
  });

  it("devuelve 5120 en Vercel (VERCEL === '1') cuando no hay STARSEED_BUILD_HEAP_MB válido", () => {
    expect(heapBuildMb({ VERCEL: "1" })).toBe(5120);
    expect(heapBuildMb({ VERCEL: "1", STARSEED_BUILD_HEAP_MB: "invalid" })).toBe(5120);
  });

  it("devuelve 4096 por defecto (Mac local, sin VERCEL ni STARSEED_BUILD_HEAP_MB válido)", () => {
    expect(heapBuildMb({})).toBe(4096);
    expect(heapBuildMb({ VERCEL: "0" })).toBe(4096);
    expect(heapBuildMb({ OTHER: "value" })).toBe(4096);
  });
});

describe("package.json build script", () => {
  it("usa $(node scripts/heap-build.mjs) y conserva prebuild y postbuild", () => {
    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

    expect(pkg.scripts.prebuild).toBeDefined();
    expect(pkg.scripts.postbuild).toBeDefined();
    expect(pkg.scripts.build).toContain("$(node scripts/heap-build.mjs)");
    expect(pkg.scripts.build).toContain("next build");
  });
});