import { describe, it, expect } from "vitest";
import {
  MATRIZ_PERMISOS,
  REGLAS_PETICION,
  MedioId,
  PermisoId,
  EstadoPermiso,
  obtenerPermisosParaMedio,
  obtenerReglasParaMedio,
  buscarPermisoEnMedio,
  distinguirFaltaDeDenegado,
  estadoSiNuncaPregunto,
  estadoSiDenegadoAMano,
  tieneEnlaceDirecto,
  obtenerEnlaceDirecto,
  accionParaEstado,
  decidirAccion,
  permisosCriticosParaMedio,
  permisosUtilesParaMedio,
  detectarMedioActual,
} from "../matriz";

describe("MATRIZ_PERMISOS", () => {
  it("contiene entradas para todos los medios declarados", () => {
    const medios: MedioId[] = [
      "web-chromium",
      "web-firefox",
      "web-safari",
      "web-pwa",
      "tauri-macos",
      "tauri-windows",
      "tauri-linux-x11",
      "tauri-linux-wayland",
      "tauri-android",
      "terminal-node",
    ];
    for (const medio of medios) {
      const entradas = MATRIZ_PERMISOS.filter((p) => p.medio === medio);
      expect(entradas.length).toBeGreaterThan(0);
    }
  });

  it("cada entrada tiene campos obligatorios", () => {
    for (const entrada of MATRIZ_PERMISOS) {
      expect(entrada.id).toBeTruthy();
      expect(entrada.medio).toBeTruthy();
      expect(entrada.comoSeDetecta).toBeTruthy();
      expect(entrada.comoSePide).toBeTruthy();
      expect(typeof entrada.tieneEnlaceDirecto).toBe("boolean");
      expect(typeof entrada.distingueFaltaDeDenegado).toBe("boolean");
      expect(entrada.estadoSiNuncaPregunto).toBeTruthy();
      expect(entrada.estadoSiDenegadoAMano).toBeTruthy();
    }
  });

  it("no hay duplicados permiso+medio", () => {
    const claves = new Set<string>();
    for (const entrada of MATRIZ_PERMISOS) {
      const clave = `${entrada.medio}|${entrada.id}`;
      expect(claves.has(clave)).toBe(false);
      claves.add(clave);
    }
  });
});

describe("REGLAS_PETICION", () => {
  it("tiene reglas para los medios principales", () => {
    const mediosConReglas = [...new Set(REGLAS_PETICION.map((r) => r.medio))];
    expect(mediosConReglas).toContain("web-chromium");
    expect(mediosConReglas).toContain("tauri-macos");
    expect(mediosConReglas).toContain("tauri-windows");
    expect(mediosConReglas).toContain("tauri-linux-x11");
    expect(mediosConReglas).toContain("tauri-linux-wayland");
    expect(mediosConReglas).toContain("tauri-android");
    expect(mediosConReglas).toContain("terminal-node");
  });

  it("cada regla tiene fraseHumana no vacía", () => {
    for (const regla of REGLAS_PETICION) {
      expect(regla.fraseHumana).toBeTruthy();
      expect(regla.fraseHumana.length).toBeGreaterThan(10);
    }
  });

  it("orden es creciente por medio", () => {
    for (const medio of ["web-chromium", "tauri-macos", "tauri-android"] as MedioId[]) {
      const reglas = REGLAS_PETICION.filter((r) => r.medio === medio).sort((a, b) => a.orden - b.orden);
      for (let i = 1; i < reglas.length; i++) {
        expect(reglas[i].orden).toBeGreaterThan(reglas[i - 1].orden);
      }
    }
  });
});

describe("obtenerPermisosParaMedio", () => {
  it("devuelve array no vacío para web-chromium", () => {
    const perms = obtenerPermisosParaMedio("web-chromium");
    expect(perms.length).toBeGreaterThan(5);
    expect(perms.some((p) => p.id === "microfono")).toBe(true);
    expect(perms.some((p) => p.id === "camara")).toBe(true);
  });

  it("devuelve array vacío para medio inexistente", () => {
    const perms = obtenerPermisosParaMedio("medio-inexistente" as MedioId);
    expect(perms).toEqual([]);
  });
});

