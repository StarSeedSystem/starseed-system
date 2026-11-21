import { describe, it, expect } from "vitest";
import {
  celdaDe,
  permisosDe,
  mediosDe,
  estadoDesdeLectura,
  estadoInicial,
  decidir,
  planDeApertura,
  aPedir,
  aAjustes,
} from "../matriz";

describe("matriz · celdas por medio", () => {
  it("devuelve no-aplica para un permiso que el medio no pide", () => {
    expect(celdaDe("terminal", "microfono")).toEqual({
      deteccion: "no-aplica",
      solicitud: "nada",
      ajustes: false,
    });
    expect(celdaDe("navegador", "accesibilidad").solicitud).toBe("nada");
  });

  it("enumera los permisos de un medio y los medios de un permiso", () => {
    expect(permisosDe("macos")).toContain("accesibilidad");
    expect(permisosDe("terminal")).toEqual([]);
    expect(mediosDe("microfono")).toEqual(
      expect.arrayContaining(["macos", "android", "linux", "windows", "ios", "navegador"]),
    );
    expect(mediosDe("microfono")).not.toContain("terminal");
  });

  it("estadoInicial distingue por uso, ilegible y sin soporte", () => {
    expect(estadoInicial(celdaDe("macos", "ubicacion"))).toBe("por-uso");
    expect(estadoInicial(celdaDe("macos", "accesibilidad"))).toBe("desconocido");
    expect(estadoInicial(celdaDe("macos", "microfono"))).toBe("falta");
    expect(estadoInicial(celdaDe("terminal", "microfono"))).toBe("no-aplica");
  });
});

describe("estadoDesdeLectura · falta frente a denegado a mano", () => {
  it("sin soporte es no-disponible; un permiso ajeno es no-aplica", () => {
    expect(estadoDesdeLectura("macos", "microfono", { soportado: false, concedido: false })).toBe(
      "no-disponible",
    );
    expect(estadoDesdeLectura("terminal", "microfono", { soportado: false, concedido: false })).toBe(
      "no-aplica",
    );
  });

  it("concedido manda sobre todo", () => {
    expect(
      estadoDesdeLectura("macos", "accesibilidad", { soportado: true, concedido: true }),
    ).toBe("concedido");
  });

  it("solo es denegado-a-mano con evidencia del sistema o de una concesión previa", () => {
    expect(
      estadoDesdeLectura("macos", "microfono", {
        soportado: true,
        concedido: false,
        diceDenegado: true,
      }),
    ).toBe("denegado-a-mano");
    expect(
      estadoDesdeLectura("macos", "microfono", {
        soportado: true,
        concedido: false,
        antesConcedido: true,
      }),
    ).toBe("denegado-a-mano");
  });

  it("lo ilegible sin evidencia es desconocido, nunca denegado por sospecha", () => {
    expect(estadoDesdeLectura("macos", "accesibilidad", { soportado: true, concedido: false })).toBe(
      "desconocido",
    );
    expect(
      estadoDesdeLectura("macos", "red-local", {
        soportado: true,
        concedido: false,
        ilegible: true,
      }),
    ).toBe("desconocido");
  });

  it("los permisos por uso no se leen como falta", () => {
    expect(estadoDesdeLectura("macos", "ubicacion", { soportado: true, concedido: false })).toBe(
      "por-uso",
    );
    expect(estadoDesdeLectura("navegador", "ubicacion", { soportado: true, concedido: false })).toBe(
      "por-uso",
    );
  });

  it("sin lectura previa, lo que el medio puede preguntar es falta", () => {
    expect(estadoDesdeLectura("macos", "microfono", { soportado: true, concedido: false })).toBe(
      "falta",
    );
  });
});

describe("decidir · la regla de la tarea", () => {
  it("concedido es listo; lo que no aplica no hace nada", () => {
    expect(decidir(celdaDe("macos", "microfono"), "concedido")).toBe("listo");
    expect(decidir(celdaDe("terminal", "microfono"), "no-aplica")).toBe("nada");
  });

  it("lo denegado a mano no se vuelve a pedir: se ofrece Abrir ajustes si existe", () => {
    expect(decidir(celdaDe("macos", "microfono"), "denegado-a-mano")).toBe("abrir-ajustes");
    expect(decidir(celdaDe("navegador", "bluetooth"), "denegado-a-mano")).toBe("nada");
  });

  it("lo que falta se pide al abrir; lo que exige panel abre ajustes", () => {
    expect(decidir(celdaDe("macos", "microfono"), "falta", "abrir")).toBe("pedir");
    expect(decidir(celdaDe("macos", "pantalla"), "falta", "abrir")).toBe("abrir-ajustes");
    expect(decidir(celdaDe("linux", "microfono"), "desconocido", "abrir")).toBe("por-uso");
  });

  it("lo por uso espera al gesto; en el uso se pide", () => {
    expect(decidir(celdaDe("macos", "ubicacion"), "por-uso", "abrir")).toBe("por-uso");
    expect(decidir(celdaDe("macos", "ubicacion"), "por-uso", "uso")).toBe("pedir");
  });

  it("lo declarado o sin permiso no se pide nunca", () => {
    expect(decidir(celdaDe("linux", "segundo-plano"), "falta")).toBe("nada");
    expect(decidir(celdaDe("macos", "energia"), "desconocido")).toBe("nada");
  });
});

describe("planDeApertura · instalar y abrir", () => {
  it("en macOS pide lo útil que falta y no lo que es por uso o panel", () => {
    const plan = planDeApertura("macos");
    const pedir = aPedir(plan);
    expect(pedir).toEqual(
      expect.arrayContaining([
        "microfono",
        "camara",
        "bluetooth",
        "red-local",
        "notificaciones",
        "segundo-plano",
      ]),
    );
    expect(pedir).not.toContain("ubicacion");
    expect(pedir).not.toContain("archivos");
    expect(aAjustes(plan)).toEqual(
      expect.arrayContaining(["pantalla", "accesibilidad", "entrada-virtual"]),
    );
  });

  it("si la persona ya lo negó a mano, se enseña pero no se pide solo", () => {
    const plan = planDeApertura("macos", { microfono: "denegado-a-mano" });
    expect(aPedir(plan)).not.toContain("microfono");
    expect(aAjustes(plan)).toContain("microfono");
  });

  it("el mismo plan sirve al instalar y al abrir, sin insistir en lo denegado", () => {
    const estados = { camara: "denegado-a-mano" as const };
    const alInstalar = aPedir(planDeApertura("macos", estados, "instalar"));
    const alAbrir = aPedir(planDeApertura("macos", estados, "abrir"));
    expect(alInstalar).not.toContain("camara");
    expect(alAbrir).not.toContain("camara");
    expect(alInstalar).toEqual(alAbrir);
  });

  it("el terminal no pide nada: sus permisos son del sistema", () => {
    expect(planDeApertura("terminal")).toEqual([]);
  });
});
