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
  it("detecta el mismo nombre en el historial aunque la ruta cambie", () => {
    const movido: ArchivoVigilado = { ruta: "Conversiones/viaje.jpg", nombre: "viaje.jpg", carpeta: "Conversiones" };
    expect(esResultadoConversion(movido, "jpg", [archivo])).toBe(true);
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
  it("respeta reglas personalizadas", () => {
    const archivos: ArchivoVigilado[] = [{ ruta: "Pruebas/captura.webp", nombre: "captura.webp", carpeta: "Pruebas" }];
    const reglas: ReglaVigilada[] = [{ carpeta: "Pruebas", a: "png" }];
    const d = archivosConvertidos(archivos, reglas);
    expect(d[0].convertir).toBe(true);
    expect(d[0].destino).toBe("png");
  });
  it("no repite por nombre aunque la ruta cambie", () => {
    const historial: ArchivoVigilado[] = [{ ruta: "Fotos del móvil/sol.heic", nombre: "sol.heic", carpeta: "Fotos del móvil" }];
    const movido: ArchivoVigilado = { ruta: "Fotos del móvil/sub/sol.heic", nombre: "sol.heic", carpeta: "Fotos del móvil" };
    const d = archivosConvertidos([movido], undefined, historial);
    expect(d[0].convertir).toBe(false);
    expect(d[0].razon).toContain("historial");
  });
  it("decide en el mismo orden para varios archivos", () => {
    const archivos: ArchivoVigilado[] = [
      { ruta: "Fotos del móvil/sol.heic", nombre: "sol.heic", carpeta: "Fotos del móvil" },
      { ruta: "Fotos del móvil/luna.jpg", nombre: "luna.jpg", carpeta: "Fotos del móvil" },
      { ruta: "Extra/nota.txt", nombre: "nota.txt", carpeta: "Extra" },
    ];
    const d = archivosConvertidos(archivos);
    expect(d.map((x) => x.convertir)).toEqual([true, false, false]);
  });
});
