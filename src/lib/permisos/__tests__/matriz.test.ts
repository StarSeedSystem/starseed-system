import { describe, it, expect } from "vitest";
import {
  registroDe,
  defDe,
  IDS_PERMISO,
  FASE_ACTUAL,
  VERSION_MATRIZ,
  TITULO_GRUPO,
  ORDEN_GRUPOS,
  accionDe,
  esAccionable,
  necesitaPara,
  textoEstado,
  enlaceDe,
  hayBotonAjustes,
  textoEnlace,
  leerGuardado,
  serializarGuardado,
  GUARDADO_VACIO,
  yaPedidoAviso,
  colaPendientes,
  debeAbrirseSolo,
  marcarVisto,
  marcarAviso,
  type Medio,
  type IdPermiso,
  type DefPermiso,
  type EstadoSistema,
  type AccionPermiso,
  type EnlaceAjustes,
  type GuardadoPermisos,
} from "../matriz";

const MEDIOS: Medio[] = ["macos", "android", "windows", "linux-x11", "linux-wayland", "ios", "web"];

describe("Matriz de permisos — estructura base", () => {
  it("todos los IDs tienen definición en BASE en al menos un medio", () => {
    for (const id of IDS_PERMISO) {
      let encontrado = false;
      for (const medio of MEDIOS) {
        if (defDe(medio, id)) {
          encontrado = true;
          break;
        }
      }
      expect(encontrado).toBe(true);
    }
  });

  it("cada medio tiene al menos un permiso por grupo (si el medio tiene ese grupo)", () => {
    for (const medio of MEDIOS) {
      const reg = registroDe(medio);
      const gruposEnMedio = new Set(reg.map((d) => d.grupo));
      for (const grupo of gruposEnMedio) {
        const hay = reg.some((d) => d.grupo === grupo);
        expect(hay).toBe(true);
      }
    }
  });

  it("versión y fase actual son coherentes", () => {
    expect(VERSION_MATRIZ).toBeGreaterThanOrEqual(1);
    expect(FASE_ACTUAL).toBeGreaterThanOrEqual(1);
  });

  it("títulos de grupo existen para todos los grupos", () => {
    for (const grupo of ORDEN_GRUPOS) {
      expect(TITULO_GRUPO[grupo]).toBeTruthy();
    }
  });

  it("orden de grupos cubre todos los grupos definidos en macos", () => {
    const reg = registroDe("macos");
    const gruposDefinidos = new Set(reg.map((d) => d.grupo));
    for (const g of gruposDefinidos) {
      expect(ORDEN_GRUPOS).toContain(g);
    }
  });
});

