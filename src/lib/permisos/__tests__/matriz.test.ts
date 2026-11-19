import { describe, expect, it } from "vitest";
import {
  MEDIOS,
  PERMISOS,
  celdaDe,
  celdasDe,
  clasificar,
  decidir,
  listaDe,
  planDe,
  type Celda,
  type Medio,
} from "../matriz";

const celda = (medio: Medio, permiso: (typeof PERMISOS)[number]): Celda => {
  const c = celdaDe(medio, permiso);
  if (!c) throw new Error(`falta ${medio}/${permiso}`);
  return c;
};

describe("matriz permiso × medio", () => {
  it("cada medio tiene celdas, sin permisos repetidos y con la distinción escrita", () => {
    for (const medio of MEDIOS) {
      const celdas = celdasDe(medio);
      expect(celdas.length, medio).toBeGreaterThan(0);
      expect(new Set(celdas.map((c) => c.permiso)).size, medio).toBe(celdas.length);
      for (const c of celdas) {
        expect(PERMISOS, `${medio}/${c.permiso}`).toContain(c.permiso);
        expect(c.distingue.length, `${medio}/${c.permiso}`).toBeGreaterThan(10);
      }
    }
  });

  it("macOS: micrófono y cámara se piden al instalar y al abrir; pantalla solo en Ajustes", () => {
    expect(celda("macos", "microfono")).toMatchObject({ detecta: "api-estado", pide: "aviso", enlace: "directo", alInstalar: true, alAbrir: true });
    expect(celda("macos", "camara").alAbrir).toBe(true);
    expect(celda("macos", "pantalla")).toMatchObject({ pide: "panel", alInstalar: false, alAbrir: false });
    expect(celda("macos", "red-local").detecta).toBe("inferida");
    expect(celda("macos", "energia").pide).toBe("nada");
  });

  it("iOS no permite control ni entrada virtual; la pantalla se pregunta cada vez", () => {
    expect(celda("ios", "control").pide).toBe("nada");
    expect(celda("ios", "entrada-virtual").pide).toBe("nada");
    expect(celda("ios", "pantalla").pide).toBe("por-uso");
    expect(celda("ios", "microfono").alAbrir).toBe(true);
  });

  it("Android: los avisos son en tiempo de ejecución y los accesos especiales, panel", () => {
    expect(celda("android", "microfono").pide).toBe("aviso");
    expect(celda("android", "ubicacion").pide).toBe("aviso");
    expect(celda("android", "segundo-plano").pide).toBe("panel");
    expect(celda("android", "archivos").pide).toBe("panel");
    expect(celda("android", "red-local").pide).toBe("nada");
  });

  it("Linux: los medios se preguntan al usarse y el resto no pide nada", () => {
    expect(celda("linux", "microfono").pide).toBe("por-uso");
    expect(celda("linux", "pantalla").pide).toBe("por-uso");
    expect(celda("linux", "bluetooth").pide).toBe("nada");
    expect(celda("linux", "segundo-plano").alInstalar).toBe(true);
  });

  it("Windows: los medios heredan la privacidad del sistema y la pantalla no pide", () => {
    expect(celda("windows", "microfono").pide).toBe("por-uso");
    expect(celda("windows", "camara").pide).toBe("por-uso");
    expect(celda("windows", "pantalla").pide).toBe("nada");
    expect(celda("windows", "red-local").detecta).toBe("inferida");
  });

  it("navegador: Permissions API para estado, y pantalla/bluetooth por uso", () => {
    expect(celda("navegador", "microfono")).toMatchObject({ detecta: "api-estado", pide: "aviso", alInstalar: true });
    expect(celda("navegador", "notificaciones").alAbrir).toBe(true);
    expect(celda("navegador", "pantalla").pide).toBe("por-uso");
    expect(celda("navegador", "bluetooth").pide).toBe("por-uso");
    expect(celda("navegador", "control").pide).toBe("nada");
  });

  it("terminal: hereda lo del sistema y solo la red local y el arranque se pueden tratar", () => {
    expect(celda("terminal", "microfono")).toMatchObject({ detecta: "no-se-puede", pide: "nada" });
    expect(celda("terminal", "red-local").pide).toBe("por-uso");
    expect(celda("terminal", "segundo-plano").alInstalar).toBe(true);
    expect(celda("terminal", "notificaciones").pide).toBe("nada");
  });
});

