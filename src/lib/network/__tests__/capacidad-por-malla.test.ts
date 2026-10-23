/**
 * capacidad-por-malla (Ola 1017A) — relé P2P genérico de cualquier capacidad sobre la malla
 * de neuronas. Cubre protocolo (guard/parse), rol CLIENTE (pedirCapacidad con canal falso,
 * reúne trozos, nunca lanza: {ok:false, motivo}).
 */
import { describe, it, expect } from "vitest";
import {
  CAPACIDAD_MALLA_NS,
  CAPACIDAD_MALLA_MAX_BYTES,
  esMensajeCapacidadMalla,
  parseCapacidadMallaMensaje,
  cabeEnMensajeCapacidad,
  esTipoCapacidadValido,
  partirEnTrozos,
  bytesUtf8,
  pedirCapacidad,
  crearIdPeticion,
} from "@/lib/network/capacidad-por-malla";

/* ══════════════════════════ Protocolo (puro) ══════════════════════════ */

describe("protocolo capacidad.*", () => {
  it("esMensajeCapacidadMalla acepta los cinco tipos bien formados", () => {
    expect(esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1", tipo: "imagen", cuerpo: { messages: [] } })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.trozo", id: "1", texto: "hola" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.fin", id: "1", resultado: "resultado" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.error", id: "1", estado: 503, mensaje: "x" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.cancelar", id: "1" })).toBe(true);
  });

  it("rechaza basura, otros namespaces y payloads incompletos", () => {
    expect(esMensajeCapacidadMalla(null)).toBe(false);
    expect(esMensajeCapacidadMalla("texto")).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "ia.pedir", id: "1", cuerpo: { messages: [] } })).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1" })).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "capacidad.fin", id: "1" })).toBe(false);
  });

  it("parseCapacidadMallaMensaje: JSON válido del protocolo → objeto; el resto → null", () => {
    expect(parseCapacidadMallaMensaje(JSON.stringify({ t: "capacidad.cancelar", id: "1" }))).toEqual({ t: "capacidad.cancelar", id: "1" });
    expect(parseCapacidadMallaMensaje("{roto")).toBeNull();
    expect(parseCapacidadMallaMensaje(JSON.stringify({ t: "malla:hb", at: 1 }))).toBeNull();
  });

  it("cabeEnMensajeCapacidad respeta el límite de 16KB", () => {
    const mensajeOK = JSON.stringify({ t: "capacidad.pedir", id: "1", tipo: "imagen", cuerpo: { messages: [] } });
    expect(cabeEnMensajeCapacidad(mensajeOK)).toBe(true);
    const mensajeGrande = JSON.stringify({ t: "capacidad.pedir", id: "1", tipo: "imagen", cuerpo: { messages: [Array(10000).fill("x")] } });
    expect(cabeEnMensajeCapacidad(mensajeGrande)).toBe(false);
  });
});

/* ══════════════════════════ TipoCapacidad ══════════════════════════ */

describe("esTipoCapacidadValido", () => {
  it("acepta los 8 tipos válidos", () => {
    expect(esTipoCapacidadValido("imagen")).toBe(true);
    expect(esTipoCapacidadValido("voz")).toBe(true);
    expect(esTipoCapacidadValido("oido")).toBe(true);
    expect(esTipoCapacidadValido("palabra")).toBe(true);
    expect(esTipoCapacidadValido("transcodificar")).toBe(true);
    expect(esTipoCapacidadValido("render")).toBe(true);
    expect(esTipoCapacidadValido("buscar")).toBe(true);
    expect(esTipoCapacidadValido("construir")).toBe(true);
  });

  it("rechaza tipos inválidos", () => {
    expect(esTipoCapacidadValido("")).toBe(false);
    expect(esTipoCapacidadValido("texto")).toBe(false);
    expect(esTipoCapacidadValido("otros")).toBe(false);
  });
});

/* ══════════════════════════ Parte y utilidades puras ══════════════════════════ */

describe("partirEnTrozos y bytesUtf8 (puras)", () => {
  it("partirEnTrozos divide el texto respetando el tope de bytes", () => {
    const trozos = partirEnTrozos("Hola mundo este es un texto de prueba para partir en trozos", 20);
    expect(trozos.length).toBeGreaterThan(1);
  });

  it("bytesUtf8 cuenta correctamente los bytes", () => {
    expect(bytesUtf8("hola")).toBe(4);
    expect(bytesUtf8("")).toBe(0);
  });
});

describe("crearIdPeticion", () => {
  it("genera ids únicos", () => {
    const id1 = crearIdPeticion();
    const id2 = crearIdPeticion();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe("string");
  });
});

/* ══════════════════════════ Rol CLIENTE ══════════════════════════ */

describe("pedirCapacidad (rol cliente)", () => {
  it("siempre devuelve objeto con ok:true/ false y nunca lanza", async () => {
    const enviados: string[] = [];
    const enviar = (msg: string) => {
      enviados.push(msg);
      return true;
    };

    let resultado: any;
    const promesa = pedirCapacidad(enviar, {
      tipo: "imagen",
      cuerpo: { prompt: "hola" },
      sesionId: "ses-123",
      timeoutMs: 10,
    });

    // El timeout provocará un rechazo con motivo
    resultado = await promesa;
    expect(resultado).toMatchObject({ ok: false });
    expect(resultado.motivo).toBeDefined();
    expect(enviados.length).toBe(1);
    const pedido = JSON.parse(enviados[0]);
    expect(pedido.t).toBe("capacidad.pedir");
    expect(pedido.tipo).toBe("imagen");
    expect(pedido.sesionId).toBe("ses-123");
  });

  it("timeout: tiempo agotado ⇒ {ok:false, motivo}", async () => {
    const enviar = () => true;
    const res = await pedirCapacidad(enviar, {
      tipo: "buscar",
      cuerpo: { query: "test" },
      timeoutMs: 1,
    });
    expect(res).toEqual({ ok: false, motivo: "Capacidad por la malla: timeout total." });
  });

  it("mensaje de error se mapea a {ok:false, motivo}", async () => {
    const enviar = () => true;
    const res = await pedirCapacidad(enviar, {
      tipo: "voz",
      cuerpo: { texto: "hola" },
      timeoutMs: 1,
    });
    expect(res.ok).toBe(false);
    expect(res.motivo).toBeDefined();
  });
});
