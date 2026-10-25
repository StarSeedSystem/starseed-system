/**
 * Pruebas de `plantilla-refine.ts` (función pura: sin red, sin disco).
 *
 * Cubren el contrato de la tarea DSN1025H: versiones exactas verificadas en npm
 * (2026-10-25), telemetría de Refine apagada de serie, validación estricta de
 * los datos del usuario, determinismo y `language` vía `languageForPath`.
 */

import { describe, expect, it } from "vitest";
import { languageForPath } from "../appgen";
import { plantillaRefine, slugProyecto } from "../plantilla-refine";

// Recurso y campos que casan con los patrones del contrato.
const recursosValidos = [{ nombre: "capas", campos: ["id", "titulo"] }];

function generar(): ReturnType<typeof plantillaRefine> {
  return plantillaRefine({ nombre: "Panel Astraura — capas", recursos: recursosValidos });
}

function buscar(archivos: ReturnType<typeof plantillaRefine>, path: string) {
  const archivo = archivos.find((f) => f.path === path);
  expect(archivo, `falta el archivo «${path}»`).toBeDefined();
  return archivo!;
}

describe("plantillaRefine", () => {
  it("genera el manifiesto con las versiones verificadas en npm", () => {
    const manifest = JSON.parse(buscar(generar(), "package.json").content) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(manifest.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(manifest.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
    expect(manifest.dependencies.react).toBe("^19.3.1");
    expect(manifest.dependencies["react-dom"]).toBe("^19.3.1");
    expect(manifest.dependencies["react-router"]).toBe("^7.0.2");
    expect(manifest.devDependencies.vite).toBe("^8.3.5");
    expect(manifest.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(manifest.devDependencies["typescript"]).toBe("^5.6.0");
  });

  it("apaga la telemetría de Refine en App.tsx y en .env.example (sin claves)", () => {
    const archivos = generar();
    expect(buscar(archivos, "src/App.tsx").content).toContain("disableTelemetry: true");
    const env = buscar(archivos, ".env.example").content;
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    expect(env).toMatch(/^VITE_API_URL=$/m);
    expect(env).not.toMatch(/(clave|secret|token|password|api[-_]?key)/i);
  });

  it("rechaza recursos y campos que no casan con los patrones", () => {
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [{ nombre: "Mal Nombre", campos: ["id"] }],
      }),
    ).toThrow(/Nombre de recurso no válido/);
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [{ nombre: "capas", campos: ['titulo"malo'] }],
      }),
    ).toThrow(/Campo no válido/);
  });

  it("no deja «http://» en ningún archivo generado", () => {
    for (const archivo of generar()) {
      expect(archivo.content, archivo.path).not.toContain("http://");
    }
  });

  it("genera una página de listado por recurso", () => {
    const archivos = plantillaRefine({
      nombre: "panel",
      recursos: [
        { nombre: "capas", campos: ["id", "titulo"] },
        { nombre: "sitios", campos: ["id", "url_publica"] },
      ],
    });
    const paginas = archivos
      .filter((f) => f.path.startsWith("src/paginas/listado-"))
      .map((f) => f.path)
      .sort();
    expect(paginas).toEqual(["src/paginas/listado-capas.tsx", "src/paginas/listado-sitios.tsx"]);
  });

  it("es determinista: dos llamadas dan lo mismo", () => {
    expect(JSON.stringify(generar())).toBe(JSON.stringify(generar()));
  });

  it("deriva cada «language» de «languageForPath»", () => {
    for (const archivo of generar()) {
      expect(archivo.language).toBe(languageForPath(archivo.path));
    }
  });

  it("reduce el nombre del proyecto a slug ASCII", () => {
    const archivos = generar();
    expect(JSON.parse(buscar(archivos, "package.json").content).name).toBe("panel-astraura-capas");
    expect(slugProyecto("Panel Astraura — capas")).toBe("panel-astraura-capas");
    expect(slugProyecto("")).toBe("panel-de-datos");
  });
});
