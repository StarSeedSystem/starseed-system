import { describe, expect, it } from "vitest";
import { SUPERFICIE_INICIAL as I, reducirSuperficie, type Superficie } from "../maquina";
import { eventosParaVista } from "../sincronizar";
import { estadoDeFase, tipoDeDirecta } from "../adaptador-directa";

const aplicar = (s: Superficie, v: Parameters<typeof eventosParaVista>[1], ahora: number) => eventosParaVista(s, v, ahora).reduce(reducirSuperficie, s);
const vista = (estado: Parameters<typeof eventosParaVista>[1]["estado"], tipo: "voz" | "video" = "voz", fin: Parameters<typeof eventosParaVista>[1]["fin"] = null) => ({ estado, tipo, fin, medioUsado: "red local" });

describe("sincronizar con el motor (LLA1108C)", () => {
  it("ciclo completo de una llamada recibida", () => {
    let s = aplicar(I, vista("entrante"), 1);
    expect(s.estado).toBe("entrante");
    s = aplicar(s, vista("conectada"), 1000);
    expect(s.estado).toBe("conectada");
    s = aplicar(s, vista("terminada"), 6000);
    expect(s).toMatchObject({ estado: "terminada", duracionMs: 5000, medioUsado: "red local", fin: "colgada" });
    // el motor vuelve a reposo: el resumen se queda
    expect(aplicar(s, vista("inactiva"), 7000).estado).toBe("terminada");
  });
  it("sin contestar queda como perdida; rechazada conserva su fin", () => {
    const s = aplicar(aplicar(I, vista("entrante"), 1), vista("terminada"), 2);
    expect(s.fin).toBe("perdida");
    expect(aplicar(aplicar(I, vista("saliente"), 1), vista("terminada", "voz", "rechazada"), 2).fin).toBe("rechazada");
  });
  it("cambio de tipo que anuncia el motor", () => {
    const c = aplicar(aplicar(I, vista("saliente"), 1), vista("conectada"), 2);
    expect(aplicar(c, vista("conectada", "video"), 3).tipo).toBe("video");
  });
  it("una llamada nueva tras un resumen lo reemplaza", () => {
    const t = aplicar(aplicar(aplicar(I, vista("saliente"), 1), vista("conectada"), 2), vista("terminada"), 3);
    expect(aplicar(t, vista("entrante", "video"), 4)).toMatchObject({ estado: "entrante", tipo: "video" });
  });
  it("adaptador de la llamada directa", () => {
    expect(estadoDeFase("en-curso")).toBe("conectada");
    expect(estadoDeFase("llamando")).toBe("saliente");
    expect(tipoDeDirecta({ video: true, pantalla: false })).toBe("video");
    expect(tipoDeDirecta({ video: true, pantalla: true })).toBe("pantalla");
  });
});
