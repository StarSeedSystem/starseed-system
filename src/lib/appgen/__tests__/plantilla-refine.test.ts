/**
 * Pruebas de la plantilla «panel de datos» con Refine (DSN1025H).
 *
 * Solo funciones puras: `plantillaRefine` es entrada → salida, sin red, sin
 * disco y sin procesos. `describe`/`it`/`expect` de vitest porque `globals`
 * está en false.
 */

import { describe, it, expect } from "vitest";
import { plantillaRefine } from "@/lib/appgen/plantilla-refine";
import { languageForPath } from "@/lib/appgen/appgen";

const CASO = {
  nombre: "Panel Ventas Verde",
  recursos: [
    { nombre: "pedidos-verde", campos: ["id", "fecha", "estado_aduana"] },
    { nombre: "clientes", campos: ["id", "nombre"] },
  ],
};

describe("plantillaRefine · panel de datos con Refine", () => {
  const archivos = plantillaRefine(CASO);
  const deRuta = (ruta: string): string =>
    archivos.find((a) => a.path === ruta)?.content ?? "";

  it("el package.json se parsea y lleva @refinedev/core exactamente 5.0.12", () => {
    const paquete = JSON.parse(deRuta("package.json"));
    expect(paquete.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(paquete.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(paquete.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
  });

  it("App.tsx apaga la telemetría con disableTelemetry: true", () => {
    expect(deRuta("src/App.tsx")).toContain("disableTelemetry: true");
  });

  it(".env.example lleva REFINE_NO_TELEMETRY=true y ninguna clave", () => {
    const env = deRuta(".env.example");
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    expect(env).toContain("VITE_API_URL=");
    expect(env).not.toMatch(/(api[_-]?key|secret|password|token|bearer|sk-)/i);
    expect(env).toMatch(/^VITE_API_URL=\s*$/m);
    expect(env).toMatch(/^REFINE_NO_TELEMETRY=true\s*$/m);
  });

  it("un recurso «Mal Nombre» lanza", () => {
    expect(() =>
      plantillaRefine({ ...CASO, recursos: [{ nombre: "Mal Nombre", campos: ["id"] }] }),
    ).toThrow(Error);
  });

  it("un campo con comillas lanza", () => {
    expect(() =>
      plantillaRefine({
        ...CASO,
        recursos: [{ nombre: "clientes", campos: ['nombre"coma'] }],
      }),
    ).toThrow(Error);
  });

  it("ningún archivo contiene http://", () => {
    for (const archivo of archivos) {
      expect(archivo.content).not.toContain("http://");
      expect(archivo.path).not.toContain("http://");
    }
  });

  it("hay una página de listado por recurso", () => {
    for (const recurso of CASO.recursos) {
      const ruta = `src/paginas/listado-${recurso.nombre}.tsx`;
      const pagina = deRuta(ruta);
      expect(pagina).toContain(`RECURSO = "${recurso.nombre}"`);
      expect(pagina).toContain("useList");
    }
  });

  it("dos llamadas con lo mismo dan lo mismo", () => {
    expect(plantillaRefine(CASO)).toEqual(plantillaRefine(CASO));
  });

  it("cada language sale de languageForPath", () => {
    for (const archivo of archivos) {
      expect(archivo.language).toBe(languageForPath(archivo.path));
    }
  });
});