describe("obtenerReglasParaMedio", () => {
  it("devuelve reglas ordenadas por orden", () => {
    const reglas = obtenerReglasParaMedio("tauri-macos");
    expect(reglas.length).toBeGreaterThan(5);
    for (let i = 1; i < reglas.length; i++) {
      expect(reglas[i].orden).toBeGreaterThan(reglas[i - 1].orden);
    }
  });
});

describe("buscarPermisoEnMedio", () => {
  it("encuentra microfono en web-chromium", () => {
    const entrada = buscarPermisoEnMedio("microfono", "web-chromium");
    expect(entrada).toBeDefined();
    expect(entrada?.id).toBe("microfono");
    expect(entrada?.medio).toBe("web-chromium");
  });

  it("devuelve undefined para combinación inexistente", () => {
    const entrada = buscarPermisoEnMedio("permiso-inexistente" as PermisoId, "web-chromium");
    expect(entrada).toBeUndefined();
  });
});

describe("distinguirFaltaDeDenegado", () => {
  it("true para microfono en web-chromium", () => {
    expect(distinguirFaltaDeDenegado("microfono", "web-chromium")).toBe(true);
  });

  it("false para pantalla en web-chromium (no consultable)", () => {
    expect(distinguirFaltaDeDenegado("pantalla", "web-chromium")).toBe(false);
  });

  it("false para accesibilidad en tauri-macos (macOS no distingue)", () => {
    expect(distinguirFaltaDeDenegado("accesibilidad", "tauri-macos")).toBe(false);
  });

  it("true para monitor-entrada en tauri-macos (sí distingue)", () => {
    expect(distinguirFaltaDeDenegado("monitor-entrada", "tauri-macos")).toBe(true);
  });
});

describe("estadoSiNuncaPregunto / estadoSiDenegadoAMano", () => {
  it("microfono web-chromium: 'preguntar' / 'denegado'", () => {
    expect(estadoSiNuncaPregunto("microfono", "web-chromium")).toBe("preguntar");
    expect(estadoSiDenegadoAMano("microfono", "web-chromium")).toBe("denegado");
  });

  it("pantalla web-chromium: 'no-disponible' / 'denegado'", () => {
    expect(estadoSiNuncaPregunto("pantalla", "web-chromium")).toBe("no-disponible");
    expect(estadoSiDenegadoAMano("pantalla", "web-chromium")).toBe("denegado");
  });

  it("accesibilidad tauri-macos: 'no-concedido' / 'no-concedido'", () => {
    expect(estadoSiNuncaPregunto("accesibilidad", "tauri-macos")).toBe("no-concedido");
    expect(estadoSiDenegadoAMano("accesibilidad", "tauri-macos")).toBe("no-concedido");
  });
});

describe("tieneEnlaceDirecto / obtenerEnlaceDirecto", () => {
  it("microfono web-chromium tiene enlace", () => {
    expect(tieneEnlaceDirecto("microfono", "web-chromium")).toBe(true);
    expect(obtenerEnlaceDirecto("microfono", "web-chromium")).toBe("chrome://settings/content/microphone");
  });

  it("almacenamiento web-chromium NO tiene enlace directo", () => {
    expect(tieneEnlaceDirecto("almacenamiento", "web-chromium")).toBe(false);
    expect(obtenerEnlaceDirecto("almacenamiento", "web-chromium")).toBeUndefined();
  });

  it("pantalla tauri-macos tiene enlace directo macOS", () => {
    expect(tieneEnlaceDirecto("pantalla", "tauri-macos")).toBe(true);
    expect(obtenerEnlaceDirecto("pantalla", "tauri-macos")).toContain("Privacy_ScreenCapture");
  });
});

describe("accionParaEstado", () => {
  it("concedido -> ninguna", () => {
    expect(accionParaEstado("concedido", true)).toBe("ninguna");
    expect(accionParaEstado("concedido", false)).toBe("ninguna");
  });

  it("denegado con distingue -> abrir-ajustes", () => {
    expect(accionParaEstado("denegado", true)).toBe("abrir-ajustes");
  });

  it("denegado sin distingue -> mostrar-en-lista", () => {
    expect(accionParaEstado("denegado", false)).toBe("mostrar-en-lista");
  });

  it("no-disponible -> ninguna", () => {
    expect(accionParaEstado("no-disponible", true)).toBe("ninguna");
    expect(accionParaEstado("no-disponible", false)).toBe("ninguna");
  });

  it("no-aplica -> ninguna", () => {
    expect(accionParaEstado("no-aplica", true)).toBe("ninguna");
  });

  it("preguntar -> pedir", () => {
    expect(accionParaEstado("preguntar", true)).toBe("pedir");
    expect(accionParaEstado("preguntar", false)).toBe("pedir");
  });

  it("sin-preguntar -> pedir", () => {
    expect(accionParaEstado("sin-preguntar", true)).toBe("pedir");
  });

  it("no-concedido -> pedir", () => {
    expect(accionParaEstado("no-concedido", true)).toBe("pedir");
  });
});

