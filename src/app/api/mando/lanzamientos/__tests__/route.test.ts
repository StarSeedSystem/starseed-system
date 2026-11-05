import { describe, it, expect } from "vitest";
import { validarPeticion, filasDeMedios, MEDIOS_PANEL } from "@/lib/mando/lanzamientos";

describe("validarPeticion (función pura)", () => {
  it("acepta petición lanzar válida", () => {
    expect(validarPeticion({ accion: "lanzar" })).toEqual({ accion: "lanzar" });
  });

  it("acepta regenerar con medio", () => {
    expect(validarPeticion({ accion: "regenerar", medio: "macos" })).toEqual({ accion: "regenerar", medio: "macos" });
  });

  it("acepta auto con activo true", () => {
    expect(validarPeticion({ accion: "auto", activo: true })).toEqual({ accion: "auto", activo: true });
  });

  it("acepta auto con activo false", () => {
    expect(validarPeticion({ accion: "auto", activo: false })).toEqual({ accion: "auto", activo: false });
  });

  it("acepta pausar", () => {
    expect(validarPeticion({ accion: "pausar" })).toEqual({ accion: "pausar" });
  });

  it("acepta reanudar", () => {
    expect(validarPeticion({ accion: "reanudar" })).toEqual({ accion: "reanudar" });
  });

  it("acepta reintentar", () => {
    expect(validarPeticion({ accion: "reintentar" })).toEqual({ accion: "reintentar" });
  });

  it("rechaza acción inválida", () => {
    expect(validarPeticion({ accion: "borrar" })).toEqual({ error: "Acción inválida" });
  });

  it("rechaza regenerar sin medio", () => {
    expect(validarPeticion({ accion: "regenerar" })).toEqual({ error: "Medio requerido" });
  });

  it("rechaza auto sin activo", () => {
    expect(validarPeticion({ accion: "auto" })).toEqual({ error: "Campo 'activo' requerido para 'auto'" });
  });

  it("rechaza cuerpo no objeto", () => {
    expect(validarPeticion(null)).toEqual({ error: "Cuerpo inválido" });
    expect(validarPeticion("string")).toEqual({ error: "Cuerpo inválido" });
    expect(validarPeticion(123)).toEqual({ error: "Cuerpo inválido" });
  });

  it("rechaza cuerpo sin acción", () => {
    expect(validarPeticion({})).toEqual({ error: "Acción inválida" });
  });
});

