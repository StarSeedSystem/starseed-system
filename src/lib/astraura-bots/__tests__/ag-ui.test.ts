import { describe, expect, it } from "vitest";
import { ESTADO_AG_UI_VACIO, reducirEventos, llamadasComoPropuestas, EstadoAgUi } from "../ag-ui";

function estado(): EstadoAgUi {
  return { ...ESTADO_AG_UI_VACIO, textoPorMensaje: {}, llamadasHerramienta: {}, errores: [], eventosDesconocidos: 0 };
}

describe("reducirEventos · eventos básicos", () => {
  it("texto en trozos acumula por messageId", () => {
    let s = estado();
    s = reducirEventos(s, { type: "TextMessageStart", messageId: "m1" });
    s = reducirEventos(s, { type: "TextMessageContent", messageId: "m1", delta: "Hola" });
    s = reducirEventos(s, { type: "TextMessageContent", messageId: "m1", delta: " mundo" });
    s = reducirEventos(s, { type: "TextMessageEnd", messageId: "m1" });
    expect(s.textoPorMensaje["m1"]).toBe("Hola mundo");
    expect(s.textoCompleto).toContain("Hola mundo");
  });
  it("dos mensajes se acumulan por separado", () => {
    let s = estado();
    s = reducirEventos(s, { type: "TextMessageStart", messageId: "m1" });
    s = reducirEventos(s, { type: "TextMessageContent", messageId: "m1", delta: "A" });
    s = reducirEventos(s, { type: "TextMessageEnd", messageId: "m1" });
    s = reducirEventos(s, { tipo: "TextMessageStart", messageId: "m2" });
    s = reducirEventos(s, { tipo: "TextMessageContent", messageId: "m2", delta: "B" });
    s = reducirEventos(s, { tipo: "TextMessageEnd", messageId: "m2" });
    expect(s.textoPorMensaje["m1"]).toBe("A");
    expect(s.textoPorMensaje["m2"]).toBe("B");
    expect(s.textoCompleto).toContain("A");
    expect(s.textoCompleto).toContain("B");
  });
  it("acepta nombres en PascalCase (RunStarted / TextMessageStart)", () => {
    let s = estado();
    s = reducirEventos(s, { type: "RunStarted" });
    s = reducirEventos(s, { type: "RunFinished" });
    expect(s.eventosDesconocidos).toBe(0);
  });
});

describe("reducirEventos · herramientas", () => {
  it("herramienta en trozos acumula argumentos y parsea al terminar", () => {
    let s = estado();
    s = reducirEventos(s, { type: "ToolCallStart", toolCallId: "t1", toolCallName: "navegar" });
    s = reducirEventos(s, { type: "ToolCallArgs", toolCallId: "t1", delta: `{"ruta":"/genesis"}` });
    s = reducirEventos(s, { type: "ToolCallEnd", toolCallId: "t1" });
    expect(s.llamadasHerramienta["t1"].nombre).toBe("navegar");
    expect(s.llamadasHerramienta["t1"].argsParseado).toEqual({ ruta: "/genesis" });
  });
  it("JSON roto en argumentos marca error y no parsea", () => {
    let s = estado();
    s = reducirEventos(s, { type: "ToolCallStart", toolCallId: "t2", toolCallName: "navegar" });
    s = reducirEventos(s, { type: "ToolCallArgs", toolCallId: "t2", delta: `{"bad` });
    s = reducirEventos(s, { type: "ToolCallEnd", toolCallId: "t2" });
    expect(s.llamadasHerramienta["t2"].argsParseado).toBeUndefined();
    expect(s.llamadasHerramienta["t2"].argsRaw).toBe(`{"bad`);
  });
  it("resultado de herramienta se acumula en texto", () => {
    let s = estado();
    s = reducirEventos(s, { type: "ToolCallResult", toolCallId: "t3", content: "hecho" });
    expect(s.textoCompleto).toContain("[resultado t3]: hecho");
  });
});

describe("reducirEventos · estado", () => {
  it("snapshot reemplaza y limpia desincronizado", () => {
    let s = estado();
    s = reducirEventos(s, { type: "StateSnapshot", snapshot: { a: 1 } });
    expect(s.snapshot).toEqual({ a: 1 });
    expect(s.estadoDesincronizado).toBe(false);
  });
  it("delta add/replace/remove sobre rutas simples funciona", () => {
    let s = estado();
    s = reducirEventos(s, { type: "StateSnapshot", snapshot: { x: 10 } });
    s = reducirEventos(s, { type: "StateDelta", delta: [{ op: "replace", path: "/x", value: 20 }] });
    expect((s.snapshot as Record<string, unknown>).x).toBe(20);
  });
  it("delta add crea clave", () => {
    let s = estado();
    s = reducirEventos(s, { type: "StateSnapshot", snapshot: {} });
    s = reducirEventos(s, { type: "StateDelta", delta: [{ op: "add", path: "/y", value: 5 }] });
    expect((s.snapshot as Record<string, unknown>).y).toBe(5);
  });
  it("delta remove borra clave simple", () => {
    let s = estado();
    s = reducirEventos(s, { type: "StateSnapshot", snapshot: { z: 1 } });
    s = reducirEventos(s, { type: "StateDelta", delta: [{ op: "remove", path: "/z" }] });
    expect((s.snapshot as Record<string, unknown>).z).toBeUndefined();
  });
  it("delta imposible (ruta muy larga / op desconocida) marca desincronizado", () => {
    let s = estado();
    s = reducirEventos(s, { type: "StateSnapshot", snapshot: {} });
    s = reducirEventos(s, { type: "StateDelta", delta: [{ op: "replace", path: "/a/b/c/d/e/f", value: 1 }] });
    expect(s.estadoDesincronizado).toBe(true);
    expect(s.errores.some((e) => e.includes("desincronizado"))).toBe(true);
  });
});

