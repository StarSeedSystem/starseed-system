import { describe, expect, it } from "vitest";
import { languageForPath } from "../appgen";
import { plantillaRefine } from "../plantilla-refine";

const RECURSOS = [
  { nombre: "libros", campos: ["id", "titulo", "an_publico"] },
  { nombre: "autores", campos: ["id", "nombre"] },
];

const archivos = plantillaRefine({ nombre: "Panel de Datos", recursos: RECURSOS });
const por = new Map(archivos.map((a) => [a.path, a]));

function archivo(path: string): string {
  const a = por.get(path);
  if (!a) throw new Error(`Falta el archivo ${path}`);
  return a.content;
}

describe("plantillaRefine", () => {
  it("genera una página por recurso, con useList y su carga en query.isLoading", () => {
    const paginas = archivos.filter((a) => a.path.startsWith("src/paginas/"));
    expect(paginas).toHaveLength(RECURSOS.length);
    for (const p of paginas) {
      expect(p.content).toContain("useList");
      expect(p.content).toContain("query.isLoading");
    }
  });

  it("package.json lleva las versiones fijadas y ninguna más", () => {
    const pkg = JSON.parse(archivo("package.json"));
    expect(pkg.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(pkg.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(pkg.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
    expect(pkg.dependencies.react).toBe("^19.3.1");
    expect(pkg.dependencies["react-dom"]).toBe("^19.3.1");
    expect(pkg.dependencies["react-router"]).toBe("^7.0.2");
    expect(pkg.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(pkg.devDependencies.typescript).toBe("^5.6.0");
    expect(pkg.devDependencies.vite).toBe("^8.3.5");
    expect(Object.keys(pkg.dependencies)).toHaveLength(6);
    expect(Object.keys(pkg.devDependencies)).toHaveLength(3);
  });

  it("apaga la telemetría en App.tsx y en .env.example", () => {
    expect(archivo("src/App.tsx")).toContain("disableTelemetry: true");
    const env = archivo(".env.example");
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    expect(env).toContain("VITE_API_URL=");
  });

  it("no lleva claves ni valores secretos en .env.example", () => {
    expect(/clave|secret|token|password|api_?key/i.test(archivo(".env.example"))).toBe(false);
  });

  it("lanza si un recurso o un campo no casan con las expresiones de seguridad", () => {
    expect(() =>
      plantillaRefine({ nombre: "panel", recursos: [{ nombre: "Mal Nombre", campos: [] }] }),
    ).toThrow();
    expect(() =>
      plantillaRefine({ nombre: "panel", recursos: [{ nombre: "ok", campos: ['no"valido'] }] }),
    ).toThrow();
  });

  it("ningún archivo contiene http://, ni lenguaje distinto de languageForPath", () => {
    for (const a of archivos) {
      expect(a.content.includes("http://")).toBe(false);
      expect(a.language).toBe(languageForPath(a.path));
    }
  });

  it("el nombre del proyecto queda reducido a slug ASCII en package.json", () => {
    expect(JSON.parse(archivo("package.json")).name).toBe("panel-de-datos");
  });

  it("declarar los mismos recursos dos veces da los mismos archivos", () => {
    const otra = plantillaRefine({ nombre: "Panel de Datos", recursos: RECURSOS });
    expect(otra).toEqual(archivos);
  });
});