describe("decidirAccion", () => {
  it("microfono concedido en web-chromium -> ninguna", () => {
    const decision = decidirAccion("microfono", "web-chromium", "concedido");
    expect(decision.accion).toBe("ninguna");
    expect(decision.fraseHumana).toBeUndefined();
    expect(decision.enlaceDirecto).toBeUndefined();
  });

  it("microfono denegado en web-chromium -> abrir-ajustes con enlace (sin frase, ya se negó)", () => {
    const decision = decidirAccion("microfono", "web-chromium", "denegado");
    expect(decision.accion).toBe("abrir-ajustes");
    expect(decision.enlaceDirecto).toBe("chrome://settings/content/microphone");
    expect(decision.fraseHumana).toBeUndefined();
  });

  it("microfono preguntar en web-chromium -> pedir con frase", () => {
    const decision = decidirAccion("microfono", "web-chromium", "preguntar");
    expect(decision.accion).toBe("pedir");
    expect(decision.fraseHumana).toContain("micrófono");
  });

  it("pantalla denegado en web-chromium (no distingue) -> mostrar-en-lista", () => {
    const decision = decidirAccion("pantalla", "web-chromium", "denegado");
    expect(decision.accion).toBe("mostrar-en-lista");
  });

  it("accesibilidad denegado en tauri-macos (no distingue) -> mostrar-en-lista", () => {
    const decision = decidirAccion("accesibilidad", "tauri-macos", "denegado");
    expect(decision.accion).toBe("mostrar-en-lista");
  });

  it("monitor-entrada denegado en tauri-macos (distingue) -> abrir-ajustes", () => {
    const decision = decidirAccion("monitor-entrada", "tauri-macos", "denegado");
    expect(decision.accion).toBe("abrir-ajustes");
    expect(decision.enlaceDirecto).toContain("Privacy_ListenEvent");
  });
});

describe("permisosCriticosParaMedio / permisosUtilesParaMedio", () => {
  it("tauri-macos tiene microfono, camara, notificaciones, pantalla, accesibilidad, monitor-entrada como críticos", () => {
    const criticos = permisosCriticosParaMedio("tauri-macos");
    expect(criticos).toContain("microfono");
    expect(criticos).toContain("camara");
    expect(criticos).toContain("notificaciones");
    expect(criticos).toContain("pantalla");
    expect(criticos).toContain("accesibilidad");
    expect(criticos).toContain("monitor-entrada");
  });

  it("tauri-macos útiles incluye críticos + ubicación, bluetooth, red-local, arranque", () => {
    const utiles = permisosUtilesParaMedio("tauri-macos");
    const criticos = permisosCriticosParaMedio("tauri-macos");
    for (const c of criticos) {
      expect(utiles).toContain(c);
    }
    expect(utiles).toContain("ubicacion");
    expect(utiles).toContain("bluetooth");
    expect(utiles).toContain("red-local");
    expect(utiles).toContain("arranque");
  });

  it("terminal-node críticos: accesibilidad, pantalla", () => {
    const criticos = permisosCriticosParaMedio("terminal-node");
    expect(criticos).toContain("accesibilidad");
    expect(criticos).toContain("pantalla");
  });
});

describe("detectarMedioActual", () => {
  it("devuelve un MedioId válido", () => {
    const medio = detectarMedioActual();
    const validos: MedioId[] = [
      "web-chromium",
      "web-firefox",
      "web-safari",
      "web-pwa",
      "tauri-macos",
      "tauri-windows",
      "tauri-linux-x11",
      "tauri-linux-wayland",
      "tauri-android",
      "terminal-node",
      "terminal-bun",
      "terminal-deno",
    ];
    expect(validos).toContain(medio);
  });
});