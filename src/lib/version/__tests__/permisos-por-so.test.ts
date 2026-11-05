import { describe, it, expect } from "vitest";
import capacidades from "../../../../native/src-tauri/capabilities/default.json";
import escritorio from "../../../../native/src-tauri/capabilities/desktop.json";
import datos from "../../../../config/permisos-por-so.json";
import { permisosDe, type SistemaOperativo } from "../permisos-por-so";

const SISTEMAS: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
const CONCEDEN = ["al-instalar", "al-primer-uso", "en-ajustes"];

type Capability = { permissions?: Array<string | { identifier?: string }> };

function identificadores(crudo: Capability): string[] {
  return (crudo.permissions ?? [])
    .map((p) => (typeof p === "string" ? p : (p.identifier ?? "")))
    .filter(Boolean);
}

describe("permisos por sistema", () => {
  it("declara todos los identificadores de las capabilities de Tauri", () => {
    const declarados = new Set(datos.permisos.flatMap((p) => p.ids));
    const requeridos = [...identificadores(capacidades), ...identificadores(escritorio)];
    expect(requeridos.length).toBeGreaterThan(0);
    expect(requeridos.filter((id) => !declarados.has(id))).toEqual([]);
  });

  it("resuelve cada sistema con su versión, arquitecturas y límites", () => {
    for (const so of SISTEMAS) {
      const info = permisosDe(so);
      expect(info.nombre.length).toBeGreaterThan(0);
      expect(info.versionMinima.length).toBeGreaterThan(0);
      expect(info.arquitecturas.length).toBeGreaterThan(0);
      expect(info.noPermite.length).toBeGreaterThan(0);
    }
  });

  it("da a cada sistema solo los permisos que le tocan y con cómo se conceden", () => {
    for (const so of SISTEMAS) {
      const info = permisosDe(so);
      expect(info.permisos.length).toBeGreaterThan(0);
      for (const permiso of info.permisos) {
        expect(permiso.sistemas).toContain(so);
        expect(CONCEDEN).toContain(permiso.concede);
        expect(permiso.texto.length).toBeGreaterThan(0);
      }
    }
  });

  it("no asigna permisos de escritorio a Android, iOS ni web", () => {
    for (const so of ["android", "ios", "web"] as const) {
      const ids = permisosDe(so).permisos.flatMap((p) => p.ids);
      expect(ids).not.toContain("updater:allow-download-and-install");
      expect(ids).not.toContain("autostart:allow-enable");
    }
  });

  it("declara lo propio de macOS, Android, Linux y la PWA", () => {
    expect(permisosDe("macos").permisos.flatMap((p) => p.ids)).toContain("NSLocalNetworkUsageDescription");
    expect(permisosDe("android").permisos.flatMap((p) => p.ids)).toContain("android.permission.POST_NOTIFICATIONS");
    expect(permisosDe("linux").permisos.flatMap((p) => p.ids)).toContain("linux:grupo-dialout");
    expect(permisosDe("web").permisos.flatMap((p) => p.ids)).toContain("browser:notificaciones");
  });
});
