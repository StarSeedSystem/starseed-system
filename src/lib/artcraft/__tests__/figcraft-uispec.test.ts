/** Pruebas de FigCraft → UiSpec (§4.4) y variables → tokens. Solo funciones puras. */
import { describe, expect, it } from "vitest";
import { figcraftAUiSpec, normalizarNodo } from "../figcraft-uispec";
import { aHex, contrasteWcag, luminancia, tokensDesdeVariables } from "../figcraft-tokens";
import { validarUiSpec } from "../../nucleo/ui-spec";

type Crudo = Record<string, unknown>;
const nodo = (name: string, extra: Crudo = {}): Crudo => ({ name, type: "FRAME", ...extra });
const doc = (children: unknown[]): Crudo => ({ name: "Documento", type: "DOCUMENT", children });
const avisos = (r: ReturnType<typeof figcraftAUiSpec>): string => r.informe.avisos.join(" | ");

describe("figcraftAUiSpec · mapeo", () => {
  it("convierte un panel con rejilla y dos widgets", () => {
    const r = figcraftAUiSpec(doc([nodo("ss:panel", { children: [nodo("ss:rejilla", { children: [nodo("ss:widget"), nodo("ss:widget")] })] })]));
    const panel = r.spec?.bloques[0];
    expect(panel?.tipo).toBe("panel");
    expect(panel?.hijos?.[0].tipo).toBe("rejilla");
    expect(panel?.hijos?.[0].hijos?.map((h) => h.tipo)).toEqual(["widget", "widget"]);
    expect(r.informe.mapeados).toBe(4);
    expect(r.spec && validarUiSpec(r.spec).spec).not.toBeNull();
  });

  it("ignora lo que no empieza por ss: y lo informa", () => {
    const r = figcraftAUiSpec(doc([nodo("Botón"), nodo("ss:panel")]));
    expect(r.informe.ignorados.some((i) => i.nodo === "Botón")).toBe(true);
    expect(r.informe.mapeados).toBe(1);
  });

  it("ignora un tipo ss: desconocido con su motivo", () => {
    const r = figcraftAUiSpec(doc([nodo("ss:script")]));
    expect(r.informe.ignorados.some((i) => /desconocido/.test(i.motivo))).toBe(true);
    expect(r.spec).toBeNull();
  });

  it("lleva el texto de ss:texto a la prop de contenido", () => {
    const r = figcraftAUiSpec(doc([nodo("ss:texto", { characters: "Buenos días" })]));
    expect(r.spec?.bloques[0].props.contenido).toBe("Buenos días");
  });

  it("descartar un texto con <script> y avisar sin tirar la spec", () => {
    const r = figcraftAUiSpec(doc([nodo("ss:texto", { text: "<script>alert(1)</script>" }), nodo("ss:panel")]));
    expect(r.spec).not.toBeNull();
    expect(r.spec?.bloques[0].props.contenido).toBeUndefined();
    expect(avisos(r)).toMatch(/código/);
  });

  it("descartar un texto con javascript: y avisar", () => {
    const r = figcraftAUiSpec(doc([nodo("ss:texto", { text: "javascript:alert(1)" }), nodo("ss:panel")]));
    expect(r.spec?.bloques[0].props.contenido).toBeUndefined();
    expect(avisos(r)).toMatch(/código/);
  });

  it("recorta un texto por encima de LONGITUD_MAXIMA_CADENA", () => {
    const r = figcraftAUiSpec(doc([nodo("ss:texto", { text: "a".repeat(4100) })]));
    expect((r.spec?.bloques[0].props.contenido as string).length).toBe(4000);
    expect(avisos(r)).toMatch(/recortado/);
  });

  it("corta una profundidad excesiva sin lanzar", () => {
    const cadena = (n: number): Crudo => (n === 0 ? {} : nodo("ss:panel", { children: [cadena(n - 1)] }));
    const r = figcraftAUiSpec(doc([cadena(8)]));
    expect(r.informe.ignorados.some((i) => /Profundidad/.test(i.motivo))).toBe(true);
  });

  it("desambigua ids repetidos a partir del nombre saneado", () => {
    const r = figcraftAUiSpec(doc([nodo("ss:panel"), nodo("ss:panel"), nodo("ss:panel / héroe")]));
    expect(r.spec?.bloques.map((b) => b.id)).toEqual(["panel", "panel-2", "panel-h-roe"]);
  });

  it("documento vacío, null o sin marcos ss: devuelve spec null sin lanzar", () => {
    expect(figcraftAUiSpec(null).spec).toBeNull();
    expect(figcraftAUiSpec({}).spec).toBeNull();
    expect(figcraftAUiSpec(doc([])).spec).toBeNull();
    expect(figcraftAUiSpec(doc([nodo("Solo texto")])).spec).toBeNull();
  });

  it("superficie inválida acaba en spec null con los problemas como avisos", () => {
    const r = figcraftAUiSpec(doc([nodo("ss:panel")]), { superficie: "../fuera" });
    expect(r.spec).toBeNull();
    expect(r.informe.avisos.length).toBeGreaterThan(0);
  });

  it("normaliza de forma tolerante y descarta campos ajenos", () => {
    const n = normalizarNodo({ id: "1", name: "ss:panel", type: "FRAME", children: [], characters: "hola", fills: [{ r: 1, g: 0, b: 0 }], ajeno: true });
    expect(n).toMatchObject({ id: "1", nombre: "ss:panel", tipo: "FRAME", texto: "hola" });
    expect(n).not.toHaveProperty("ajeno");
    expect(normalizarNodo(null)).toBeNull();
  });
});

describe("tokensDesdeVariables · contraste", () => {
  it("marca #FFBF00 sobre nieve como logica con contraste insuficiente", () => {
    const pares = tokensDesdeVariables({ variables: [{ name: "Lógica", values: { light: "#FFBF00" } }] });
    expect(pares.some((p) => p.token === "logica" && p.fondo === "nieve" && p.contraste < 4.5)).toBe(true);
  });

  it("empareja por cercanía y no duplica variables", () => {
    const pares = tokensDesdeVariables({ variables: [{ name: "Casi noche", value: { r: 10, g: 15, b: 29 } }, { name: "Casi noche", value: "#0A0F1D" }] });
    expect(pares.filter((p) => p.variable === "Casi noche")).toHaveLength(1);
    expect(pares[0].token).toBe("noche");
  });

  it("calcula formatos de color y la luminancia WCAG", () => {
    expect(aHex("#abc")).toBe("#AABBCC");
    expect(aHex({ r: 1, g: 0, b: 0 })).toBe("#FF0000");
    expect(aHex({ r: 0, g: 0.5, b: 1 })).toBe("#0080FF");
    expect(aHex("no-es-color")).toBeNull();
    expect(luminancia("#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrasteWcag("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });
});
