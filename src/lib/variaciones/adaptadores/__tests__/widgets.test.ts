import { describe, it, expect } from "vitest";
import {
  aplicarWidget, capturarWidget, crearAdaptadorWidget, registrarAdaptadorWidget,
  validarVariacionWidget, type PuertoWidget, type VariacionWidget, type WidgetType,
} from "../widgets";
import { familiasRegistradas, __resetRegistros } from "../../familias";

const CLIMA = "WEATHER_BASIC" as WidgetType; // manifiesto: minW 3 · minH 3
const CAPTURADORA = "CLOCK_DATE" as WidgetType; // manifiesto: minW 2 · minH 2
const motivos = (r: { ok: boolean; motivos?: string[] }) => (r.ok ? "" : (r.motivos ?? []).join(" "));

function puertoFalso(instancias: Partial<Record<WidgetType, Record<string, unknown>>>) {
  const vivas = new Map(Object.entries(instancias));
  const puerto: PuertoWidget = {
    leer: (tipo) => vivas.get(tipo) ?? null,
    guardar: (tipo, opciones) => { vivas.set(tipo, opciones); },
  };
  return { puerto, de: (tipo: WidgetType) => vivas.get(tipo) };
}

describe("widgets · familia widget:<WidgetType>", () => {
  it("capturar: solo opciones visuales y huella, jamás datos personales", () => {
    const { puerto } = puertoFalso({
      [CAPTURADORA]: { opacity: 0.9, blur: 12, notas: "mi cuaderno privado", fecha: "2026-10-28" },
    });
    expect(capturarWidget(puerto, `widget:${CAPTURADORA}`)).toEqual({
      tipo: CAPTURADORA, opciones: { opacity: 0.9, blur: 12 },
    });
    expect(capturarWidget(puerto, "widget:AI_GENERATED")).toBeNull(); // sin instancia viva
    expect(capturarWidget(puerto, "dock:genesis")).toBeNull(); // otra familia
  });

  it("validar: campos justos, opciones de la lista y huella según el manifiesto", () => {
    expect(validarVariacionWidget({ tipo: CLIMA, opciones: { opacity: 0.8, w: 4, h: 4 } }).ok).toBe(true);
    expect(motivos(validarVariacionWidget({ tipo: "NO_EXISTE" as WidgetType, opciones: { blur: 8 } })))
      .toContain("manifiesto");
    expect(motivos(validarVariacionWidget({ tipo: CLIMA, opciones: { notas: "dato personal" } })))
      .toContain("no es una opción visual");
    expect(motivos(validarVariacionWidget({ tipo: CLIMA, opciones: { opacity: 3 } }))).toContain("rango");
    expect(motivos(validarVariacionWidget({ tipo: CLIMA, opciones: { w: 1 } })))
      .toContain("huella «w» debe ir de 3 a");
    expect(motivos(validarVariacionWidget({ tipo: CAPTURADORA, opciones: { w: 2.5 } })))
      .toContain("huella «w» debe ir de 2 a"); // la huella es un número entero de rejilla
    expect(motivos(validarVariacionWidget({ tipo: CLIMA, opciones: {} }))).toContain("no cambia nada");
  });

  it("aplicar: fusiona con la instancia elegida y deshacer restaura el estado previo", () => {
    const { puerto, de } = puertoFalso({ [CLIMA]: { opacity: 1, notas: "privado" } });
    const aplicado = aplicarWidget(puerto, `widget:${CLIMA}`, {
      tipo: CLIMA, opciones: { blur: 8, w: 4, h: 4 },
    });
    expect(de(CLIMA)).toEqual({ opacity: 1, notas: "privado", blur: 8, w: 4, h: 4 });
    expect(capturarWidget(puerto, `widget:${CLIMA}`)).toMatchObject({
      tipo: CLIMA, opciones: { blur: 8, w: 4, h: 4 },
    });
    aplicado(); // aplicarWidget devuelve la deshacer directamente
    expect(de(CLIMA)).toEqual({ opacity: 1, notas: "privado" });
  });

  it("nada se ejecuta sin validar, con clave ajena o sin instancia viva", () => {
    const { puerto, de } = puertoFalso({ [CLIMA]: {} });
    expect(() => aplicarWidget(puerto, `widget:${CLIMA}`, { tipo: CLIMA, opciones: { opacity: 9 } }))
      .toThrow("rechazada");
    expect(() => aplicarWidget(puerto, `widget:${CAPTURADORA}`, { tipo: CLIMA, opciones: { blur: 4 } }))
      .toThrow("no coincide");
    expect(() => aplicarWidget(puerto, `widget:${CAPTURADORA}`, { tipo: CAPTURADORA, opciones: { blur: 4 } }))
      .toThrow("no hay instancia");
    expect(() => aplicarWidget(puerto, "dock:genesis", { tipo: CLIMA, opciones: { blur: 4 } }))
      .toThrow("clave no coincide");
    expect(de(CLIMA)).toEqual({});
  });

  it("el adaptador expone la familia widget con capturar, validar y aplicar", () => {
    __resetRegistros();
    const { puerto } = puertoFalso({ [CLIMA]: { opacity: 0.5 } });
    registrarAdaptadorWidget(puerto);
    expect(familiasRegistradas()).toEqual(["widget"]);
    const adaptador = crearAdaptadorWidget(puerto);
    expect(adaptador.familia).toBe("widget");
    expect(adaptador.capturar("widget:NO_EXISTE" as never)).toBeNull();
    expect(adaptador.validar({ tipo: CLIMA, opciones: { scale: 1.2 } })).toMatchObject({ ok: true });
    const aplicado = adaptador.aplicar(`widget:${CLIMA}`, {
      tipo: CLIMA, opciones: { borderRadius: 21 },
    } as VariacionWidget);
    expect(adaptador.capturar(`widget:${CLIMA}`)).toEqual({ tipo: CLIMA, opciones: { opacity: 0.5, borderRadius: 21 } });
    aplicado.deshacer();
    expect(adaptador.capturar(`widget:${CLIMA}`)).toEqual({ tipo: CLIMA, opciones: { opacity: 0.5 } });
  });
});
