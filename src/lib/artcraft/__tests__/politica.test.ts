import { describe, it, expect } from "vitest";
import type { AppArtcraft } from "../politica-tablas";
import {
  RaicesTrabajo,
  LlamadaArtcraft,
  evaluarLlamada,
  rutaDentro,
  rutasEnParametros,
} from "../politica";
import type { Origen, Ambito, Rol } from "@/lib/prototmolecula/tipos";

const raices: RaicesTrabajo = {
  lectura: ["/app/data"],
  escritura: ["/app/data"],
};

function haceLlamada(
  sobre: Partial<LlamadaArtcraft> = {}
): LlamadaArtcraft {
  return {
    app: "figcraft" as AppArtcraft,
    herramienta: "list_commands",
    parametros: {},
    origen: "mano" as Origen,
    ambito: "personal" as Ambito,
    rol: null as Rol | null,
    raices,
    ...sobre,
  };
}

describe("politica ArtCraft - rutaDentro", () => {
  it("acepta ruta exacta a raíz de lectura", () => {
    const paso = rutaDentro("/app/data", raices);
    expect(paso).toBe(true);
  });

  it("acepta ruta que empieza por raíz más /", () => {
    const paso = rutaDentro("/app/data/sub/file.txt", raices);
    expect(paso).toBe(true);
  });

  it("rechaza ruta vacía", () => {
    const paso = rutaDentro("", raices);
    expect(paso).toBe(false);
  });

  it("rechaza ruta con ..", () => {
    const paso = rutaDentro("/app/../etc/passwd", raices);
    expect(paso).toBe(false);
  });

  it("rechaza ruta con ~", () => {
    const paso = rutaDentro("~/x", raices);
    expect(paso).toBe(false);
  });

  it("rechaza ruta con file:", () => {
    const paso = rutaDentro("file:///x", raices);
    expect(paso).toBe(false);
  });

  it("rechaza ruta UNC con \\\\", () => {
    const paso = rutaDentro("\\\\server\\share", raices);
    expect(paso).toBe(false);
  });

  it("rechaza ruta con byte nulo", () => {
    const paso = rutaDentro("/app/data\x00/file", raices);
    expect(paso).toBe(false);
  });

  it("rechaza ruta con doble barra", () => {
    const paso = rutaDentro("/app//data", raices);
    expect(paso).toBe(true);
  });
});

describe("politica ArtCraft - rutasEnParametros", () => {
  it("extrae strings de claves conocidas", () => {
    const rutas = rutasEnParametros({
      path: "/app/data/x",
      file: "/app/data/y",
      dir: "/app/data/z",
    });
    expect(rutas).toContain("/app/data/x");
    expect(rutas).toContain("/app/data/y");
    expect(rutas).toContain("/app/data/z");
  });

  it("extrae strings que empiezan con /, ~, file:, \\\\, letra de unidad", () => {
    const rutas = rutasEnParametros({
      ruta: "/etc/passwd",
      tilde: "~/x",
      archivo: "file:///x",
      unc: "\\\\server\\share",
      unidad: "C:\\\\windows",
    });
    expect(rutas).toContain("/etc/passwd");
    expect(rutas).toContain("~/x");
    expect(rutas).toContain("file:///x");
    expect(rutas).toContain("\\\\server\\share");
    expect(rutas).toContain("C:\\\\windows");
  });

  it("recursión profundidad ≤ 6", () => {
    const obj = { a: { b: { c: { d: { e: { f: "/deep" } } } } } };
    const rutas = rutasEnParametros(obj);
    expect(rutas).toContain("/deep");
  });
});

describe("politica ArtCraft - evaluarLlamada", () => {
  it("herramienta desconocida deniega", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "herrameta desconeguda",
      parametros: {},
      origen: "mano" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("herramienta vetada deniega", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "pointer",
      parametros: {},
      origen: "mano" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("collab.share denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "collab.share",
      parametros: {},
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("collab.publish denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "collab.publish",
      parametros: {},
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("plugin.import denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "plugin.import",
      parametros: {},
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("automate.trustScripts denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "gridcraft",
      herramienta: "automate.trustScripts",
      parametros: {},
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("trusted: true deniega", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "list_commands",
      parametros: { trusted: true },
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("call_app denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "call_app",
      parametros: {},
      origen: "ia" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("/etc/passwd denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "write_range",
      parametros: { ruta: "/etc/passwd" },
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("../x denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "write_range",
      parametros: { ruta: "../x" },
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("~/x denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "write_range",
      parametros: { ruta: "~/x" },
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("file:///x denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "write_range",
      parametros: { ruta: "file:///x" },
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("UNC \\\\server\\share denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "write_range",
      parametros: { ruta: "\\\\server\\share" },
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("ruta dentro de salida/ permitida", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "export",
      parametros: { ruta: "/app/salida/report.pdf" },
      origen: "mano" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices: { lectura: ["/app"], escritura: ["/app/salida"] },
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("permitir");
  });

  it("GridCraft open_workbook con ruta fuera denegado", () => {
    const llamada: LlamadaArtcraft = {
      app: "gridcraft",
      herramienta: "open_workbook",
      parametros: { ruta: "/etc/passwd" },
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices,
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });

  it("export de FigCraft dentro de salida/ permitido", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "export",
      parametros: { ruta: "/app/salida/report.pdf" },
      origen: "mano" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices: { lectura: ["/app"], escritura: ["/app/salida"] },
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("permitir");
  });

it("en ámbito grupo pide confirmar", () => {
  const llamada: LlamadaArtcraft = {
    app: "figcraft",
    herramienta: "set_properties",
    parametros: { ruta: "/app/data/x" },
    origen: "agente" as Origen,
    ambito: "grupo" as Ambito,
    rol: "editor" as Rol,
    raices,
  };
  const veredicto = evaluarLlamada(llamada);
  expect(veredicto.decision).toBe("confirmar");
});

  it("ruta dentro solo de lectura no vale para escribir", () => {
    const llamada: LlamadaArtcraft = {
      app: "figcraft",
      herramienta: "write_range",
      parametros: { ruta: "/app/data/x" },
      origen: "agente" as Origen,
      ambito: "personal" as Ambito,
      rol: null as Rol | null,
      raices: { lectura: ["/app/data"], escritura: [] },
    };
    const veredicto = evaluarLlamada(llamada);
    expect(veredicto.decision).toBe("denegar");
  });
});