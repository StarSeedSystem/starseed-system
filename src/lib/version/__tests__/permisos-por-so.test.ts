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

  it("cada permiso tiene texto en español con acentos", () => {
    const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const so of sistemas) {
      const config = permisosDe(so) as ConfigSO;
      for (const permiso of config.permisos) {
        const tieneAcentos = /[áéíóúñÁÉÍÓÚÑ]/.test(permiso.texto);
        expect(tieneAcentos).toBe(true);
      }
    }
  });

  it("no hay permisos con nombre vacío", () => {
    const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const so of sistemas) {
      const config = permisosDe(so) as ConfigSO;
      for (const permiso of config.permisos) {
        expect(permiso.nombre.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("alConceder tiene valores esperados (al instalar, al primer uso, nativo, etc.)", () => {
    const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    const valoresEsperados = [
      "al instalar",
      "al primer uso",
      "al solicitar permiso",
      "por selección del usuario",
      "por respuesta del usuario",
      "al invocar",
      "nativo de macOS",
      "nativo de Windows",
      "nativo de Linux",
    ];
    for (const so of sistemas) {
      const config = permisosDe(so) as ConfigSO;
      for (const permiso of config.permisos) {
        const valorEsperado = valoresEsperados.find((v) => permiso.alConceder.includes(v));
        expect(valorEsperado).toBeDefined();
      }
    }
  });

  it("noPermiteSistema existe en sistemas de escritorio (macos, windows, linux)", () => {
    const sistemasDeEscritorio: SistemaOperativo[] = ["macos", "windows", "linux"];
    for (const so of sistemasDeEscritorio) {
      const config = permisosDe(so) as ConfigSO;
      expect(config.noPermiteSistema).toBeDefined();
      expect(Array.isArray(config.noPermiteSistema)).toBe(true);
      expect(config.noPermiteSistema!.length).toBeGreaterThan(0);
    }
  });

  it("noPermiteSistema no existe en sistemas móviles (android, ios, web)", () => {
    const sistemasMoviles: SistemaOperativo[] = ["android", "ios", "web"];
    for (const so of sistemasMoviles) {
      const config = permisosDe(so) as ConfigSO;
      expect(config.noPermiteSistema).toBeUndefined();
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
    expect(valoresVistos.size).toBeGreaterThan(1);
  });

  it("arquitecturas incluyen las compatibles para cada SO", () => {
    const configMacos = permisosDe("macos") as ConfigSO;
    const configWindows = permisosDe("windows") as ConfigSO;
    const configLinux = permisosDe("linux") as ConfigSO;
    const configAndroid = permisosDe("android") as ConfigSO;
    const configIos = permisosDe("ios") as ConfigSO;
    const configWeb = permisosDe("web") as ConfigSO;

    expect(configMacos.arquitecturas).toContain("x86_64");
    expect(configMacos.arquitecturas).toContain("arm64");
    expect(configWindows.arquitecturas).toContain("x86_64");
    expect(configLinux.arquitecturas).toContain("x86_64");
    expect(configLinux.arquitecturas).toContain("arm64");
    expect(configAndroid.arquitecturas).toContain("arm64-v8a");
    expect(configAndroid.arquitecturas).toContain("x86_64");
    expect(configAndroid.arquitecturas).toContain("armeabi-v7a");
    expect(configIos.arquitecturas).toContain("arm64");
    expect(configWeb.arquitecturas).toContain("cualquiera con navegador moderno");
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
  it("exporta el tipo SistemaOperativo", () => {
    const valores: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios", "web"];
    for (const so of valores) {
      const resultado = tipo(so);
      expect(resultado).toBeDefined();
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