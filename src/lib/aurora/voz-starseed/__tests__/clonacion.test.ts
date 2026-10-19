/**
 * Test de clonación de voz con permiso (Ola 1018V · Voz de Astraura + VoiceStudio)
 * ─────────────────────────────────────────────────────────────────────────────
 * Prueba la clonación de voz con permiso registrado, marca de agua y
 * etiqueta «voz clonada».
 */

import { describe, expect, it } from "vitest";

import { puedeClonar, etiquetarAudio, type PermisoVoz, type ResultadoPuedeClonar, type MetaAudio } from "../clonacion";

describe("puedeClonar", () => {
  const ahora = "2026-10-19T10:00:00Z"; // fecha fija para las pruebas

  it("voz propia siempre se puede clonar", () => {
    const resultado: ResultadoPuedeClonar = puedeClonar({
      solicitante: "usuario123",
      titular: "usuario123",
      uso: "personal",
      permisos: [], // no importa si hay permisos o no
      ahora,
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.motivo).toBe("Voz propia");
  });

  it("voz ajena con permiso vigente y válido se puede clonar", () => {
    const permisos: PermisoVoz[] = [
      {
        id: "permiso1",
        titular: "usuario456",
        concedidoA: "usuario123",
        para: ["personal", "grupo"],
        desde: "2026-10-01T00:00:00Z",
        hasta: "2026-12-31T23:59:59Z",
      },
    ];

    const resultado: ResultadoPuedeClonar = puedeClonar({
      solicitante: "usuario123",
      titular: "usuario456",
      uso: "personal",
      permisos,
      ahora,
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.motivo).toBe("Permiso vigente y válido");
  });

  it("voz ajena sin permiso no se puede clonar", () => {
    const permisos: PermisoVoz[] = [];

    const resultado: ResultadoPuedeClonar = puedeClonar({
      solicitante: "usuario123",
      titular: "usuario456",
      uso: "personal",
      permisos,
      ahora,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("No existe permiso para este solicitante");
  });

  it("voz ajena con permiso revocado no se puede clonar", () => {
    const permisos: PermisoVoz[] = [
      {
        id: "permiso1",
        titular: "usuario456",
        concedidoA: "usuario123",
        para: ["personal"],
        desde: "2026-10-01T00:00:00Z",
        hasta: "2026-12-31T23:59:59Z",
        revocado: true,
      },
    ];

    const resultado: ResultadoPuedeClonar = puedeClonar({
      solicitante: "usuario123",
      titular: "usuario456",
      uso: "personal",
      permisos,
      ahora,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("Permiso revocado");
  });

  it("voz ajena con permiso que no cubre el uso no se puede clonar", () => {
    const permisos: PermisoVoz[] = [
      {
        id: "permiso1",
        titular: "usuario456",
        concedidoA: "usuario123",
        para: ["grupo"], // solo permite uso en grupo
        desde: "2026-10-01T00:00:00Z",
        hasta: "2026-12-31T23:59:59Z",
      },
    ];

    const resultado: ResultadoPuedeClonar = puedeClonar({
      solicitante: "usuario123",
      titular: "usuario456",
      uso: "comercial", // quiere usarlo comercialmente
      permisos,
      ahora,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("El permiso no cubre el uso: comercial");
  });

  it("voz ajena con permiso caducado (fecha futura) no se puede clonar", () => {
    const permisos: PermisoVoz[] = [
      {
        id: "permiso1",
        titular: "usuario456",
        concedidoA: "usuario123",
        para: ["personal"],
        desde: "2026-10-20T00:00:00Z", // empieza mañana
        hasta: "2026-12-31T23:59:59Z",
      },
    ];

    const resultado: ResultadoPuedeClonar = puedeClonar({
      solicitante: "usuario123",
      titular: "usuario456",
      uso: "personal",
      permisos,
      ahora, // 2026-10-19
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("Permiso caducado");
  });

  it("voz ajena con permiso caducado (fecha pasada) no se puede clonar", () => {
    const permisos: PermisoVoz[] = [
      {
        id: "permiso1",
        titular: "usuario456",
        concedidoA: "usuario123",
        para: ["personal"],
        desde: "2026-01-01T00:00:00Z",
        hasta: "2026-10-18T23:59:59Z", // terminó ayer
      },
    ];

    const resultado: ResultadoPuedeClonar = puedeClonar({
      solicitante: "usuario123",
      titular: "usuario456",
      uso: "personal",
      permisos,
      ahora, // 2026-10-19
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("Permiso caducado");
  });
});

describe("etiquetarAudio", () => {
  it("añade clonada: true y marcaAgua: pendiente por defecto", () => {
    const meta: MetaAudio = {};
    const resultado = etiquetarAudio(meta);

    expect(resultado).toEqual({
      clonada: true,
      marcaAgua: "pendiente",
      autorizadoPor: "sistema",
    });
  });

  it("respeta marcaAgua si ya está especificada", () => {
    const meta: MetaAudio = { marcaAgua: "audioseal" };
    const resultado = etiquetarAudio(meta);

    expect(resultado).toEqual({
      clonada: true,
      marcaAgua: "audioseal", // mantiene el valor original
      autorizadoPor: "sistema",
    });
  });

  it("respeta autorizadoPor si ya está especificado", () => {
    const meta: MetaAudio = { autorizadoPor: "usuario123" };
    const resultado = etiquetarAudio(meta);

    expect(resultado).toEqual({
      clonada: true,
      marcaAgua: "pendiente",
      autorizadoPor: "usuario123", // mantiene el valor original
    });
  });

  it("añade todos los campos cuando se especifica todo", () => {
    const meta: MetaAudio = {
      marcaAgua: "audioseal",
      autorizadoPor: "usuario456",
      duracion: 5.2, // otro campo cualquiera
    };
    const resultado = etiquetarAudio(meta);

    expect(resultado).toEqual({
      clonada: true,
      marcaAgua: "audioseal",
      autorizadoPor: "usuario456",
      duracion: 5.2,
    });
  });
});