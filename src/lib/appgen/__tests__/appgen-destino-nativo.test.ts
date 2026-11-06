import { describe, it, expect } from "vitest";
import {
  requisitosNativos,
  planBama,
  newApp,
  type GeneratedApp,
  buildPreview,
} from "@/lib/appgen/appgen";

describe("App Generator BAMA Native macOS", () => {
  it("requisitosNativos devuelve los requisitos correctos", () => {
    const req = requisitosNativos();
    expect(req).toEqual({
      xcode: true,
      swift: "6.2",
      swiftUI: true,
      swiftData: true,
      macOS: "26",
    });
  });

  it("planBama genera un plan válido con todos los campos", () => {
    const app: GeneratedApp = {
      id: "test",
      owner: null,
      name: "Mi App",
      files: [
        { path: "index.html", content: "<html></html>", language: "html" },
        { path: "main.swift", content: "import SwiftUI", language: "swift" },
        { path: "utils.swift", content: "// helpers", language: "swift" },
      ],
      meta: {
        notes: "Prueba",
        plugins: ["supabase", "auth"],
        connections: ["api-notas"],
        requisitosNativos: requisitosNativos(),
      },
      shared: false,
    };

    const plan = planBama(app);
    expect(plan).toContain("Plan de app nativa macOS (BAMA) para Mi App");
    expect(plan).toContain("Xcode 6.2 o superior");
    expect(plan).toContain("macOS 26 o superior");
    expect(plan).toContain("Swift 6.2");
    expect(plan).toContain("SwiftUI: Sí");
    expect(plan).toContain("SwiftData: Sí");
    expect(plan).toContain("3 archivos totales");
    expect(plan).toContain("2 archivos Swift");
    expect(plan).toContain("Prueba");
    expect(plan).toContain("supabase, auth");
    expect(plan).toContain("api-notas");
    expect(plan).toContain("Destino: nativa-macos");
    expect(plan).toContain("Plan generado por StarSeed OS");
  });

  it("planBama maneja app sin plugins ni conexiones", () => {
    const app: GeneratedApp = {
      id: "test",
      owner: null,
      name: "App Simple",
      files: [{ path: "index.html", content: "<html></html>", language: "html" }],
      meta: {
        notes: "",
        plugins: [],
        connections: [],
        requisitosNativos: requisitosNativos(),
      },
      shared: false,
    };

    const plan = planBama(app);
    expect(plan).toContain("Ninguna nota adicional");
    expect(plan).toContain("Ninguno");
    expect(plan).not.toContain("undefined");
  });

  it("planBama usa notes y muestra 'Ninguna nota adicional' si está vacío", () => {
    const app: GeneratedApp = {
      id: "test",
      owner: null,
      name: "App Sin Notas",
      files: [{ path: "index.html", content: "<html></html>", language: "html" }],
      meta: {
        spec: "Una app de notas con identidad Trinity",
        notes: "",
        plugins: [],
        connections: [],
        requisitosNativos: requisitosNativos(),
      },
      shared: false,
    };

    const plan = planBama(app);
    expect(plan).toContain("Ninguna nota adicional");
    expect(plan).not.toContain("Una app de notas con identidad Trinity");
  });

  it("planBama incluye notes cuando están presentes", () => {
    const app: GeneratedApp = {
      id: "test",
      owner: null,
      name: "App Con Notas",
      files: [{ path: "index.html", content: "<html></html>", language: "html" }],
      meta: {
        spec: "Spec",
        notes: "Mis notas personales",
        plugins: [],
        connections: [],
        requisitosNativos: requisitosNativos(),
      },
      shared: false,
    };

    const plan = planBama(app);
    expect(plan).toContain("Mis notas personales");
  });

  it("newApp crea app con destino nativa-macos", () => {
    const app = newApp("App Nativa", null, "nativa-macos");
    expect(app.destino).toBe("nativa-macos");
    expect(app.meta.requisitosNativos).toEqual(requisitosNativos());
    expect(app.files).toHaveLength(1);
    expect(app.files[0].path).toBe("index.html");
  });

  it("newApp crea app sin destino", () => {
    const app = newApp("App Web", null);
    expect(app.destino).toBeUndefined();
    expect(app.meta.requisitosNativos).toBeUndefined();
  });

  it("newApp con owner y destino nativa-macos", () => {
    const app = newApp("Mi App", "user-123", "nativa-macos");
    expect(app.owner).toBe("user-123");
    expect(app.destino).toBe("nativa-macos");
    expect(app.meta.requisitosNativos).toBeDefined();
  });

  describe("planBama contenido del plan BAMA", () => {
    const baseApp: GeneratedApp = {
      id: "test",
      owner: null,
      name: "Test App",
      files: [
        { path: "index.html", content: "<html></html>", language: "html" },
        { path: "settings.html", content: "<html></html>", language: "html" },
        { path: "main.swift", content: "import SwiftUI", language: "swift" },
        { path: "model.swift", content: "struct Model {}", language: "swift" },
      ],
      meta: {
        spec: "Especificación de prueba",
        notes: "Notas de prueba",
        plugins: ["plugin1"],
        connections: ["conn1"],
        requisitosNativos: requisitosNativos(),
      },
      shared: false,
    };

    it("incluye sección de requisitos con versiones correctas", () => {
      const plan = planBama(baseApp);
      expect(plan).toContain("1. Requisitos:");
      expect(plan).toContain("Xcode 6.2 o superior");
      expect(plan).toContain("macOS 26 o superior");
      expect(plan).toContain("Swift 6.2");
      expect(plan).toContain("SwiftUI: Sí");
      expect(plan).toContain("SwiftData: Sí");
    });

    it("incluye sección de estructura con conteos correctos", () => {
      const plan = planBama(baseApp);
      expect(plan).toContain("2. Estructura del proyecto:");
      expect(plan).toContain("4 archivos totales");
      expect(plan).toContain("2 archivos Swift");
    });

    it("incluye sección de notas", () => {
      const plan = planBama(baseApp);
      expect(plan).toContain("3. Notas:");
      expect(plan).toContain("Notas de prueba");
    });

    it("incluye sección de plugins", () => {
      const plan = planBama(baseApp);
      expect(plan).toContain("4. Plugins:");
      expect(plan).toContain("plugin1");
    });

    it("incluye sección de conexiones", () => {
      const plan = planBama(baseApp);
      expect(plan).toContain("5. Conexiones:");
      expect(plan).toContain("conn1");
    });

    it("incluye destino y marca de generación", () => {
      const plan = planBama(baseApp);
      expect(plan).toContain("6. Destino: nativa-macos");
      expect(plan).toContain("Plan generado por StarSeed OS");
      expect(plan).toContain("Guárdalo como proyecto en la Librería");
    });
  });

  describe("buildPreview con archivos Swift", () => {
    it("ignora archivos Swift y usa solo HTML/CSS/JS para preview", () => {
      const files = [
        { path: "index.html", content: "<html><body>Hola</body></html>", language: "html" },
        { path: "main.swift", content: "import SwiftUI", language: "swift" },
      ];
      const preview = buildPreview(files);
      expect(preview).toContain("Hola");
      expect(preview).not.toContain("import SwiftUI");
    });

    it("genera preview mínimo sin archivos HTML", () => {
      const files = [
        { path: "main.swift", content: "import SwiftUI", language: "swift" },
      ];
      const preview = buildPreview(files);
      expect(preview).toContain("<!doctype html>");
      expect(preview).not.toContain("import SwiftUI");
    });
  });
});
