import { describe, it, expect } from "vitest";
import {
  RUTA_AJUSTES,
  crearAdaptadorAjustes,
  esClaveAjustePermitida,
  fusionarConfigMausbot,
  idDeAjuste,
  sanearParcheMausbot,
  validarParcheAjustes,
  type AlmacenPreferencias,
} from "../ajustes";

/** Almacenamiento en memoria para las pruebas: sin disco, sin DOM. */
function almacenFalso(): AlmacenPreferencias & { tiene(clave: string): boolean } {
  const datos = new Map<string, string>();
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => { datos.set(clave, valor); },
    removeItem: (clave) => { datos.delete(clave); },
    tiene: (clave) => datos.has(clave),
  };
}

/** Guardado en la cuenta inyectado que cuenta sus llamadas (nunca lanza). */
function guardadoFalso() {
  let llamadas = 0;
  return {
    get llamadas() { return llamadas; },
    pushPreferences: async () => { llamadas += 1; return { ok: true, message: "ok" }; },
  };
}

const CONFIG_BASE = {
  v: 1, encendido: true, modo: "cursor", disenoPorDefecto: "fabrica-blob",
  porPersonalidad: { aurora: "fabrica-star" }, actuar: "aplicar",
  perfiles: { p1: { modo: "ambos" } }, neuronas: { n1: { encendido: false } },
};
describe("ajustes · Mausbot como variación pública", () => {
  it("registra mausbot y mausbot-disenos como ajustes compartibles", () => {
    expect(RUTA_AJUSTES.mausbot).toBe("starseed.mausbot.v1");
    expect(RUTA_AJUSTES["mausbot-disenos"]).toBe("starseed.mausbot.disenos.v1");
    expect(idDeAjuste("ajuste:mausbot")).toBe("mausbot");
    expect(idDeAjuste("ajuste:mausbot-disenos")).toBe("mausbot-disenos");
    expect(esClaveAjustePermitida("starseed.mausbot.v1")).toBe(true);
    expect(esClaveAjustePermitida("starseed.mausbot.disenos.v1")).toBe(true);
  });

  it("sanea el parche: sin perfiles ni neuronas y actuar como mucho «proponer»", () => {
    expect(sanearParcheMausbot({ actuar: "aplicar", perfiles: { p: {} }, neuronas: { n: {} }, modo: "ambos" }))
      .toEqual({ actuar: "proponer", modo: "ambos" });
    expect(sanearParcheMausbot({ actuar: "aplicar-bajo" })).toEqual({ actuar: "proponer" });
    expect(sanearParcheMausbot({ actuar: "nada" })).toEqual({ actuar: "nada" });
    // Lo que no es un objeto plano pasa tal cual: sanealo solo tiene sentido en un parche.
    expect(sanearParcheMausbot(["perfiles"])).toEqual(["perfiles"]);
    expect(sanearParcheMausbot("mausbot")).toBe("mausbot");
    const r = validarParcheAjustes({ mausbot: { actuar: "aplicar", perfiles: { p: { encendido: false } }, neuronas: { n: {} } } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parche.mausbot).toEqual({ actuar: "proponer" });
  });

  it("al aplicar conserva v, perfiles y neuronas locales y acota actuar a «proponer»", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    almacen.setItem(RUTA_AJUSTES.mausbot, JSON.stringify(CONFIG_BASE));
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    adaptador.aplicar("ajuste:mausbot", { mausbot: {
      actuar: "aplicar", disenoPorDefecto: "fabrica-hexagon", modo: "ambos",
      perfiles: { intruso: { encendido: true } }, neuronas: { intrusa: { encendido: true } },
    } });
    const guardada = JSON.parse(almacen.getItem(RUTA_AJUSTES.mausbot) ?? "null") as typeof CONFIG_BASE;
    expect(guardada.v).toBe(1);
    expect(guardada.disenoPorDefecto).toBe("fabrica-hexagon");
    expect(guardada.modo).toBe("ambos");
    expect(guardada.actuar).toBe("proponer");
    expect(guardada.perfiles).toEqual(CONFIG_BASE.perfiles);
    expect(guardada.neuronas).toEqual(CONFIG_BASE.neuronas);
    expect(guardado.llamadas).toBe(1);
  });

  it("deshacer devuelve la config del Mausbot que había antes", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    almacen.setItem(RUTA_AJUSTES.mausbot, JSON.stringify(CONFIG_BASE));
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    adaptador.aplicar("ajuste:mausbot", { mausbot: { modo: "ambos" } }).deshacer();
    expect(almacen.getItem(RUTA_AJUSTES.mausbot)).toBe(JSON.stringify(CONFIG_BASE));
    expect(guardado.llamadas).toBe(2);
  });

  it("captura el Mausbot sin perfiles ni neuronas y con actuar acotado", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    almacen.setItem(RUTA_AJUSTES.mausbot, JSON.stringify(CONFIG_BASE));
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    expect(adaptador.capturar("ajuste:mausbot")).toEqual({ mausbot: {
      v: 1, encendido: true, modo: "cursor", disenoPorDefecto: "fabrica-blob",
      porPersonalidad: { aurora: "fabrica-star" }, actuar: "proponer",
    } });
  });

  it("fusionarConfigMausbot parte de la fábrica si lo guardado está roto", () => {
    const r = fusionarConfigMausbot("esto no es json", { modo: "ambos" });
    expect([r.v, r.modo, r.actuar]).toEqual([1, "ambos", "proponer"]);
    expect([r.perfiles, r.neuronas]).toEqual([{}, {}]);
  });

  it("aplica, captura y deshace el catálogo de diseños del Mausbot", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    const disenos = [{
      id: "propio-1", nombre: "Mi Mausbot", cuerpo: "cursor", gradiente: ["#ffffff", "#000000", "#111111"],
      cara: { ojos: true, boca: true, mirada: true }, tamano: 1, origen: "variacion",
    }];
    const aplicado = adaptador.aplicar("ajuste:mausbot-disenos", { "mausbot-disenos": disenos });
    expect(JSON.parse(almacen.getItem(RUTA_AJUSTES["mausbot-disenos"]) ?? "null")).toEqual(disenos);
    expect(adaptador.capturar("ajuste:mausbot-disenos")).toEqual({ "mausbot-disenos": disenos });
    aplicado.deshacer();
    expect(almacen.tiene(RUTA_AJUSTES["mausbot-disenos"])).toBe(false);
    expect(guardado.llamadas).toBe(2);
  });
});
