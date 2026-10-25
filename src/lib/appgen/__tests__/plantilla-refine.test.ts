/**
 * Pruebas de la plantilla de panel de datos con Refine (DSN1025H).
 * Sólo funciones puras: sin red, sin disco, sin procesos.
 */

import { describe, it, expect } from "vitest";
import { plantillaRefine } from "../plantilla-refine";
import { languageForPath } from "@/lib/appgen/appgen";

const RECURSOS = [
  { nombre: "autores", campos: ["id", "nombre", "anio"] },
  { nombre: "paises", campos: ["id", "nombre", "region"] },
];

function generar() {
  return plantillaRefine({ nombre: "Panel de Datos Ética", recursos: RECURSOS });
}

function porRuta(files = generar(), ruta: string) {
  const f = files.find((x) => x.path === ruta);
  if (!f) throw new Error(`Falta el archivo «${ruta}» en la plantilla`);
  return f;
}

describe("plantillaRefine · el proyecto generado", () => {
  it("trae package.json que se parsea y @refinedev/core exactamente «5.0.12»", () => {
    const pkg = JSON.parse(porRuta(generar(), "package.json").content) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(pkg.dependencies["react"]).toBe("^19.3.1");
    expect(pkg.devDependencies.vite).toContain("8.3.5");
  });

  it("App.tsx apaga la telemetría con disableTelemetry: true", () => {
    expect(porRuta(generar(), "src/App.tsx").content).toContain(
      "disableTelemetry: true",
    );
  });

  it(".env.example lleva REFINE_NO_TELEMETRY=true y ninguna clave", () => {
    const env = porRuta(generar(), ".env.example").content;
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    expect(env).toContain("VITE_API_URL=");
    expect(/(CLAVE|KEY|SECRET|TOKEN|PASSWORD)\s*=\s*\S/i.test(env)).toBe(false);
  });
});

describe("plantillaRefine · datos del usuario nunca crudos", () => {
  it("un recurso «Mal Nombre» lanza Error en español", () => {
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [{ nombre: "Mal Nombre", campos: ["id"] }],
      }),
    ).toThrow(/Nombre de recurso no válido/);
  });

  it("un campo con comillas lanza Error en español", () => {
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [{ nombre: "autores", campos: ['camp"o'] }],
      }),
    ).toThrow(/Campo no válido/);
  });

  it("ningún archivo contiene la secuencia http://", () => {
    for (const f of generar()) {
      expect(f.content).not.toContain("http://");
    }
  });

  it("el nombre del proyecto sale como slug ASCII", () => {
    const pkg = JSON.parse(porRuta(generar(), "package.json").content) as {
      name: string;
    };
    expect(pkg.name).toBe("panel-de-datos-etica");
  });
});

describe("plantillaRefine · estructura y reproducibilidad", () => {
  it("hay una página de listado por recurso", () => {
    for (const r of RECURSOS) {
      expect(
        generar().some((f) => f.path === `src/paginas/${r.nombre}/listado.tsx`),
      ).toBe(true);
    }
  });

  it("la página usa useList con query.isLoading y result.data", () => {
    const pagina = porRuta(generar(), "src/paginas/autores/listado.tsx").content;
    expect(pagina).toContain("useList");
    expect(pagina).toContain("query.isLoading");
    expect(pagina).toContain("result?.data");
  });

  it("dos llamadas con la misma entrada dan exactamente lo mismo", () => {
    expect(JSON.stringify(generar())).toBe(JSON.stringify(generar()));
  });

  it("cada language sale de languageForPath", () => {
    for (const f of generar()) {
      expect(f.language).toBe(languageForPath(f.path));
    }
  });
});