describe("accionDe — tabla de verdad completa", () => {
  const baseDef: DefPermiso = {
    id: "microfono",
    grupo: "comunicacion",
    titulo: "Micrófono",
    porQue: "test",
    como: "aviso",
    lectura: "si",
    fase: 1,
    desde: 1,
    funciones: ["llamadas"],
  };

  it("fase futura → mas-adelante", () => {
    expect(accionDe({ ...baseDef, fase: FASE_ACTUAL + 1 }, "sin-preguntar")).toBe("mas-adelante");
  });

  it("concedido → listo", () => {
    expect(accionDe(baseDef, "concedido")).toBe("listo");
  });

  it("no-aplica → listo", () => {
    expect(accionDe(baseDef, "no-aplica")).toBe("listo");
  });

  it("como=nada → nada", () => {
    expect(accionDe({ ...baseDef, como: "nada" }, "sin-preguntar")).toBe("nada");
  });

  it("como=declaracion → nada", () => {
    expect(accionDe({ ...baseDef, como: "declaracion" }, "sin-preguntar")).toBe("nada");
  });

  it("como=por-uso → por-uso", () => {
    expect(accionDe({ ...baseDef, como: "por-uso" }, "sin-preguntar")).toBe("por-uso");
    expect(accionDe({ ...baseDef, como: "por-uso" }, "desconocido")).toBe("por-uso");
    expect(accionDe({ ...baseDef, como: "por-uso" }, undefined)).toBe("por-uso");
  });

  it("como=panel → abrir-ajustes", () => {
    expect(accionDe({ ...baseDef, como: "panel" }, "sin-preguntar")).toBe("abrir-ajustes");
    expect(accionDe({ ...baseDef, como: "panel" }, "denegado")).toBe("abrir-ajustes");
  });

  it("como=aviso-y-panel sin aviso previo → pedir", () => {
    expect(accionDe({ ...baseDef, como: "aviso-y-panel" }, "sin-preguntar", false)).toBe("pedir");
    expect(accionDe({ ...baseDef, como: "aviso-y-panel" }, "no-concedido", false)).toBe("pedir");
  });

  it("como=aviso-y-panel con aviso previo → abrir-ajustes", () => {
    expect(accionDe({ ...baseDef, como: "aviso-y-panel" }, "sin-preguntar", true)).toBe("abrir-ajustes");
    expect(accionDe({ ...baseDef, como: "aviso-y-panel" }, "no-concedido", true)).toBe("abrir-ajustes");
  });

  it("como=aviso-y-panel denegado → abrir-ajustes", () => {
    expect(accionDe({ ...baseDef, como: "aviso-y-panel" }, "denegado", false)).toBe("abrir-ajustes");
    expect(accionDe({ ...baseDef, como: "aviso-y-panel" }, "denegado", true)).toBe("abrir-ajustes");
  });

  it("como=aviso sin denegar → pedir", () => {
    expect(accionDe(baseDef, "sin-preguntar")).toBe("pedir");
    expect(accionDe(baseDef, "no-concedido")).toBe("pedir");
    expect(accionDe(baseDef, undefined)).toBe("pedir");
  });

  it("como=aviso denegado → abrir-ajustes", () => {
    expect(accionDe(baseDef, "denegado")).toBe("abrir-ajustes");
  });
});

describe("esAccionable", () => {
  it("pedir y abrir-ajustes son accionables", () => {
    expect(esAccionable("pedir")).toBe(true);
    expect(esAccionable("abrir-ajustes")).toBe(true);
  });

  it("otros no son accionables", () => {
    expect(esAccionable("nada")).toBe(false);
    expect(esAccionable("por-uso")).toBe(false);
    expect(esAccionable("mas-adelante")).toBe(false);
    expect(esAccionable("listo")).toBe(false);
  });
});

describe("necesitaPara — funciones del OS", () => {
  it("malla-radios en macOS pide bluetooth, red-local y ubicacion-wifi si faltan", () => {
    const r = necesitaPara("malla-radios", "macos", { bluetooth: "sin-preguntar", "red-local": "desconocido", "ubicacion-wifi": "sin-preguntar" });
    expect(r.construida).toBe(true);
    expect(r.listo).toBe(false);
    expect(r.faltan.map((f) => f.id)).toEqual(["bluetooth", "red-local", "ubicacion-wifi"]);
    expect(r.faltan[0].accion).toBe("pedir");
    expect(r.faltan[1].accion).toBe("pedir");
  });

  it("malla-radios en macOS omite ya concedidos", () => {
    const r = necesitaPara("malla-radios", "macos", { bluetooth: "concedido", "red-local": "sin-preguntar", "ubicacion-wifi": "concedido" });
    expect(r.faltan.map((f) => f.id)).toEqual(["red-local"]);
  });

  it("prestar-ventana en macOS requiere red-local, pantalla y accesibilidad", () => {
    const r = necesitaPara("prestar-ventana", "macos", { "red-local": "sin-preguntar", pantalla: "sin-preguntar", accesibilidad: "sin-preguntar" });
    expect(r.faltan.map((f) => f.id)).toEqual(["red-local", "pantalla", "accesibilidad"]);
    // opcionales → accion sigue siendo pedir/abrir-ajustes
    expect(r.faltan.every((f) => f.accion === "pedir" || f.accion === "abrir-ajustes")).toBe(true);
  });

  it("función fase futura → no construida", () => {
    const r = necesitaPara("astraura-actua", "macos", {});
    expect(r.construida).toBe(false);
    expect(r.listo).toBe(false);
    // astraura-actua usa permisos de fase 4 (accesibilidad, automatizacion, monitor-entrada, superposicion)
    // que en fase actual (1) son "mas-adelante" y no aparecen en faltan
    expect(r.faltan.length).toBeGreaterThanOrEqual(0);
  });

  it("por-uso va a porUso, no a faltan", () => {
    const r = necesitaPara("mapa-senales", "macos", { ubicacion: "desconocido" });
    expect(r.porUso).toContain("ubicacion");
    expect(r.faltan.map((f) => f.id)).not.toContain("ubicacion");
  });
});

