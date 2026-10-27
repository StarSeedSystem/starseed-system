import { describe, it, expect } from "vitest";
import { decidirEnvioAlOido } from "../oido-ambiental";

describe("decidirEnvioAlOido", () => {
  it("debería rechazar si contiene voz", () => {
    const estado = { encendidos: true, siempreEscuchando: true };
    const fragmento = { id: "1", contieneVoz: true, energia: 0.8, timestamp: 1000 };
    const resultado = decidirEnvioAlOido(estado, fragmento, null, 0.5, 1000);
    expect(resultado.enviarAlServicio).toBe(false);
  });

  it("debería rechazar si la energía es inferior al umbral", () => {
    const estado = { encendidos: true, siempreEscuchando: true };
    const fragmento = { id: "1", contieneVoz: false, energia: 0.2, timestamp: 1000 };
    const resultado = decidirEnvioAlOido(estado, fragmento, null, 0.5, 1000);
    expect(resultado.enviarAlServicio).toBe(false);
  });

  it("debería rechazar si el intervalo es demasiado corto", () => {
    const estado = { encendidos: true, siempreEscuchando: true };
    const fragmento = { id: "2", contieneVoz: false, energia: 0.8, timestamp: 1500 };
    const resultado = decidirEnvioAlOido(estado, fragmento, 1000, 0.5, 1000);
    expect(resultado.enviarAlServicio).toBe(false);
  });

  it("debería aceptar un fragmento válido", () => {
    const estado = { encendidos: true, siempreEscuchando: true };
    const fragmento = { id: "2", contieneVoz: false, energia: 0.8, timestamp: 2000 };
    const resultado = decidirEnvioAlOido(estado, fragmento, 1000, 0.5, 1000);
    expect(resultado.enviarAlServicio).toBe(true);
  });
});
