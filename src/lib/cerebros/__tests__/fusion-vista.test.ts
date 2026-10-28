import { describe, it, expect } from "vitest";
import { palabraDeAccion, seccionesAnadidas, textoKb, cuentasPlan } from "@/lib/cerebros/fusion-vista";
import type { PlanFusion } from "@/lib/cerebros/fusion";

const archivo = (accion: PlanFusion["archivos"][number]["accion"], contenido: string, bytes: number): PlanFusion["archivos"][number] => ({
  name: "memory.md",
  accion,
  contenido,
  bytesQueEntran: bytes,
  desde: ["origen"],
});

describe("palabraDeAccion", () => {
  it("copiar dice «copia»", () => {
    expect(palabraDeAccion(archivo("copiar", "memoria", 10))).toBe("copia");
  });

  it("omitir dice «ya estaba»", () => {
    expect(palabraDeAccion(archivo("omitir", "memoria", 0))).toBe("ya estaba");
  });

  it("anexar dice cuántas secciones entran", () => {
    const contenido = "memoria\n\n## Fusionado de «Otros» (abcd1234) · 2026-10-13\n\n## Lo nuevo\n\n## Fusionado de «Otros» (abcd1234) · 2026-10-13\n\n## Otro más";
    expect(palabraDeAccion(archivo("anexar", contenido, 30))).toBe("añade 2 secciones");
  });

  it("anexar con una sola sección va en singular", () => {
    const contenido = "## Fusionado de «Otros» (abcd1234) · 2026-10-13";
    expect(palabraDeAccion(archivo("anexar", contenido, 10))).toBe("añade 1 sección");
  });
});

describe("seccionesAnadidas", () => {
  it("cuenta las cabeceras de fusión", () => {
    const dos = "## Fusionado de «a» (11111111) · 2026-10-13\nx\n## Fusionado de «b» (22222222) · 2026-10-13\ny";
    expect(seccionesAnadidas(dos)).toBe(2);
    expect(seccionesAnadidas("sin nada")).toBe(0);
  });
});

describe("textoKb", () => {
  it("los tamaños pequeños se quedan en bytes", () => {
    expect(textoKb(824)).toBe("824 B");
  });

  it("el kilobyte se separa con coma decimal", () => {
    expect(textoKb(1536)).toBe("1,5 KB");
    expect(textoKb(2600)).toBe("2,5 KB");
  });
});

describe("cuentasPlan", () => {
  it("cuenta entradas de includes, servidores y preferencias de verdad", () => {
    const plan = {
      archivos: [],
      includes: {
        vaults: ["v1"],
        backends: [],
        personalities: ["p1", "p2"],
        runtimes: [],
        tokens: [],
        memories: [],
        connections: ["c1"],
        bindScope: false,
        permissions: [],
        aiProvider: "llama",
      },
      servers: [{ id: "s1" }, { id: "s2" }],
      config: {},
      prefs: { tema: 1, canales: 2 },
      resumen: { archivosNuevos: 0, archivosAnexados: 0, archivosOmitidos: 0, bytes: 0 },
    } as unknown as PlanFusion;
    const c = cuentasPlan(plan);
    expect(c).toEqual({ incluir: 4, servidores: 2, preferencias: 2 });
  });
});
