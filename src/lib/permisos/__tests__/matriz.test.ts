import { describe, it, expect } from "vitest";
import {
  registroDe,
  defDe,
  accionDe,
  esAccionable,
  necesitaPara,
  textoEstado,
  detectarMedio,
  FASE_ACTUAL,
  VERSION_MATRIZ,
  IDS_PERMISO,
  ORDEN_GRUPOS,
  type Medio,
  type IdPermiso,
  type EstadoSistema,
  type AccionPermiso,
  type DefPermiso,
} from "../matriz";

describe("matriz — registro por medio", () => {
  const medios: Medio[] = ["macos", "android", "windows", "linux-x11", "linux-wayland", "web", "terminal", "ios"];

  it("cada medio tiene todos los IDs de permiso", () => {
    for (const m of medios) {
      const reg = registroDe(m);
      const ids = reg.map((d) => d.id).sort();
      expect(ids).toEqual([...IDS_PERMISO].sort());
    }
  });

  it("orden de grupos respetado", () => {
    for (const m of medios) {
      const reg = registroDe(m);
      let lastIdx = -1;
      for (const d of reg) {
        const idx = ORDEN_GRUPOS.indexOf(d.grupo);
        expect(idx).toBeGreaterThanOrEqual(lastIdx);
        lastIdx = idx;
      }
    }
  });

  it("defDe devuelve el permiso con campos específicos del medio", () => {
    const d = defDe("macos", "pantalla");
    expect(d).not.toBeNull();
    expect(d!.como).toBe("aviso-y-panel");
    expect(d!.lectura).toBe("si");
    expect(d!.enlace.nivel).toBe("directo");
    expect(d!.enlace.pantalla).toContain("Grabación de pantalla");
  });

  it("permiso inexistente devuelve null", () => {
    expect(defDe("macos", "no-existe" as IdPermiso)).toBeNull();
  });
});

