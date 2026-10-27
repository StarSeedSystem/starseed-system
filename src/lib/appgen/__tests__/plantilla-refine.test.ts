import { describe, it, expect } from "vitest";
import { plantillaRefine, PlantillaRefineOptions } from "../plantilla-refine";
import { languageForPath } from "../appgen";

describe("plantillaRefine", () => {
  const baseOpts: PlantillaRefineOptions = {
    nombre: "Mi Panel",
    recursos: [
      { nombre: "usuarios", campos: ["id", "nombre", "email"] },
      { nombre: "productos", campos: ["id", "nombre", "precio"] },
    ],
  };

  it("devuelve AppFile[] con todos los archivos esperados", () => {
    const files = plantillaRefine(baseOpts);
    const paths = files.map((f) => f.path).sort();

    expect(paths).toContain("package.json");
    expect(paths).toContain("index.html");
    expect(paths).toContain("vite.config.ts");
    expect(paths).toContain("tsconfig.json");
    expect(paths).toContain(".gitignore");
    expect(paths).toContain(".env.example");
    expect(paths).toContain("src/main.tsx");
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("LEEME.md");
    expect(paths).toContain("src/paginas/listado-usuarios.tsx");
    expect(paths).toContain("src/paginas/listado-productos.tsx");
  });

  it("package.json se parsea y lleva @refinedev/core exactamente 5.0.12", () => {
    const files = plantillaRefine(baseOpts);
    const pkgFile = files.find((f) => f.path === "package.json");
    expect(pkgFile).toBeDefined();

    const pkg = JSON.parse(pkgFile!.content);
    expect(pkg.dependencies["@refinedev/core"]).toBe("5.0.12");
    expect(pkg.dependencies["@refinedev/react-router"]).toBe("2.0.4");
    expect(pkg.dependencies["@refinedev/simple-rest"]).toBe("6.0.1");
    expect(pkg.dependencies.react).toBe("^19.3.1");
    expect(pkg.dependencies["react-dom"]).toBe("^19.3.1");
    expect(pkg.dependencies["react-router"]).toBe("^7.0.2");
    expect(pkg.devDependencies.vite).toBe("^8.3.5");
    expect(pkg.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(pkg.devDependencies.typescript).toBe("^5.6.0");
  });

  it("App.tsx contiene disableTelemetry: true", () => {
    const files = plantillaRefine(baseOpts);
    const appFile = files.find((f) => f.path === "src/App.tsx");
    expect(appFile).toBeDefined();
    expect(appFile!.content).toContain("disableTelemetry: true");
  });

  it(".env.example contiene REFINE_NO_TELEMETRY=true y ninguna clave", () => {
    const files = plantillaRefine(baseOpts);
    const envFile = files.find((f) => f.path === ".env.example");
    expect(envFile).toBeDefined();
    expect(envFile!.content).toContain("REFINE_NO_TELEMETRY=true");
    expect(envFile!.content).toContain("VITE_API_URL=");
    // No debe contener claves secretas (ni valores después de = que no sean vacíos o true)
    const lineas = envFile!.content.trim().split("\n");
    for (const linea of lineas) {
      if (linea.includes("=") && !linea.startsWith("#")) {
        const [, valor] = linea.split("=");
        // Solo valores permitidos: vacío o "true"
        expect(valor === "" || valor === "true").toBe(true);
      }
    }
  });

  it("un recurso con nombre inválido lanza Error en español", () => {
    const opts: PlantillaRefineOptions = {
      nombre: "Test",
      recursos: [{ nombre: "Mal Nombre", campos: ["id"] }],
    };
    expect(() => plantillaRefine(opts)).toThrow(/Nombre de recurso inválido/);
    expect(() => plantillaRefine(opts)).toThrow(/minúscula/);
  });

  it("un campo con comillas lanza Error en español", () => {
    const opts: PlantillaRefineOptions = {
      nombre: "Test",
      recursos: [{ nombre: "valido", campos: ['campo"con"comillas'] }],
    };
    expect(() => plantillaRefine(opts)).toThrow(/Nombre de campo inválido/);
    expect(() => plantillaRefine(opts)).toThrow(/guión bajo/);
  });

  it("ningún archivo contiene http:// (solo https o variables de entorno)", () => {
    const files = plantillaRefine(baseOpts);
    for (const f of files) {
      expect(f.content).not.toMatch(/http:\/\//);
    }
  });

  it("hay una página por recurso", () => {
    const files = plantillaRefine(baseOpts);
    const paginas = files.filter((f) => f.path.startsWith("src/paginas/listado-"));
    expect(paginas).toHaveLength(2);
  });

  it("dos llamadas con las mismas opciones devuelven lo mismo", () => {
    const files1 = plantillaRefine(baseOpts);
    const files2 = plantillaRefine(baseOpts);

    expect(files1.length).toBe(files2.length);
    for (let i = 0; i < files1.length; i++) {
      expect(files1[i].path).toBe(files2[i].path);
      expect(files1[i].content).toBe(files2[i].content);
      expect(files1[i].language).toBe(files2[i].language);
    }
  });

  it("cada language sale de languageForPath", () => {
    const files = plantillaRefine(baseOpts);
    for (const f of files) {
      expect(f.language).toBe(languageForPath(f.path));
    }
  });

  it("el nombre del proyecto se reduce a slug ASCII", () => {
    const opts: PlantillaRefineOptions = {
      nombre: "Mi Proyecto con Acentos Ñ",
      recursos: [{ nombre: "items", campos: ["id"] }],
    };
    const files = plantillaRefine(opts);
    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = JSON.parse(pkgFile!.content);
    expect(pkg.name).toMatch(/^[a-z0-9-]+$/);
    expect(pkg.name).not.toContain(" ");
    expect(pkg.name).not.toContain("ó");
    expect(pkg.name).not.toContain("ñ");
  });

  it("valida campos que empiezan por número", () => {
    const opts: PlantillaRefineOptions = {
      nombre: "Test",
      recursos: [{ nombre: "valido", campos: ["1invalido"] }],
    };
    expect(() => plantillaRefine(opts)).toThrow(/Nombre de campo inválido/);
  });

  it("valida recurso que empieza por número", () => {
    const opts: PlantillaRefineOptions = {
      nombre: "Test",
      recursos: [{ nombre: "1invalido", campos: ["id"] }],
    };
    expect(() => plantillaRefine(opts)).toThrow(/Nombre de recurso inválido/);
  });

  it("acepta guión bajo al inicio en campos", () => {
    const opts: PlantillaRefineOptions = {
      nombre: "Test",
      recursos: [{ nombre: "valido", campos: ["_privado", "publico"] }],
    };
    const files = plantillaRefine(opts);
    expect(files.length).toBeGreaterThan(0);
  });

  it("acepta guiones en nombres de recurso", () => {
    const opts: PlantillaRefineOptions = {
      nombre: "Test",
      recursos: [{ nombre: "mis-usuarios", campos: ["id"] }],
    };
    const files = plantillaRefine(opts);
    const listado = files.find((f) => f.path === "src/paginas/listado-mis-usuarios.tsx");
    expect(listado).toBeDefined();
  });
});