describe("filasDeMedios (función pura)", () => {
  const estadoBase: Parameters<typeof filasDeMedios>[0] = {
    fase: "esperando-lista",
    detalle: "",
    version: "1.0.0",
    pasos: [],
    jobs: [],
    medios: {},
    historial: [],
    pausado: false,
    tono: "normal",
  };

  it("retorna filas para los 9 medios en el orden correcto", () => {
    const filas = filasDeMedios(estadoBase, "1.0.0");
    expect(filas).toHaveLength(9);
    expect(filas[0].id).toBe("web");
    expect(filas[1].id).toBe("pwa");
    expect(filas[2].id).toBe("macos");
    expect(filas[3].id).toBe("windows");
    expect(filas[4].id).toBe("linux");
    expect(filas[5].id).toBe("android");
    expect(filas[6].id).toBe("ios");
    expect(filas[7].id).toBe("canales");
    expect(filas[8].id).toBe("libreria");
  });

  it("incluye título y formatos de cada medio", () => {
    const filas = filasDeMedios(estadoBase, "1.0.0");
    const web = filas.find(f => f.id === "web");
    expect(web?.titulo).toBe("Sitio web oficial");
    expect(web?.formatos).toHaveLength(1);
    expect(web?.formatos[0].nombre).toBe("starseed-os.vercel.app");
  });

  it("incluye estado y detalle de cada medio desde estado.medios", () => {
    const estado = {
      ...estadoBase,
      medios: { macos: { estado: "al-dia", faltan: [], pequenos: [] } },
    };
    const filas = filasDeMedios(estado, "0.3.0");
    const macos = filas.find(f => f.id === "macos");
    expect(macos?.estado).toBe("al-dia");
    expect(macos?.detalle).toBe("Al día");
    expect(macos?.accion).toBe("Generar/Actualizar");
  });

  it("muestra faltan cuando hay archivos faltantes", () => {
    const estado = {
      ...estadoBase,
      medios: { macos: { estado: "atascado", faltan: ["StarSeed.OS_0.3.0_universal.dmg"], pequenos: [] } },
    };
    const filas = filasDeMedios(estado, "0.3.0");
    const macos = filas.find(f => f.id === "macos");
    expect(macos?.estado).toBe("atascado");
    expect(macos?.detalle).toContain("Faltan:");
    expect(macos?.detalle).toContain("StarSeed.OS_0.3.0_universal.dmg");
  });

  it("muestra 'Archivos demasiado pequeños' cuando hay archivos pequeños", () => {
    const estado = {
      ...estadoBase,
      medios: { macos: { estado: "atascado", faltan: [], pequenos: ["StarSeed.OS_0.3.0_universal.dmg"] } },
    };
    const filas = filasDeMedios(estado, "0.3.0");
    const macos = filas.find(f => f.id === "macos");
    expect(macos?.detalle).toBe("Archivos demasiado pequeños");
  });

  it("usa versión publicada cuando estado.version no existe", () => {
    const estado = { ...estadoBase, version: "" };
    const filas = filasDeMedios(estado, "0.4.0");
    const macos = filas.find(f => f.id === "macos");
    expect(macos?.version).toBe("0.4.0");
  });

  it("web tiene acción 'Publicar ahora' y URL fija", () => {
    const filas = filasDeMedios(estadoBase, "1.0.0");
    const web = filas.find(f => f.id === "web");
    expect(web?.accion).toBe("Publicar ahora");
    expect(web?.formatos[0].url).toBe("https://starseed-os.vercel.app");
  });

  it("pwa tiene URL de manifiesto", () => {
    const filas = filasDeMedios(estadoBase, "1.0.0");
    const pwa = filas.find(f => f.id === "pwa");
    expect(pwa?.formatos[0].url).toBe("https://starseed-os.vercel.app/manifest.json");
  });

  it("libreria mantiene su formato sin URL de release", () => {
    const filas = filasDeMedios(estadoBase, "1.0.0");
    const lib = filas.find(f => f.id === "libreria");
    expect(lib?.formatos[0].nombre).toBe("ficha");
    expect(lib?.formatos[0].url).toBe("/api/os/versiones");
  });

  it("medios de release construyen URL con versión del estado si existe", () => {
    const estado = { ...estadoBase, version: "0.3.0" };
    const filas = filasDeMedios(estado, "1.0.0");
    const macos = filas.find(f => f.id === "macos");
    expect(macos?.formatos[0].url).toContain("v0.3.0");
    expect(macos?.formatos[0].url).toContain("StarSeed_macos_");
  });

  it("medios de release usan versionPublicada si estado.version está vacío", () => {
    const estado = { ...estadoBase, version: "" };
    const filas = filasDeMedios(estado, "0.4.0");
    const macos = filas.find(f => f.id === "macos");
    expect(macos?.formatos[0].url).toContain("v0.4.0");
    expect(macos?.formatos[0].url).toContain("StarSeed_macos_");
  });
});

describe("MEDIOS_PANEL (constante)", () => {
  it("tiene 9 medios definidos", () => {
    expect(MEDIOS_PANEL).toHaveLength(9);
  });

  it("el primer medio es web", () => {
    expect(MEDIOS_PANEL[0].id).toBe("web");
  });

  it("el último medio es libreria", () => {
    expect(MEDIOS_PANEL[8].id).toBe("libreria");
  });

  it("cada medio tiene id, titulo y formatos", () => {
    for (const m of MEDIOS_PANEL) {
      expect(m.id).toBeTruthy();
      expect(m.titulo).toBeTruthy();
      expect(Array.isArray(m.formatos)).toBe(true);
      expect(m.formatos.length).toBeGreaterThan(0);
      for (const f of m.formatos) {
        expect(f.nombre).toBeTruthy();
        expect(typeof f.url).toBe("string");
      }
    }
  });
});