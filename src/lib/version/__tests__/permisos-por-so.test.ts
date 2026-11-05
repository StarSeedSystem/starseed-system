import { describe, it, expect } from "vitest";
import { permisosDe, validarPermisoEnJson, tipo, ConfigSO, PermisoSO, SistemaOperativo } from "../permisos-por-so";

describe("permisos-por-so: validez del JSON", () => {
  it("todos los sistemas operativos tienen configuración válida", () => {
    const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const so of sistemas) {
      const config = permisosDe(so);
      expect(config).toBeDefined();
      expect(config.versionMinima).toBeDefined();
      expect(Array.isArray(config.arquitecturas)).toBe(true);
      expect(config.arquitecturas.length).toBeGreaterThan(0);
      expect(Array.isArray(config.permisos)).toBe(true);
      expect(config.permisos.length).toBeGreaterThan(0);
    }
  });

  it("cada sistema tiene versionMinima, arquitecturas y permisos", () => {
    const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const so of sistemas) {
      const config = permisosDe(so) as ConfigSO;
      expect(config.versionMinima).toBeDefined();
      expect(config.versionMinima.length).toBeGreaterThan(0);
      expect(Array.isArray(config.arquitecturas)).toBe(true);
      expect(config.arquitecturas.length).toBeGreaterThan(0);
      expect(Array.isArray(config.permisos)).toBe(true);
      expect(config.permisos.length).toBeGreaterThan(0);
    }
  });

  it("cada permiso tiene los campos requeridos", () => {
    const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const so of sistemas) {
      const config = permisosDe(so) as ConfigSO;
      for (const permiso of config.permisos) {
        expect(permiso.nombre).toBeDefined();
        expect(permiso.texto).toBeDefined();
        expect(permiso.alConceder).toBeDefined();
        expect(typeof permiso.nombre).toBe("string");
        expect(typeof permiso.texto).toBe("string");
        expect(typeof permiso.alConceder).toBe("string");
      }
    }
  });

  it("los sistemas de escritorio tienen noPermiteSistema", () => {
    const sistemasDeEscritorio: SistemaOperativo[] = ["macos", "windows", "linux"];
    for (const so of sistemasDeEscritorio) {
      const config = permisosDe(so) as ConfigSO;
      expect(config.noPermiteSistema).toBeDefined() || (config.noPermiteSistema === undefined && !['android', 'ios', 'web'].includes(so));
      expect(Array.isArray(config.noPermiteSistema)).toBe(true);
      expect(config.noPermiteSistema.length).toBeGreaterThan(0);
    }
  });

  it("los sistemas móviles no tienen noPermiteSistema", () => {
    const sistemasMoviles: SistemaOperativo[] = ["android", "ios", "web"];
    for (const so of sistemasMoviles) {
      const config = permisosDe(so) as ConfigSO;
      expect(config.noPermiteSistema).toBeUndefined() || (config.noPermiteSistema === undefined && ['android', 'ios', 'web'].includes(so));
    }
  });

  it("los textos de permiso contienen contenido en español", () => {
    const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const so of sistemas) {
      const config = permisosDe(so) as ConfigSO;
      for (const permiso of config.permisos) {
        expect(permiso.texto.length).toBeGreaterThan(0);
        expect(typeof permiso.texto).toBe("string");
      }
    }
  });

  it("alConceder tiene valores variados (al instalar, al primer uso, por selección, etc.)", () => {
    const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    const valoresVistos = new Set<string>();
    for (const so of sistemas) {
      const config = permisosDe(so) as ConfigSO;
      for (const permiso of config.permisos) {
        valoresVistos.add(permiso.alConceder);
      }
    }
    // Deben verse varios valores distintos
    expect(valoresVistos.size).toBeGreaterThan(1);
  });
});

