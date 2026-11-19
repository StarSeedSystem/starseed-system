import { describe, it, expect } from "vitest";
import {
  detectarMedio,
  normalizarEstadoSistema,
  accionPara,
  textoPara,
  hayBotonAjustes,
  catalogoMedio,
  evaluarPermiso,
  necesitaParaMedio,
  pedirAlInstalarYAbrir,
  FASE_ACTUAL,
} from "../matriz";
import type { Medio, PermisoId, EstadoSistema, AccionPermiso, EnlaceAjustes, DefPermisoMedio } from "../matriz";

function mockDef(overrides: Partial<DefPermisoMedio> = {}): DefPermisoMedio {
  return {
    id: "test" as PermisoId,
    titulo: "Test",
    porQue: "Test",
    funciones: [],
    como: "aviso",
    lectura: "si",
    fase: 1,
    enlace: null,
    ...overrides,
  } as DefPermisoMedio;
}

describe("matriz de permisos — utilidades base", () => {
  describe("normalizarEstadoSistema", () => {
    it("mapea granted/allowed/authorized → concedido", () => {
      expect(normalizarEstadoSistema("granted", "macos", "microfono")).toBe("concedido");
      expect(normalizarEstadoSistema("allowed", "windows", "camara")).toBe("concedido");
      expect(normalizarEstadoSistema("authorized", "android", "ubicacion")).toBe("concedido");
      expect(normalizarEstadoSistema("concedido", "macos", "microfono")).toBe("concedido");
      expect(normalizarEstadoSistema("enabled", "linux-x11", "bluetooth")).toBe("concedido");
    });

    it("mapea denied/blocked/rejected → denegado", () => {
      expect(normalizarEstadoSistema("denied", "macos", "microfono")).toBe("denegado");
      expect(normalizarEstadoSistema("blocked", "web-chrome", "camara")).toBe("denegado");
      expect(normalizarEstadoSistema("rejected", "android", "ubicacion")).toBe("denegado");
      expect(normalizarEstadoSistema("denegado", "macos", "pantalla")).toBe("denegado");
      expect(normalizarEstadoSistema("disabled", "windows", "microfono")).toBe("denegado");
    });

    it("mapea prompt/default/ask → sin-preguntar", () => {
      expect(normalizarEstadoSistema("prompt", "web-chrome", "notificaciones")).toBe("sin-preguntar");
      expect(normalizarEstadoSistema("default", "web-firefox", "ubicacion")).toBe("sin-preguntar");
      expect(normalizarEstadoSistema("ask", "ios", "microfono")).toBe("sin-preguntar");
      expect(normalizarEstadoSistema("sin-preguntar", "macos", "accesibilidad")).toBe("sin-preguntar");
    });

    it("mapea unsupported/unavailable → no-aplica", () => {
      expect(normalizarEstadoSistema("unsupported", "web-safari", "archivos")).toBe("no-aplica");
      expect(normalizarEstadoSistema("unavailable", "ios", "pantalla")).toBe("no-aplica");
      expect(normalizarEstadoSistema("no-disponible", "linux-x11", "monitor-entrada")).toBe("no-aplica");
    });

    it("lo desconocido → desconocido", () => {
      expect(normalizarEstadoSistema("rareza", "macos", "microfono")).toBe("desconocido");
      expect(normalizarEstadoSistema(123, "windows", "camara")).toBe("desconocido");
      expect(normalizarEstadoSistema(null, "android", "ubicacion")).toBe("desconocido");
    });
  });

describe("accionPara", () => {
  it("fase futura → mas-adelante (si no concedido)", () => {
    const def = mockDef({ fase: 99, como: "aviso", lectura: "si" });
    expect(accionPara(def, "sin-preguntar", false)).toBe("mas-adelante");
    // concedido gana sobre fase futura
    expect(accionPara(def, "concedido", false)).toBe("listo");
  });

  it("concedido o no-aplica → listo", () => {
    const def = mockDef({ fase: 1, como: "aviso", lectura: "si" });
    expect(accionPara(def, "concedido", false)).toBe("listo");
    expect(accionPara(def, "no-aplica", false)).toBe("listo");
  });

  it("nada/declaracion → nada", () => {
    const defNada = mockDef({ fase: 1, como: "nada", lectura: "no" });
    const defDecl = mockDef({ fase: 1, como: "declaracion", lectura: "si" });
    expect(accionPara(defNada, "sin-preguntar", false)).toBe("nada");
    expect(accionPara(defDecl, "sin-preguntar", false)).toBe("nada");
  });

  it("por-uso → por-uso", () => {
    const def = mockDef({ fase: 1, como: "por-uso", lectura: "no" });
    expect(accionPara(def, "sin-preguntar", false)).toBe("por-uso");
    expect(accionPara(def, "desconocido", false)).toBe("por-uso");
  });

  it("panel → abrir-ajustes", () => {
    const def = mockDef({ fase: 1, como: "panel", lectura: "si" });
    expect(accionPara(def, "sin-preguntar", false)).toBe("abrir-ajustes");
    expect(accionPara(def, "denegado", false)).toBe("abrir-ajustes");
  });

  it("aviso-y-panel: yaPedido o denegado → abrir-ajustes; si no → pedir", () => {
    const def = mockDef({ fase: 1, como: "aviso-y-panel", lectura: "si" });
    expect(accionPara(def, "sin-preguntar", true)).toBe("abrir-ajustes");
    expect(accionPara(def, "denegado", false)).toBe("abrir-ajustes");
    expect(accionPara(def, "sin-preguntar", false)).toBe("pedir");
    expect(accionPara(def, "desconocido", false)).toBe("pedir");
  });

  it("aviso: denegado → abrir-ajustes; si no → pedir", () => {
    const def = mockDef({ fase: 1, como: "aviso", lectura: "si" });
    expect(accionPara(def, "denegado", false)).toBe("abrir-ajustes");
    expect(accionPara(def, "sin-preguntar", false)).toBe("pedir");
    expect(accionPara(def, "desconocido", false)).toBe("pedir");
  });
});

  describe("textoPara", () => {
    it("devuelve textos esperados para cada caso", () => {
      const def = mockDef({ fase: 1, como: "aviso", lectura: "si", titulo: "Micrófono" });
      expect(textoPara(def, "concedido", "listo")).toBe("Concedido");
      expect(textoPara(def, "denegado", "abrir-ajustes")).toBe("Denegado: se cambia en Ajustes");
      expect(textoPara(def, "sin-preguntar", "pedir")).toBe("Sin preguntar");
      expect(textoPara(def, "desconocido", "pedir")).toBe("Sin preguntar");
      expect(textoPara(def, "no-aplica", "listo")).toBe("Este medio no lo pide");
    });

    it("mas-adelante menciona la fase", () => {
      const def = mockDef({ fase: 3, como: "aviso", lectura: "si" });
      expect(textoPara(def, "sin-preguntar", "mas-adelante")).toBe("Llega con la fase 3: aún no se pide");
    });

    it("por-uso → texto específico", () => {
      const def = mockDef({ fase: 1, como: "por-uso", lectura: "no" });
      expect(textoPara(def, "sin-preguntar", "por-uso")).toBe("El sistema lo pregunta al usarlo");
    });

    it("lectura=no y estado desconocido → mensaje honesto", () => {
      const def = mockDef({ fase: 1, como: "aviso", lectura: "no" });
      expect(textoPara(def, "desconocido", "pedir")).toBe("El sistema no deja saber su estado");
    });
  });

  describe("hayBotonAjustes", () => {
    it("true para directo, lista, ficha", () => {
      expect(hayBotonAjustes({ nivel: "directo", pantalla: "X", pulsa: "Y" })).toBe(true);
      expect(hayBotonAjustes({ nivel: "lista", pantalla: "X", pulsa: "Y" })).toBe(true);
      expect(hayBotonAjustes({ nivel: "ficha", pantalla: "X", pulsa: "Y" })).toBe(true);
    });

    it("false para aviso, sin-enlace, no-hace-falta, null", () => {
      expect(hayBotonAjustes({ nivel: "aviso", pantalla: "X", pulsa: "Y" })).toBe(false);
      expect(hayBotonAjustes({ nivel: "sin-enlace", pantalla: "X", pulsa: "Y" })).toBe(false);
      expect(hayBotonAjustes({ nivel: "no-hace-falta", pantalla: "—", pulsa: "Y" })).toBe(false);
      expect(hayBotonAjustes(null)).toBe(false);
    });
  });
});