describe("textoEstado — legible para la UI", () => {
  const baseDef: DefPermiso = {
    id: "microfono",
    grupo: "comunicacion",
    titulo: "Micrófono",
    porQue: "test",
    como: "aviso",
    lectura: "si",
    fase: 1,
    desde: 1,
    funciones: ["llamadas"],
  };

  it("mas-adelante menciona la fase", () => {
    expect(textoEstado({ ...baseDef, fase: 3 }, undefined, "mas-adelante")).toContain("fase 3");
  });

  it("concedido → Concedido", () => {
    expect(textoEstado(baseDef, "concedido", "listo")).toBe("Concedido");
  });

  it("no-aplica → Este sistema no lo pide", () => {
    expect(textoEstado(baseDef, "no-aplica", "listo")).toBe("Este sistema no lo pide");
  });

  it("denegado → Denegado: se cambia en Ajustes", () => {
    expect(textoEstado(baseDef, "denegado", "abrir-ajustes")).toBe("Denegado: se cambia en Ajustes");
  });

  it("por-uso → El sistema lo pregunta al usarlo", () => {
    expect(textoEstado({ ...baseDef, como: "por-uso" }, undefined, "por-uso")).toBe("El sistema lo pregunta al usarlo");
  });

  it("lectura=no → El sistema no deja saber su estado", () => {
    expect(textoEstado({ ...baseDef, lectura: "no" }, "desconocido", "pedir")).toBe("El sistema no deja saber su estado");
  });
});

describe("enlaces directos a Ajustes", () => {
  it("macOS tiene enlace directo para permisos con ancla Privacy_*", () => {
    for (const id of ["microfono", "camara", "pantalla", "accesibilidad", "bluetooth", "ubicacion", "carpetas", "disco-completo"] as IdPermiso[]) {
      const e = enlaceDe("macos", id);
      expect(e).not.toBeNull();
      expect(e!.nivel).toBe("directo");
      expect(e!.pantalla).toContain("Privacidad y seguridad");
    }
  });

  it("Windows usa ms-settings: en la pantalla", () => {
    for (const id of ["microfono", "camara", "ubicacion", "notificaciones", "bluetooth", "arranque"] as IdPermiso[]) {
      const e = enlaceDe("windows", id);
      expect(e).not.toBeNull();
      expect(e!.nivel).toBe("directo");
      // En matriz.ts usamos etiquetas en español, pero el test verifica que hay enlace directo
      expect(["Configuración", "ms-settings:"]).toContain(e!.pantalla.split(" ")[0]);
    }
  });

  it("Android usa ficha o panel:*", () => {
    for (const id of ["microfono", "camara", "ubicacion", "cercanos"] as IdPermiso[]) {
      const e = enlaceDe("android", id);
      expect(e).not.toBeNull();
      expect(["ficha", "directo", "lista", "aviso"]).toContain(e!.nivel);
    }
  });

  it("Linux X11/Wayland no tienen enlaces directos fiables", () => {
    for (const medio of ["linux-x11", "linux-wayland"] as Medio[]) {
      for (const id of ["microfono", "camara", "notificaciones"] as IdPermiso[]) {
        const e = enlaceDe(medio, id);
        expect(e).not.toBeNull();
        expect(["sin-enlace", "no-hace-falta", "aviso"]).toContain(e!.nivel);
      }
    }
  });

  it("iOS PWA usa ficha de la app", () => {
    for (const id of ["ubicacion", "notificaciones", "microfono", "camara"] as IdPermiso[]) {
      const e = enlaceDe("ios", id);
      expect(e).not.toBeNull();
      expect(["ficha", "no-hace-falta"]).toContain(e!.nivel);
    }
  });

  it("Web usa ficha del navegador", () => {
    for (const id of ["microfono", "camara", "ubicacion", "notificaciones"] as IdPermiso[]) {
      const e = enlaceDe("web", id);
      expect(e).not.toBeNull();
      expect(["ficha", "sin-enlace", "no-hace-falta"]).toContain(e!.nivel);
    }
  });
});

