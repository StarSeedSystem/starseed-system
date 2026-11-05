// Pruebas de la fuente única de permisos por sistema (contrato §6).
// Verifican que TODO identificador de las capabilities de Tauri aparece en el
// JSON (macos/windows/linux + android/ios), que los solo-escritorio no se
// cuelan en móvil, y que los textos declarados van verbatim de sus archivos.

import { describe, it, expect } from "vitest";

import { permisosDe, tieneIdentificador, SO_PERMISOS } from "../permisos-por-so";
import type { SoPermisos } from "../permisos-por-so";

// Identificadores de native/src-tauri/capabilities/default.json (multiplataforma).
const MULTI = (
  "core:default core:app:default core:window:default core:webview:default core:event:default " +
  "core:path:default core:resources:default core:menu:default core:tray:default " +
  "core:window:allow-set-title core:window:allow-minimize core:window:allow-maximize " +
  "core:window:allow-unmaximize core:window:allow-close core:window:allow-start-dragging " +
  "shell:allow-execute shell:allow-spawn shell:allow-kill shell:allow-stdin-write shell:allow-open " +
  "fs:default fs:scope fs:allow-read-text-file fs:allow-write-text-file fs:allow-read-dir fs:allow-mkdir " +
  "os:allow-platform os:allow-version os:allow-os-type os:allow-family os:allow-arch " +
  "os:allow-hostname os:allow-locale os:allow-exe-extension " +
  "process:allow-exit process:allow-restart " +
  "notification:default notification:allow-notify notification:allow-request-permission " +
  "notification:allow-is-permission-granted " +
  "dialog:default dialog:allow-open dialog:allow-save dialog:allow-message dialog:allow-ask " +
  "dialog:allow-confirm deep-link:default"
).split(" ");

// De native/src-tauri/capabilities/desktop.json: solo escritorio.
const ESCRITORIO = (
  "autostart:default autostart:allow-enable autostart:allow-disable autostart:allow-is-enabled " +
  "updater:default updater:allow-check updater:allow-download-and-install"
).split(" ");

const idsDe = (so: SoPermisos): Set<string> => {
  const p = permisosDe(so);
  return new Set(p ? p.permisos.flatMap((g) => g.ids) : []);
};

describe("permisos-por-so", () => {
  it("conoce los seis sistemas y responde undefined para un SO raro", () => {
    expect(SO_PERMISOS).toEqual(["macos", "windows", "linux", "android", "ios", "web"]);
    expect(permisosDe("windows-98")).toBeUndefined();
  });

  it("cada identificador de capabilities/default.json aparece en los cinco SO nativos", () => {
    for (const so of ["macos", "windows", "linux", "android", "ios"] as const) {
      const ids = idsDe(so);
      const faltan = MULTI.filter((id) => !ids.has(id));
      expect(`en ${so} faltan: ${faltan.join(", ")}`).toBe(`en ${so} faltan: `);
    }
  });

  it("los permisos de desktop.json van solo en escritorio, nunca en móvil", () => {
    for (const so of ["macos", "windows", "linux"] as const) {
      const ids = idsDe(so);
      expect(ESCRITORIO.filter((id) => !ids.has(id))).toEqual([]);
    }
    for (const so of ["android", "ios", "web"] as const) {
      const ids = idsDe(so);
      expect(ESCRITORIO.filter((id) => ids.has(id))).toEqual([]);
    }
  });

  it("web no declara permisos nativos y dice su límite en no-permite", () => {
    const web = permisosDe("web");
    expect(web).toBeDefined();
    expect(idsDe("web").size).toBe(0);
    expect(web?.noPermite.join(" ")).toContain("navegador no puede");
  });

  it("macOS lleva la frase de red local de Info.plist verbatim", () => {
    const macos = permisosDe("macos");
    expect(macos?.permisosOS.length).toBe(1);
    const declara = macos?.permisosOS[0];
    expect(declara?.identificador).toBe("NSLocalNetworkUsageDescription");
    expect(declara?.texto).toBe(
      "StarSeed anuncia y escucha a tus otras neuronas en esta red, también sin internet, para enlazarlas entre sí.",
    );
  });

  it("todo permiso declarado tiene texto, un cómo se concede y no-permite", () => {
    const cuandoValidos = new Set(["al instalar", "al primer uso", "en ajustes"]);
    for (const so of SO_PERMISOS) {
      const p = permisosDe(so);
      expect(p, so).toBeDefined();
      if (!p) continue;
      expect(p.desde.length, `${so} · desde`).toBeGreaterThan(0);
      expect(p.arquitecturas.length, `${so} · arquitecturas`).toBeGreaterThan(0);
      expect(p.noPermite.length, `${so} · noPermite`).toBeGreaterThan(0);
      for (const g of p.permisos) {
        expect(g.ids.length, `${so} · ids de ${g.ids[0]}`).toBeGreaterThan(0);
        expect(g.texto.trim().length, `${so} · texto de ${g.ids[0]}`).toBeGreaterThan(0);
        expect(cuandoValidos.has(g.cuando), `${so} · ${g.cuando}`).toBe(true);
        expect(g.plataformas.length, `${so} · plataformas`).toBeGreaterThan(0);
      }
    }
  });

  it("notificaciones se conceden al primer uso y el updater se instala desde su canal", () => {
    for (const so of ["macos", "android"] as const) {
      const grupos = permisosDe(so)?.permisos ?? [];
      const notifica = grupos.find((g) => g.ids.includes("notification:default"));
      expect(notifica?.cuando, so).toBe("al primer uso");
    }
    const escritorio = permisosDe("windows")?.permisos ?? [];
    const updater = escritorio.find((g) => g.ids.includes("updater:default"));
    expect(updater?.cuando).toBe("al instalar");
  });

  it("android declara solo lo versionado y nombra el manifiesto que no está", () => {
    const android = permisosDe("android");
    expect(android?.noPermite.join(" ")).toContain("AndroidManifest");
    expect(tieneIdentificador("android", "core:app:default")).toBe(true);
    expect(tieneIdentificador("android", "autostart:default")).toBe(false);
  });
});
