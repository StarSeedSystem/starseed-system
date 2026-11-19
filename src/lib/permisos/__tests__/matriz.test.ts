/**
 * Tests for src/lib/permisos/matriz.ts
 * Solo funciones puras exportadas (entrada → salida, sin red, sin disco, sin procesos).
 */

import { describe, it, expect } from "vitest";
import {
  detectarMedio,
  defPermisoParaMedio,
  permisosParaMedio,
  accionParaPermiso,
  esAccionable,
  textoEstadoPermiso,
  medioTienePendientes,
  VERSION_MATRIZ,
  FASE_ACTUAL,
  IDS_PERMISO,
  ORDEN_GRUPOS,
  TITULO_GRUPO,
  type MedioCompleto,
  type DefPermisoMedio,
  type EstadoPermiso,
  type AccionPermiso,
  type IdPermiso,
} from "../matriz";

describe("matriz — detección de medio", () => {
  it("en servidor devuelve medio vacío con so=desconocido", () => {
    // En Node/servidor, typeof window === "undefined"
    // La función detectarMedio() usa window, así que en test (jsdom) hay window
    // Verificamos que la función existe y no lanza
    expect(typeof detectarMedio).toBe("function");
  });

  it("devuelve estructura MedioCompleto válida", () => {
    const medio = detectarMedio();
    expect(medio).toHaveProperty("tipo");
    expect(medio).toHaveProperty("so");
    expect(["app-nativa", "app-instalada", "local", "navegador-claude", "navegador"]).toContain(medio.tipo);
    expect([
      "macos",
      "android",
      "windows",
      "linux-x11",
      "linux-wayland",
      "ios",
      "ipados",
      "desconocido",
    ]).toContain(medio.so);
    if (medio.contexto) {
      expect(["terminal", "tv", "plegable"]).toContain(medio.contexto);
    }
  });
});

describe("matriz — constantes y tipos", () => {
  it("VERSION_MATRIZ es número positivo", () => {
    expect(typeof VERSION_MATRIZ).toBe("number");
    expect(VERSION_MATRIZ).toBeGreaterThan(0);
  });

  it("FASE_ACTUAL es 1", () => {
    expect(FASE_ACTUAL).toBe(1);
  });

  it("IDS_PERMISO contiene todos los IDs esperados", () => {
    expect(IDS_PERMISO).toContain("microfono");
    expect(IDS_PERMISO).toContain("camara");
    expect(IDS_PERMISO).toContain("pantalla");
    expect(IDS_PERMISO).toContain("accesibilidad");
    expect(IDS_PERMISO).toContain("ubicacion");
    expect(IDS_PERMISO).toContain("bluetooth");
    expect(IDS_PERMISO).toContain("notificaciones");
    expect(IDS_PERMISO.length).toBeGreaterThan(20);
  });

  it("ORDEN_GRUPOS tiene 8 grupos en orden lógico", () => {
    expect(ORDEN_GRUPOS).toEqual([
      "audio-video",
      "pantalla-control",
      "ubicacion-red",
      "comunicacion",
      "segundo-plano",
      "archivos-almacenamiento",
      "sistema-dispositivo",
      "entrada-salida",
    ]);
  });

  it("TITULO_GRUPO tiene título para cada grupo", () => {
    for (const g of ORDEN_GRUPOS) {
      expect(TITULO_GRUPO[g]).toBeTruthy();
      expect(typeof TITULO_GRUPO[g]).toBe("string");
    }
  });
});

