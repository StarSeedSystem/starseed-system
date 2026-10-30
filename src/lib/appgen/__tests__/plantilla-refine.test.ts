/**
 * StarSeed OS — pruebas de la plantilla «panel de datos» con Refine (DSN1025H).
 *
 * Solo funciones puras: entrada → salida, sin red, sin disco, sin procesos.
 * `plantillaRefine` genera el proyecto completo (AppFile[]), así que las pruebas
 * inspeccionan el texto de los archivos generados.
 */

import { describe, it, expect } from "vitest";
import { plantillaRefine } from "../plantilla-refine";
import { languageForPath } from "../appgen";

const PLANTILLA = plantillaRefine({
  nombre: "Panel Datos RH",
  recursos: [
    { nombre: "clientes", campos: ["id", "nombre_completo", "cif"] },
    { nombre: "pedidos", campos: ["total_bruto"] },
  ],
});

function contenido(ruta: string): string {
  const archivo = PLANTILLA.find((a) => a.path === ruta);
  if (!archivo) throw new Error(`La plantilla no trae el archivo «${ruta}».`);
  return archivo.content;
}

describe("plantillaRefine", () => {
  it("genera el paquete con las versiones verificadas de la ficha lib-refine", () => {
    const paquete = JSON.parse(contenido("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // Exactas, verificadas en npm el 2026-10-25 (ficha lib-refine).
    expect(paquete.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(paquete.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(paquete.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
    // De rango, según el contrato (no inventadas).
    expect(paquete.dependencies["react"]).toBe("^19.3.1");
    expect(paquete.dependencies["react-dom"]).toBe("^19.3.1");
    expect(paquete.dependencies["react-router"]).toBe("^7.0.2");
    expect(paquete.devDependencies["vite"]).toBe("^8.3.5");
    expect(paquete.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(paquete.devDependencies["typescript"]).toBe("^5.6.0");
  });

  it("apaga la telemetría en App.tsx y en .env.example, sin ninguna clave", () => {
    const app = contenido("src/App.tsx");
    expect(app).toContain("disableTelemetry: true");
    const env = contenido(".env.example");
    expect(env).toContain("VITE_API_URL=");
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    // Las líneas de valor (no comentario) son solo esas dos: ninguna clave.
    const valores = env
      .split("\n")
      .filter((linea) => linea.includes("=") && !linea.trim().startsWith("#"));
    expect(valores.length).toBe(2);
    for (const linea of valores) {
      expect(linea === "VITE_API_URL=" || linea === "REFINE_NO_TELEMETRY=true").toBe(true);
    }
  });

  it("rechaza «Mal Nombre» como recurso y un campo con comillas", () => {
    expect(() =>
      plantillaRefine({ nombre: "panel", recursos: [{ nombre: "Mal Nombre", campos: [] }] }),
    ).toThrow(/recurso/i);
    expect(() =>
      plantillaRefine({ nombre: "panel", recursos: [{ nombre: "clientes", campos: [] }] }),
    ).not.toThrow();
    expect(() =>
      plantillaRefine({
        nombre: "panel",
        recursos: [{ nombre: "clientes", campos: ['campo"rarito'] }],
      }),
    ).toThrow(/campo/i);
  });

  it("no pone «http://» en ningún archivo generado", () => {
    for (const archivo of PLANTILLA) {
      expect(archivo.content).not.toContain("http://");
    }
  });

  it("trata un listado por recurso y deriva cada language de languageForPath", () => {
    expect(PLANTILLA.map((a) => a.path)).toContain("src/paginas/listado-clientes.tsx");
    expect(PLANTILLA.map((a) => a.path)).toContain("src/paginas/listado-pedidos.tsx");
    const paginas = PLANTILLA.filter((a) => a.path.startsWith("src/paginas/listado-"));
    expect(paginas.length).toBe(2);
    for (const pagina of paginas) {
      expect(pagina.content).toContain("useList");
      expect(pagina.content).toContain("query.isLoading");
    }
    for (const archivo of PLANTILLA) {
      expect(archivo.language).toBe(languageForPath(archivo.path));
    }
  });

  it("es pura: dos llamadas con la misma entrada dan lo mismo", () => {
    const primera = JSON.stringify(
      plantillaRefine({ nombre: "Panel Datos RH", recursos: [{ nombre: "clientes", campos: ["id", "cif"] }] }),
    );
    const segunda = JSON.stringify(
      plantillaRefine({ nombre: "Panel Datos RH", recursos: [{ nombre: "clientes", campos: ["id", "cif"] }] }),
    );
    expect(primera).toBe(segunda);
  });
});
