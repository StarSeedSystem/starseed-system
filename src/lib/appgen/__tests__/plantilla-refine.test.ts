import { describe, it, expect } from "vitest";
import { plantillaRefine, type OpcionesPlantillaRefine } from "../plantilla-refine";
import { languageForPath } from "../appgen";

const op: OpcionesPlantillaRefine = {
  nombre: "Panel de Clientes",
  recursos: [
    { nombre: "clientes", campos: ["id", "nombre", "creado"] },
    { nombre: "pedidos", campos: ["id", "cliente_id", "total"] },
  ],
};

function porRuta(archivos: ReturnType<typeof plantillaRefine>, ruta: string) {
  return archivos.find((a) => a.path === ruta);
}

describe("plantillaRefine", () => {
  it("genera un package.json válido con exactamente @refinedev/core 5.0.12", () => {
    const paquete = JSON.parse(porRuta(plantillaRefine(op), "package.json")?.content ?? "");
    expect(paquete.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(paquete.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(paquete.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
  });

  it("apaga la telemetría en App.tsx (.env.example) y en el entorno", () => {
    const archivos = plantillaRefine(op);
    expect(porRuta(archivos, "src/App.tsx")?.content).toContain("disableTelemetry: true");
    const env = porRuta(archivos, ".env.example")?.content ?? "";
    expect(env).toContain("REFINE_NO_TELEMETRY=true");
    expect(env).toContain("VITE_API_URL=\n");
    // Sin claves: solo esas dos líneas.
    const lineas = env.split("\n").filter(Boolean);
    expect(lineas).toHaveLength(2);
  });

  it("lanza en español si el recurso o un campo no casan", () => {
    expect(() => plantillaRefine({ ...op, recursos: [{ nombre: "Mal Nombre", campos: ["id"] }] })).toThrow(
      /Mal Nombre/,
    );
    expect(() =>
      plantillaRefine({ ...op, recursos: [{ nombre: "clientes", campos: ['con"comillas'] }] }),
    ).toThrow(/comillas/);
  });

  it("ningún archivo generado contiene http://", () => {
    for (const a of plantillaRefine(op)) {
      expect(a.content).not.toContain("http://");
    }
  });

  it("una página por recurso, con useList", () => {
    const archivos = plantillaRefine(op);
    for (const r of op.recursos) {
      const pagina = porRuta(archivos, `src/paginas/${r.nombre}.tsx`);
      expect(pagina).toBeDefined();
      expect(pagina?.content).toContain(`"${r.nombre}"`);
    }
    expect(porRuta(archivos, "src/paginas/listado.tsx")?.content).toContain("useList");
  });

  it("es determinista: dos llamadas dan lo mismo", () => {
    expect(plantillaRefine(op)).toEqual(plantillaRefine(op));
  });

  it("cada language sale de languageForPath", () => {
    for (const a of plantillaRefine(op)) {
      expect(a.language).toBe(languageForPath(a.path));
    }
  });

  it("reduce el nombre del proyecto a slug ASCII", () => {
    const archivos = plantillaRefine(op);
    const paquete = JSON.parse(porRuta(archivos, "package.json")?.content ?? "");
    expect(paquete.name).toBe("panel-de-clientes");
  });
});
