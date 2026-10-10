import { describe, it, expect } from "vitest";
import {
  enviarChatDirecto,
  alRecibirChatDirecto,
  bandejaChatDirecto,
  marcarSubido,
  type MensajeChatDirecto,
} from "../chat-directo";
import type { MensajeEntrante, ResultadoEnvio } from "@/lib/malla/transporte-universal";

function almacenFalso() {
  const mapa = new Map<string, string>();
  return { get: (k: string) => mapa.get(k) ?? null, set: (k: string, v: string) => void mapa.set(k, v) };
}

const okResultado: ResultadoEnvio = {
  ok: true,
  confirmado: true,
  enlace: { id: "e1", tipo: "p2p", etiqueta: "cercano" },
  intentos: [],
  descartados: [],
};

function entrante(cuerpo: unknown): MensajeEntrante {
  return {
    id: "m1",
    canal: "chat",
    cuerpo,
    origen: { tipo: "p2p", enlaceId: "e1", etiqueta: "Ana", syncDeviceId: "dev-ana" },
    at: 123,
  };
}

describe("chat-directo", () => {
  it("el envío se guarda en la bandeja aunque falle", async () => {
    const almacen = almacenFalso();
    const enviar = async () => {
      throw new Error("sin enlaces");
    };
    const r = await enviarChatDirecto(
      { uidDestino: "u1", hiloId: "h1", texto: "hola" },
      { enviar, almacen },
    );
    expect(r.ok).toBe(false);
    const lista = bandejaChatDirecto({ almacen });
    expect(lista).toHaveLength(1);
    expect(lista[0].dir).toBe("sale");
    expect(lista[0].txt).toBe("hola");
    expect(lista[0].subido).toBe(false);
  });

  it("el envío con éxito guarda enlace y confirmado", async () => {
    const almacen = almacenFalso();
    await enviarChatDirecto(
      { uidDestino: "u1", hiloId: "h1", texto: "x" },
      { enviar: async () => okResultado, almacen },
    );
    const [m] = bandejaChatDirecto({ almacen });
    expect(m.enlace).toBe("p2p");
    expect(m.confirmado).toBe(true);
  });

  it("recibe un mensaje válido, lo guarda y llama a cb", () => {
    const almacen = almacenFalso();
    let oyente: (m: MensajeEntrante) => void = () => {};
    const alRecibir = (_c: string, cb: (m: MensajeEntrante) => void) => {
      oyente = cb;
      return () => {};
    };
    const recibidos: MensajeChatDirecto[] = [];
    alRecibirChatDirecto((m) => recibidos.push(m), { alRecibir, almacen });
    oyente(entrante({ h: "h1", txt: "qué tal" }));
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].dir).toBe("entra");
    expect(recibidos[0].origen).toBe("Ana");
    expect(bandejaChatDirecto({ almacen })).toHaveLength(1);
  });

  it("descarta mensajes con forma inválida", () => {
    const almacen = almacenFalso();
    let oyente: (m: MensajeEntrante) => void = () => {};
    const alRecibir = (_c: string, cb: (m: MensajeEntrante) => void) => {
      oyente = cb;
      return () => {};
    };
    let llamadas = 0;
    alRecibirChatDirecto(() => llamadas++, { alRecibir, almacen });
    oyente(entrante({ h: 42, txt: "x" }));
    oyente(entrante({ h: "h", txt: "y".repeat(4001) }));
    oyente(entrante(null));
    expect(llamadas).toBe(0);
    expect(bandejaChatDirecto({ almacen })).toHaveLength(0);
  });

  it("la bandeja tiene tope de 200 entradas", async () => {
    const almacen = almacenFalso();
    const enviar = async () => okResultado;
    for (let i = 0; i < 205; i++) {
      await enviarChatDirecto(
        { uidDestino: "u1", hiloId: "h1", texto: `m${i}` },
        { enviar, almacen },
      );
    }
    const lista = bandejaChatDirecto({ almacen });
    expect(lista).toHaveLength(200);
    expect(lista[0].txt).toBe("m204");
  });

  it("marcarSubido marca y devuelve false si no existe", async () => {
    const almacen = almacenFalso();
    await enviarChatDirecto(
      { uidDestino: "u1", hiloId: "h1", texto: "hola" },
      { enviar: async () => okResultado, almacen },
    );
    const [m] = bandejaChatDirecto({ almacen });
    expect(marcarSubido(m.id, { almacen })).toBe(true);
    expect(bandejaChatDirecto({ almacen })[0].subido).toBe(true);
    expect(marcarSubido("no-existe", { almacen })).toBe(false);
  });
});
