/**
 * Tests de `plantillaRefine` (Estudio de Apps · plantilla «panel de datos»
 * con Refine, telemetría apagada). Funciones puras: sin red, sin disco.
 */
import { describe, it, expect } from "vitest";
import { plantillaRefine, type RecursoPanel } from "../plantilla-refine";
import { languageForPath } from "../../appgen";

const RECURSOS: RecursoPanel[] = [
  { nombre: "clientes", campos: ["nombre", "correo", "notas"] },
  { nombre: "pedidos", campos: ["id", "total", "fecha"] },
];

function generar() {
  return plantillaRefine({ nombre: "Panel Óxido 2026", recursos: RECURSOS });
}

function contenido(files: { path: string; content: string }[], ruta: string): string {
  const archivo = files.find((a) => a.path === ruta);
  if (!archivo) throw new Error(`No existe el archivo ${ruta}`);
  return archivo.content;
}

describe("plantillaRefine", () => {
  it("produce el conjunto completo de archivos del proyecto", () => {
    const files = generar();
    expect(files.map((a) => a.path)).toEqual([
      "package.json",
      "index.html",
      "vite.config.ts",
      "tsconfig.json",
      ".gitignore",
      ".env.example",
      "src/main.tsx",
      "src/App.tsx",
      "src/paginas/listado.tsx",
      "LEEME.md",
    ]);
  });

  it("el package.json se parsea y lleva las versiones exactas verificadas", () => {
    const pkg = JSON.parse(contenido(generar(), "package.json")) as Record<string, unknown>;
    const deps = pkg["dependencies"] as Record<string, string>;
    expect(deps["@refinedev/core"]).toBe("5.0.12");
    expect(deps["@refinedev/react-router"]).toBe("2.0.4");
    expect(deps["@refinedev/simple-rest"]).toBe("6.0.1");
    expect(deps["react"]).toBe("^19.3.1");
    expect(deps["react-dom"]).toBe("^19.3.1");
    expect(deps["react-router"]).toBe("^7.0.2");
    const dev = pkg["devDependencies"] as Record<string, string>;
    expect(dev["vite"]).toBe("^8.3.5");
    expect(dev["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(dev["typescript"]).toBe("^5.6.0");
    expect(Object.keys(deps)).toHaveLength(6);
    expect(Object.keys(dev)).toHaveLength(3);
  });

  it("App.tsx monta <Refine> con la telemetría apagada", () => {
    const app = contenido(generar(), "src/App.tsx");
    expect(app).toContain("disableTelemetry: true");
    expect(app).toContain("<Refine");
    expect(app).toContain('dataProvider={dataProvider(API_URL)}');
    expect(app).toContain('@refinedev/core');
  });

  it(".env.example lleva REFINE_NO_TELEMETRY=true y ninguna clave", () => {
    const env = contenido(generar(), ".env.example");
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    expect(env).toMatch(/VITE_API_URL=\s*$/m);
    // Ninguna variable con valor no vacío, salvo el apagado de telemetría.
    const conValor = env
      .split("\n")
      .filter((linea) => /^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(linea));
    expect(conValor).toEqual(["REFINE_NO_TELEMETRY=true"]);
    expect(env).toContain("VITE_API_URL=");
  });

  it("rechaza nombres de recurso y campos inválidos con error en español", () => {
    expect(() =>
      plantillaRefine({ nombre: "Panel", recursos: [{ nombre: "Mal Nombre", campos: [] }] }),
    ).toThrow(/Mal Nombre/);
    expect(() =>
      plantillaRefine({ nombre: "Panel", recursos: [{ nombre: "ok", campos: ['pre"cio'] }] }),
    ).toThrow(/pre"cio/);
    expect(() =>
      plantillaRefine({ nombre: "Panel", recursos: [{ nombre: "ok", campos: ["repetido", "repetido"] }] }),
    ).toThrow(/repetido/);
  });

  it("reduce el nombre del proyecto a un slug ASCII", () => {
    const pkg = JSON.parse(contenido(generar(), "package.json")) as Record<string, unknown>;
    expect(pkg["name"]).toBe("panel-oxido-2026");
  });

  it("ningún archivo generado contiene http://", () => {
    for (const archivo of generar()) {
      expect(archivo.content).not.toContain("http://");
    }
  });

  it("hay una página (ruta de listado) por recurso", () => {
    const app = contenido(generar(), "src/App.tsx");
    const listado = contenido(generar(), "src/paginas/listado.tsx");
    for (const recurso of RECURSOS) {
      expect(app).toContain(`path="/${recurso.nombre}"`);
      expect(app).toContain(`recurso="${recurso.nombre}"`);
      expect(app).toContain(`Listado recurso="${recurso.nombre}"`);
      expect(app).toContain(JSON.stringify(recurso.campos));
    }
    expect(listado).toContain("useList");
    expect(listado).toContain("query.isLoading");
    expect(listado).toContain("result?.data");
  });

  it("el LEEME.md explica la activación manual y la conexión con widget-data", () => {
    const leeme = contenido(generar(), "LEEME.md");
    expect(leeme).toContain("npm install");
    expect(leeme).toContain("Node 20+");
    expect(leeme).toContain("Versiones fijadas el 2026-10-25");
    expect(leeme).toContain("disableTelemetry: true");
    expect(leeme).toContain("REFINE_NO_TELEMETRY=true");
    expect(leeme).toContain("src/lib/widget-data/");
    expect(leeme).toContain("proxy");
    expect(leeme).toContain("sin la palabra de Alex");
  });

  it("es determinista: dos llamadas dan lo mismo", () => {
    expect(JSON.stringify(generar())).toBe(JSON.stringify(generar()));
  });

  it("cada lenguaje sale de languageForPath", () => {
    for (const archivo of generar()) {
      expect(archivo.language).toBe(languageForPath(archivo.path));
    }
  });
});
