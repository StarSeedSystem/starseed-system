/**
 * Pruebas de la plantilla Refine del Estudio de Apps (DSN1025H).
 * Solo funciones puras: entrada → salida, sin red ni disco ni procesos.
 */

import { describe, it, expect } from "vitest";
import { plantillaRefine } from "../plantilla-refine";
import { languageForPath } from "@/lib/appgen/appgen";

const opValida = {
  nombre: "Panel Éxodo Café",
  recursos: [
    { nombre: "clientes", campos: ["nombre", "creado_en"] },
    { nombre: "pedidos-2026", campos: ["total", "cliente_id"] },
  ],
};

describe("plantillaRefine · package.json", () => {
  it("el package.json se parsea y lleva @refinedev/core exactamente 5.0.12", () => {
    const archivos = plantillaRefine(opValida);
    const pkg = archivos.find((f) => f.path === "package.json");
    expect(pkg).toBeDefined();
    const parsed = JSON.parse(pkg!.content) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(parsed.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(parsed.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
    expect(parsed.dependencies["react-router"]).toBe("^7.0.2");
    expect(parsed.dependencies.react).toBe("^19.3.1");
    expect(parsed.devDependencies.vite).toBe("^8.3.5");
    expect(parsed.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(parsed.devDependencies.typescript).toBe("^5.6.0");
  });

  it("el nombre del proyecto queda reducido a slug ASCII", () => {
    const archivos = plantillaRefine(opValida);
    const parsed = JSON.parse(archivos.find((f) => f.path === "package.json")!.content) as {
      name: string;
    };
    expect(parsed.name).toBe("panel-exodo-cafe");
  });
});

describe("plantillaRefine · telemetría apagada", () => {
  it("App.tsx contiene disableTelemetry: true", () => {
    const archivos = plantillaRefine(opValida);
    const app = archivos.find((f) => f.path === "src/App.tsx");
    expect(app?.content).toContain("disableTelemetry: true");
  });

  it(".env.example contiene REFINE_NO_TELEMETRY=true y ninguna clave", () => {
    const archivos = plantillaRefine(opValida);
    const env = archivos.find((f) => f.path === ".env.example");
    expect(env?.content).toContain("REFINE_NO_TELEMETRY=true");
    expect(env?.content).toContain("VITE_API_URL=");
    expect(env?.content).not.toMatch(/(KEY|SECRET|TOKEN|PASSWORD)\s*=/);
    for (const archivo of archivos) {
      expect(archivo.content).not.toContain("API_KEY");
      expect(archivo.content).not.toContain("api_key");
      expect(archivo.content).not.toContain("sk-");
    }
  });
});

describe("plantillaRefine · validación de datos del usuario", () => {
  it("un recurso «Mal Nombre» lanza Error en español", () => {
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [{ nombre: "Mal Nombre", campos: ["nombre"] }],
      }),
    ).toThrow("Nombre de recurso no válido");
  });

  it("un campo con comillas lanza Error en español", () => {
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [{ nombre: "clientes", campos: ['nombre"peligro"'] }],
      }),
    ).toThrow("Campo no válido");
  });

  it("sin recursos lanza Error", () => {
    expect(() => plantillaRefine({ nombre: "panel", recursos: [] })).toThrow(
      "al menos un recurso",
    );
  });

  it("un recurso repetido lanza Error", () => {
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [
          { nombre: "clientes", campos: ["nombre"] },
          { nombre: "clientes", campos: ["total"] },
        ],
      }),
    ).toThrow("repetido");
  });
});

describe("plantillaRefine · conjunto de archivos", () => {
  it("ningún archivo contiene http://", () => {
    const archivos = plantillaRefine(opValida);
    for (const archivo of archivos) {
      expect(archivo.content).not.toContain("http://");
    }
  });

  it("hay una página de listado por recurso", () => {
    const archivos = plantillaRefine(opValida);
    const paginas = archivos.filter((f) => f.path.startsWith("src/paginas/"));
    expect(paginas.map((p) => p.path)).toEqual([
      "src/paginas/clientes.tsx",
      "src/paginas/pedidos-2026.tsx",
    ]);
    expect(paginas[0].content).toContain('useList({ resource: "clientes" })');
    expect(paginas[1].content).toContain('useList({ resource: "pedidos-2026" })');
    // Refine 5: resultado en result.data / result.total y carga en query.isLoading.
    expect(paginas[0].content).toContain("query.isLoading");
    expect(paginas[0].content).toContain("result?.data");
    expect(paginas[0].content).toContain("result?.total");
  });

  it("App.tsx monta <Refine> con dataProvider, routerProvider y recursos", () => {
    const archivos = plantillaRefine(opValida);
    const app = archivos.find((f) => f.path === "src/App.tsx")!;
    expect(app.content).toContain("dataProvider={dataProvider(apiUrl)}");
    expect(app.content).toContain("routerProvider={routerProvider}");
    expect(app.content).toContain("{ name: \"clientes\", list: \"/clientes\" }");
    expect(app.content).toContain("import.meta.env.VITE_API_URL");
  });

  it("los archivos de base existen con lo esperado", () => {
    const archivos = plantillaRefine(opValida);
    const rutas = archivos.map((f) => f.path);
    expect(rutas).toContain("index.html");
    expect(rutas).toContain("vite.config.ts");
    expect(rutas).toContain("tsconfig.json");
    expect(rutas).toContain(".gitignore");
    expect(rutas).toContain("LEEME.md");
    expect(rutas).toContain("src/main.tsx");
    const leeme = archivos.find((f) => f.path === "LEEME.md")!;
    expect(leeme.content).toContain("npm install");
    expect(leeme.content).toContain("npm run dev");
    expect(leeme.content).toContain("Node.js 20");
    expect(leeme.content).toContain("2026-10-25");
    expect(leeme.content).toContain("npm outdated");
    expect(leeme.content).toContain("SRC/lib/widget-data/".toLowerCase());
    expect(leeme.content).toContain("no dentro de este");
    expect(leeme.content).toContain("palabra de Alex");
    expect(leeme.content).toContain("proxy propio");
  });

  it("dos llamadas con la misma operación dan exactamente lo mismo", () => {
    expect(plantillaRefine(opValida)).toEqual(plantillaRefine({ ...opValida }));
  });

  it("cada language sale de languageForPath", () => {
    const archivos = plantillaRefine(opValida);
    expect(archivos.length).toBeGreaterThan(0);
    for (const archivo of archivos) {
      expect(archivo.language).toBe(languageForPath(archivo.path));
    }
  });
});
