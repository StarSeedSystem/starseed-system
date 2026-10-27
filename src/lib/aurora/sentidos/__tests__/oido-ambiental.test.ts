import { describe, it, expect } from "vitest";
import {
  INTERVALO_MINIMO_MS_POR_DEFECTO,
  UMBRAL_ENERGIA_POR_DEFECTO,
  decidirEnvioAlOido,
  type EstadoSentidos,
  type FragmentoAudio,
} from "../oido-ambiental";

const ENCENDIDOS: EstadoSentidos = { encendidos: true, siempreEscuchando: true };
const APAGADOS: EstadoSentidos = { encendidos: false, siempreEscuchando: true };

function fragmento(extra: Partial<FragmentoAudio> = {}): FragmentoAudio {
  return {
    id: "frag-1",
    contieneVoz: false,
    energia: 0.6,
    timestamp: 10_000,
    ...extra,
  };
}

describe("decidirEnvioAlOido · sentidos y escucha", () => {
  it("nunca envía con los sentidos apagados", () => {
    expect(decidirEnvioAlOido(APAGADOS, fragmento(), null, 0.5, 1000)).toEqual({
      enviarAlServicio: false,
      razon: "sentidos-apagados",
    });
  });

  it("no envía si los sentidos están encendidos pero la escucha no es continua", () => {
    const estado: EstadoSentidos = { encendidos: true, siempreEscuchando: false };
    expect(decidirEnvioAlOido(estado, fragmento(), null, 0.5, 1000)).toEqual({
      enviarAlServicio: false,
      razon: "escucha-inactiva",
    });
  });
});

describe("decidirEnvioAlOido · voz y energía", () => {
  it("nunca manda un fragmento que contiene voz", () => {
    expect(decidirEnvioAlOido(ENCENDIDOS, fragmento({ contieneVoz: true }), null, 0.5, 1000)).toEqual({
      enviarAlServicio: false,
      razon: "contiene-voz",
    });
  });

  it("manda el fragmento sin voz que supera el umbral", () => {
    expect(decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: 0.51 }), null, 0.5, 1000)).toEqual({
      enviarAlServicio: true,
    });
  });

  it("justo en el umbral se acepta (el umbral es el mínimo)", () => {
    expect(decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: 0.5 }), null, 0.5, 1000)).toEqual({
      enviarAlServicio: true,
    });
  });

  it("rechaza por energía insuficiente", () => {
    expect(decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: 0.2 }), null, 0.5, 1000)).toEqual({
      enviarAlServicio: false,
      razon: "energia-insuficiente",
    });
  });

  it("rechaza energía no finita en vez de mandar un tramo roto", () => {
    expect(
      decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: Number.NaN }), null, 0.5, 1000)
    ).toEqual({ enviarAlServicio: false, razon: "fragmento-invalido" });
  });

  it("rechaza un timestamp no finito", () => {
    expect(
      decidirEnvioAlOido(
        ENCENDIDOS,
        fragmento({ timestamp: Number.POSITIVE_INFINITY }),
        null,
        0.5,
        1000
      )
    ).toEqual({ enviarAlServicio: false, razon: "fragmento-invalido" });
  });
});

describe("decidirEnvioAlOido · freno de frecuencia", () => {
  it("rechaza si no ha pasado el intervalo mínimo", () => {
    expect(decidirEnvioAlOido(ENCENDIDOS, fragmento({ timestamp: 1500 }), 1000, 0.5, 1000)).toEqual({
      enviarAlServicio: false,
      razon: "intervalo-corto",
    });
  });

  it("acepta justo al cumplirse el intervalo mínimo", () => {
    expect(decidirEnvioAlOido(ENCENDIDOS, fragmento({ timestamp: 2000 }), 1000, 0.5, 1000)).toEqual({
      enviarAlServicio: true,
    });
  });

  it("acepta el primer envío cuando no hay último envío", () => {
    expect(decidirEnvioAlOido(ENCENDIDOS, fragmento(), null, 0.5, 1000)).toEqual({
      enviarAlServicio: true,
    });
  });

  it("un último envío no finito no bloquea para siempre", () => {
    expect(
      decidirEnvioAlOido(ENCENDIDOS, fragmento(), Number.NaN, 0.5, 1000)
    ).toEqual({ enviarAlServicio: true });
  });

  it("un reloj que retrocede no se toma como intervalo cumplido", () => {
    expect(decidirEnvioAlOido(ENCENDIDOS, fragmento({ timestamp: 900 }), 1000, 0.5, 1000)).toEqual({
      enviarAlServicio: false,
      razon: "intervalo-corto",
    });
  });
});

describe("decidirEnvioAlOido · valores por defecto", () => {
  it("usa el umbral y el intervalo de la casa cuando no se pasan", () => {
    const valido = fragmento({
      energia: UMBRAL_ENERGIA_POR_DEFECTO,
      timestamp: INTERVALO_MINIMO_MS_POR_DEFECTO,
    });
    expect(decidirEnvioAlOido(ENCENDIDOS, valido, 0)).toEqual({ enviarAlServicio: true });
  });

  it("con los valores por defecto también frena un fragmento demasiado pronto", () => {
    const pronto = fragmento({
      energia: UMBRAL_ENERGIA_POR_DEFECTO,
      timestamp: INTERVALO_MINIMO_MS_POR_DEFECTO - 1,
    });
    expect(decidirEnvioAlOido(ENCENDIDOS, pronto, 0)).toEqual({
      enviarAlServicio: false,
      razon: "intervalo-corto",
    });
  });
});