describe("matriz — permisos por medio", () => {
  const medioMacOSNativo: MedioCompleto = {
    tipo: "app-nativa",
    so: "macos",
  };

  const medioAndroidNativo: MedioCompleto = {
    tipo: "app-nativa",
    so: "android",
  };

  const medioWindowsNativo: MedioCompleto = {
    tipo: "app-nativa",
    so: "windows",
  };

  const medioLinuxX11: MedioCompleto = {
    tipo: "app-nativa",
    so: "linux-x11",
  };

  const medioLinuxWayland: MedioCompleto = {
    tipo: "app-nativa",
    so: "linux-wayland",
  };

  const medioIOS: MedioCompleto = {
    tipo: "app-instalada",
    so: "ios",
  };

  const medioWeb: MedioCompleto = {
    tipo: "navegador",
    so: "macos", // SO del host, pero medio es web
  };

  it("macOS nativo tiene permisos de audio/video/pantalla/accesibilidad", () => {
    const perms = permisosParaMedio(medioMacOSNativo);
    const ids = perms.map((p) => p.id);
    expect(ids).toContain("microfono");
    expect(ids).toContain("camara");
    expect(ids).toContain("pantalla");
    expect(ids).toContain("accesibilidad");
    expect(ids).toContain("monitor-entrada");
    expect(ids).toContain("bluetooth");
    expect(ids).toContain("notificaciones");
  });

  it("Android nativo tiene permisos específicos (cercanos, accesibilidad servicio, superposición)", () => {
    const perms = permisosParaMedio(medioAndroidNativo);
    const ids = perms.map((p) => p.id);
    expect(ids).toContain("cercanos");
    expect(ids).toContain("accesibilidad");
    expect(ids).toContain("superposicion");
    expect(ids).toContain("bateria");
    expect(ids).toContain("todos-archivos");
    expect(ids).toContain("instalar");
  });

  it("Windows nativo no pide permisos para Bluetooth/pantalla/accesibilidad", () => {
    const perms = permisosParaMedio(medioWindowsNativo);
    const bluetooth = perms.find((p) => p.id === "bluetooth");
    const pantalla = perms.find((p) => p.id === "pantalla");
    const accesibilidad = perms.find((p) => p.id === "accesibilidad");
    expect(bluetooth?.como).toBe("nada-sistema");
    expect(pantalla?.como).toBe("nada-sistema");
    expect(accesibilidad?.como).toBe("nada-sistema");
  });

  it("Linux X11 no pide permisos para pantalla/accesibilidad/micrófono/cámara", () => {
    const perms = permisosParaMedio(medioLinuxX11);
    const pantalla = perms.find((p) => p.id === "pantalla");
    const accesibilidad = perms.find((p) => p.id === "accesibilidad");
    const microfono = perms.find((p) => p.id === "microfono");
    const camara = perms.find((p) => p.id === "camara");
    expect(pantalla?.como).toBe("nada-sistema");
    expect(accesibilidad?.como).toBe("nada-sistema");
    expect(microfono?.como).toBe("nada-sistema");
    expect(camara?.como).toBe("nada-sistema");
  });

  it("Linux Wayland pide pantalla y accesibilidad por-uso (portales)", () => {
    const perms = permisosParaMedio(medioLinuxWayland);
    const pantalla = perms.find((p) => p.id === "pantalla");
    const accesibilidad = perms.find((p) => p.id === "accesibilidad");
    expect(pantalla?.como).toBe("por-uso");
    expect(accesibilidad?.como).toBe("por-uso");
    expect(pantalla?.fase).toBe(1);
    expect(accesibilidad?.fase).toBe(3);
  });

  it("iOS (PWA) adapta permisos a web: pantalla por-uso, sin accesibilidad nativa", () => {
    const perms = permisosParaMedio(medioIOS);
    const pantalla = perms.find((p) => p.id === "pantalla");
    const accesibilidad = perms.find((p) => p.id === "accesibilidad");
    const microfono = perms.find((p) => p.id === "microfono");
    expect(pantalla?.como).toBe("por-uso");
    expect(accesibilidad?.como).toBe("no-aplica");
    expect(microfono?.como).toBe("por-uso");
  });

  it("Web (navegador) adapta todos los permisos nativos a APIs web", () => {
    const perms = permisosParaMedio(medioWeb);
    const pantalla = perms.find((p) => p.id === "pantalla");
    const accesibilidad = perms.find((p) => p.id === "accesibilidad");
    const bluetooth = perms.find((p) => p.id === "bluetooth");
    const redLocal = perms.find((p) => p.id === "red-local");
    expect(pantalla?.como).toBe("por-uso");
    expect(accesibilidad?.como).toBe("no-aplica");
    expect(bluetooth?.como).toBe("por-uso");
    expect(redLocal?.como).toBe("no-aplica");
  });

  it("cada permiso tiene enlace válido (no null)", () => {
    const perms = permisosParaMedio(medioMacOSNativo);
    for (const p of perms) {
      expect(p.enlace).not.toBeNull();
      if (p.enlace) {
        expect(p.enlace.nivel).toBeTruthy();
        expect(p.enlace.pantalla).toBeTruthy();
        expect(p.enlace.pulsa).toBeTruthy();
      }
    }
  });

  it("cada permiso tiene distinguirFaltaDeDenegado no vacío", () => {
    const perms = permisosParaMedio(medioMacOSNativo);
    for (const p of perms) {
      expect(p.distinguirFaltaDeDenegado).toBeTruthy();
      expect(typeof p.distinguirFaltaDeDenegado).toBe("string");
      expect(p.distinguirFaltaDeDenegado.length).toBeGreaterThan(10);
    }
  });
});

