import { describe, it, expect } from "vitest";
import {
  firmarCuerpoAmbito,
  verificarFirmaAmbito,
  sanitizarRutaAmbito,
  nombreArchivoEventoAmbito,
  construirEventoAmbito,
  EventoGanchoAmbito,
} from "../ganchos-ambito";

describe("Gancho firmado por ámbito - firmarCuerpoAmbito", () => {
  it("firma el cuerpo correctamente con un secreto dado", () => {
    const cuerpo = "datos de prueba";
    const secreto = "secreto-de-prueba-del-ámbito-123";
    const firma = firmarCuerpoAmbito(cuerpo, secreto);
    expect(typeof firma).toBe("string");
    expect(firma).toMatch(/^[0-9a-f]{64}$/);
  });

  it("firma el mismo cuerpo con el mismo secreto da la misma firma", () => {
    const cuerpo = { mensaje: "hola", valor: 123 };
    const secreto = "secreto-del-ámbito-para-la-firma";
    const firma1 = firmarCuerpoAmbito(JSON.stringify(cuerpo), secreto);
    const firma2 = firmarCuerpoAmbito(JSON.stringify(cuerpo), secreto);
    expect(firma1).toBe(firma2);
  });
});

describe("Gancho firmado por ámbito - verificarFirmaAmbito", () => {
  it("verifica firma válida", () => {
    const cuerpo = "cuerpo de prueba para firma";
    const secreto = "secreto-seguro-para-verificación-ambito";
    const firma = firmarCuerpoAmbito(cuerpo, secreto);
    const cabecera = `sha256=${firma}`;
    const resultado = verificarFirmaAmbito(cuerpo, cabecera, secreto);
    expect(resultado).toBe(true);
  });

  it("rechaza cabecera inválida", () => {
    const cuerpo = "cuerpo de prueba";
    const secreto = "secreto-para-rechazo";
    const cabecera = "invalida-sin-sha256-=";
    const resultado = verificarFirmaAmbito(cuerpo, cabecera, secreto);
    expect(resultado).toBe(false);
  });

  it("rechaza formato de firma inválido", () => {
    const cuerpo = "cuerpo de prueba";
    const secreto = "secreto-para-formato-inv";
    const cabecera = "sha256=xyz123inválido";
    const resultado = verificarFirmaAmbito(cuerpo, cabecera, secreto);
    expect(resultado).toBe(false);
  });

  it("rechaza secreto incorrecto", () => {
    const cuerpo = "cuerpo de prueba";
    const secretoCorrecto = "secreto-ambito-correcto";
    const secretoIncorrecto = "secreto-ambito-incorrecto";
    const firma = firmarCuerpoAmbito(cuerpo, secretoCorrecto);
    const cabecera = `sha256=${firma}`;
    const resultado = verificarFirmaAmbito(cuerpo, cabecera, secretoIncorrecto);
    expect(resultado).toBe(false);
  });

  it("rechaza firma faltante", () => {
    const cuerpo = "cuerpo de prueba";
    const secreto = "secreto-para-faltante";
    const cabecera = null;
    const resultado = verificarFirmaAmbito(cuerpo, cabecera, secreto);
    expect(resultado).toBe(false);
  });

  it("rechaza secreto vacío", () => {
    const cuerpo = "cuerpo de prueba";
    const secreto = "";
    const cabecera = "sha256=a".repeat(64);
    const resultado = verificarFirmaAmbito(cuerpo, cabecera, secreto);
    expect(resultado).toBe(false);
  });
});

describe("Gancho firmado por ámbito - sanitizarRutaAmbito", () => {
  it("acepta ruta con letras, dígitos, guiones y guiones bajos", () => {
    const rutaValida = "mi-ruta_123";
    const resultado = sanitizarRutaAmbito(rutaValida);
    expect(resultado).toBe(rutaValida);
  });

  it("rechaza ruta con caracteres inválidos", () => {
    const rutaInválida = "ruta/concaracteres/inválidos.txt";
    const resultado = sanitizarRutaAmbito(rutaInválida);
    expect(resultado).toBe(null);
  });

  it("rechaza ruta vacía", () => {
    const rutaVacia = "";
    const resultado = sanitizarRutaAmbito(rutaVacia);
    expect(resultado).toBe(null);
  });

  it("rechaza ruta muy larga", () => {
    const rutaLarga = "a".repeat(65);
    const resultado = sanitizarRutaAmbito(rutaLarga);
    expect(resultado).toBe(null);
  });
});

describe("Gancho firmado por ámbito - nombreArchivoEventoAmbito", () => {
  it("genera nombre de archivo con formato correcto", () => {
    const ambitoId = "mi-ambito-personal";
    const ruta = "evento-test";
    const epochMs = 1735689600000; // 2025-01-01
    const nombre = nombreArchivoEventoAmbito(ambitoId, ruta, epochMs);
    expect(nombre).toBe("1735689600000-mi-ambito-personal-evento-test.json");
  });

  it("sanea el ámbitoId en el nombre del archivo", () => {
    const ambitoId = "ámbito@con#caracteres&especiales";
    const ruta = "test";
    const epochMs = 1735689600000;
    const nombre = nombreArchivoEventoAmbito(ambitoId, ruta, epochMs);
    expect(nombre).toBe("1735689600000-_mbito_con_caracteres_especiales-test.json");
  });
});

describe("Gancho firmado por ámbito - construirEventoAmbito", () => {
  it("construye evento con todos los campos", () => {
    const ambitoId = "ambito-prueba";
    const ruta = "ruta-del-evento";
    const cuerpo = { dato: "valor", num: 42 };
    const ahora = new Date(1735689600000);
    const evento = construirEventoAmbito(ambitoId, ruta, cuerpo, ahora);

    expect(evento).toEqual({
      ambitoId,
      ruta,
      recibido: ahora.toISOString(),
      cuerpo,
      timestamp: ahora.getTime(),
    });
  });

  it("fecha automáticamente si no se proporciona", () => {
    const ambitoId = "ambito-test";
    const ruta = "ruta-test";
    const cuerpo = null;
    const evento = construirEventoAmbito(ambitoId, ruta, cuerpo);
    expect(evento.ambitoId).toBe(ambitoId);
    expect(evento.ruta).toBe(ruta);
    expect(evento.cuerpo).toBe(null);
    expect(typeof evento.timestamp).toBe("number");
  });
});