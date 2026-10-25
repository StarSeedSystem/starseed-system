/**
 * Pruebas de la plantilla «panel de datos» (DSN1025H).
 * Solo funciones puras: nada de red, disco ni procesos. Sin `vi.mock`.
 */
import { describe, it, expect } from "vitest";
import { plantillaRefine } from "@/lib/appgen/plantilla-refine";
import { languageForPath } from "@/lib/appgen/appgen";

const opBase = {
  nombre: "Panel Sol Ñ 2026!",
  recursos: [
    { nombre: "pepitas", campos: ["nombre", "peso_kg", "notas"] },
    { nombre: "placas-solares", campos: ["techo", "kwh_dia"] },
  ],
};

const archivos = plantillaRefine(opBase);
const porRuta = new Map(archivos.map((f) => [f.path, f]));

function ruta(path: string): string {
  const f = porRuta.get(path);
  if (!f) throw new Error(`La plantilla no generó el archivo ${path}`);
  return f.content;
}

describe("plantillaRefine · paquete", () => {
  it("el package.json se parsea y lleva las dependencias exactas verificadas", () => {
    const pkg = JSON.parse(ruta("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(pkg.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(pkg.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
    expect(pkg.dependencies["react"]).toBe("^19.3.1");
    expect(pkg.dependencies["react-dom"]).toBe("^19.3.1");
    expect(pkg.dependencies["react-router"]).toBe("^7.0.2");
    expect(pkg.devDependencies["vite"]).toBe("^8.3.5");
    expect(pkg.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(pkg.devDependencies["typescript"]).toBe("^5.6.0");
  });

  it("el nombre del proyecto se redujo a un slug ASCII", () => {
    expect(JSON.parse(ruta("package.json")).name).toBe("panel-sol-n-2026");
  });
});

describe("plantillaRefine · telemetría apagada", () => {
  it("App.tsx lleva options={{ disableTelemetry: true }}", () => {
    expect(ruta("src/App.tsx")).toContain("disableTelemetry: true");
  });

  it(".env.example lleva REFINE_NO_TELEMETRY=true y en él no hay ninguna clave", () => {
    const env = ruta(".env.example");
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    expect(env).toContain("VITE_API_URL=");
    for (const linea of env.split("\n")) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith("#")) continue;
      const partes = limpia.split("=");
      const valor = partes.slice(1).join("=");
      expect(valor === "" || valor === "true" || valor === "false").toBe(true);
    }
    expect(/KEY|SECRET|TOKEN|PASSWORD|PASSWD/i.test(env)).toBe(false);
  });
});

describe("plantillaRefine · validación de datos del usuario", () => {
  it("un recurso «Mal Nombre» lanza un Error en español", () => {
    expect(() => plantillaRefine({ ...opBase, recursos: [{ nombre: "Mal Nombre", campos: ["a"] }] })).toThrow(
      /recurso/i,
    );
  });

  it("un campo con comillas lanza un Error", () => {
    expect(() =>
      plantillaRefine({
        ...opBase,
        recursos: [{ nombre: "pepitas", campos: ['campo"malo'] }],
      }),
    ).toThrow(/campo/i);
  });
});

describe("plantillaRefine · higiene del proyecto generado", () => {
  it("ningún archivo contiene http://", () => {
    for (const f of archivos) {
      expect(f.content.includes("http://")).toBe(false);
    }
  });

  it("hay una página de listado por recurso", () => {
    const paginas = archivos.filter((f) => f.path.startsWith("src/paginas/listado-"));
    expect(paginas).toHaveLength(opBase.recursos.length);
    for (const recurso of opBase.recursos) {
      const pagina = porRuta.get(`src/paginas/listado-${recurso.nombre}.tsx`);
      expect(pagina?.content).toContain(`resource: "${recurso.nombre}"`);
      expect(pagina?.content).toContain("query.isLoading");
    }
  });

  it("dos llamadas con la misma entrada dan exactamente lo mismo", () => {
    expect(plantillaRefine(opBase)).toEqual(plantillaRefine(opBase));
  });
});

describe("plantillaRefine · AppFile", () => {
  it("cada language sale de languageForPath", () => {
    for (const f of archivos) {
      expect(f.language).toBe(languageForPath(f.path));
    }
  });
});
