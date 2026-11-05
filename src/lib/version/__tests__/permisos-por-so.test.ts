import { describe, it, expect } from "vitest";
import {
  COMPANERO,
  CONCESIONES,
  PERMISOS_POR_SO,
  SO_VERSION,
  capacidadesNoEnJson,
  identificadoresDe,
  permisosDe,
  type SoVersion,
} from "../permisos-por-so";

describe("permisos por sistema (config/permisos-por-so.json)", () => {
  it("cubre TODOS los identificadores de las capabilities de Tauri", () => {
    expect(capacidadesNoEnJson()).toEqual([]);
  });

  it("los seis sistemas tienen ficha y solo incluyen grupos que existen", () => {
    for (const so of SO_VERSION) {
      const sistema = permisosDe(so);
      expect(PERMISOS_POR_SO[so]).toBe(sistema);
      expect(sistema.arquitecturas.length).toBeGreaterThan(0);
      expect(sistema.instaladores.length).toBeGreaterThan(0);
      for (const grupo of sistema.incluye) {
        expect(COMPANERO[grupo], `${so} incluye ${grupo}`).toBeDefined();
      }
      for (const propio of sistema.propios) {
        expect(CONCESIONES, `${so} · ${propio.id}`).toContain(
          propio.comoSeConcede,
        );
        expect(propio.texto.length).toBeGreaterThan(8);
      }
      expect(sistema.noPermite.length).toBeGreaterThan(0);
    }
  });

  it("el escritorio trae autoarranque y actualización; móvil y web no", () => {
    for (const so of ["macos", "windows", "linux"] as const) {
      const ids = identificadoresDe(so);
      expect(ids).toContain("autostart:allow-enable");
      expect(ids).toContain("updater:allow-download-and-install");
    }
    for (const so of ["android", "ios", "web"] as const satisfies readonly SoVersion[]) {
      const ids = identificadoresDe(so);
      expect(ids).not.toContain("autostart:allow-enable");
      expect(ids).not.toContain("updater:allow-check");
    }
  });

  it("macOS declara el texto real de «Red local» del Info.plist", () => {
    const propio = permisosDe("macos").propios.find((p) => p.id === "red-local");
    expect(propio).toBeDefined();
    expect(propio?.texto).toContain("neuronas en esta red");
  });

  it("Android declara los permisos que parchea android_parche.rs y cómo los pide", () => {
    const ids = permisosDe("android").propios.map((p) => p.id);
    const esperados = [
      "android.permission.INTERNET",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
      "android.permission.CHANGE_WIFI_MULTICAST_STATE",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.ACCESS_WIFI_STATE",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
    ];
    for (const esperado of esperados) {
      expect(ids, esperado).toContain(esperado);
    }
    const concedes = Object.fromEntries(
      permisosDe("android").propios.map((p) => [p.id, p.comoSeConcede]),
    );
    expect(concedes["android.permission.POST_NOTIFICATIONS"]).toBe(
      "al-primer-uso",
    );
    expect(concedes["android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"]).toBe(
      "manual",
    );
  });

  it("iOS dice la verdad: hoy no hay app nativa, se usa la PWA", () => {
    const ios = permisosDe("ios");
    expect(ios.estado).toContain("no-disponible");
    expect(ios.propios).toEqual([]);
    expect(ios.noPermite.join(" ")).toContain("PWA");
  });

  it("macOS universal y Android apuntan a las 4 arquitecturas del CI", () => {
    expect(permisosDe("macos").arquitecturas).toEqual(["aarch64", "x86_64"]);
    expect(permisosDe("android").arquitecturas).toEqual([
      "aarch64",
      "armv7",
      "i686",
      "x86_64",
    ]);
  });
});
