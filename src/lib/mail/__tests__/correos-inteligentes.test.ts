import { describe, expect, it } from "vitest";
import { aplicarReglas, validarRegla, type ReglaCorreo } from "../reglas-correo";
import { clasificarHilo, resumenSeguimiento, type HiloLite } from "../seguimiento-respuestas";

describe("reglas-correo: validarRegla", () => {
  it("rechaza acciones fuera de la lista y campos extra", () => {
    const base = {
      id: "r1",
      texto: "Marcar como destacado",
      cuando: { de: "cliente@ejemplo.com" },
      hacer: "destacar",
    };
    expect(validarRegla(base)).not.toBeNull();

    expect(validarRegla({ ...base, hacer: "enviar" })).toBeNull();
    expect(validarRegla({ ...base, hacer: "responder" })).toBeNull();
    expect(validarRegla({ ...base, hacer: "borrar" })).toBeNull();
    expect(validarRegla({ ...base, hacer: "reenviar" })).toBeNull();

    expect(validarRegla({ ...base, extra: true })).toBeNull();
    expect(validarRegla({ ...base, cuando: { de: "x", truco: 1 } })).toBeNull();
  });

  it("acepta todas las acciones permitidas", () => {
    const acciones = ["etiquetar", "mover", "destacar", "esperar-respuesta", "sugerir-borrador"] as const;
    for (const a of acciones) {
      const r = validarRegla({
        id: "r-" + a,
        texto: "regla",
        cuando: {},
        hacer: a,
        parametro: a === "etiquetar" ? "urgente" : undefined,
      });
      expect(r?.hacer).toBe(a);
    }
  });

  it("rechaza textos largos", () => {
    const largo = "a".repeat(201);
    expect(
      validarRegla({
        id: "r1",
        texto: largo,
        cuando: {},
        hacer: "destacar",
      })
    ).toBeNull();
    expect(
      validarRegla({
        id: largo,
        texto: "ok",
        cuando: {},
        hacer: "destacar",
      })
    ).toBeNull();
  });
});

describe("reglas-correo: aplicarReglas", () => {
  it("devuelve acciones propuestas en orden y sin repetir", () => {
    const reglas: ReglaCorreo[] = [
      {
        id: "r1",
        texto: "Destacar facturas",
        cuando: { asuntoContiene: "factura" },
        hacer: "destacar",
      },
      {
        id: "r2",
        texto: "Etiquetar facturas también",
        cuando: { asuntoContiene: "factura" },
        hacer: "etiquetar",
        parametro: "factura",
      },
      {
        id: "r3",
        texto: "Otra regla que repite acción+param",
        cuando: { asuntoContiene: "factura" },
        hacer: "etiquetar",
        parametro: "factura",
      },
    ];
    const hilo = { id: "h1", asunto: "Factura #123", remitente: "cliente@acme.com", dominio: "acme.com" };
    const res = aplicarReglas(reglas, hilo);
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({ reglaId: "r1", hacer: "destacar", parametro: undefined });
    expect(res[1]).toEqual({ reglaId: "r2", hacer: "etiquetar", parametro: "factura" });
  });

  it("filtra por todas las condiciones", () => {
    const reglas = [
      { id: "r1", texto: "x", cuando: { dominio: "vip.com", tieneAdjunto: true, antiguedadHorasMin: 10 }, hacer: "mover", parametro: "importante" },
    ];
    expect(aplicarReglas(reglas, { id: "h1", dominio: "vip.com", tieneAdjunto: true, antiguedadHoras: 12 }).length).toBe(1);
    expect(aplicarReglas(reglas, { id: "h1", dominio: "otro.com", tieneAdjunto: true, antiguedadHoras: 12 }).length).toBe(0);
    expect(aplicarReglas(reglas, { id: "h1", dominio: "vip.com", tieneAdjunto: false, antiguedadHoras: 12 }).length).toBe(0);
    expect(aplicarReglas(reglas, { id: "h1", dominio: "vip.com", tieneAdjunto: true, antiguedadHoras: 5 }).length).toBe(0);
  });
});

describe("seguimiento-respuestas", () => {
  it("clasifica por-responder cuando ultimo es de otro y pasan mas de N horas sin respuesta mia", () => {
    const ahora = new Date("2026-10-27T12:00:00Z");
    const hilo: HiloLite = {
      id: "h1",
      ultimoRemitenteId: "otro",
      ultimoMensajeAt: new Date("2026-10-27T10:00:00Z"), // 2 horas
    };
    expect(clasificarHilo(hilo, "yo", ahora, { horasSinRespuesta: 1 })).toBe("por-responder");
    expect(clasificarHilo(hilo, "yo", ahora, { horasSinRespuesta: 5 })).toBe("resuelto");
  });

  it("clasifica esperando cuando ultimo es mio y pasan mas de D dias (14 por defecto)", () => {
    const ahora = new Date("2026-10-27T12:00:00Z");
    const hilo: HiloLite = {
      id: "h2",
      ultimoRemitenteId: "yo",
      ultimoMensajeAt: new Date("2026-10-01T12:00:00Z"),
      ultimoEsMio: true,
    };
    expect(clasificarHilo(hilo, "yo", ahora)).toBe("esperando");
    expect(clasificarHilo(hilo, "yo", ahora, { diasEsperando: 30 })).toBe("resuelto");
  });

  it("resumenSeguimiento cuenta estados", () => {
    const hilos: HiloLite[] = [
      { id: "a", ultimoRemitenteId: "x", ultimoMensajeAt: new Date(), ultimoEsMio: false },
      { id: "b", ultimoRemitenteId: "yo", ultimoMensajeAt: new Date(), ultimoEsMio: true },
      { id: "c", ultimoRemitenteId: "yo", ultimoMensajeAt: new Date(), ultimoEsMio: true },
    ];
    const r = resumenSeguimiento(hilos);
    expect(r["por-responder"]).toBe(1);
    expect(r.esperando).toBe(2);
    expect(r.resuelto).toBe(0);
  });
});