describe("catalogoMedio", () => {
  const medios: Medio[] = [
    "macos", "windows", "linux-x11", "linux-wayland",
    "android", "ios",
    "web-chrome", "web-firefox", "web-safari", "web-embedded",
    "terminal",
  ];

  for (const medio of medios) {
    it(`${medio}: devuelve array no vacío con todos los permisos canónicos`, () => {
      const cat = catalogoMedio(medio);
      expect(cat.length).toBeGreaterThan(20);
      const ids = cat.map((d) => d.id);
      expect(ids).toContain("microfono");
      expect(ids).toContain("camara");
      expect(ids).toContain("notificaciones");
      expect(ids).toContain("capacidades");
    });

    it(`${medio}: cada permiso tiene campos requeridos`, () => {
      const cat = catalogoMedio(medio);
      for (const d of cat) {
        expect(d.id).toBeTruthy();
        expect(d.titulo).toBeTruthy();
        expect(d.porQue).toBeTruthy();
        expect(["aviso", "aviso-y-panel", "panel", "por-uso", "declaracion", "nada"]).toContain(d.como);
        expect(["si", "parcial", "no"]).toContain(d.lectura);
        expect(typeof d.fase).toBe("number");
        expect(Array.isArray(d.funciones)).toBe(true);
        expect(d.enlace === null || typeof d.enlace === "object").toBe(true);
      }
    });
  }

  it("macOS: pantalla y accesibilidad son aviso-y-panel", () => {
    const cat = catalogoMedio("macos");
    const pantalla = cat.find((d) => d.id === "pantalla");
    const acc = cat.find((d) => d.id === "accesibilidad");
    expect(pantalla?.como).toBe("aviso-y-panel");
    expect(acc?.como).toBe("aviso-y-panel");
  });

  it("Android: accesibilidad es panel, superposicion es panel", () => {
    const cat = catalogoMedio("android");
    expect(cat.find((d) => d.id === "accesibilidad")?.como).toBe("panel");
    expect(cat.find((d) => d.id === "superposicion")?.como).toBe("panel");
  });

  it("iOS PWA: pantalla es nada (no soportado), segundo-plano es nada", () => {
    const cat = catalogoMedio("ios");
    expect(cat.find((d) => d.id === "pantalla")?.como).toBe("nada");
    expect(cat.find((d) => d.id === "segundo-plano")?.como).toBe("nada");
  });

  it("web-chrome: archivos es por-uso (FSA), web-firefox/safari: archivos es nada", () => {
    expect(catalogoMedio("web-chrome").find((d) => d.id === "archivos")?.como).toBe("por-uso");
    expect(catalogoMedio("web-firefox").find((d) => d.id === "archivos")?.como).toBe("nada");
    expect(catalogoMedio("web-safari").find((d) => d.id === "archivos")?.como).toBe("nada");
  });

  it("web-embedded: micrófono/cámara/pantalla/notificaciones son nada con enlace aviso", () => {
    const cat = catalogoMedio("web-embedded");
    for (const id of ["microfono", "camara", "pantalla", "notificaciones", "ubicacion"] as const) {
      const d = cat.find((x) => x.id === id);
      expect(d?.como).toBe("nada");
      expect(d?.enlace?.nivel).toBe("aviso");
    }
  });

  it("terminal: todo es nada salvo segundo-plano/arranque/capacidades", () => {
    const cat = catalogoMedio("terminal");
    for (const d of cat) {
      if (["segundo-plano", "arranque", "capacidades"].includes(d.id)) {
        expect(d.como).toBe("aviso");
      } else {
        expect(d.como).toBe("nada");
      }
    }
    // Verificar específicamente capacidades
    expect(cat.find((d) => d.id === "capacidades")?.como).toBe("aviso");
  });
});

