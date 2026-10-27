import { describe, expect, it } from "vitest";
import { languageForPath } from "../appgen";
import { plantillaRefine, slugProyecto } from "../plantilla-refine";

const op = {
  nombre: "Panel de Datos Centinela",
  recursos: [
    { nombre: "lineas-base", campos: ["id", "nombre", "temperatura_c"] },
    { nombre: "sensores", campos: ["id", "alias", "en_linea"] },
  ],
};

describe("plantillaRefine", () => {
  it("genera un package.json que se parsea y fija @refinedev/core exactamente en 5.0.12", () => {
    const archivos = plantillaRefine(op);
    const pkg = archivos.find((a) => a.path === "package.json");
    expect(pkg).toBeDefined();
    const parsed = JSON.parse(pkg!.content) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const versiones = { ...parsed.dependencies, ...parsed.devDependencies };
    expect(versiones["@refinedev/core"]).toBe("5.0.12");
    expect(versiones["@refinedev/react-router"]).toBe("2.0.4");
    expect(versiones["@refinedev/simple-rest"]).toBe("6.0.1");
  });

  it("App.tsx apaga la telemetría de Refine", () => {
    const archivos = plantillaRefine(op);
    const app = archivos.find((a) => a.path === "src/App.tsx");
    expect(app).toBeDefined();
    expect(app!.content).toContain("disableTelemetry: true");
  });

  it(".env.example apaga la telemetría y no contiene ninguna clave", () => {
    const archivos = plantillaRefine(op);
    const env = archivos.find((a) => a.path === ".env.example");
    expect(env).toBeDefined();
    expect(env!.content).toContain("REFINE_NO_TELEMETRY=true");
    expect(env!.content).not.toMatch(/(clave|key|token|secreto|password)\s*[=:]\s*\S/i);
  });

  it("rechaza un recurso «Mal Nombre» y un campo con comillas", () => {
    expect(() =>
      plantillaRefine({
        ...op,
        recursos: [{ nombre: "Mal Nombre", campos: ["id"] }],
      }),
    ).toThrow(Error);
    expect(() =>
      plantillaRefine({
        ...op,
        recursos: [{ nombre: "lineas-base", campos: ['camp"o'] }],
      }),
    ).toThrow(Error);
  });

  it("ningún archivo generado contiene http://", () => {
    const archivos = plantillaRefine(op);
    for (const a of archivos) {
      expect(a.content).not.toContain("http://");
    }
  });

  it("hay una página de listado por recurso", () => {
    const archivos = plantillaRefine(op);
    const paginas = archivos.filter((a) => PROJECT_PAGINA.test(a.path));
    expect(paginas).toHaveLength(op.recursos.length);
    const app = archivos.find((a) => a.path === "src/App.tsx");
    expect(app).toBeDefined();
    expect(app!.content).toContain("resources");
    const listado = archivos.find((a) => PROJECT_PAGINA.test(a.path));
    expect(listado!.content).toContain("useList");
  });

  it("cada language sale de languageForPath", () => {
    const archivos = plantillaRefine(op);
    expect(archivos.length).toBeGreaterThan(0);
    for (const a of archivos) {
      expect(a.language).toBe(languageForPath(a.path));
    }
  });

  it("dos llamadas con la misma entrada dan los mismos archivos", () => {
    expect(plantillaRefine(op)).toEqual(plantillaRefine(op));
  });

  it("el nombre del proyecto se reduce a un slug ASCII", () => {
    expect(slugProyecto("Panel de Datos Centinela")).toBe("panel-de-datos-centinela");
    expect(slugProyecto("¡Áccents & símbolos!")).not.toMatch(/[^a-z0-9-]/);
  });
});

/** Ruta de página de listado generada: una por recurso. */
const PROJECT_PAGINA = /^src\/paginas\/listado.*\.tsx$/;