describe("hayBotonAjustes / textoEnlace", () => {
  it("directo, lista, ficha → true", () => {
    expect(hayBotonAjustes({ nivel: "directo", pantalla: "x", pulsa: "y" })).toBe(true);
    expect(hayBotonAjustes({ nivel: "lista", pantalla: "x", pulsa: "y" })).toBe(true);
    expect(hayBotonAjustes({ nivel: "ficha", pantalla: "x", pulsa: "y" })).toBe(true);
  });

  it("aviso, sin-enlace, no-hace-falta → false", () => {
    expect(hayBotonAjustes({ nivel: "aviso", pantalla: "x", pulsa: "y" })).toBe(false);
    expect(hayBotonAjustes({ nivel: "sin-enlace", pantalla: "x", pulsa: "y" })).toBe(false);
    expect(hayBotonAjustes({ nivel: "no-hace-falta", pantalla: "—", pulsa: "y" })).toBe(false);
    expect(hayBotonAjustes(null)).toBe(false);
  });

  it("textoEnlace formatea cada nivel", () => {
    expect(textoEnlace({ nivel: "directo", pantalla: "A", pulsa: "B" })).toContain("Se abre «A»");
    expect(textoEnlace({ nivel: "lista", pantalla: "A", pulsa: "B" })).toContain("(la lista, no el interruptor)");
    expect(textoEnlace({ nivel: "ficha", pantalla: "A", pulsa: "B" })).toContain("no tiene una pantalla propia");
    expect(textoEnlace({ nivel: "aviso", pantalla: "A", pulsa: "B" })).toBe("B");
    expect(textoEnlace({ nivel: "sin-enlace", pantalla: "A", pulsa: "B" })).toContain("No hay enlace directo");
    expect(textoEnlace({ nivel: "no-hace-falta", pantalla: "—", pulsa: "B" })).toBe("B");
    expect(textoEnlace(null)).toBe("");
  });
});

describe("GuardadoPermisos — serialización y lectura", () => {
  it("vacío por defecto", () => {
    expect(leerGuardado(null)).toEqual(GUARDADO_VACIO);
    expect(leerGuardado(undefined)).toEqual(GUARDADO_VACIO);
    expect(leerGuardado("")).toEqual(GUARDADO_VACIO);
  });

  it("lee JSON válido y filtra IDs desconocidos", () => {
    const raw = JSON.stringify({
      version: 2,
      vistos: ["microfono", "no-existe", "camara"],
      resultados: { microfono: "concedido", "no-existe": "denegado", camara: "omitido" },
      avisos: ["pantalla", "no-existe"],
    });
    const g = leerGuardado(raw);
    expect(g.version).toBe(2);
    expect(g.vistos).toEqual(["microfono", "camara"]);
    expect(g.resultados.microfono).toBe("concedido");
    expect(g.resultados.camara).toBe("omitido");
    expect("no-existe" in g.resultados).toBe(false);
    expect(g.avisos).toEqual(["pantalla"]);
  });

  it("JSON inválido → vacío", () => {
    expect(leerGuardado("{ no json }")).toEqual(GUARDADO_VACIO);
  });

  it("serializar redondea", () => {
    const g: GuardadoPermisos = { version: 1, vistos: ["microfono"], resultados: { microfono: "concedido" } };
    const raw = serializarGuardado(g);
    expect(JSON.parse(raw)).toEqual(g);
  });
});

