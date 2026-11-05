import { describe, it, expect } from "vitest";
import {
  comprobarActualizacionAndroid,
  obtenerVersionNuevaAndroid,
  ResultadoActualizador,
  VersionAndroid,
} from "../actualizador-android";

const mockVersionNueva = {
  version: "1.2.3",
  sha256: "a".repeat(64),
  url_apk: "https://example.com/app-1.2.3.apk",
} as const;

// Window configurado para el entorno de test (Node con simulación Tauri)
(globalThis as any).window = {
  __TAURI__: {
    shell: {
      open: (_url: string, _options: object) => {
        return true;
      },
    },
  },
};

describe("actualizador-android", () => {
  it("ya_dia si la versión instalada es la misma que la nueva", () => {
    const resultado = comprobarActualizacionAndroid(mockVersionNueva, "1.2.3");
    expect(resultado).toEqual({
      ya_dia: true,
      version_nueva: "1.2.3",
      sha256: "a".repeat(64),
    });
  });

  it("bloqueado si la versión nueva no tiene URL de APK", () => {
    const sinApk = { ...mockVersionNueva, url_apk: undefined as unknown as string };
    const resultado = comprobarActualizacionAndroid(sinApk);
    expect(resultado).toEqual(
      expect.objectContaining({ bloqueado: true, motivo: "La versión nueva no tiene URL de .apk disponible." })
    );
  });

  it("abierto cuando hay versión nueva y abridor disponible", () => {
    const resultado = comprobarActualizacionAndroid(mockVersionNueva, "0.0.1");
    expect(resultado).toEqual(
      expect.objectContaining({
        abierto: true,
        version_nueva: "1.2.3",
        sha256: "a".repeat(64),
      })
    );
  });

  it("obtenerVersionNuevaAndroid retorna null fuera del navegador", async () => {
    const res = await obtenerVersionNuevaAndroid();
    expect(res).toBeNull();
  });

  it("formato de VersionAndroid es correcto", () => {
    const v = {
      version: "2.0.0",
      sha256: "b".repeat(64),
      url_apk: "https://example.com/app-2.0.0.apk",
    } as VersionAndroid;
    expect(v).toMatchObject({
      version: "2.0.0",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      url_apk: expect.stringMatching(/^https:\/\//),
    });
  });
});