describe("falta no es lo mismo que denegado a mano", () => {
  it("lee la señal cruda del sistema", () => {
    expect(clasificar("macos", { api: "granted" })).toBe("concedido");
    expect(clasificar("macos", { api: "prompt" })).toBe("falta");
    expect(clasificar("macos", { api: "unsupported" })).toBe("no-aplica");
    expect(clasificar("macos", {})).toBe("no-se-puede-saber");
  });

  it("donde el sistema dice la verdad, `denied` es una decisión de la persona", () => {
    expect(clasificar("macos", { api: "denied" })).toBe("denegado-a-mano");
    expect(clasificar("ios", { api: "denied" })).toBe("denegado-a-mano");
    expect(clasificar("navegador", { api: "denied" })).toBe("denegado-a-mano");
  });

  it("en Android `denied` es el valor por defecto: solo es denegado si ya se preguntó", () => {
    expect(clasificar("android", { api: "denied" })).toBe("falta");
    expect(clasificar("android", { api: "denied", yaPreguntado: true })).toBe("denegado-a-mano");
  });
});

describe("la regla de la lista", () => {
  it("concedido es listo; lo que no aplica no hace nada", () => {
    expect(decidir(celda("macos", "microfono"), "concedido")).toBe("listo");
    expect(decidir(celda("macos", "microfono"), "no-aplica")).toBe("nada");
    expect(decidir(celda("linux", "bluetooth"), "falta")).toBe("nada");
  });

  it("lo que falta se pide o se abre en Ajustes según cómo se dé", () => {
    expect(decidir(celda("macos", "microfono"), "falta")).toBe("pedir");
    expect(decidir(celda("macos", "pantalla"), "falta")).toBe("abrir-ajustes");
    expect(decidir(celda("navegador", "pantalla"), "falta")).toBe("por-uso");
  });

  it("lo denegado a mano NUNCA se vuelve a pedir: la lista lo enseña con Abrir ajustes", () => {
    for (const medio of MEDIOS) {
      for (const fila of listaDe(medio, Object.fromEntries(PERMISOS.map((p) => [p, "denegado-a-mano" as const])))) {
        if (fila.pide === "nada" || fila.pide === "declaracion") expect(fila.accion, `${medio}/${fila.permiso}`).toBe("nada");
        else expect(fila.accion, `${medio}/${fila.permiso}`).toBe("abrir-ajustes");
      }
    }
  });
});

describe("plan al instalar y al abrir", () => {
  it("macOS pide al instalar solo lo útil de ese momento", () => {
    const plan = planDe("macos", {}, "instalar");
    expect(plan.pedir).toEqual(expect.arrayContaining(["microfono", "camara", "notificaciones", "bluetooth"]));
    expect(plan.pedir).not.toContain("pantalla");
    expect(plan.pedir).not.toContain("control");
  });

  it("al abrir pide lo que sigue faltando, sin tocar lo concedido", () => {
    const plan = planDe("macos", { microfono: "concedido", camara: "falta" }, "abrir");
    expect(plan.pedir).not.toContain("microfono");
    expect(plan.pedir).toContain("camara");
  });

  it("lo denegado a mano no entra en el plan automático (no se insiste)", () => {
    const plan = planDe("macos", { microfono: "denegado-a-mano", camara: "denegado-a-mano" }, "instalar");
    expect(plan.pedir).not.toContain("microfono");
    expect(plan.abrirAjustes).not.toContain("microfono");
    expect(plan.pedir).not.toContain("camara");
    expect(plan.abrirAjustes).not.toContain("camara");
  });

  it("los accesos que solo se dan en Ajustes se abren una vez, no se piden por aviso", () => {
    expect(planDe("android", {}, "instalar").abrirAjustes).toEqual(expect.arrayContaining(["segundo-plano", "energia"]));
    expect(planDe("android", {}, "instalar").pedir).not.toContain("segundo-plano");
  });

  it("el plan solo contiene pedir, abrir o por uso: jamás concede nada", () => {
    for (const medio of MEDIOS) {
      const plan = planDe(medio, {}, "instalar");
      expect(plan).toEqual({ pedir: expect.any(Array), abrirAjustes: expect.any(Array), porUso: expect.any(Array) });
      expect(Object.keys(plan).sort()).toEqual(["abrirAjustes", "pedir", "porUso"]);
    }
  });

  it("la lista enseña todos los permisos del medio con su acción", () => {
    const filas = listaDe("navegador", { microfono: "denegado-a-mano", camara: "concedido" });
    expect(filas.length).toBe(celdasDe("navegador").length);
    expect(filas.find((f) => f.permiso === "microfono")!.accion).toBe("abrir-ajustes");
    expect(filas.find((f) => f.permiso === "camara")!.accion).toBe("listo");
  });
});
