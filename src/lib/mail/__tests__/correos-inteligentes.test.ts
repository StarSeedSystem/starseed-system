/**
 * INV1025I · correos inteligentes: reglas como datos y seguimiento de respuestas.
 * Solo funciones puras: reloj inyectado, sin red y sin disco.
 */
import { describe, expect, it } from "vitest";
import { M, R, R0, aplicarReglas, validarRegla, type Correo } from "../inteligente";
import { clasificarHilo, resumenSeguimiento } from "../seguimiento-respuestas";

const AHORA = new Date("2026-01-15T12:00:00Z").getTime();
const BASE: Correo = { id: "m1", remitente: "Ana@Ejemplo.com", fecha: "2026-01-14T10:00:00Z", dominio: "ejemplo.com" };

describe("validarRegla", () => {
  it("acepta una regla válida con y sin parámetro", () => {
    expect(validarRegla(R("etiquetar", { etiqueta: "t" }, "p"))).toBe(true);
    expect(validarRegla(R("destacar", { de: "ana@ejemplo.com" }))).toBe(true);
    expect(validarRegla(R0("esperar-respuesta"))).toBe(true);
  });

  it("rechaza campos extra y acciones fuera de la lista", () => {
    expect(validarRegla({ ...R0("etiquetar"), extra: 1 })).toBe(false);
    expect(validarRegla({ ...R0("etiquetar"), cuando: { extra: 1 } })).toBe(false);
    expect(validarRegla({ ...R0("etiquetar"), hacer: "enviar" })).toBe(false);
    expect(validarRegla({ ...R0("etiquetar"), tipo: "enviar" })).toBe(false);
  });

  it("rechaza textos largos, id vacío y condiciones inválidas", () => {
    expect(validarRegla({ ...R0("etiquetar"), texto: "x".repeat(201) })).toBe(false);
    expect(validarRegla({ ...R0("etiquetar"), parametro: "x".repeat(101) })).toBe(false);
    expect(validarRegla({ ...R0("etiquetar"), id: "" })).toBe(false);
    expect(validarRegla({ ...R0("etiquetar"), cuando: { antiguedadHorasMin: -1 } })).toBe(false);
    expect(validarRegla({ ...R0("etiquetar"), cuando: { tieneAdjunto: "sí" } })).toBe(false);
    expect(validarRegla(null)).toBe(false);
    expect(validarRegla({})).toBe(false);
  });
});

describe("aplicarReglas", () => {
  it("propone en orden solo las reglas que coinciden", () => {
    const conAdjunto = { ...BASE, tieneAdjunto: true };
    const acciones = aplicarReglas(
      [R("etiquetar", {}, "t"), R("mover", { tieneAdjunto: true }), R("destacar", { de: "ANA@EJEMPLO.COM" })],
      conAdjunto,
      AHORA,
    );
    expect(acciones.map((a) => a.tipo)).toEqual(["etiquetar", "mover", "destacar"]);
    expect(acciones[0]).toEqual({ reglaId: "r1", tipo: "etiquetar", parametro: "t" });
  });

  it("no aplica cuando la condición no coincide", () => {
    expect(aplicarReglas([R("mover", { tieneAdjunto: true })], BASE, AHORA)).toHaveLength(0);
    expect(aplicarReglas([R("destacar", { de: "otro@ejemplo.com" })], BASE, AHORA)).toHaveLength(0);
    expect(aplicarReglas([R("sugerir-borrador", { dominio: "otro.com" })], BASE, AHORA)).toHaveLength(0);
  });

  it("aplica por dominio, antigüedad y asunto", () => {
    expect(aplicarReglas([R("sugerir-borrador", { dominio: "EJEMPLO.com" })], BASE, AHORA)[0]?.tipo).toBe("sugerir-borrador");
    expect(aplicarReglas([R("esperar-respuesta", { antiguedadHorasMin: 24 })], BASE, AHORA)[0]?.tipo).toBe("esperar-respuesta");
    expect(aplicarReglas([R("esperar-respuesta", { antiguedadHorasMin: 27 })], BASE, AHORA)).toHaveLength(0);
    const conAsunto = { ...BASE, asunto: "Propuesta de presupuesto" };
    expect(aplicarReglas([R("etiquetar", { asuntoContiene: "PRESUPUESTO" }, "x")], conAsunto, AHORA)[0]?.tipo).toBe("etiquetar");
  });

  it("deduplica por acción y parámetro y filtra reglas inválidas", () => {
    expect(aplicarReglas([R("etiquetar", {}, "p"), R("etiquetar", {}, "p")], BASE, AHORA)).toHaveLength(1);
    expect(aplicarReglas([R("etiquetar", {}, "a"), R("etiquetar", {}, "b")], BASE, AHORA)).toHaveLength(2);
    expect(aplicarReglas([{ ...R0("etiquetar"), hacer: "enviar" }, R("etiquetar", {})], BASE, AHORA)).toHaveLength(1);
  });
});

const hilo = (mensajes: Correo[]): Correo[] => M(mensajes);
const deOtro = (fecha: string): Correo => ({ id: "1", remitente: "otro@x.com", fecha });
const mio = (fecha: string): Correo => ({ id: "1", remitente: "yo", fecha });

describe("clasificarHilo", () => {
  it("por-responder: el último es de otro y pasaron más de N horas", () => {
    expect(clasificarHilo(hilo([mio("2026-01-14T10:00:00Z"), deOtro("2026-01-14T11:00:00Z")]), "yo", AHORA)).toBe("por-responder");
    expect(clasificarHilo(hilo([deOtro("2026-01-15T11:00:00Z")]), "yo", AHORA)).toBe("resuelto");
  });

  it("esperando: el último es mío y pasaron más de D días", () => {
    expect(clasificarHilo(hilo([deOtro("2026-01-01T10:00:00Z"), mio("2026-01-01T11:00:00Z")]), "yo", AHORA)).toBe("esperando");
    expect(clasificarHilo(hilo([deOtro("2026-01-14T10:00:00Z"), mio("2026-01-14T11:00:00Z")]), "yo", AHORA)).toBe("resuelto");
  });

  it("acepta umbrales propios, Date o number, y un hilo vacío es resuelto", () => {
    expect(clasificarHilo(hilo([deOtro("2026-01-14T11:00:00Z")]), "yo", AHORA, { horasPorResponder: 48 })).toBe("resuelto");
    expect(clasificarHilo(hilo([deOtro("2026-01-14T11:00:00Z")]), "yo", new Date(AHORA))).toBe("por-responder");
    expect(clasificarHilo(hilo([]), "yo", AHORA)).toBe("resuelto");
  });
});

describe("resumenSeguimiento", () => {
  it("cuenta los tres estados", () => {
    const hilos = [
      hilo([mio("2026-01-14T10:00:00Z"), deOtro("2026-01-14T11:00:00Z")]),
      hilo([deOtro("2026-01-01T10:00:00Z"), mio("2026-01-01T11:00:00Z")]),
      hilo([mio("2026-01-15T10:00:00Z"), deOtro("2026-01-15T11:00:00Z")]),
      hilo([deOtro("2026-01-14T10:00:00Z"), mio("2026-01-14T11:00:00Z")]),
      hilo([]),
    ];
    expect(resumenSeguimiento(hilos, "yo", AHORA)).toEqual({ porResponder: 1, esperando: 1, resuelto: 3, total: 5 });
  });

  it("una bandeja vacía da ceros", () => {
    expect(resumenSeguimiento([], "yo", AHORA)).toEqual({ porResponder: 0, esperando: 0, resuelto: 0, total: 0 });
  });
});
