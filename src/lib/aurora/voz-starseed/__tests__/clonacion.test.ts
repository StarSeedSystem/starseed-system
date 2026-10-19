import { describe, it, expect } from "vitest";
import { puedeClonar, etiquetarAudio, PermisoVoz, UsoVoz } from "../clonacion";

describe("puedeClonar", () => {
  const ahora = Date.now();
  const unDia = 24 * 60 * 60 * 1000;

  it("permite clonar la propia voz", () => {
    const resultado = puedeClonar({
      solicitante: "usuario1",
      titular: "usuario1",
      uso: "personal",
      permisos: [],
      ahora,
    });
    expect(resultado.ok).toBe(true);
  });

  it("niega clonar voz ajena sin permiso", () => {
    const resultado = puedeClonar({
      solicitante: "usuario2",
      titular: "usuario1",
      uso: "personal",
      permisos: [],
      ahora,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toContain("No hay permiso válido");
    }
  });

  it("niega clonar voz ajena con permiso caducado", () => {
    const permisoCaducado: PermisoVoz = {
      id: "p1",
      titular: "usuario1",
      concedidoA: "usuario2",
      para: ["personal"],
      desde: ahora - 2 * unDia,
      hasta: ahora - unDia,
      revocado: false,
    };
    const resultado = puedeClonar({
      solicitante: "usuario2",
      titular: "usuario1",
      uso: "personal",
      permisos: [permisoCaducado],
      ahora,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toContain("No hay permiso válido");
    }
  });

  it("niega clonar voz ajena con permiso revocado", () => {
    const permisoRevogado: PermisoVoz = {
      id: "p2",
      titular: "usuario1",
      concedidoA: "usuario2",
      para: ["personal"],
      desde: ahora - unDia,
      hasta: ahora + unDia,
      revocado: true,
    };
    const resultado = puedeClonar({
      solicitante: "usuario2",
      titular: "usuario1",
      uso: "personal",
      permisos: [permisoRevogado],
      ahora,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toContain("No hay permiso válido");
    }
  });

  it("permite clonar voz ajena con permiso vigente y válido para el uso", () => {
    const permisoValido: PermisoVoz = {
      id: "p3",
      titular: "usuario1",
      concedidoA: "usuario2",
      para: ["personal", "grupo"],
      desde: ahora - unDia,
      hasta: ahora + unDia,
      revocado: false,
    };
    const resultado = puedeClonar({
      solicitante: "usuario2",
      titular: "usuario1",
      uso: "grupo",
      permisos: [permisoValido],
      ahora,
    });
    expect(resultado.ok).toBe(true);
  });
});

describe("etiquetarAudio", () => {
  it("añade los campos de clonación y marca de agua pendiente", () => {
    const meta = { titulo: "Prueba", autor: "Juan" };
    const resultado = etiquetarAudio(meta);
    expect(resultado).toHaveProperty("clonada", true);
    expect(resultado).toHaveProperty("marcaAgua", "pendiente");
  });
});