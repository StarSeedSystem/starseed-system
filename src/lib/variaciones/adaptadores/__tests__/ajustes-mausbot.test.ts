import { describe, it, expect } from "vitest";
import {
  NIVEL_ACTUAR_MAXIMO_MAUSBOT,
  RUTA_AJUSTES,
  crearAdaptadorAjustes,
  esClaveAjustePermitida,
  idDeAjuste,
  sanearValorMausbot,
  validarParcheAjustes,
  type AlmacenPreferencias,
} from "../ajustes";

/** Almacenamiento en memoria para las pruebas: sin disco, sin DOM. */
function almacenFalso(): AlmacenPreferencias {
  const datos = new Map<string, string>();
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => { datos.set(clave, valor); },
    removeItem: (clave) => { datos.delete(clave); },
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

const CONFIG_CON_PERFILES = {
  v: 1,
  encendido: true,
  modo: "cursor",
  disenoPorDefecto: "fabrica-cursor",
  porPersonalidad: { aurora: "fabrica-blob" },
  actuar: "aplicar",
  perfiles: { trabajo: { actuar: "aplicar", modo: "ambos" } },
  neuronas: { "neurona-1": { encendido: false } },
};

const DISENO_PROPIO = {
  id: "propio-uno",
  nombre: "Mi cursor",
  cuerpo: "blob",
  gradiente: ["#9FE6B5", "#3FAE6E", "#1C7A4C"],
  cara: { ojos: true, boca: true, mirada: true },
  tamano: 1,
  origen: "protomolecula",
};

describe("ajustes · variaciones del Mausbot", () => {
  it("mapea mausbot y mausbot-disenos a sus claves sincronizadas permitidas", () => {
    expect(RUTA_AJUSTES.mausbot).toBe("starseed.mausbot.v1");
    expect(RUTA_AJUSTES["mausbot-disenos"]).toBe("starseed.mausbot.disenos.v1");
    for (const id of ["mausbot", "mausbot-disenos"]) {
      expect(esClaveAjustePermitida(RUTA_AJUSTES[id]), id).toBe(true);
      expect(idDeAjuste(`ajuste:${id}`), id).toBe(id);
    }
  });

  it("sanea el valor: sin perfiles ni neuronas y actuar nunca por encima de proponer", () => {
    const saneado = sanearValorMausbot("mausbot", CONFIG_CON_PERFILES) as Record<string, unknown>;
    expect(saneado).not.toHaveProperty("perfiles");
    expect(saneado).not.toHaveProperty("neuronas");
    expect(saneado.actuar).toBe(NIVEL_ACTUAR_MAXIMO_MAUSBOT);
    expect(saneado.porPersonalidad).toEqual({ aurora: "fabrica-blob" });
    expect(sanearValorMausbot("mausbot", { actuar: "nada" })).toEqual({ actuar: "nada" });
    expect(sanearValorMausbot("mausbot", { actuar: "proponer" })).toEqual({ actuar: "proponer" });
    expect(sanearValorMausbot("mausbot", { actuar: "desconocido" })).toEqual({ actuar: "proponer" });
    expect(sanearValorMausbot("rendimiento", { perfiles: {} })).toEqual({ perfiles: {} });
    expect(sanearValorMausbot("mausbot", ["perfiles"])).toEqual(["perfiles"]);
  });

  it("valida el parche ya saneado, sin perfiles ni neuronas y con actuar acotado", () => {
    const valido = validarParcheAjustes({ mausbot: CONFIG_CON_PERFILES, "mausbot-disenos": [DISENO_PROPIO] });
    expect(valido.ok).toBe(true);
    if (!valido.ok) return;
    const config = valido.parche.mausbot as Record<string, unknown>;
    expect(config).not.toHaveProperty("perfiles");
    expect(config).not.toHaveProperty("neuronas");
    expect(config.actuar).toBe("proponer");
    expect(valido.parche["mausbot-disenos"]).toEqual([DISENO_PROPIO]);
  });

  it("aplica una variación del Mausbot sin copiar perfiles ni neuronas y con actuar acotado", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    adaptador.aplicar("ajuste:mausbot", { mausbot: CONFIG_CON_PERFILES });
    const escrito = JSON.parse(almacen.getItem("starseed.mausbot.v1") ?? "null") as Record<string, unknown>;
    expect(escrito).not.toHaveProperty("perfiles");
    expect(escrito).not.toHaveProperty("neuronas");
    expect(escrito.actuar).toBe("proponer");
    expect(escrito.modo).toBe("cursor");
    expect(guardado.llamadas).toBe(1);
  });

  it("aplica y deshace una variación de diseños propios del Mausbot", () => {
    const almacen = almacenFalso();
    const guardado = guardadoFalso();
    almacen.setItem("starseed.mausbot.disenos.v1", JSON.stringify([{ ...DISENO_PROPIO, id: "previo" }]));
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardado.pushPreferences, almacen });
    const aplicado = adaptador.aplicar("ajuste:mausbot-disenos", { "mausbot-disenos": [DISENO_PROPIO] });
    expect(JSON.parse(almacen.getItem("starseed.mausbot.disenos.v1") ?? "[]")).toEqual([DISENO_PROPIO]);
    aplicado.deshacer();
    expect(JSON.parse(almacen.getItem("starseed.mausbot.disenos.v1") ?? "[]")).toEqual([{ ...DISENO_PROPIO, id: "previo" }]);
  });

  it("captura la config del Mausbot ya saneada desde el almacen inyectado", () => {
    const almacen = almacenFalso();
    almacen.setItem("starseed.mausbot.v1", JSON.stringify(CONFIG_CON_PERFILES));
    const adaptador = crearAdaptadorAjustes({ pushPreferences: guardadoFalso().pushPreferences, almacen });
    const capturado = adaptador.capturar("ajuste:mausbot") as { mausbot: Record<string, unknown> };
    expect(capturado.mausbot).not.toHaveProperty("perfiles");
    expect(capturado.mausbot).not.toHaveProperty("neuronas");
    expect(capturado.mausbot.actuar).toBe("proponer");
  });
});
