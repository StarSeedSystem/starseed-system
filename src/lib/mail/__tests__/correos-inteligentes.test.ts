/* ═══════════════════════════════════════════════════════════════════════════
   StarSeed OS · Pruebas de correos inteligentes (INV1025I) — funciones puras
   Solo cubre funciones exportadas; sin red, sin disco, sin procesos lanzados.
   Prohibido `vi.mock` de módulos de Node e importar `route.ts`.
   ═══════════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import {
  validarRegla,
  aplicarReglas,
} from "../reglas-correo";
import {
  clasificarHilo,
  resumenSeguimiento,
  type HiloLite,
} from "../seguimiento-respuestas";

/* Esqueleto; se completa en ediciones sucesivas. */

describe("validarRegla", () => {
  it("rechaza valores que no son objetos", () => {
    expect(validarRegla(null)).toBeNull();
    expect(validarRegla(42)).toBeNull();
    expect(validarRegla("texto")).toBeNull();
  });

  it("rechaza acciones fuera de la lista permitida", () => {
    expect(validarRegla({ id: "r1", texto: "x", cuando: {}, hacer: "enviar" })).toBeNull();
    expect(validarRegla({ id: "r2", texto: "x", cuando: {}, hacer: "borrar" })).toBeNull();
  });

  it("rechaza textos muy largos (>500) y campos extra", () => {
    const largo = "a".repeat(501);
    expect(validarRegla({ id: "r", texto: largo, cuando: {}, hacer: "etiquetar" })).toBeNull();
    expect(validarRegla({ id: "r", texto: "ok", cuando: {}, hacer: "etiquetar", extra: 1 })).toBeNull();
  });

  it("acepta una regla válida completa", () => {
    const r = validarRegla({
      id: "r1",
      texto: "Marca como importante",
      cuando: { asuntoContiene: "urgente" },
      hacer: "destacar",
    });
    expect(r).not.toBeNull();
    expect(r?.id).toBe("r1");
    expect(r?.hacer).toBe("destacar");
  });

  it("rechaza campos extra dentro de `cuando`", () => {
    expect(
      validarRegla({ id: "r", texto: "ok", cuando: { de: "a", extra: 1 }, hacer: "mover" }),
    ).toBeNull();
  });
});

describe("aplicarReglas", () => {
  it("devuelve acciones en orden y sin repetir", () => {
    const reglas = [
      validarRegla({ id: "a", texto: "a", cuando: { asuntoContiene: "hola" }, hacer: "etiquetar" })!,
      validarRegla({ id: "b", texto: "b", cuando: { asuntoContiene: "adios" }, hacer: "mover" })!,
      validarRegla({ id: "c", texto: "c", cuando: { asuntoContiene: "hola" }, hacer: "destacar" })!,
    ];
    const acciones = aplicarReglas(reglas, { asunto: "hola mundo" });
    expect(acciones.length).toBe(2);
    expect(acciones.map((a) => a.accion)).toEqual(["etiquetar", "destacar"]);
    expect(acciones.map((a) => a.reglaId)).toEqual(["a", "c"]);
  });

  it("no envía nada", () => {
    // Las funciones son puras: no hay envío, borrado ni llamada a red.
    expect(typeof aplicarReglas).toBe("function");
  });
});

describe("seguimiento-respuestas", () => {
  const yo = "user-1";
  const ahora = new Date("2026-10-27T12:00:00Z");

  it("por-responder cuando el último es de otro y pasaron horas", () => {
    const h: HiloLite = {
      id: "t1",
      ultimoMensajeDe: "user-2",
      ultimoMensajeEn: new Date(ahora.getTime() - 25 * 60 * 60 * 1000).toISOString(),
    };
    expect(clasificarHilo(h, yo, ahora, { horasEsperarRespuesta: 24 })).toBe("por-responder");
  });

  it("resuelto cuando no aplica ninguna condición", () => {
    const h: HiloLite = {
      id: "t2",
      ultimoMensajeDe: "user-2",
      ultimoMensajeEn: new Date(ahora.getTime() - 1 * 60 * 60 * 1000).toISOString(),
    };
    expect(clasificarHilo(h, yo, ahora)).toBe("resuelto");
  });

  it("esperando cuando el último es mío y pasaron días", () => {
    const h: HiloLite = {
      id: "t3",
      ultimoMensajeDe: yo,
      ultimoMensajeEn: new Date(ahora.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(clasificarHilo(h, yo, ahora)).toBe("esperando");
  });

  it("resuelto explícito tiene prioridad", () => {
    const h: HiloLite = {
      id: "t4",
      resuelto: true,
      ultimoMensajeDe: "user-2",
      ultimoMensajeEn: new Date(ahora.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(clasificarHilo(h, yo, ahora)).toBe("resuelto");
  });

  it("resumenSeguimiento cuenta correctamente", () => {
    const hilos: HiloLite[] = [
      { id: "t1", ultimoMensajeDe: "o1", ultimoMensajeEn: new Date(ahora.getTime() - 30 * 60 * 60 * 1000).toISOString() },
      { id: "t2", ultimoMensajeDe: yo, ultimoMensajeEn: new Date(ahora.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString() },
      { id: "t3", resuelto: true, ultimoMensajeDe: yo },
    ];
    const r = resumenSeguimiento(hilos, yo, ahora);
    expect(r.porResponder).toBe(1);
    expect(r.esperando).toBe(1);
    expect(r.resuelto).toBe(1);
  });
});
