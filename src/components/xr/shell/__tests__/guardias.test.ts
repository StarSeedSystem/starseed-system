import { describe, it, expect } from "vitest";
import { FUNCIONES_XR } from "@/lib/xr/tipos";
import { opcionesAlmacenXR } from "@/components/xr/shell/almacen-xr";
import { readFileSync } from "node:fs";
import path from "node:path";

function leerArchivo(ruta: string): string {
  return readFileSync(ruta, "utf8");
}

describe("Guardia XR1010AL — reglas mínimas del contrato", () => {
  describe("(1) emulate: solo false o con ?emulador=1", () => {
    const datosBase = {
      perfil: { nivel: "alta" as const, foveacion: 0.3, frameRate: 90, escala: 1.15, refresh: 120 },
      capacidades: {
        plataforma: "quest" as const, visor: true, modos: ["vr-inmersivo"] as const,
        recomendado: "vr-inmersivo" as const, entradas: ["mandos"] as const,
        funciones: FUNCIONES_XR, ofrecerSesion: true, motivos: [], avisos: []
      },
    };

    it("el valor default de emulate es false en producción", () => {
      const almacen = opcionesAlmacenXR({ ...datosBase, produccion: true, busqueda: "" });
      expect(almacen.opciones.emulate).toBe(false);
    });

    it("emulate es objeto con ?emulador=1 en desarrollo", () => {
      const almacen = opcionesAlmacenXR({ ...datosBase, produccion: false, busqueda: "?emulador=1" });
      expect(almacen.opciones.emulate).toEqual({ type: "metaQuest3", inject: true });
    });

    it("emulate es false con ?emulador=1 en producción", () => {
      const almacen = opcionesAlmacenXR({ ...datosBase, produccion: true, busqueda: "?emulador=1" });
      expect(almacen.opciones.emulate).toBe(false);
    });
  });

  describe("(2) camera-access no aparece en src/lib/xr ni src/components/xr/shell", () => {
    it("almacen-xr.ts no tiene camera-access en funciones", () => {
      const contenido = leerArchivo("/home/runner/work/_temp/starseed-wt/XR1010AL/src/components/xr/shell/almacen-xr.ts");
      const sinComentarios = contenido
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(sinComentarios).not.toContain("camera-access");
    });

    it("capacidades.ts no tiene camera-access en funciones esperadas", () => {
      const contenido = leerArchivo("/home/runner/work/_temp/starseed-wt/XR1010AL/src/lib/xr/capacidades.ts");
      const sinComentarios = contenido
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(sinComentarios).not.toContain("camera-access");
    });
  });

  describe("(3) node:* no aparece en src/lib/xr ni src/components/xr/shell", () => {
    const archivos = [
      "/home/runner/work/_temp/starseed-wt/XR1010AL/src/lib/xr/capacidades.ts",
      "/home/runner/work/_temp/starseed-wt/XR1010AL/src/lib/xr/tipos.ts",
      "/home/runner/work/_temp/starseed-wt/XR1010AL/src/components/xr/shell/almacen-xr.ts",
      "/home/runner/work/_temp/starseed-wt/XR1010AL/src/components/xr/shell/entrada-global.tsx",
    ];

    it.each(archivos)("%s: NO importa node:*", (archivo) => {
      const contenido = leerArchivo(archivo);
      const sinComentarios = contenido
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(sinComentarios).not.toMatch(/from\s+["']node:\w/);
      expect(sinComentarios).not.toMatch(/import\s+.*\bnode:/);
    });
  });

  describe("(4) grafo de imports app-globals no alcanza three/pmndrs/etc", () => {
    const contenido = String(readFileSync("/home/runner/work/_temp/starseed-wt/XR1010AL/src/app/(app)/app-globals.tsx", "utf8"));
    const imports = contenido.match(/from\s+["']([^"']+)["']/g) || [];

    const paquetesProhibidos = ["three", "@react-three", "@pmndrs", "@dimforge", "@pixiv", "@sparkjsdev", "node:"];
    const prohibidos = imports.filter((imp) =>
      paquetesProhibidos.some((p) => imp.includes(p))
    );

    it("no hay imports prohibidos", () => {
      expect(prohibidos).toEqual([]);
    });
  });
});