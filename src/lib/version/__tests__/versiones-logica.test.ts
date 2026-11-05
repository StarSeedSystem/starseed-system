import { describe, it, expect } from "vitest";
import {
  extraerVersionMasReciente,
  hayActualizacionDisponible,
  obtenerSistemasConArchivos,
  obtenerRequisitosYPermisos,
  formatearFechaISO,
  bytesAFormato,
  ETIQUETAS_SISTEMA,
  type ApiVersionesResponse,
  type VersionTransformada,
} from "@/lib/version/versiones-logica";

const MOCK_API_RESPONSE: ApiVersionesResponse = {
  versiones: [
    {
      version: "v2026.11.05",
      fecha: "2026-11-05",
      notas: "Actualización de seguridad y nuevas features",
      url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v2026.11.05",
      archivos: {
        os: {
          macos: [
            { nombre: "StarSeed.OS_2026.11.05_universal.dmg", bytes: 7_025_536, href: "https://example.com/macos.dmg" },
          ],
          windows: [
            { nombre: "StarSeed.OS_2026.11.05_x64-setup.exe", bytes: 2_516_582, href: "https://example.com/windows.exe" },
            { nombre: "StarSeed.OS_2026.11.05_x64_en-US.msi", bytes: 3_460_352, href: "https://example.com/windows.msi" },
          ],
          linux: [
            { nombre: "StarSeed.OS_2026.11.05_amd64.AppImage", bytes: 81_800_000, href: "https://example.com/linux.AppImage" },
          ],
          android: [
            { nombre: "StarSeed-os-2026.11.05.apk", bytes: 28_665_472, href: "https://example.com/android.apk" },
          ],
          ios: [],
        },
      },
    },
    {
      version: "v2026.10.09",
      fecha: "2026-10-09",
      notas: "Versión anterior",
      url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v2026.10.09",
      archivos: { os: { macos: [], windows: [], linux: [], android: [], ios: [] } },
    },
  ],
  generadoEn: "2026-11-05T12:00:00Z",
};

describe("versiones-logica - funciones puras", () => {
  describe("extraerVersionMasReciente", () => {
    it("extrae la versión más reciente del response de la API", () => {
      const resultado = extraerVersionMasReciente(MOCK_API_RESPONSE);
      expect(resultado).not.toBeNull();
      expect(resultado?.version).toBe("v2026.11.05");
      expect(resultado?.fecha).toBe("2026-11-05");
      expect(resultado?.notas).toBe("Actualización de seguridad y nuevas features");
    });

    it("devuelve null si no hay versiones", () => {
      const vacio: ApiVersionesResponse = { versiones: [], generadoEn: "2026-11-05T12:00:00Z" };
      expect(extraerVersionMasReciente(vacio)).toBeNull();
    });

    it("devuelve null si response es undefined", () => {
      expect(extraerVersionMasReciente(undefined as unknown as ApiVersionesResponse)).toBeNull();
    });
  });

  describe("hayActualizacionDisponible", () => {
    it("devuelve true si la versión disponible es mayor", () => {
      expect(hayActualizacionDisponible("2026.10.09", "2026.11.05")).toBe(true);
    });

    it("devuelve false si la versión instalada es igual o mayor", () => {
      expect(hayActualizacionDisponible("2026.11.05", "2026.11.05")).toBe(false);
      expect(hayActualizacionDisponible("2026.11.10", "2026.11.05")).toBe(false);
    });

    it("funciona con prefijo v", () => {
      expect(hayActualizacionDisponible("v2026.10.09", "v2026.11.05")).toBe(true);
      expect(hayActualizacionDisponible("2026.10.09", "v2026.11.05")).toBe(true);
    });
  });

  describe("obtenerSistemasConArchivos", () => {
    it("devuelve solo sistemas que tienen archivos", () => {
      const archivos = MOCK_API_RESPONSE.versiones[0].archivos.os;
      const resultado = obtenerSistemasConArchivos(archivos);

      expect(resultado.length).toBe(4); // macos, windows, linux, android (no ios)
      expect(resultado.map((s) => s.sistema)).toEqual(["macos", "windows", "linux", "android"]);
    });

    it("cada sistema tiene su array de archivos", () => {
      const archivos = MOCK_API_RESPONSE.versiones[0].archivos.os;
      const resultado = obtenerSistemasConArchivos(archivos);

      const windows = resultado.find((s) => s.sistema === "windows");
      expect(windows?.archivos.length).toBe(2);
    });
  });

  describe("obtenerRequisitosYPermisos", () => {
    it("devuelve config para cada sistema solicitado", () => {
      const resultado = obtenerRequisitosYPermisos(["macos", "windows", "linux"]);

      expect(resultado.length).toBe(3);
      expect(resultado[0].sistema).toBe("macos");
      expect(resultado[0].config.versionMinima).toBe("10.15");
      expect(resultado[0].config.arquitecturas).toContain("x86_64");
      expect(resultado[0].config.arquitecturas).toContain("arm64");
      expect(resultado[0].config.permisos.length).toBeGreaterThan(0);
    });

    it("lanza error para sistema desconocido", () => {
      expect(() => obtenerRequisitosYPermisos(["desconocido" as any])).toThrow("Sistema operativo desconocido");
    });
  });

  describe("formatearFechaISO", () => {
    it("formatea fecha ISO correctamente", () => {
      expect(formatearFechaISO("2026-11-05")).toBe("5 de nov de 2026");
      expect(formatearFechaISO("2026-01-15")).toBe("15 de ene de 2026");
    });

    it("devuelve la entrada original si es inválida", () => {
      expect(formatearFechaISO("invalido")).toBe("invalido");
      expect(formatearFechaISO("")).toBe("—");
    });
  });

  describe("bytesAFormato", () => {
    it("formatea bytes correctamente", () => {
      expect(bytesAFormato(500)).toBe("500 B");
      expect(bytesAFormato(1_500)).toBe("1.5 KB");
      expect(bytesAFormato(2_516_582)).toBe("2.5 MB");
      expect(bytesAFormato(81_800_000)).toBe("81.8 MB");
      expect(bytesAFormato(1_500_000_000)).toBe("1.5 GB");
    });
  });

  describe("ETIQUETAS_SISTEMA", () => {
    it("tiene etiquetas para todos los sistemas", () => {
      expect(ETIQUETAS_SISTEMA.macos).toBe("macOS");
      expect(ETIQUETAS_SISTEMA.windows).toBe("Windows");
      expect(ETIQUETAS_SISTEMA.linux).toBe("Linux");
      expect(ETIQUETAS_SISTEMA.android).toBe("Android");
      expect(ETIQUETAS_SISTEMA.ios).toBe("iOS");
      expect(ETIQUETAS_SISTEMA.web).toBe("Web (PWA)");
    });
  });
});