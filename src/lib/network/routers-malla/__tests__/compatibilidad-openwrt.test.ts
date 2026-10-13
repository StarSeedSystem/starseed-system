import { describe, it, expect } from "vitest";
import {
  compatibilidad,
  normalizarModelo,
  AVISO_FLASHEO,
  type EntradaTabla,
  type ModeloRouter,
} from "../compatibilidad-openwrt";

const tabla: EntradaTabla[] = [
  {
    fabricante: "TP-Link",
    modelo: "Archer C7",
    versiones: ["v5"],
    target: "ath79/generic",
    perfil: "tplink_archer-c7-v5",
    soportado: true,
  },
  {
    fabricante: "Netgear",
    modelo: "R6700",
    target: "bcm53xx/generic",
    perfil: "netgear_r6700v2",
    soportado: false,
    nota: "flash rota en algunas unidades",
  },
];

const movistar: ModeloRouter = {
  fabricante: "Movistar",
  modelo: "HGU Askey WiFi Router-",
  deOperador: true,
};

describe("normalizarModelo", () => {
  it("pasa a minúsculas, quita espacios dobles, «router», «wifi» y guiones finales", () => {
    expect(normalizarModelo("  HGU   Askey WiFi Router- ")).toBe("hgu askey");
    expect(normalizarModelo("TP-LINK  ARCHER-C7")).toBe("tp link archer c7");
  });
});

describe("compatibilidad", () => {
  it("router soportado: estado, enlace codificado y pasos completos", () => {
    const r = compatibilidad(
      { fabricante: "tp-link", modelo: "archer c7", version: "v5" },
      tabla,
    );
    expect(r.estado).toBe("soportado");
    expect(r.enlace).toBe(
      "https://firmware-selector.openwrt.org/?" +
        "target=ath79%2Fgeneric&id=tplink_archer-c7-v5",
    );
    expect(r.pasos.join("\n")).toContain("copia de seguridad");
    expect(r.pasos.join("\n")).toContain("«factory»");
    expect(r.pasos.join("\n")).toContain("192.168.1.1");
    expect(r.pasos.join("\n")).toContain("«Adoptar»");
    expect(r.aviso).toBe(AVISO_FLASHEO);
  });

  it("versión distinta de la soportada no casa con la entrada", () => {
    const r = compatibilidad(
      { fabricante: "TP-Link", modelo: "Archer C7", version: "v2" },
      tabla,
    );
    expect(r.estado).toBe("desconocido");
  });

  it("router de operador sin entrada: bloqueado con alternativa en modo puente", () => {
    const r = compatibilidad(movistar, tabla);
    expect(r.estado).toBe("bloqueado-operador");
    expect(r.enlace).toBeNull();
    expect(r.pasos.join("\n")).toContain("modo puente");
    expect(r.aviso).toBe(AVISO_FLASHEO);
  });

  it("entrada no soportada con su nota", () => {
    const r = compatibilidad({ fabricante: "Netgear", modelo: "R6700" }, tabla);
    expect(r.estado).toBe("no-soportado");
    expect(r.enlace).toBeNull();
    expect(r.aviso).toBe(AVISO_FLASHEO);
  });

  it("modelo ausente de la tabla: desconocido y sin enlace", () => {
    const r = compatibilidad({ fabricante: "D-Link", modelo: "DIR-615" }, tabla);
    expect(r.estado).toBe("desconocido");
    expect(r.enlace).toBeNull();
    expect(r.aviso).toBe(AVISO_FLASHEO);
  });

  it("entrada soportada con nota la añade a los pasos", () => {
    const conNota: EntradaTabla[] = [{ ...tabla[0], nota: "no v1" }];
    const r = compatibilidad({ fabricante: "TP-Link", modelo: "Archer C7" }, conNota);
    expect(r.pasos[r.pasos.length - 1]).toBe("Aviso de la tabla: no v1");
  });
});