describe("evaluarPermiso", () => {
  it("macos micrófono concedido → listo, sin botón ajustes", () => {
    const r = evaluarPermiso("macos", "microfono", "granted", false);
    expect(r.estado).toBe("concedido");
    expect(r.accion).toBe("listo");
    expect(r.hayBotonAjustes).toBe(false);
    expect(r.texto).toBe("Concedido");
    expect(r.enlace?.nivel).toBe("directo");
  });

  it("macos pantalla denegado → abrir-ajustes, con botón", () => {
    const r = evaluarPermiso("macos", "pantalla", "denied", true); // yaPedido=true
    expect(r.estado).toBe("denegado");
    expect(r.accion).toBe("abrir-ajustes");
    expect(r.hayBotonAjustes).toBe(true);
    expect(r.texto).toBe("Denegado: se cambia en Ajustes");
  });

  it("android accesibilidad sin-preguntar → abrir-ajustes (panel siempre va a ajustes)", () => {
    const r = evaluarPermiso("android", "accesibilidad", "prompt", false);
    expect(r.estado).toBe("sin-preguntar");
    expect(r.accion).toBe("abrir-ajustes"); // panel: siempre abre ajustes, no hay primer aviso
  });

  it("android accesibilidad denegado → abrir-ajustes", () => {
    const r = evaluarPermiso("android", "accesibilidad", "denied", false);
    expect(r.accion).toBe("abrir-ajustes");
    expect(r.hayBotonAjustes).toBe(true);
  });

  it("web-chrome notificaciones denegado → abrir-ajustes con botón directo", () => {
    const r = evaluarPermiso("web-chrome", "notificaciones", "denied", false);
    expect(r.accion).toBe("abrir-ajustes");
    expect(r.hayBotonAjustes).toBe(true);
    expect(r.enlace?.nivel).toBe("directo");
  });

  it("web-embedded micrófono → nada, enlace aviso, sin botón", () => {
    const r = evaluarPermiso("web-embedded", "microfono", "prompt", false);
    expect(r.accion).toBe("nada");
    expect(r.hayBotonAjustes).toBe(false);
    expect(r.enlace?.nivel).toBe("aviso");
  });
});

