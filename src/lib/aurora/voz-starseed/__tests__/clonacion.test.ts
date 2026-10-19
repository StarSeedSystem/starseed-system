import { describe, it, expect } from "vitest";
import { puedeClonar, PermisoVoz, etiquetarAudio } from "../clonacion";

describe("puedeClonar", () => {
  const ahora = new Date("2026-10-20T12:00:00Z");

  it("devuelve ok para la voz propia", () => {
    const resultado = puedeClonar({
      solicitante: "user123",
      titular: "user123",
      uso: "personal",
      permisos: [],
      ahora,
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.motivo).toBe("Voz propia");
  });

  it("devuelve ok para voz ajena con permiso válido", () => {
    const permiso: PermisoVoz = {
      id: "perm1",
      titular: "voiceOwner",
      concedidoA: "requester",
      para: ["personal", "grupo"],
      desde: new Date("2026-10-01T00:00:00Z"),
      hasta: new Date("2026-12-31T23:59:59Z"),
      revocado: false,
    };
    const resultado = puedeClonar({
      solicitante: "requester",
      titular: "voiceOwner",
      uso: "personal",
      permisos: [permiso],
      ahora,
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.motivo).toBe("Permiso válido");
  });

  it("devuelve not ok para voz ajena sin permiso", () => {
    const resultado = puedeClonar({
      solicitante: "requester",
      titular: "voiceOwner",
      uso: "personal",
      permisos: [],
      ahora,
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("Permiso inválido o inexistente para el uso solicitado");
  });

  it("devuelve not ok para voz ajena con permiso pero uso no permitido", () => {
    const permiso: PermisoVoz = {
      id: "perm1",
      titular: "voiceOwner",
      concedidoA: "requester",
      para: ["grupo"], // no incluye "personal"
      desde: new Date("2026-10-01T00:00:00Z"),
      hasta: new Date("2026-12-31T23:59:59Z"),
      revocado: false,
    };
    const resultado = puedeClonar({
      solicitante: "requester",
      titular: "voiceOwner",
      uso: "personal", // uso no permitido
      permisos: [permiso],
      ahora,
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("Permiso inválido o inexistente para el uso solicitado");
  });

  it("devuelve not ok para voz ajena con permiso pero fuera de rango de tiempo (antes de desde)", () => {
    const permiso: PermisoVoz = {
      id: "perm1",
      titular: "voiceOwner",
      concedidoA: "requester",
      para: ["personal"],
      desde: new Date("2026-10-25T00:00:00Z"), // empieza en el futuro
      hasta: new Date("2026-12-31T23:59:59Z"),
      revocado: false,
    };
    const resultado = puedeClonar({
      solicitante: "requester",
      titular: "voiceOwner",
      uso: "personal",
      permisos: [permiso],
      ahora, // 2026-10-20
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("Permiso inválido o inexistente para el uso solicitado");
  });

  it("devuelve not ok para voz ajena con permiso pero vencido (después de hasta)", () => {
    const permiso: PermisoVoz = {
      id: "perm1",
      titular: "voiceOwner",
      concedidoA: "requester",
      para: ["personal"],
      desde: new Date("2026-10-01T00:00:00Z"),
      hasta: new Date("2026-10-15T23:59:59Z"), // ya pasó
      revocado: false,
    };
    const resultado = puedeClonar({
      solicitante: "requester",
      titular: "voiceOwner",
      uso: "personal",
      permisos: [permiso],
      ahora, // 2026-10-20
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("Permiso inválido o inexistente para el uso solicitado");
  });

  it("devuelve not ok para voz ajena con permiso revocado", () => {
    const permiso: PermisoVoz = {
      id: "perm1",
      titular: "voiceOwner",
      concedidoA: "requester",
      para: ["personal"],
      desde: new Date("2026-10-01T00:00:00Z"),
      hasta: new Date("2026-12-31T23:59:59Z"),
      revocado: true, // revocado
    };
    const resultado = puedeClonar({
      solicitante: "requester",
      titular: "voiceOwner",
      uso: "personal",
      permisos: [permiso],
      ahora,
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("Permiso inválido o inexistente para el uso solicitado");
  });
});

describe("etiquetarAudio", () => {
  it("añade clonada: true, marcaAgua: 'pendiente' y autorizador, preservando metadatos originales", () => {
    const metaOriginal = { duracion: 5.2, formato: "wav", titulo: "Grabación de prueba" };
    const autorizador = "voiceOwner123";
    const resultado = etiquetarAudio(metaOriginal, autorizador);

    expect(resultado).toHaveProperty("clonada", true);
    expect(resultado).toHaveProperty("marcaAgua", "pendiente");
    expect(resultado).toHaveProperty("autorizador", autorizador);
    // Preserva los originales
    expect(resultado).toHaveProperty("duracion", 5.2);
    expect(resultado).toHaveProperty("formato", "wav");
    expect(resultado).toHaveProperty("titulo", "Grabación de prueba");
    // Asegura que no se modificó el original
    expect(metaOriginal).not.toHaveProperty("clonada");
    expect(metaOriginal).not.toHaveProperty("marcaAgua");
    expect(metaOriginal).not.toHaveProperty("autorizador");
  });
});