import { describe, it, expect } from "vitest";
import { plantillaRefine, type OpcionesPlantillaRefine } from "../plantilla-refine";
import { languageForPath } from "../appgen";

/** Datos de entrada de ejemplo: dos recursos con campos acordes al contrato. */
function datosEjemplo(): OpcionesPlantillaRefine {
  return {
    nombre: "Panel de Datos Áureo",
    recursos: [
      { nombre: "clientes", campos: ["nombre", "email", "total"] },
      { nombre: "pedidos", campos: ["fecha", "importe"] },
    ],
  };
}

const GENERADOS = plantillaRefine(datosEjemplo());

/** Devuelve el contenido del archivo pedido; falla si la plantilla no lo trae. */
function buscar(archivos: { path: string; content: string }[], ruta: string): string {
  const archivo = archivos.find((o) => o.path === ruta);
  expect(archivo, `falta el archivo ${ruta}`).toBeTruthy();
  return archivo ? archivo.content : "";
}

describe("plantillaRefine", () => {
  it("genera el conjunto de archivos esperado", () => {
    const rutas = GENERADOS.map((o) => o.path);
    const esperadas = [
      "package.json",
      "index.html",
      "vite.config.ts",
      "tsconfig.json",
      ".gitignore",
      ".env.example",
      "src/main.tsx",
      "src/App.tsx",
      "LEEME.md",
    ];
    for (const ruta of esperadas) expect(rutas, ruta).toContain(ruta);
  });

  it("package.json se parsea con las versiones exactas de la ficha lib-refine", () => {
    const paquete = JSON.parse(buscar(GENERADOS, "package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(paquete.dependencies).toEqual({
      "@refinedev/core": "5.0.12",
      "@refinedev/react-router": "2.0.4",
      "@refinedev/simple-rest": "6.0.1",
      react: "^19.3.1",
      "react-dom": "^19.3.1",
      "react-router": "^7.0.2",
    });
    expect(paquete.devDependencies).toEqual({
      "@vitejs/plugin-react": "^6.1.2",
      typescript: "^5.6.0",
      vite: "^8.3.5",
    });
  });

  it("App.tsx apaga la telemetría y monta el proveedor REST con recursos", () => {
    const app = buscar(GENERADOS, "src/App.tsx");
    expect(app).toContain("disableTelemetry: true");
    expect(app).toContain("@refinedev/simple-rest");
    expect(app).toContain("routerProvider");
  });

  it(".env.example apaga la telemetría y no trae ninguna clave", () => {
    const env = buscar(GENERADOS, ".env.example");
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    const valores = env
      .split("\n")
      .filter((linea) => linea.includes("=") && !linea.trim().startsWith("#"));
    // Solo hay dos variables y SIN valores: VITE_API_URL vacío y el freno a true.
    expect(valores).toEqual(["VITE_API_URL=", "REFINE_NO_TELEMETRY=true"]);
  });

  it("rechaza un recurso con «Mal Nombre» y un campo con comillas", () => {
    expect(() =>
      plantillaRefine({ ...datosEjemplo(), recursos: [{ nombre: "Mal Nombre", campos: ["a"] }] }),
    ).toThrow(/recurso/i);
    expect(() =>
      plantillaRefine({ ...datosEjemplo(), recursos: [{ nombre: "clientes", campos: ['no"puede'] }] }),
    ).toThrow(/campo/i);
  });

  it("ningún archivo generado contiene http://", () => {
    for (const archivo of GENERADOS) {
      expect(archivo.content, archivo.path).not.toContain("http://");
    }
  });

  it("genera una página por recurso con useList de Refine 5", () => {
    const paginas = GENERADOS.filter((o) => o.path.startsWith("src/paginas/listado-"));
    expect(paginas.length).toBe(datosEjemplo().recursos.length);
    for (const pagina of paginas) {
      expect(pagina.content).toContain("useList");
      expect(pagina.content).toContain("query.isLoading");
      expect(pagina.content).toContain("result");
    }
  });

  it("es pura: dos llamadas con los mismos datos devuelven lo mismo", () => {
    expect(JSON.stringify(plantillaRefine(datosEjemplo()))).toBe(
      JSON.stringify(plantillaRefine(datosEjemplo())),
    );
  });

  it("cada language sale de languageForPath", () => {
    for (const archivo of GENERADOS) {
      expect(archivo.language).toBe(languageForPath(archivo.path));
    }
  });

  it("reduce el nombre del proyecto a un slug ASCII", () => {
    const paquete = JSON.parse(buscar(GENERADOS, "package.json")) as { name: string };
    expect(paquete.name).toBe("panel-de-datos-aureo");
  });
});
