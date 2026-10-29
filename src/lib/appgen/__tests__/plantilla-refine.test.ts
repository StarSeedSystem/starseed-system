/**
 * Pruebas de la plantilla «panel de datos» con Refine (DSN1025H · Ola 1025R).
 *
 * PURAS: solo la función pura de la plantilla, sin red, sin disco y sin
 * probar el texto de origen de los datos de Refine (eso se verificó en la
 * rama main según la ficha lib-refine; aquí se comprueba el contenido
 * GENERADO y sus validaciones). Importa describe/it/expect de vitest porque
 * `globals` está en false.
 */
import { describe, it, expect } from "vitest";
import { languageForPath } from "../appgen";
import { plantillaRefine, type RecursoRefine } from "../plantilla-refine";

function recursosBase(): RecursoRefine[] {
  return [
    { nombre: "clientes", campos: ["nombre", "correo", "activo"] },
    { nombre: "pedidos", campos: ["referencia", "total"] },
  ];
}

function panelGenerado(): ReturnType<typeof plantillaRefine> {
  return plantillaRefine({ nombre: "Panel de Ventas", recursos: recursosBase() });
}

function archivoPorRuta(fichas: ReturnType<typeof plantillaRefine>, path: string) {
  const f = fichas.find((x) => x.path === path);
  if (!f) throw new Error(`La plantilla no generó ${path}`);
  return f;
}

describe("plantillaRefine", () => {
  it("genera el conjunto completo de archivos del proyecto", () => {
    const rutas = panelGenerado().map((f) => f.path);
    expect(rutas).toEqual([
      "package.json",
      "index.html",
      "vite.config.ts",
      "tsconfig.json",
      ".gitignore",
      ".env.example",
      "src/main.tsx",
      "src/App.tsx",
      "src/paginas/listado-clientes.tsx",
      "src/paginas/listado-pedidos.tsx",
      "LEEME.md",
    ]);
  });

  it("package.json se parsea y lleva @refinedev/core exactamente 5.0.12", () => {
    const contenido = archivoPorRuta(panelGenerado(), "package.json").content;
    const p = JSON.parse(contenido) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(p.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(p.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(p.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
    expect(p.dependencies.react).toBe("^19.3.1");
    expect(p.dependencies["react-router"]).toBe("^7.0.2");
    expect(p.devDependencies.vite).toBe("^8.3.5");
    expect(p.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(p.devDependencies.typescript).toBe("^5.6.0");
  });

  it("App.tsx monta Refine y apaga la telemetría con disableTelemetry: true", () => {
    const app = archivoPorRuta(panelGenerado(), "src/App.tsx").content;
    expect(app).toContain("disableTelemetry: true");
    expect(app).toContain("dataProvider(API_URL)");
    expect(app).toContain("routerProvider");
    expect(app).toContain('{ name: "pedidos", list: "/pedidos" }');
    expect(app).toContain('ListadoPedidos } from "./paginas/listado-pedidos"');
  });

  it(".env.example lleva REFINE_NO_TELEMETRY=true y ninguna clave", () => {
    const env = archivoPorRuta(panelGenerado(), ".env.example").content;
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    const asignaciones = env
      .split("\n")
      .filter((linea) => linea.includes("=") && !linea.startsWith("#"))
      .sort();
    expect(asignaciones).toEqual(["REFINE_NO_TELEMETRY=true", "VITE_API_URL="]);
  });

  it("un recurso «Mal Nombre», un campo con comillas o repetido lanzan Error", () => {
    expect(() =>
      plantillaRefine({ nombre: "panel", recursos: [{ nombre: "Mal Nombre", campos: [] }] }),
    ).toThrow(/nombre de recurso no es válido/);
    expect(() =>
      plantillaRefine({ nombre: "panel", recursos: [{ nombre: "ok", campos: ['na"me'] }] }),
    ).toThrow(/campo no válido/);
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [
          { nombre: "ok", campos: [] },
          { nombre: "ok", campos: [] },
        ],
      }),
    ).toThrow(/repetido/);
  });

  it("ningún archivo del proyecto generado contiene http://", () => {
    for (const f of panelGenerado()) {
      expect(f.content.includes("http://")).toBe(false);
    }
  });

  it("hay una página de listado por recurso, con useList y query.isLoading", () => {
    const fichas = panelGenerado();
    const paginas = fichas.filter((f) => f.path.startsWith("src/paginas/listado-"));
    expect(paginas.length).toBe(2);
    for (const p of paginas) {
      expect(p.content).toContain("useList({ resource:");
      expect(p.content).toContain("query.isLoading");
      expect(p.content).toContain("result?.data");
    }
    const clientes = archivoPorRuta(fichas, "src/paginas/listado-clientes.tsx").content;
    expect(clientes).toContain('resource: "clientes"');
    expect(clientes).toContain('"correo"');
  });

  it("dos llamadas con la misma entrada devuelven lo mismo", () => {
    expect(panelGenerado()).toEqual(panelGenerado());
  });

  it("cada language de cada archivo sale de languageForPath", () => {
    for (const f of panelGenerado()) {
      expect(f.language).toBe(languageForPath(f.path));
    }
  });

  it("el nombre del proyecto se reduce a un slug ASCII (sin acentos ni símbolos)", () => {
    const fichas = plantillaRefine({ nombre: "Panel Áureo ×", recursos: [] });
    const p = JSON.parse(archivoPorRuta(fichas, "package.json").content) as {
      name: string;
    };
    expect(p.name).toBe("panel-aureo");
  });

  it("LEEME.md explica activación manual, versiones y datos sin palabras secretas", () => {
    const leeme = archivoPorRuta(panelGenerado(), "LEEME.md").content;
    expect(leeme).toContain("npm install");
    expect(leeme).toContain("Node 20");
    expect(leeme).toContain("npm outdated");
    expect(leeme).toContain("disableTelemetry");
    expect(leeme).toContain("REFINE_NO_TELEMETRY");
    expect(leeme).toContain("palabra de Alex");
    expect(leeme).toContain("widget-data");
    expect(leeme).toContain("API REST");
  });
});
