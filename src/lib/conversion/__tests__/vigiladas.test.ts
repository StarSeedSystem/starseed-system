import { describe, it, expect } from "vitest";
import {
  CLAVE_VIGILADAS,
  REGLAS_PREDETERMINADAS,
  tipoReglas,
  esResultadoConversion,
  archivosConvertidos,
  type ArchivoVigilado,
  type ReglaVigilada,
} from "../vigiladas";

describe("CLAVE_VIGILADAS", () => {
  it("tiene la clave de memoria correcta", () => {
    expect(CLAVE_VIGILADAS).toBe("starseed.conversion.vigiladas.v1");
  });
});

describe("REGLAS_PREDETERMINADAS", () => {
  it("tiene las carpetas del contrato", () => {
    const carpetas = REGLAS_PREDETERMINADAS.map((r) => r.carpeta);
    expect(carpetas).toContain("Fotos del móvil");
    expect(carpetas).toContain("Documentos");
  });
});

describe("tipoReglas", () => {
  it("devuelve las reglas de una carpeta existente", () => {
    const reglas = tipoReglas("Fotos del móvil");
    expect(reglas.length).toBeGreaterThanOrEqual(1);
    expect(reglas[0].a).toBe("jpg");
  });
  it("devuelve vacío para carpeta sin regla", () => {
    expect(tipoReglas("Inexistente").length).toBe(0);
  });
  it("acepta reglas personalizadas", () => {
    const custom: ReglaVigilada[] = [{ carpeta: "Pruebas", a: "png" }];
    expect(tipoReglas("Pruebas", custom)[0].a).toBe("png");
  });
});

describe("esResultadoConversion", () => {
  const archivo: ArchivoVigilado = {
    ruta: "Fotos del móvil/viaje.jpg",
    nombre: "viaje.jpg",
    carpeta: "Fotos del móvil",
  };
  it("detecta bucle cuando la extensión es el destino", () => {
    expect(esResultadoConversion(archivo, "jpg")).toBe(true);
  });
  it("detecta historial explícito", () => {
    expect(
      esResultadoConversion(archivo, "jpg", [{ ruta: archivo.ruta, nombre: archivo.nombre, carpeta: archivo.carpeta }]),
    ).toBe(true);
  });
  it("no marca archivo nuevo como resultado", () => {
    const nuevo: ArchivoVigilado = { ruta: "Fotos del móvil/sol.heic", nombre: "sol.heic", carpeta: "Fotos del móvil" };
    expect(esResultadoConversion(nuevo, "jpg", [])).toBe(false);
  });
});

describe("archivosConvertidos", () => {
  it("convierte archivo nuevo en carpeta vigilada", () => {
    const archivos: ArchivoVigilado[] = [{ ruta: "Fotos del móvil/sol.heic", nombre: "sol.heic", carpeta: "Fotos del móvil" }];
    const decisions = archivosConvertidos(archivos);
    expect(decisions.length).toBe(1);
    expect(decisions[0].convertir).toBe(true);
    expect(decisions[0].destino).toBe("jpg");
  });
  it("no convierte archivo que ya es el destino (evita bucle)", () => {
    const archivos: ArchivoVigilado[] = [{ ruta: "Fotos del móvil/sol.jpg", nombre: "sol.jpg", carpeta: "Fotos del móvil" }];
    const d = archivosConvertidos(archivos);
    expect(d[0].convertir).toBe(false);
    expect(d[0].razon).toContain("Ya está en formato");
  });
  it("no repite archivo en historial", () => {
    const archivos: ArchivoVigilado[] = [{ ruta: "Fotos del móvil/sol.heic", nombre: "sol.heic", carpeta: "Fotos del móvil" }];
    const historial: ArchivoVigilado[] = [{ ruta: archivos[0].ruta, nombre: archivos[0].nombre, carpeta: archivos[0].carpeta }];
    const d = archivosConvertidos(archivos, undefined, historial);
    expect(d[0].convertir).toBe(false);
    expect(d[0].razon).toContain("historial");
  });
  it("no inventa destino sin regla", () => {
    const archivos: ArchivoVigilado[] = [{ ruta: "Extra/nota.txt", nombre: "nota.txt", carpeta: "Extra" }];
    const d = archivosConvertidos(archivos);
    expect(d[0].convertir).toBe(false);
    expect(d[0].razon).toContain("Sin regla");
  });
});