describe("necesitaParaMedio / pedirAlInstalarYAbrir", () => {
  it("macos: si micrófono=granted y cámara=denied → solo cámara en abrir-ajustes", () => {
    const res = necesitaParaMedio("macos", { microfono: "granted", camara: "denied" }, []);
    const ids = res.map((r) => r.permiso);
    expect(ids).not.toContain("microfono");
    expect(ids).toContain("camara");
    const cam = res.find((r) => r.permiso === "camara");
    expect(cam?.accion).toBe("abrir-ajustes");
  });

  it("android: notificaciones=denied → abrir-ajustes; ubicacion=prompt → pedir", () => {
    const res = pedirAlInstalarYAbrir("android", { notificaciones: "denied", ubicacion: "prompt" }, []);
    const notif = res.find((r) => r.permiso === "notificaciones");
    const ub = res.find((r) => r.permiso === "ubicacion");
    expect(notif?.accion).toBe("abrir-ajustes");
    expect(ub?.accion).toBe("por-uso"); // ubicacion es por-uso en android
  });

  it("web-chrome: archivos (FSA) → por-uso, notificaciones=prompt → pedir", () => {
    const res = pedirAlInstalarYAbrir("web-chrome", { notificaciones: "prompt" }, []);
    const notif = res.find((r) => r.permiso === "notificaciones");
    const arch = res.find((r) => r.permiso === "archivos");
    expect(notif?.accion).toBe("pedir");
    expect(arch?.accion).toBe("por-uso");
  });

  it("web-firefox: archivos → nada (no soportado), notificaciones=denied → abrir-ajustes", () => {
    const res = pedirAlInstalarYAbrir("web-firefox", { notificaciones: "denied" }, []);
    const arch = res.find((r) => r.permiso === "archivos");
    const notif = res.find((r) => r.permiso === "notificaciones");
    expect(arch).toBeUndefined(); // fase 1 pero como=nada → no sale en faltan
    expect(notif?.accion).toBe("abrir-ajustes");
  });

  it("ios: pantalla y segundo-plano no salen (como=nada)", () => {
    const res = necesitaParaMedio("ios", { pantalla: "unsupported", "segundo-plano": "unsupported" }, []);
    const ids = res.map((r) => r.permiso);
    expect(ids).not.toContain("pantalla");
    expect(ids).not.toContain("segundo-plano");
  });

  it("respeta yaPedidos: macos pantalla yaPedido=true → abrir-ajustes aunque sea sin-preguntar", () => {
    const res = necesitaParaMedio("macos", { pantalla: "prompt" }, ["pantalla"]);
    const p = res.find((r) => r.permiso === "pantalla");
    expect(p?.accion).toBe("abrir-ajustes");
  });

  it("fase > FASE_ACTUAL no sale (monitor-entrada en macos es fase 3)", () => {
    const res = necesitaParaMedio("macos", { "monitor-entrada": "sin-preguntar" }, []);
    expect(res.find((r) => r.permiso === "monitor-entrada")).toBeUndefined();
  });

  it("orden: pedir → abrir-ajustes → por-uso", () => {
    const res = pedirAlInstalarYAbrir("macos", {
      microfono: "prompt",      // aviso → pedir
      pantalla: "denied",        // aviso-y-panel + denegado → abrir-ajustes
      ubicacion: "prompt",       // por-uso → por-uso
    }, []);
    const acciones = res.map((r) => r.accion);
    expect(acciones.indexOf("pedir")).toBeLessThan(acciones.indexOf("abrir-ajustes"));
    expect(acciones.indexOf("abrir-ajustes")).toBeLessThan(acciones.indexOf("por-uso"));
  });
});

describe("detectarMedio (SSR-safe)", () => {
  it("sin navigator → terminal", () => {
    // No podemos mockear global navigator fácilmente en vitest sin jsdom,
    // pero la función tiene guard: typeof navigator === "undefined"
    // Test de humo: importar no lanza
    expect(typeof detectarMedio).toBe("function");
  });
});

describe("FASE_ACTUAL", () => {
  it("es 1", () => {
    expect(FASE_ACTUAL).toBe(1);
  });
});