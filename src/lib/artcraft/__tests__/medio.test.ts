/** Pruebas de `medio.ts` · elegirMedioArtcraft (contrato: `architecture/artcraft-y-rare.md` §4.5). Solo funciones puras. */
import { describe, expect, it } from "vitest";
import { elegirMedioArtcraft, versionAlMenos, VERSION_MINIMA } from "../medio";
import type { NeuronaArtcraft } from "../medio";

const ESCRITORIO: NeuronaArtcraft = {
  rol: "escritorio",
  webgpu: true,
  webgl2: true,
  memoriaMB: 8192,
  binarios: { gridcraft: { version: "0.11.1" } },
  aislamientoSinRed: true,
  servidoresMalla: [],
};

const MAC = (): NeuronaArtcraft => ({ ...ESCRITORIO, binarios: { gridcraft: { version: "0.11.2" } } });

describe("versionAlMenos", () => {
  const casos: [string, string, boolean][] = [
    ["0.11.1", "0.11.1", true],
    ["0.11.2", "0.11.1", true],
    ["0.10.9", "0.11.1", false],
    ["v0.10.0", "0.10.0", true], // prefijo `v` en la consultada
    ["0.12.0", "v0.11.1", true], // prefijo `v` en la mínima
    ["0.10.10", "0.10.9", true], // números de dos cifras
    ["0.2.10", "0.10.2", false],
    ["1.0", "1.0.0", true], // faltantes valen 0
  ];
  it.each(casos)("%s ≥ %s → %s", (a, b, esperado) => expect(versionAlMenos(a, b)).toBe(esperado));
});

describe("elegirMedioArtcraft · nativo", () => {
  it("escritorio con binario nuevo y aislamiento → nativo montada, con alternativas web y servidor", () => {
    const n = MAC();
    n.servidoresMalla = [{ id: "estudio", apps: ["gridcraft"], libre: true }];
    const e = elegirMedioArtcraft(n, "gridcraft");
    expect(e.medio).toBe("nativo");
    expect(e.modoMalla).toBe("montada");
    expect(e.alternativas.map((a) => a.medio)).toEqual(["web", "servidor-malla"]);
  });

  it("binario viejo → web, y el motivo de nativo dice la versión que hace falta", () => {
    const e = elegirMedioArtcraft(
      { ...ESCRITORIO, binarios: { gridcraft: { version: "0.10.0" } } },
      "gridcraft",
    );
    expect(e.medio).toBe("web");
    expect(e.motivo).toContain("0.11.1");
  });

  it("sin binario de la app pedida, no hay nativo aunque haya otro binario", () => {
    const e = elegirMedioArtcraft(MAC(), "figcraft");
    expect(e.medio).toBe("web");
    expect(e.motivo).toContain("figcraft");
  });

  it("sin aislamiento de red, el motivo dice que se queda como web y por qué", () => {
    const e = elegirMedioArtcraft({ ...MAC(), aislamientoSinRed: false }, "gridcraft");
    expect(e.medio).toBe("web");
    expect(e.motivo).toContain("aislamiento");
  });

  it("rol móvil o navegador nunca da nativo", () => {
    for (const rol of ["movil", "navegador", "tv"] as const)
      expect(elegirMedioArtcraft({ ...MAC(), rol }, "gridcraft").medio).toBe("web");
  });
});

describe("elegirMedioArtcraft · web", () => {
  it("WebGL2 sin WebGPU y memoria suficiente → web por bandas", () => {
    const e = elegirMedioArtcraft(
      { ...ESCRITORIO, webgpu: false, webgl2: true, binarios: {} },
      "gridcraft",
    );
    expect(e).toMatchObject({ medio: "web", modoMalla: "por-bandas" });
    expect(e.motivo).toContain("WebGL2");
  });

  it("sin GPU en escritorio con servidor libre → servidor-malla", () => {
    const n: NeuronaArtcraft = {
      ...MAC(),
      webgpu: false,
      webgl2: false,
      binarios: {},
      servidoresMalla: [{ id: "pepe", apps: ["gridcraft"], libre: true }],
    };
    expect(elegirMedioArtcraft(n, "gridcraft").medio).toBe("servidor-malla");
  });

  it("GPU sí pero menos de 1024 MB → sin web, motivo de memoria", () => {
    const n = { ...ESCRITORIO, binarios: {}, memoriaMB: 512 };
    const e = elegirMedioArtcraft(n, "gridcraft");
    expect(e.medio).toBe("ninguno");
    expect(e.motivo).toContain("1024");
  });
});