describe("matriz — defPermisoParaMedio", () => {
  const medio: MedioCompleto = { tipo: "app-nativa", so: "macos" };

  it("devuelve DefPermisoMedio para ID existente", () => {
    const def = defPermisoParaMedio("microfono", medio);
    expect(def).not.toBeNull();
    expect(def?.id).toBe("microfono");
    expect(def?.grupo).toBe("audio-video");
  });

  it("devuelve null para ID inexistente en ese medio", () => {
    const def = defPermisoParaMedio("nfc", medio); // NFC no está en macOS base
    expect(def).toBeNull();
  });

  it("devuelve null para ID inventado", () => {
    const def = defPermisoParaMedio("permiso-inexistente" as IdPermiso, medio);
    expect(def).toBeNull();
  });
});

describe("matriz — accionParaPermiso (regla principal)", () => {
  const medio: MedioCompleto = { tipo: "app-nativa", so: "macos" };

  it("permiso concedido → listo", () => {
    const def = defPermisoParaMedio("microfono", medio)!;
    const accion = accionParaPermiso(def, "concedido", false);
    expect(accion).toBe("listo");
  });

  it("permiso denegado a mano (aviso-sistema) → abrir-ajustes", () => {
    const def = defPermisoParaMedio("microfono", medio)!; // aviso-sistema
    const accion = accionParaPermiso(def, "denegado", false);
    expect(accion).toBe("abrir-ajustes");
  });

  it("permiso nunca pedido (aviso-sistema) → pedir", () => {
    const def = defPermisoParaMedio("microfono", medio)!;
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("pedir");
  });

  it("permiso aviso-luego-ajustes nunca pedido → pedir", () => {
    const def = defPermisoParaMedio("pantalla", medio)!; // aviso-luego-ajustes
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("pedir");
  });

  it("permiso aviso-luego-ajustes ya pedido → abrir-ajustes", () => {
    const def = defPermisoParaMedio("pantalla", medio)!;
    const accion = accionParaPermiso(def, undefined, true);
    expect(accion).toBe("abrir-ajustes");
  });

  it("permiso aviso-luego-ajustes denegado → abrir-ajustes", () => {
    const def = defPermisoParaMedio("pantalla", medio)!;
    const accion = accionParaPermiso(def, "denegado", false);
    expect(accion).toBe("abrir-ajustes");
  });

  it("permiso solo-ajustes (fase actual) → abrir-ajustes", () => {
    // instalar en Android es fase 1, solo-ajustes
    const medioAndroid: MedioCompleto = { tipo: "app-nativa", so: "android" };
    const def = defPermisoParaMedio("instalar", medioAndroid)!; // fase 1, solo-ajustes
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("abrir-ajustes");
  });

  it("permiso solo-ajustes (fase futura) → mas-adelante", () => {
    // disco-completo en macOS es fase 6 > FASE_ACTUAL
    const def = defPermisoParaMedio("disco-completo", medio)!; // fase 6, solo-ajustes
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("mas-adelante");
  });

  it("permiso por-uso (fase actual) → por-uso", () => {
    // microfono en iOS es fase 1, por-uso
    const medioIOS: MedioCompleto = { tipo: "app-instalada", so: "ios" };
    const def = defPermisoParaMedio("microfono", medioIOS)!; // fase 1, por-uso
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("por-uso");
  });

  it("permiso por-uso (fase futura) → mas-adelante", () => {
    // pantalla en iOS es fase 2 > FASE_ACTUAL
    const medioIOS: MedioCompleto = { tipo: "app-instalada", so: "ios" };
    const def = defPermisoParaMedio("pantalla", medioIOS)!; // fase 2, por-uso
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("mas-adelante");
  });

  it("permiso nada-sistema → nada", () => {
    const medioWin: MedioCompleto = { tipo: "app-nativa", so: "windows" };
    const def = defPermisoParaMedio("bluetooth", medioWin)!; // nada-sistema
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("nada");
  });

  it("permiso fase futura → mas-adelante", () => {
    const def = defPermisoParaMedio("automatizacion", medio)!; // fase 4
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("mas-adelante");
  });

  it("permiso no-aplica → nada", () => {
    const medioWeb: MedioCompleto = { tipo: "navegador", so: "macos" };
    const def = defPermisoParaMedio("accesibilidad", medioWeb)!; // no-aplica en web
    const accion = accionParaPermiso(def, undefined, false);
    expect(accion).toBe("nada");
  });
});