describe("matriz — acción según estado y medio", () => {
  const dMacPantalla = defDe("macos", "pantalla")!;
  const dAndroidPantalla = defDe("android", "pantalla")!;
  const dWebMicro = defDe("web", "microfono")!;
  const dMacAccesibilidad = defDe("macos", "accesibilidad")!;
  const dAndroidAccesibilidad = defDe("android", "accesibilidad")!;
  const dWebPantalla = defDe("web", "pantalla")!;
  const dMacBluetooth = defDe("macos", "bluetooth")!;
  const dWindowsMicro = defDe("windows", "microfono")!;
  const dLinuxPantalla = defDe("linux-x11", "pantalla")!;
  const dTerminalCap = defDe("terminal", "capacidades")!;
  const dIosPantalla = defDe("ios", "pantalla")!;

  it("macOS pantalla: aviso-y-panel → pedir si sin-preguntar, abrir-ajustes si denegado o yaPedido", () => {
    expect(accionDe(dMacPantalla, "sin-preguntar")).toBe("pedir");
    expect(accionDe(dMacPantalla, "denegado")).toBe("abrir-ajustes");
    expect(accionDe(dMacPantalla, "sin-preguntar", true)).toBe("abrir-ajustes");
    expect(accionDe(dMacPantalla, "concedido")).toBe("listo");
  });

  it("Android pantalla: por-uso → por-uso siempre", () => {
    expect(accionDe(dAndroidPantalla, "sin-preguntar")).toBe("por-uso");
    expect(accionDe(dAndroidPantalla, "denegado")).toBe("por-uso");
    expect(accionDe(dAndroidPantalla, "concedido")).toBe("listo");
  });

  it("Web micrófono: aviso → pedir si sin-preguntar, abrir-ajustes si denegado", () => {
    expect(accionDe(dWebMicro, "sin-preguntar")).toBe("pedir");
    expect(accionDe(dWebMicro, "denegado")).toBe("abrir-ajustes");
    expect(accionDe(dWebMicro, "concedido")).toBe("listo");
  });

  it("macOS accesibilidad: aviso-y-panel con lectura no-concedido → pedir si no-concedido (no distingue negado), abrir-ajustes si denegado o yaPedido", () => {
    expect(accionDe(dMacAccesibilidad, "no-concedido")).toBe("pedir");
    expect(accionDe(dMacAccesibilidad, "denegado")).toBe("abrir-ajustes");
    expect(accionDe(dMacAccesibilidad, "no-concedido", true)).toBe("abrir-ajustes");
    expect(accionDe(dMacAccesibilidad, "concedido")).toBe("listo");
  });

  it("Android accesibilidad: panel → abrir-ajustes siempre que no esté concedido", () => {
    expect(accionDe(dAndroidAccesibilidad, "sin-preguntar")).toBe("abrir-ajustes");
    expect(accionDe(dAndroidAccesibilidad, "denegado")).toBe("abrir-ajustes");
    expect(accionDe(dAndroidAccesibilidad, "concedido")).toBe("listo");
  });

  it("Web pantalla: aviso → pedir si sin-preguntar, abrir-ajustes si denegado", () => {
    expect(accionDe(dWebPantalla, "sin-preguntar")).toBe("pedir");
    expect(accionDe(dWebPantalla, "denegado")).toBe("abrir-ajustes");
  });

  it("macOS bluetooth: aviso → pedir si sin-preguntar", () => {
    expect(accionDe(dMacBluetooth, "sin-preguntar")).toBe("pedir");
    expect(accionDe(dMacBluetooth, "denegado")).toBe("abrir-ajustes");
  });

  it("Windows micrófono: por-uso → por-uso", () => {
    expect(accionDe(dWindowsMicro, "sin-preguntar")).toBe("por-uso");
    expect(accionDe(dWindowsMicro, "desconocido")).toBe("por-uso");
  });

  it("Linux X11 pantalla: nada → listo (no-aplica)", () => {
    expect(accionDe(dLinuxPantalla, "no-aplica")).toBe("listo");
    expect(accionDe(dLinuxPantalla, "concedido")).toBe("listo");
  });

  it("Terminal capacidades: nada → listo", () => {
    expect(accionDe(dTerminalCap, "no-aplica")).toBe("listo");
  });

  it("iOS pantalla: no-disponible → nada (independiente del estado)", () => {
    expect(accionDe(dIosPantalla, "no-aplica")).toBe("nada");
    expect(accionDe(dIosPantalla, "concedido")).toBe("nada");
    expect(accionDe(dIosPantalla, "sin-preguntar")).toBe("nada");
  });

  it("fase futura → mas-adelante", () => {
    const dAuto = defDe("macos", "automatizacion")!; // fase 4
    expect(accionDe(dAuto, "sin-preguntar")).toBe("mas-adelante");
  });
});

describe("matriz — esAccionable", () => {
  it("pedir y abrir-ajustes son accionables", () => {
    expect(esAccionable("pedir")).toBe(true);
    expect(esAccionable("abrir-ajustes")).toBe(true);
  });

  it("el resto no", () => {
    expect(esAccionable("por-uso")).toBe(false);
    expect(esAccionable("nada")).toBe(false);
    expect(esAccionable("mas-adelante")).toBe(false);
    expect(esAccionable("listo")).toBe(false);
  });
});