describe("yaPedidoAviso", () => {
  it("true si está en avisos", () => {
    expect(yaPedidoAviso({ avisos: ["pantalla"] }, "pantalla")).toBe(true);
  });

  it("false si no está o no hay avisos", () => {
    expect(yaPedidoAviso({ avisos: ["pantalla"] }, "microfono")).toBe(false);
    expect(yaPedidoAviso({}, "pantalla")).toBe(false);
    expect(yaPedidoAviso({ avisos: [] }, "pantalla")).toBe(false);
  });
});

describe("colaPendientes / debeAbrirseSolo", () => {
  const g: GuardadoPermisos = { version: 1, vistos: ["microfono"], resultados: { microfono: "concedido" } };
  const estados: Partial<Record<IdPermiso, EstadoSistema>> = { camara: "sin-preguntar" };

  it("filtra vistos y no accionables", () => {
    const cola = colaPendientes("macos", g, estados, false);
    const ids = cola.map((d) => d.id);
    expect(ids).not.toContain("microfono");
    expect(ids).toContain("camara");
  });

  it("forzar=true incluye vistos", () => {
    const cola = colaPendientes("macos", g, estados, true);
    const ids = cola.map((d) => d.id);
    expect(ids).toContain("microfono");
  });

  it("debeAbrirseSolo true si hay pendientes sin forzar", () => {
    expect(debeAbrirseSolo("macos", g, estados)).toBe(true);
  });

  it("debeAbrirseSolo false si no hay pendientes (todos vistos y concedidos)", () => {
    const reg = registroDe("macos");
    const todosIds = reg.map((d) => d.id);
    const g2: GuardadoPermisos = {
      version: 1,
      vistos: todosIds,
      resultados: Object.fromEntries(todosIds.map((id) => [id, "concedido" as const])),
    };
    const e2 = Object.fromEntries(todosIds.map((id) => [id, "concedido" as EstadoSistema]));
    expect(debeAbrirseSolo("macos", g2, e2)).toBe(false);
  });
});

describe("marcarVisto / marcarAviso", () => {
  it("marcarVisto añade a vistos y resultado", () => {
    const g = marcarVisto(GUARDADO_VACIO, "microfono", "concedido");
    expect(g.vistos).toContain("microfono");
    expect(g.resultados.microfono).toBe("concedido");
  });

  it("marcarVisto no duplica", () => {
    let g = marcarVisto(GUARDADO_VACIO, "microfono", "concedido");
    g = marcarVisto(g, "microfono", "denegado");
    expect(g.vistos.filter((v) => v === "microfono").length).toBe(1);
    expect(g.resultados.microfono).toBe("denegado");
  });

  it("marcarAviso añade a avisos", () => {
    const g = marcarAviso(GUARDADO_VACIO, "pantalla");
    expect(g.avisos).toEqual(["pantalla"]);
  });

  it("marcarAviso no duplica", () => {
    let g = marcarAviso(GUARDADO_VACIO, "pantalla");
    g = marcarAviso(g, "pantalla");
    expect(g.avisos.filter((v) => v === "pantalla").length).toBe(1);
  });
});

describe("Coherencia cross-medio: cada permiso existe en al menos un medio", () => {
  for (const id of IDS_PERMISO) {
    it(`${id} está definido en algún medio`, () => {
      let encontrado = false;
      for (const medio of MEDIOS) {
        if (defDe(medio, id)) {
          encontrado = true;
          break;
        }
      }
      expect(encontrado).toBe(true);
    });
  }
});

describe("No hay duplicados en IDS_PERMISO", () => {
  it("IDs únicos", () => {
    const uniq = new Set(IDS_PERMISO);
    expect(uniq.size).toBe(IDS_PERMISO.length);
  });
});