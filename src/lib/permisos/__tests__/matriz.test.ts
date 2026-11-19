import { describe, it, expect } from "vitest";
import { accionPara, clasificarEstado, ficha, fichasDe, medios, permisos, planDePermisos, textoAccion } from "../matriz";

describe("clasificarEstado", () => {
  it("separa falta de denegado a mano", () => {
    expect(clasificarEstado("granted")).toBe("concedido");
    expect(clasificarEstado("denied")).toBe("denegado");
    expect(clasificarEstado("prompt")).toBe("sin-preguntar");
    expect(clasificarEstado("no-concedido")).toBe("no-concedido");
    expect(clasificarEstado("no-aplica")).toBe("no-aplica");
    expect([null, "otro"].map(clasificarEstado)).toEqual(["desconocido", "desconocido"]);
  });
});

describe("matriz por medio", () => {
  it("cubre los diez medios y todos los permisos", () => {
    expect(medios()).toEqual(["macos", "windows", "linux-x11", "linux-wayland", "android", "ios", "web", "navegador", "pwa", "terminal"]);
    expect(permisos()).toEqual(expect.arrayContaining(["microfono", "monitor-entrada", "bateria"]));
  });

  it("cada fila dice cómo se detecta y cómo separar falta de denegación", () => {
    for (const medio of medios()) {
      const filas = fichasDe(medio);
      expect(filas.length, medio).toBeGreaterThan(0);
      for (const f of filas) {
        expect(f.comoDetectar.length, `${medio}/${f.id}`).toBeGreaterThan(0);
        expect(f.comoDistinguir.length, `${medio}/${f.id}`).toBeGreaterThan(0);
        expect(f.titulo.length, `${medio}/${f.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("los medios con enlace directo lo declaran y otros no fingen uno", () => {
    expect(ficha("macos", "microfono")?.ajustes).toContain("Micrófono");
    expect(ficha("windows", "camara")?.ajustes).toContain("Cámara");
    expect(ficha("android", "accesibilidad")?.ajustes).toContain("Accesibilidad");
    expect([ficha("linux-x11", "microfono")?.ajustes, ficha("terminal", "microfono")?.ajustes]).toEqual([null, null]);
    expect(ficha("linux-x11", "pantalla")?.ajustes).toBeNull();
  });
});

describe("acción por permiso", () => {
  it("pide lo que falta y es útil", () => {
    expect(accionPara("macos", "microfono", "sin-preguntar")).toBe("pedir");
    expect(accionPara("android", "notificaciones", "sin-preguntar")).toBe("pedir");
  });

  it("no vuelve a pedir lo denegado a mano: solo ofrece abrir ajustes", () => {
    expect(accionPara("macos", "microfono", "denegado")).toBe("abrir-ajustes");
    expect(accionPara("android", "camara", "denegado")).toBe("abrir-ajustes");
    expect(accionPara("linux-x11", "microfono", "denegado")).toBe("nada");
  });

  it("el aviso único no se repite y el permiso de panel abre ajustes", () => {
    expect(accionPara("macos", "pantalla", "sin-preguntar")).toBe("pedir");
    expect(accionPara("macos", "pantalla", "sin-preguntar", { yaPedidos: ["pantalla"] })).toBe("abrir-ajustes");
    expect(accionPara("android", "instalar", "sin-preguntar")).toBe("abrir-ajustes");
  });

  it("no pide lo inútil, lo que el sistema pregunta al usarlo ni lo que no sabe leer", () => {
    expect(accionPara("macos", "capacidades", "sin-preguntar")).toBe("nada");
    expect(accionPara("navegador", "pantalla", "sin-preguntar")).toBe("por-uso");
    expect(accionPara("linux-wayland", "pantalla", "sin-preguntar")).toBe("por-uso");
  });

  it("lo ya concedido o no aplicable no se toca", () => {
    expect(accionPara("macos", "microfono", "concedido")).toBe("listo");
    expect(accionPara("macos", "microfono", "no-aplica")).toBe("listo");
    expect(accionPara("terminal", "microfono", "sin-preguntar")).toBe("nada");
  });

  it("el texto de la acción es el que ve la persona", () => {
    expect((["pedir", "abrir-ajustes", "por-uso", "nada", "listo"] as const).map(textoAccion)).toEqual(["Pedir permiso", "Abrir ajustes", "Se pedirá al usarlo", "Sin acción", "Listo"]);
  });
});

describe("plan al instalar y al abrir", () => {
  const estado = {
    microfono: "sin-preguntar", camara: "denegado", notificaciones: "concedido",
    bluetooth: "sin-preguntar", pantalla: "sin-preguntar", ubicacion: "desconocido",
  } as const;
  const utiles = ["microfono", "camara", "notificaciones", "bluetooth", "pantalla", "ubicacion"] as const;

  it("al instalar solo pide lo útil que falta y separa lo denegado", () => {
    const plan = planDePermisos("macos", estado, "instalar", { yaPedidos: ["pantalla"], utiles });
    expect(plan.momento).toBe("instalar");
    expect(plan.pedir).toEqual(["bluetooth", "microfono"]);
    expect(plan.ajustes).toContain("camara");
    expect(plan.ajustes).toContain("pantalla");
    expect(plan.sinCambios).toContain("notificaciones");
    expect(plan.esperar).toContain("ubicacion");
  });

  it("al abrir no insiste en lo denegado ni en lo ya pedido", () => {
    const opciones = { yaPedidos: ["pantalla"] as const, utiles };
    const abrir = planDePermisos("macos", estado, "abrir", opciones);
    const instalar = planDePermisos("macos", estado, "instalar", opciones);
    expect({ pedir: abrir.pedir, ajustes: abrir.ajustes, esperar: abrir.esperar, sinCambios: abrir.sinCambios }).toEqual({ pedir: instalar.pedir, ajustes: instalar.ajustes, esperar: instalar.esperar, sinCambios: instalar.sinCambios });
    expect(abrir.ajustes).not.toContain("microfono");
  });

  it("sin estados, los avisos se piden y lo que el sistema pregunta al usarlo espera", () => {
    const plan = planDePermisos("navegador", {}, "abrir");
    expect(plan.pedir).toContain("microfono");
    expect(plan.esperar).toContain("pantalla");
  });

  it("nada concede permisos por la persona", () => {
    for (const medio of medios()) {
      const plan = planDePermisos(medio, {}, "abrir");
      expect(Object.keys(plan).sort()).toEqual(["ajustes", "esperar", "momento", "pedir", "sinCambios"]);
      expect(JSON.stringify(plan)).not.toContain("conceder");
      for (const f of fichasDe(medio)) {
        for (const e of ["sin-preguntar", "denegado", "desconocido"] as const) {
          expect(accionPara(medio, f.id, e)).not.toBe("conceder");
        }
      }
    }
  });
});