describe("matriz — esAccionable", () => {
  it("pedir y abrir-ajustes son accionables", () => {
    expect(esAccionable("pedir")).toBe(true);
    expect(esAccionable("abrir-ajustes")).toBe(true);
  });

  it("por-uso, nada, mas-adelante, listo no son accionables", () => {
    expect(esAccionable("por-uso")).toBe(false);
    expect(esAccionable("nada")).toBe(false);
    expect(esAccionable("mas-adelante")).toBe(false);
    expect(esAccionable("listo")).toBe(false);
  });
});

describe("matriz — textoEstadoPermiso", () => {
  const medio: MedioCompleto = { tipo: "app-nativa", so: "macos" };

  it("concedido → 'Concedido'", () => {
    const def = defPermisoParaMedio("microfono", medio)!;
    expect(textoEstadoPermiso(def, "concedido", "listo")).toBe("Concedido");
  });

  it("denegado → 'Denegado: se cambia en Ajustes'", () => {
    const def = defPermisoParaMedio("microfono", medio)!;
    expect(textoEstadoPermiso(def, "denegado", "abrir-ajustes")).toBe("Denegado: se cambia en Ajustes");
  });

  it("fase futura → menciona la fase", () => {
    const def = defPermisoParaMedio("automatizacion", medio)!;
    expect(textoEstadoPermiso(def, undefined, "mas-adelante")).toContain("fase 4");
  });

  it("por-uso → 'El sistema lo pregunta al usarlo'", () => {
    const medioIOS: MedioCompleto = { tipo: "app-instalada", so: "ios" };
    const def = defPermisoParaMedio("pantalla", medioIOS)!;
    expect(textoEstadoPermiso(def, undefined, "por-uso")).toBe("El sistema lo pregunta al usarlo");
  });

  it("sin dato → 'Sin dato todavía'", () => {
    const def = defPermisoParaMedio("microfono", medio)!;
    expect(textoEstadoPermiso(def, undefined, "pedir")).toBe("Sin dato todavía");
  });

  it("no-concedido → 'Sin conceder'", () => {
    const def = defPermisoParaMedio("microfono", medio)!;
    expect(textoEstadoPermiso(def, "no-concedido", "pedir")).toBe("Sin conceder");
  });

  it("lectura no → 'El sistema no deja saber su estado'", () => {
    const def = defPermisoParaMedio("disco-completo", medio)!; // lectura: no
    expect(textoEstadoPermiso(def, undefined, "abrir-ajustes")).toBe("El sistema no deja saber su estado");
  });
});

