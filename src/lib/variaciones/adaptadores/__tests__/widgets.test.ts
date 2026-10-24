import { describe, it, expect } from "vitest";
import {
  ajustesPublicos, crearAdaptadorWidget, disenoDeWidget, estaEnLimites, huellaDe,
  registrarAdaptadoresWidget, tipoDeClave, validarParcheWidget,
  type InstanciaWidget, type PuertoWidgets,
} from "../widgets";
import { __resetRegistros, adaptadorDe, familiasRegistradas } from "../../familias";

const instancia = (id: string, ajustes: Record<string, unknown>, size?: "S" | "M" | "L" | "XL"): InstanciaWidget =>
  ({ id, ajustes, ...(size ? { size } : {}) });

function puertoFalso(inicial: InstanciaWidget[]): { puerto: PuertoWidgets; guardadas(): InstanciaWidget[] } {
  let guardadas = inicial.map((i) => ({ ...i }));
  return {
    puerto: {
      elegida: (tipo) => guardadas.find((i) => i.id === tipo) ?? null,
      escribir: (id, fusion) => {
        const it = guardadas.find((i) => i.id === id);
        if (!it) return;
        it.ajustes = fusion.ajustes;
        it.size = fusion.size ?? undefined;
      },
    },
    guardadas: () => guardadas,
  };
}

const motivos = (raw: unknown): string => {
  const r = validarParcheWidget(raw);
  return r.ok ? "" : r.motivos.join(" · ");
};

describe("adaptadores · familia widget del Dashboard", () => {
  it("la clave nombra el tipo de widget, no una instancia", () => {
    expect(tipoDeClave("widget:CLOCK_DATE")).toBe("CLOCK_DATE");
    expect(tipoDeClave("widget:PROTOMOLECULA")).toBe("PROTOMOLECULA");
    expect(tipoDeClave("widget:NO_EXISTE")).toBeNull();
    expect(tipoDeClave("fondo:aurora")).toBeNull();
    expect(tipoDeClave("widget:")).toBeNull();
  });

  it("validar: acepta ajustes planos con talla y rechaza lo que no es configuración", () => {
    expect(validarParcheWidget({ ajustes: { digital: true } }).ok).toBe(true);
    expect(validarParcheWidget({ ajustes: { digital: true }, size: "M" }).ok).toBe(true);
    expect(motivos({ ajustes: { digital: true }, size: "XXXL" })).toContain("talla");
    expect(motivos({ ajustes: { digital: true }, ruta: "/ajena" })).toContain("no es un campo");
    expect(motivos({ ajustes: {} })).toContain("no cambia nada");
    expect(motivos({ ajustes: "no" })).toContain("objeto de configuración");
  });

  it("privacidad y estética: sin datos personales y sin hexadecimales sueltos", () => {
    expect(motivos({ ajustes: { notas: "comprar pan" } })).toContain("datos personales");
    expect(motivos({ ajustes: { ciudad: "Madrid" } })).toContain("datos personales");
    expect(motivos({ ajustes: { acento: "#FF5050" } })).toContain("token del OS");
    expect(motivos({ ajustes: { sombra: { color: "#784BA0" } } })).toContain("token del OS");
    expect(motivos({ ajustes: { proc: () => 1 } })).toContain("no serializable"); // no es JSON plano
    expect(ajustesPublicos({ digital: true, notas: "comprar pan", ciudad: "Madrid" })).toEqual({ digital: true });
  });

  it("capturar: toma solo la configuración de la instancia y su talla", () => {
    const { puerto } = puertoFalso([instancia("CLOCK_DATE", { digital: true, notas: "comprar pan" }, "S")]);
    const adaptador = crearAdaptadorWidget(puerto);
    expect(adaptador.capturar("widget:CLOCK_DATE")).toEqual({ ajustes: { digital: true }, size: "S" });
    expect(adaptador.capturar("widget:NO_EXISTE")).toBeNull();
    expect(crearAdaptadorWidget(puertoFalso([]).puerto).capturar("widget:CLOCK_DATE")).toBeNull();
  });

  it("aplicar: fusiona los ajustes con la instancia elegida y deshacer restaura", () => {
    const { puerto, guardadas } = puertoFalso([instancia("CLOCK_DATE", { digital: true, flip: 1 }, "S")]);
    const adaptador = crearAdaptadorWidget(puerto);
    const aplicado = adaptador.aplicar("widget:CLOCK_DATE", { ajustes: { flip: 2, opacidad: 0.6 }, size: "M" });
    expect(guardadas()[0]).toEqual({ id: "CLOCK_DATE", ajustes: { digital: true, flip: 2, opacidad: 0.6 }, size: "M" });
    aplicado.deshacer();
    expect(guardadas()[0]).toEqual({ id: "CLOCK_DATE", ajustes: { digital: true, flip: 1 }, size: "S" });
  });

  it("aplicar: nada corre sin validar ni sin instancia", () => {
    const { puerto } = puertoFalso([instancia("CLOCK_DATE", { digital: true, flip: 1 })]);
    const adaptador = crearAdaptadorWidget(puerto);
    expect(() => adaptador.aplicar("widget:CLOCK_DATE", { ajustes: { notas: "comprar pan" } })).toThrow("rechazada");
    expect(() => adaptador.aplicar("widget:NO_EXISTE", { ajustes: { digital: true } })).toThrow("tipo de widget");
    expect(() => crearAdaptadorWidget(puertoFalso([]).puerto).aplicar("widget:CLOCK_DATE", { ajustes: { digital: true } }))
      .toThrow("no hay instancia");
  });

  it("el footprint respeta getSizeConstraints del manifiesto", () => {
    expect(estaEnLimites("CLOCK_DATE", 2, 2)).toBe(true);
    expect(estaEnLimites("CLOCK_DATE", 1, 2)).toBe(false);
    expect(estaEnLimites("CLOCK_DATE", 12, 6)).toBe(true);
    expect(huellaDe("WEATHER_SPACE_KP", "S")).toEqual({ w: 3, h: 3 });
    expect(huellaDe("AGORA_CAUSAL", "S")).toEqual({ w: 3, h: 4 });
  });

  it("la variación capturada se convierte en DesignFile publicable (skin de widget)", () => {
    const diseno = disenoDeWidget("CLOCK_DATE", { ajustes: { digital: true }, size: "M" });
    expect(diseno.tipo).toBe("skin-widget");
    expect(diseno.categoria).toBe("skins");
    expect(diseno.nombre).toBe("Skin de Reloj y Fecha");
    expect(diseno.payload.override).toMatchObject({ tipo: "CLOCK_DATE", ajustes: { digital: true }, size: "M" });
  });

  it("registra la familia widget en el registro compartido y responde por la clave", () => {
    __resetRegistros();
    const { puerto } = puertoFalso([instancia("CLOCK_DATE", { digital: true })]);
    registrarAdaptadoresWidget(puerto);
    expect(familiasRegistradas()).toEqual(["widget"]);
    expect(adaptadorDe("widget:CLOCK_DATE")?.validar({ ajustes: { digital: true } }).ok).toBe(true);
  });
});