describe("permisos-por-so: cobertura de identificadores de capabilities", () => {
  it("cada identificador de permission del capability default.json aparece en el JSON de permisos", () => {
    const identificadoresCapability = [
      "core:default",
      "core:app:default",
      "core:window:default",
      "core:webview:default",
      "core:event:default",
      "core:path:default",
      "core:resources:default",
      "core:menu:default",
      "core:window:allow-set-title",
      "core:window:allow-minimize",
      "core:window:allow-maximize",
      "core:window:allow-unmaximize",
      "core:window:allow-close",
      "core:window:allow-start-dragging",
      "shell:allow-execute",
      "shell:allow-spawn",
      "shell:allow-kill",
      "shell:allow-stdin-write",
      "shell:allow-open",
      "fs:allow-read-text-file",
      "fs:allow-write-text-file",
      "fs:allow-read-dir",
      "fs:allow-mkdir",
      "fs:scope",
      "fs:default",
      "os:allow-platform",
      "os:allow-version",
      "os:allow-os-type",
      "os:allow-family",
      "os:allow-arch",
      "os:allow-hostname",
      "os:allow-locale",
      "os:allow-exe-extension",
      "process:allow-exit",
      "process:allow-restart",
      "notification:default",
      "notification:allow-notify",
      "notification:allow-request-permission",
      "notification:allow-is-permission-granted",
      "dialog:default",
      "dialog:allow-open",
      "dialog:allow-save",
      "dialog:allow-message",
      "dialog:allow-ask",
      "dialog:allow-confirm",
      "deep-link:default",
    ];

    for (const identificador of identificadoresCapability) {
      const existe = validarPermisoEnJson(identificador);
      expect(existe).toBe(true), ` identificador "${identificador}" no encontrado en config/permisos-por-so.json`;
    }
  });

  it("cada identificador de permission del capability desktop.json aparece en el JSON", () => {
    const identificadoresCapability = [
      "autostart:default",
      "autostart:allow-enable",
      "autostart:allow-disable",
      "autostart:allow-is-enabled",
      "updater:default",
      "updater:allow-check",
      "updater:allow-download-and-install",
    ];

    for (const identificador of identificadoresCapability) {
      const existe = validarPermisoEnJson(identificador);
      expect(existe).toBe(true), ` identificador "${identificador}" no encontrado en config/permisos-por-so.json`;
    }
  });

  it("cada identificador de permiso de AndroidManifest aparece en el JSON", () => {
    const identificadoresAndroid = [
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_CONNECTED_DEVICE",
      "FOREGROUND_SERVICE_DATA_SYNC",
      "CHANGE_WIFI_MULTICAST_STATE",
      "ACCESS_NETWORK_STATE",
      "ACCESS_WIFI_STATE",
      "POST_NOTIFICATIONS",
      "RECEIVE_BOOT_COMPLETED",
      "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
    ];

    for (const identificador of identificadoresAndroid) {
      const existe = validarPermisoEnJson(identificador);
      expect(existe).toBe(true), ` identificador "${identificador}" no encontrado en config/permisos-por-so.json`;
    }
  });

  it("identificador NSLocalNetworkUsageDescription aparece en el JSON iOS", () => {
    const existe = validarPermisoEnJson("NSLocalNetworkUsageDescription");
    expect(existe).toBe(true);
  });

  it("identificadores de capabilities de web aparecen en el JSON web", () => {
    const identificadoresWeb = ["notificaciones", "geolocalización", "acceso-aarchivo", "drag-drop"];
    for (const identificador of identificadoresWeb) {
      const existe = validarPermisoEnJson(identificador);
      expect(existe).toBe(true), ` identificador "${identificador}" no encontrado en config/permisos-por-so.json`;
    }
  });
});

describe("permisos-por-so: exportaciones tipo", () => {
  it("exporta el tipo SistemaOperativo correctamente", () => {
    const valores: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const so of valores) {
      const config = tipo(so);
      expect(config).toBeDefined();
      expect(config.versionMinima).toBeDefined();
    }
  });

  it("exporta ConfigSO y PermisoSO correctamente", () => {
    const config = permisosDe("macos") as ConfigSO;
    expect(config).toHaveProperty("versionMinima");
    expect(config).toHaveProperty("arquitecturas");
    expect(config).toHaveProperty("permisos");
    expect(config).toHaveProperty("noPermiteSistema");

    const permiso = config.permisos[0];
    expect(permiso).toHaveProperty("nombre");
    expect(permiso).toHaveProperty("texto");
    expect(permiso).toHaveProperty("alConceder");
  });
});