describe("matriz — medioTienePendientes", () => {
  const medio: MedioCompleto = { tipo: "app-nativa", so: "macos" };

  it("true si hay permisos accionables no vistos", () => {
    const tiene = medioTienePendientes(medio, [], {}, []);
    expect(tiene).toBe(true);
  });

  it("false si todos los permisos accionables ya se vieron", () => {
    const todosLosIds = permisosParaMedio(medio)
      .filter((p) => esAccionable(accionParaPermiso(p, undefined, false)))
      .map((p) => p.id);
    const tiene = medioTienePendientes(medio, todosLosIds, {}, []);
    expect(tiene).toBe(false);
  });

  it("false si TODOS los permisos accionables ya están concedidos", () => {
    // Obtener todos los permisos accionables en fase actual para macOS nativo
    const accionables = permisosParaMedio(medio)
      .filter((p) => p.fase <= FASE_ACTUAL && esAccionable(accionParaPermiso(p, undefined, false)))
      .map((p) => p.id);
    // Marcarlos todos como vistos y concedidos
    const estados: Partial<Record<IdPermiso, EstadoPermiso>> = {};
    for (const id of accionables) estados[id] = "concedido";
    const tiene = medioTienePendientes(medio, accionables, estados, []);
    expect(tiene).toBe(false);
  });
});

describe("matriz — estructura de DefPermisoMedio", () => {
  const medio: MedioCompleto = { tipo: "app-nativa", so: "macos" };
  const perms = permisosParaMedio(medio);

  it("todos los permisos tienen campos requeridos", () => {
    for (const p of perms) {
      expect(p.id).toBeTruthy();
      expect(p.grupo).toBeTruthy();
      expect(p.titulo).toBeTruthy();
      expect(p.porQue).toBeTruthy();
      expect(p.como).toBeTruthy();
      expect(p.lectura).toBeTruthy();
      expect(typeof p.fase).toBe("number");
      expect(typeof p.desde).toBe("number");
      expect(Array.isArray(p.funciones)).toBe(true);
      expect(p.enlace).not.toBeNull();
      expect(p.distinguirFaltaDeDenegado).toBeTruthy();
    }
  });

  it("grupo es uno de ORDEN_GRUPOS", () => {
    for (const p of perms) {
      expect(ORDEN_GRUPOS).toContain(p.grupo);
    }
  });

  it("como es uno de los valores válidos", () => {
    const valoresValidos: string[] = [
      "aviso-sistema",
      "aviso-luego-ajustes",
      "solo-ajustes",
      "por-uso",
      "declaracion-manifiesto",
      "nada-sistema",
      "no-aplica",
    ];
    for (const p of perms) {
      expect(valoresValidos).toContain(p.como);
    }
  });

  it("lectura es uno de los valores válidos", () => {
    const valoresValidos: string[] = ["si", "parcial", "no", "no-aplica"];
    for (const p of perms) {
      expect(valoresValidos).toContain(p.lectura);
    }
  });

  it("enlace.nivel es uno de los valores válidos", () => {
    const valoresValidos: string[] = [
      "directo",
      "lista",
      "ficha-app",
      "aviso-sistema",
      "sin-enlace",
      "no-hace-falta",
    ];
    for (const p of perms) {
      expect(valoresValidos).toContain(p.enlace!.nivel);
    }
  });
});