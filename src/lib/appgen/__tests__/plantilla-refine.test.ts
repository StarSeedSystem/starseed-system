import { describe, it, expect } from "vitest";
import { plantillaRefine, type OpcionesPlantillaRefine } from "../plantilla-refine";
import { languageForPath } from "../appgen";

function datosEjemplo(): OpcionesPlantillaRefine {
  return {
    nombre: "Panel de Datos Áureo",
    recursos: [
      { nombre: "clientes", campos: ["nombre", "email", "total"] },
      { nombre: "pedidos", campos: ["fecha", "importe"] },
    ],
  };
}

function buscar(archivos: { path: string; content: string }[], ruta: string): string {
  const archivo = archivos.find((a) => a.path === ruta);
  expect(archivo, `falta el archivo ${ruta}`).toBeTruthy();
  return archivo ? archivo.content : "";
}

describe("plantillaRefine", () => {
  it("genera el conjunto de archivos esperado", () => {
    const archivos = plantillaRefine(datosEjemplo());
    const rutas = archivos.map((a) => a.path);
    expect(rutas).toContain("package.json");
    expect(rutas).toContain("index.html");
    expect(rutas).toContain("vite.config.ts");
    expect(rutas).toContain("tsconfig.json");
    expect(rutas).toContain(".gitignore");
    expect(rutas).toContain(".env.example");
    expect(rutas).toContain("src/main.tsx");
    expect(rutas).toContain("src/App.tsx");
    expect(rutas).toContain("LEEME.md");
  });

  it("package.json se parsea y lleva @refinedev/core exactamente 5.0.12", () => {
    const archivos = plantillaRefine(datosEjemplo());
    const paquete = JSON.parse(buscar(archivos, "package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(paquete.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(paquete.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(paquete.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
    expect(paquete.dependencies.react).toBe("^19.3.1");
    expect(paquete.dependencies["react-dom"]).toBe("^19.3.1");
    expect(paquete.dependencies["react-router"]).toBe("^7.0.2");
    expect(paquete.devDependencies.vite).toBe("^8.3.5");
    expect(paquete.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(paquete.devDependencies.typescript).toBe("^5.6.0");
  });

  it("App.tsx monta Refine con la telemetría apagada y el proveedor REST", () => {
    const app = buscar(plantillaRefine(datosEjemplo()), "src/App.tsx");
    expect(app).toContain("disableTelemetry: true");
    expect(app).toContain("dataProvider");
    expect(app).toContain("routerProvider");
    expect(app).toContain("@refinedev/simple-rest");
  });

  it(".env.example lleva REFINE_NO_TELEMETRY=true, VITE_API_URL vacío y ninguna clave", () => {
    const env = buscar(plantillaRefine(datosEjemplo()), ".env.example");
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    expect(env).toContain("VITE_API_URL=");
    expect(env).toMatch(/VITE_API_URL=\s*$/m);
    expect(env.length).toBeLessThan(500);
  });

  it("rechaza un recurso con «Mal Nombre» y un campo con comillas", () => {
    const malRecurso = {
      ...datosEjemplo(),
      recursos: [{ nombre: "Mal Nombre", campos: ["a"] }],
    };
    expect(() => plantillaRefine(malRecurso)).toThrow(/recurso/i);

    const malCampo = {
      ...datosEjemplo(),
      recursos: [{ nombre: "clientes", campos: ['no"puede'] }],
    };
    expect(() => plantillaRefine(malCampo)).toThrow(/campo/i);
  });

  it("ningún archivo generado contiene http://", () => {
    for (const archivo of plantillaRefine(datosEjemplo())) {
      expect(archivo.content, archivo.path).not.toContain("http://");
    }
  });

  it("genera una página por recurso con useList de Refine 5", () => {
    const archivos = plantillaRefine(datosEjemplo());
    const clientes = buscar(archivos, "src/paginas/listado-clientes.tsx");
    expect(clientes).toContain("useList");
    expect(clientes).toContain("query.isLoading");
    expect(clientes).toContain("result?.data");
    expect(clientes).toContain("result?.total");
    expect(buscar(archivos, "src/paginas/listado-pedidos.tsx")).toContain("useList");
  });

  it("dos llamadas con los mismos datos devuelven lo mismo", () => {
    expect(JSON.stringify(plantillaRefine(datosEjemplo()))).toBe(
      JSON.stringify(plantillaRefine(datosEjemplo())),
    );
  });

  it("cada language sale de languageForPath", () => {
    for (const archivo of plantillaRefine(datosEjemplo())) {
      expect(archivo.language).toBe(languageForPath(archivo.path));
    }
  });

  it("reduce el nombre del proyecto a un slug ASCII", () => {
    const paquete = JSON.parse(
      buscar(plantillaRefine(datosEjemplo()), "package.json"),
    ) as { name: string };
    expect(paquete.name).toBe("panel-de-datos-aureo");
    expect(paquete.name).toMatch(/^[a-z0-9-]+$/);
  });
});