describe("elegirMedioArtcraft · servidor de la malla", () => {
  it("móvil sin WebGPU, poca memoria y servidor libre → servidor-malla transmitida", () => {
    const n: NeuronaArtcraft = {
      rol: "movil",
      webgpu: false,
      webgl2: true,
      memoriaMB: 600,
      binarios: {},
      aislamientoSinRed: false,
      servidoresMalla: [{ id: "pepe", apps: ["figcraft"], libre: true }],
    };
    const e = elegirMedioArtcraft(n, "figcraft");
    expect(e).toMatchObject({ medio: "servidor-malla", modoMalla: "transmitida" });
    expect(e.motivo).toContain("pepe");
  });

  it("servidor ocupado o sin la app → sin servidor-malla", () => {
    const ocupado = { id: "estudio", apps: ["gridcraft" as const], libre: false };
    const otro = { id: "estudio", apps: ["deckcraft" as const], libre: true };
    for (const servidor of [ocupado, otro])
      expect(
        elegirMedioArtcraft({ ...ESCRITORIO, binarios: {}, servidoresMalla: [servidor] }, "gridcraft").medio,
      ).toBe("web");
  });

  it("solo un servidor ocupado con la app y sin GPU → el motivo de servidor dice la falta", () => {
    const n: NeuronaArtcraft = {
      ...ESCRITORIO,
      webgpu: false,
      webgl2: false,
      binarios: {},
      servidoresMalla: [{ id: "forja", apps: ["gridcraft"], libre: false }],
    };
    expect(elegirMedioArtcraft(n, "gridcraft").alternativas).toEqual([]);
  });
});

describe("elegirMedioArtcraft · ninguno y forzar", () => {
  it("TV sin nada → ninguno con motivo «próximamente» y lo que falta", () => {
    const e = elegirMedioArtcraft(
      { rol: "tv", webgpu: false, webgl2: false, memoriaMB: 512, binarios: {}, aislamientoSinRed: true, servidoresMalla: [] },
      "deckcraft",
    );
    expect(e).toMatchObject({ medio: "ninguno", modoMalla: null, alternativas: [] });
    expect(e.motivo).toContain("próximamente");
    expect(e.motivo).toContain("deckcraft");
  });

  it("forzar «nativo» imposible en una TV con web → cae a web y el motivo lo explica", () => {
    const n: NeuronaArtcraft = {
      rol: "tv",
      webgpu: true,
      webgl2: false,
      memoriaMB: 8192,
      binarios: {},
      aislamientoSinRed: true,
      servidoresMalla: [],
    };
    const e = elegirMedioArtcraft(n, "gridcraft", "nativo");
    expect(e.medio).toBe("web");
    expect(e.motivo).toContain("forzar");
    expect(e.motivo).toContain("nativo");
  });

  it("forzar «web» estando nativo viable se respeta y nativo pasa a alternativa", () => {
    const e = elegirMedioArtcraft(MAC(), "gridcraft", "web");
    expect(e.medio).toBe("web");
    expect(e.alternativas.map((a) => a.medio)).toContain("nativo");
  });

  it("forzar «servidor-malla» sin servidores → se abre como nativo con explicación", () => {
    const e = elegirMedioArtcraft(MAC(), "gridcraft", "servidor-malla");
    expect(e.medio).toBe("nativo");
    expect(e.motivo).toContain("servidor");
  });

  it("binario viejo y sin GPU, con servidor libre → servidor y alternativas vacías de elementos viables", () => {
    const n: NeuronaArtcraft = {
      ...ESCRITORIO,
      webgpu: false,
      webgl2: false,
      binarios: { gridcraft: { version: "0.9.0" } },
      servidoresMalla: [{ id: "pepe", apps: ["gridcraft"], libre: true }],
    };
    const e = elegirMedioArtcraft(n, "gridcraft");
    expect(e.medio).toBe("servidor-malla");
    expect(e.alternativas).toEqual([]);
  });
});

describe("VERSION_MINIMA", () => {
  it("ficha por app, según §2.2–§2.4", () => {
    expect(VERSION_MINIMA).toEqual({ figcraft: "0.10.0", gridcraft: "0.11.1", deckcraft: "0.10.0" });
  });
});
