import { describe, it, expect, vi } from "vitest";
import { manejar } from "../../../servicios/hyperframes/src/rutas.mjs";

describe("hyperframes rutas", () => {
  const crearDepsMock = () => ({
    version: "0.8.172",
    tieneNavegador: true,
    tieneFfmpeg: true,
    linter: {
      lint: vi.fn().mockReturnValue({ errores: [] }),
    },
    sdk: {
      applyOperations: vi.fn().mockReturnValue("{}"),
    },
    obtenerComposicion: vi.fn().mockReturnValue('{"test": "composicion"}'),
    encolarRender: vi.fn().mockReturnValue("trabajo-123"),
    obtenerEstadoTrabajo: vi.fn().mockReturnValue({ estado: "completado", progreso: 100 }),
  });

  it("should handle health check", async () => {
    const deps = crearDepsMock();
    const resultado = manejar({ metodo: "GET", ruta: "/salud", cuerpo: null }, deps);
    expect(resultado.status).toBe(200);
    expect(resultado.cuerpo).toContain("0.8.172");
    expect(resultado.cuerpo).toContain(true); // navegador y ffmpeg
  });

  it("should handle lint route", async () => {
    const deps = crearDepsMock();
    const cuerpo = '{"test": "composicion"}';
    const resultado = manejar({ metodo: "POST", ruta: "/lint", cuerpo }, deps);
    expect(resultado.status).toBe(200);
    expect(deps.linter.lint).toHaveBeenCalledWith(cuerpo);
  });

  it("should handle editar route", async () => {
    const deps = crearDepsMock();
    const cuerpo = { composicion: "{}", operaciones: [] };
    const resultado = manejar({ metodo: "POST", ruta: "/editar", cuerpo: JSON.stringify(cuerpo) }, deps);
    expect(resultado.status).toBe(200);
    expect(deps.sdk.applyOperations).toHaveBeenCalledWith("{}", []);
  });

  it("should handle vista route", async () => {
    const deps = crearDepsMock();
    const resultado = manejar({ metodo: "GET", ruta: "/vista/abc123", cuerpo: null }, deps);
    expect(resultado.status).toBe(200);
    expect(deps.obtenerComposicion).toHaveBeenCalledWith("abc123");
    const cuerpoParseado = JSON.parse(resultado.cuerpo);
    expect(cuerpoParseado).toHaveProperty("composicion");
    expect(JSON.parse(cuerpoParseado.composicion)).toHaveProperty("test", "composicion");
  });

  it("should handle render route", async () => {
    const deps = crearDepsMock();
    const cuerpo = { composicion: "{}", opciones: {} };
    const resultado = manejar({ metodo: "POST", ruta: "/render", cuerpo: JSON.stringify(cuerpo) }, deps);
    expect(resultado.status).toBe(200);
    expect(deps.encolarRender).toHaveBeenCalledWith("{}", {});
    expect(resultado.cuerpo).toContain('"trabajo-123"');
  });

  it("should handle trabajos route", async () => {
    const deps = crearDepsMock();
    const resultado = manejar({ metodo: "GET", ruta: "/trabajos/trabajo-123", cuerpo: null }, deps);
    expect(resultado.status).toBe(200);
    expect(deps.obtenerEstadoTrabajo).toHaveBeenCalledWith("trabajo-123");
    const cuerpoParseado = JSON.parse(resultado.cuerpo);
    expect(cuerpoParseado).toHaveProperty("estado", "completado");
    expect(cuerpoParseado).toHaveProperty("progreso", 100);
  });

  it("should reject large body", async () => {
    const deps = crearDepsMock();
    const cuerpoGrande = "x".repeat(9 * 1024 * 1024); // 9 MB
    const resultado = manejar({ metodo: "POST", ruta: "/lint", cuerpo: cuerpoGrande }, deps);
    expect(resultado.status).toBe(413);
  });

  it("should return 404 for unknown route", async () => {
    const deps = crearDepsMock();
    const resultado = manejar({ metodo: "GET", ruta: "/ruta-desconocida", cuerpo: null }, deps);
    expect(resultado.status).toBe(404);
  });

  it("should return 400 for missing body on POST routes", async () => {
    const deps = crearDepsMock();
    // Test /lint
    let resultado = manejar({ metodo: "POST", ruta: "/lint", cuerpo: undefined }, deps);
    expect(resultado.status).toBe(400);
    // Test /editar
    resultado = manejar({ metodo: "POST", ruta: "/editar", cuerpo: undefined }, deps);
    expect(resultado.status).toBe(400);
    // Test /render
    resultado = manejar({ metodo: "POST", ruta: "/render", cuerpo: undefined }, deps);
    expect(resultado.status).toBe(400);
  });
});