import { describe, it, expect } from "vitest";
import { plantillaRefine, validarSlugYRecursos } from "../plantilla-refine";
import { languageForPath } from "../appgen";

describe("Plantilla Refine", () => {
  it("valida slugs y nombres de recursos correctamente", () => {
    const res = validarSlugYRecursos("Mi Panel de Datos", [
      { nombre: "usuarios", campos: ["id", "nombre_completo", "email"] },
    ]);
    expect(res.slug).toBe("mi-panel-de-datos");
  });

  it("lanza error con nombres de recursos inválidos", () => {
    expect(() =>
      validarSlugYRecursos("Panel", [{ nombre: "Mal Nombre", campos: ["id"] }])
    ).toThrow();
  });

  it("lanza error con campos inválidos", () => {
    expect(() =>
      validarSlugYRecursos("Panel", [{ nombre: "usuarios", campos: ["id-comillas\""] }])
    ).toThrow();
  });

  it("genera el package.json con la versión exacta de @refinedev/core 5.0.12", () => {
    const files = plantillaRefine({
      nombre: "test-app",
      recursos: [{ nombre: "tareas", campos: ["titulo", "estado"] }],
    });
    const pkgFile = files.find((f) => f.path === "package.json");
    expect(pkgFile).toBeDefined();
    const pkg = JSON.parse(pkgFile!.content);
    expect(pkg.dependencies["@refinedev/core"]).toBe("5.0.12");
  });

  it("contiene disableTelemetry: true en App.tsx", () => {
    const files = plantillaRefine({
      nombre: "test-app",
      recursos: [{ nombre: "tareas", campos: ["titulo", "estado"] }],
    });
    const appFile = files.find((f) => f.path === "src/App.tsx");
    expect(appFile).toBeDefined();
    expect(appFile!.content).toContain("disableTelemetry: true");
  });

  it("contiene REFINE_NO_TELEMETRY=true y ninguna clave en .env.example", () => {
    const files = plantillaRefine({
      nombre: "test-app",
      recursos: [{ nombre: "tareas", campos: ["titulo", "estado"] }],
    });
    const envFile = files.find((f) => f.path === ".env.example");
    expect(envFile).toBeDefined();
    expect(envFile!.content).toContain("REFINE_NO_TELEMETRY=true");
    expect(envFile!.content).not.toContain("secret");
    expect(envFile!.content).not.toContain("key");
  });

  it("ningún archivo contiene http://", () => {
    const files = plantillaRefine({
      nombre: "test-app",
      recursos: [{ nombre: "tareas", campos: ["titulo", "estado"] }],
    });
    for (const file of files) {
      expect(file.content).not.toContain("http://");
    }
  });

  it("genera una página por recurso", () => {
    const files = plantillaRefine({
      nombre: "test-app",
      recursos: [
        { nombre: "tareas", campos: ["titulo"] },
        { nombre: "proyectos", campos: ["nombre"] },
      ],
    });
    const paginas = files.filter((f) => f.path.startsWith("src/paginas/"));
    expect(paginas.length).toBe(2);
    expect(paginas.some((p) => p.path.includes("tareas"))).toBe(true);
    expect(paginas.some((p) => p.path.includes("proyectos"))).toBe(true);
  });

  it("dos llamadas dan exactamente lo mismo (determinista)", () => {
    const opciones = {
      nombre: "demo-app",
      recursos: [{ nombre: "clientes", campos: ["nombre", "activo"] }],
    };
    const files1 = plantillaRefine(opciones);
    const files2 = plantillaRefine(opciones);
    expect(files1).toEqual(files2);
  });

  it("cada language sale de languageForPath", () => {
    const files = plantillaRefine({
      nombre: "test-app",
      recursos: [{ nombre: "tareas", campos: ["titulo"] }],
    });
    for (const file of files) {
      expect(file.language).toBe(languageForPath(file.path));
    }
  });
});
