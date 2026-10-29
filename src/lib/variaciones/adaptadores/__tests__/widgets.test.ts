import { describe, it, expect, beforeEach } from "vitest";
import {
  crearAdaptadorWidgets, normalizarTipo, registrarAdaptadorWidgets, validarPayloadWidget,
  type InstanciaWidget, type PayloadWidget, type PuertoWidgets,
} from "../widgets";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

const CLAVE = "widget:clock-date";
const motivos = (r: { ok: boolean; motivos?: string[] }) => (r.ok ? "" : (r.motivos ?? []).join(" "));

/** Instancia real de ejemplo: ajustes visuales, huella en el layout y tamaño S/M/L/XL. */
const instancia = (extra: Partial<InstanciaWidget> = {}): InstanciaWidget => ({
  id: "w1", widget_type: "CLOCK_DATE",
  settings: { formato24h: true, mostrarSegundos: false },
  layout: { w: 3, h: 3, x: 0, y: 0, i: "w1" },
  size: "M", ...extra,
});

/** Dashboard falso: presta la instancia y graba lo que el adaptador escribe sobre ella. */
function tableroFalso(inicial: InstanciaWidget | null): { puerto: PuertoWidgets; escrita(): InstanciaWidget | null } {
  let actual = inicial;
  return {
    puerto: {
      instanciaDe: (tipo) => (actual !== null && actual.widget_type === tipo ? actual : null),
      escribir: (_id, cambios) => {
        if (actual === null) return;
        actual = {
          ...actual,
          settings: cambios.ajustes ?? actual.settings,
          layout: cambios.huella ? { ...actual.layout, w: cambios.huella.w, h: cambios.huella.h } : actual.layout,
          size: cambios.tamano ?? actual.size,
        };
      },
    },
    escrita: () => actual,
  };
}

const payload = (extra: Partial<PayloadWidget> = {}): PayloadWidget => ({
  tipo: "CLOCK_DATE", ajustes: { formato24h: false }, ...extra,
});

beforeEach(() => {
  __resetRegistros();
});

describe("adaptador de widgets del Dashboard", () => {
  it("normaliza ids con guiones a los del manifiesto y suelta los ajenos", () => {
    expect(normalizarTipo("clock-date")).toBe("CLOCK_DATE");
    expect(normalizarTipo("widget-inexistente")).toBeNull();
  });

  it("valida ajustes, huella y tamaño dentro de los límites del manifiesto", () => {
    expect(validarPayloadWidget(payload()).ok).toBe(true);
    expect(validarPayloadWidget(payload({ huella: { w: 2, h: 2 }, tamano: "XL" })).ok).toBe(true);
  });

  it("rechaza campos ajenos, tipos fuera del catálogo y datos personales", () => {
    const campos = { tipo: "CLOCK_DATE", ajustes: { formato24h: true }, posicion: { x: 1, y: 2 } };
    expect(motivos(validarPayloadWidget(campos))).toContain("no es un campo");
    expect(motivos(validarPayloadWidget({ tipo: "no-existe", ajustes: {} }))).toContain("catálogo");
    expect(motivos(validarPayloadWidget(payload({ ajustes: { notas: [1, 2] } })))).toContain("Privacidad");
    expect(motivos(validarPayloadWidget(payload({ ajustes: { texto: "hola" } })))).toContain("Privacidad");
  });

  it("exige la huella dentro de los mínimos de getSizeConstraints y algún cambio", () => {
    expect(motivos(validarPayloadWidget(payload({ huella: { w: 1, h: 3 } })))).toContain("mínimo es 2×2");
    expect(motivos(validarPayloadWidget(payload({ huella: { w: 1.5, h: 3 } })))).toContain("celdas enteras");
    expect(motivos(validarPayloadWidget({ tipo: "CLOCK_DATE", ajustes: { formato24h: false }, huella: { w: 2 } }))).toContain("w y h numéricos");
    expect(motivos(validarPayloadWidget({ tipo: "CLOCK_DATE", ajustes: { formato24h: false }, tamano: "XXL" }))).toContain("S, M, L o XL");
    expect(motivos(validarPayloadWidget(payload({ ajustes: {} })))).toContain("no trae ningún cambio");
  });

  it("captura la configuración visual, la huella y el tamaño; nunca datos personales ni la posición", () => {
    const { puerto, escrita } = tableroFalso(instancia());
    expect(crearAdaptadorWidgets(puerto).capturar(CLAVE)).toEqual({
      tipo: "CLOCK_DATE", ajustes: { formato24h: true, mostrarSegundos: false }, huella: { w: 3, h: 3 }, tamano: "M",
    });
    const filtro = crearAdaptadorWidgets(
      tableroFalso(instancia({ settings: { formato24h: true, notas: "mis notas privadas", tareas: ["privadas"] } })).puerto,
    );
    expect(filtro.capturar(CLAVE)?.ajustes).toEqual({ formato24h: true });
    expect(escrita()).toEqual(instancia());
    expect(crearAdaptadorWidgets(puerto).capturar("widget:no-existe")).toBeNull();
    expect(crearAdaptadorWidgets(puerto).capturar("tema:synthwave-horizon")).toBeNull();
  });

  it("aplica fusionando los ajustes con los de la instancia y deshacer restaura todo", () => {
    const { puerto, escrita } = tableroFalso(instancia());
    const adaptador = crearAdaptadorWidgets(puerto);
    const { deshacer } = adaptador.aplicar(
      CLAVE,
      payload({ huella: { w: 2, h: 2 }, tamano: "XL" }),
    );
    expect(escrita()?.settings).toEqual({ formato24h: false, mostrarSegundos: false });
    expect(escrita()?.layout).toMatchObject({ w: 2, h: 2 });
    expect(escrita()?.size).toBe("XL");
    deshacer();
    expect(escrita()).toEqual(instancia());
  });

  it("no ejecuta nada sin validar ni sobre un elemento ausente o ajeno", () => {
    const { puerto, escrita } = tableroFalso(instancia());
    const adaptador = crearAdaptadorWidgets(puerto);
    expect(() => adaptador.aplicar(CLAVE, payload({ ajustes: { notas: [1] } }))).toThrow("rechazada");
    expect(() => adaptador.aplicar("widget:notifications", { tipo: "CLOCK_DATE", ajustes: { formato24h: false } })).toThrow("no coincide");
    expect(() => adaptador.aplicar("widget:notifications", { tipo: "NOTIFICATIONS", ajustes: { sonido: true } })).toThrow("ninguna instancia");
    expect(escrita()).toEqual(instancia());
  });

  it("registra la familia widget en el registro compartido", () => {
    const { puerto } = tableroFalso(instancia());
    registrarAdaptadorWidgets(puerto);
    expect(familiasRegistradas()).toEqual(["widget"]);
    expect(adaptadorDe(CLAVE)?.familia).toBe("widget");
    expect(adaptadorDe("tema:synthwave-horizon")).toBeNull();
  });
});