describe("matriz — necesitaPara por función", () => {
  it("malla-radios en macOS pide bluetooth, red-local y ubicacion-wifi (opcional en lista, obligatorio para función) si faltan", () => {
    const r = necesitaPara("malla-radios", "macos", {
      bluetooth: "sin-preguntar",
      "red-local": "sin-preguntar",
      "ubicacion-wifi": "sin-preguntar",
    });
    expect(r.construida).toBe(true);
    expect(r.listo).toBe(false);
    expect(r.faltan.map((f) => f.id).sort()).toEqual(["bluetooth", "red-local", "ubicacion-wifi"].sort());
    expect(r.faltan[0].accion).toBe("pedir");
  });

  it("malla-radios en Android pide cercanos y ubicacion-wifi (opcionales en lista, obligatorios para función)", () => {
    const r = necesitaPara("malla-radios", "android", { cercanos: "sin-preguntar", "ubicacion-wifi": "sin-preguntar" });
    expect(r.faltan.map((f) => f.id)).toContain("cercanos");
    expect(r.faltan.map((f) => f.id)).toContain("ubicacion-wifi");
  });

  it("llamadas en web: microfono, camara, notificaciones son obligatorios; pantalla NO es para llamadas (es para compartir-pantalla); bluetooth/red-local/cercanos/llamadas no aplican en web", () => {
    const r = necesitaPara("llamadas", "web", {
      microfono: "sin-preguntar",
      camara: "sin-preguntar",
      notificaciones: "sin-preguntar",
    });
    // En web, solo microfono, camara, notificaciones aplican para llamadas
    // pantalla es para compartir-pantalla, no para llamadas
    expect(r.faltan.map((f) => f.id).sort()).toEqual(["camara", "microfono", "notificaciones"].sort());
    expect(r.porUso).toEqual([]);
  });

  it("prestar-ventana en macOS: pantalla y accesibilidad son opcionales en lista pero obligatorios para la función; red-local también está en la función", () => {
    const r = necesitaPara("prestar-ventana", "macos", {
      pantalla: "sin-preguntar",
      accesibilidad: "sin-preguntar",
      "red-local": "sin-preguntar",
    });
    expect(r.faltan.map((f) => f.id).sort()).toEqual(["accesibilidad", "pantalla", "red-local"].sort());
  });

  it("función no construida → listo=false, construida=false", () => {
    const r = necesitaPara("astraura-actua", "macos", {});
    expect(r.construida).toBe(false);
    expect(r.listo).toBe(false);
  });

  it("yaPedidos salta a abrir-ajustes en aviso-y-panel", () => {
    const d = defDe("macos", "pantalla")!;
    expect(accionDe(d, "sin-preguntar", false)).toBe("pedir");
    expect(accionDe(d, "sin-preguntar", true)).toBe("abrir-ajustes");
  });
});

describe("matriz — textoEstado", () => {
  const d = defDe("macos", "pantalla")!;

  it("estados principales", () => {
    expect(textoEstado(d, "concedido", "listo")).toBe("Concedido");
    expect(textoEstado(d, "denegado", "abrir-ajustes")).toBe("Denegado: se cambia en Ajustes");
    expect(textoEstado(d, "sin-preguntar", "pedir")).toBe("Sin preguntar");
    expect(textoEstado(d, "no-concedido", "abrir-ajustes")).toBe("Sin conceder (no distingue negado de sin preguntar)");
    expect(textoEstado(d, undefined, "pedir")).toBe("Sin dato todavía");
    expect(textoEstado(d, "desconocido", "pedir")).toBe("Sin dato todavía");
  });

  it("casos especiales", () => {
    expect(textoEstado(d, "no-aplica", "listo")).toBe("Este medio no lo pide");
    expect(textoEstado({ ...d, lectura: "no" }, "sin-preguntar", "pedir")).toBe("El sistema no deja saber su estado");
    expect(textoEstado({ ...d, fase: 4 }, "sin-preguntar", "mas-adelante")).toBe("Llega con la fase 4: aún no se pide");
  });
});

describe("matriz — detectarMedio (lado cliente)", () => {
  it("devuelve un Medio válido", () => {
    const m = detectarMedio();
    expect(["macos", "android", "windows", "linux-x11", "linux-wayland", "web", "terminal", "ios"]).toContain(m);
  });
});

describe("matriz — constantes", () => {
  it("FASE_ACTUAL es 1", () => {
    expect(FASE_ACTUAL).toBe(1);
  });

  it("VERSION_MATRIZ es 1", () => {
    expect(VERSION_MATRIZ).toBe(1);
  });

  it("IDS_PERMISO contiene todos los permisos esperados", () => {
    const esperados: IdPermiso[] = [
      "bluetooth", "red-local", "ubicacion-wifi", "ubicacion", "cercanos", "nfc",
      "notificaciones", "microfono", "camara", "llamadas", "pantalla", "accesibilidad",
      "monitor-entrada", "automatizacion", "superposicion", "arranque", "bateria",
      "carpetas", "disco-completo", "todos-archivos", "instalar", "no-molestar",
      "escribir-ajustes", "capacidades",
    ];
    expect([...IDS_PERMISO].sort()).toEqual(esperados.sort());
  });
});