describe("reducirEventos · errores y límites", () => {
  it("RUN_ERROR acumula mensaje", () => {
    let s = estado();
    s = reducirEventos(s, { type: "RunError", message: "fallo" });
    expect(s.errores).toContain("fallo");
  });
  it("texto que supera 20.000 caracteres se trunca y genera error", () => {
    let s = estado();
    s = reducirEventos(s, { type: "TextMessageStart", messageId: "mX" });
    const largo = "x".repeat(20_001);
    s = reducirEventos(s, { type: "TextMessageContent", messageId: "mX", delta: largo });
    expect(s.textoPorMensaje["mX"].length).toBe(20_000);
    expect(s.errores.some((e) => e.includes("excede"))).toBe(true);
  });
  it("argumentos que superan 20.000 caracteres se truncan", () => {
    let s = estado();
    s = reducirEventos(s, { type: "ToolCallStart", toolCallId: "tx", toolCallName: "navegar" });
    s = reducirEventos(s, { type: "ToolCallArgs", toolCallId: "tx", delta: "x".repeat(20_001) });
    expect(s.llamadasHerramienta["tx"].argsRaw.length).toBe(20_000);
  });
  it("más de 50 llamadas a herramientas rechaza nuevas", () => {
    let s = estado();
    for (let i = 0; i < 50; i++) {
      s = reducirEventos(s, { type: "ToolCallStart", toolCallId: `t${i}`, toolCallName: "navegar" });
    }
    s = reducirEventos(s, { type: "ToolCallStart", toolCallId: "t50", toolCallName: "navegar" });
    expect(s.errores.some((e) => e.includes("Límite"))).toBe(true);
  });
});

describe("reducirEventos · desconocidos", () => {
  it("evento vacío desde estado inicial incrementa desconocidos", () => {
    const estado = reducirEventos(ESTADO_AG_UI_VACIO, {});
    expect(estado).toEqual({
      ...ESTADO_AG_UI_VACIO,
      eventosDesconocidos: 1
    });
  });

  it("eventos desconocidos se cuentan y no rompen", () => {
    let s = estado();
    s = reducirEventos(s, { type: "EventoInexistente", valor: 1 });
    expect(s.eventosDesconocidos).toBe(1);
  });
});

describe("llamadasComoPropuestas", () => {
  it("valida propuestas de acciones conocidas y rechaza herramientas no disponibles", () => {
    let s = estado();
    s = reducirEventos(s, { type: "ToolCallStart", toolCallId: "tc1", toolCallName: "navegar" });
    s = reducirEventos(s, { type: "ToolCallArgs", toolCallId: "tc1", delta: `{"ruta":"/hub"}` });
    s = reducirEventos(s, { type: "ToolCallEnd", toolCallId: "tc1" });
    const r = llamadasComoPropuestas(s);
    expect(r.acciones.some((a) => a.tipo === "navegar")).toBe(true);
    expect(r.problemas.some((p) => p.includes("navegar"))).toBe(false);
  });
  it("rechaza herramientas no disponibles para invitados", () => {
    let s = estado();
    s = reducirEventos(s, { type: "ToolCallStart", toolCallId: "tc2", toolCallName: "herramientaDesconocida" });
    s = reducirEventos(s, { type: "ToolCallArgs", toolCallId: "tc2", delta: "{}" });
    s = reducirEventos(s, { type: "ToolCallEnd", toolCallId: "tc2" });
    const r = llamadasComoPropuestas(s);
    expect(r.acciones.length).toBe(0);
    expect(r.problemas.some((p) => p.includes("no disponible"))).toBe(true);
  });
  it("argumentos rotos producen problema", () => {
    let s = estado();
    s = reducirEventos(s, { type: "ToolCallStart", toolCallId: "tc3", toolCallName: "navegar" });
    s = reducirEventos(s, { type: "ToolCallArgs", toolCallId: "tc3", delta: `{"bad` });
    s = reducirEventos(s, { type: "ToolCallEnd", toolCallId: "tc3" });
    const r = llamadasComoPropuestas(s);
    expect(r.problemas.some((p) => p.includes("rotos"))).toBe(true);
  });
  it("no incluye tool calls que no han terminado", () => {
    let estado = reducirEventos(ESTADO_AG_UI_VACIO, {});
    estado = reducirEventos(estado, {
      type: 'ToolCallStart',
      toolCallId: 'call1',
      toolCallName: 'navegar',
    });
    estado = reducirEventos(estado, {
      type: 'ToolCallArgs',
      toolCallId: 'call1',
      delta: '{"ruta":"/genesis"}',
    });
    // No END event
    const { acciones, problemas } = llamadasComoPropuestas(estado);
    expect(acciones).toHaveLength(0);
    expect(problemas).toHaveLength(0);
  });
});
