/** capacidad-por-malla (Ola 1017A) — protocolo `capacidad.*` y cliente `pedirCapacidad` sobre un canal FALSO. */
import { describe, expect, it } from "vitest";
import { CAPACIDAD_MAX_BYTES, cabeEnMensajeCapacidad, esMensajeCapacidad, parseCapacidadMensaje, pedirCapacidad } from "@/lib/network/capacidad-por-malla";
import type { CapacidadCuerpo, CapacidadTipo, SolicitudCapacidad } from "@/lib/network/capacidad-por-malla";

class CanalFalso {
  enviados: unknown[] = []; cerrado = false; lanzar = false;
  /** Graba lo enviado (JSON → objeto); puede fingir canal cerrado o roto (que lanza). */
  readonly enviar = (json: string): boolean => {
    if (this.lanzar) throw new Error("canal roto");
    if (this.cerrado) return false;
    try { this.enviados.push(JSON.parse(json) as unknown); } catch { this.enviados.push(json); }
    return true;
  };
}
const crudo = (o: unknown): string => JSON.stringify(o);
const pedirCon = (c: CanalFalso, tipo: CapacidadTipo, cuerpo: CapacidadCuerpo = {}, timeoutMs = 5_000): SolicitudCapacidad =>
  pedirCapacidad(c.enviar, { tipo, cuerpo, sesionId: "s1", timeoutMs });

describe("protocolo capacidad.*", () => {
  it("guard: acepta los cinco tipos bien formados", () => {
    expect(esMensajeCapacidad({ t: "capacidad.pedir", id: "1", tipo: "voz", cuerpo: {} })).toBe(true);
    expect(esMensajeCapacidad({ t: "capacidad.trozo", id: "1", texto: "hola", i: 0, total: 1 })).toBe(true);
    expect(esMensajeCapacidad({ t: "capacidad.fin", id: "1", tipo: "imagen", meta: { bytes: 2 } })).toBe(true);
    expect(esMensajeCapacidad({ t: "capacidad.error", id: "1", estado: 429, mensaje: "La cola está llena." })).toBe(true);
    expect(esMensajeCapacidad({ t: "capacidad.cancelar", id: "1" })).toBe(true);
  });

  it("guard: rechaza basura, otros namespaces, tipo desconocido y payloads incompletos", () => {
    expect(esMensajeCapacidad(null)).toBe(false); expect(esMensajeCapacidad("texto")).toBe(false);
    expect(esMensajeCapacidad({ t: "ia.pedir", id: "1", tipo: "voz", cuerpo: {} })).toBe(false);
    expect(esMensajeCapacidad({ t: "capacidad.pedir", id: "1", tipo: "flauta", cuerpo: {} })).toBe(false);
    expect(esMensajeCapacidad({ t: "capacidad.trozo", id: "1", texto: "x" })).toBe(false);
    expect(esMensajeCapacidad({ t: "capacidad.error", id: "1", estado: "429", mensaje: "x" })).toBe(false);
  });

  it("parse y tope de tamaño (16 KB en bytes UTF-8)", () => {
    expect(parseCapacidadMensaje(crudo({ t: "capacidad.cancelar", id: "1" }))).toEqual({ t: "capacidad.cancelar", id: "1" });
    expect(parseCapacidadMensaje("{roto")).toBeNull(); expect(parseCapacidadMensaje(",,,,,,,,")).toBeNull();    expect(cabeEnMensajeCapacidad(crudo({ t: "x" }))).toBe(true); expect(cabeEnMensajeCapacidad("a".repeat(CAPACIDAD_MAX_BYTES + 1))).toBe(false);
  });
});

describe("pedirCapacidad (cliente, canal falso)", () => {
  it("éxito: arma capacidad.pedir y reúne trozos + fin (meta incluida)", async () => {
    const c = new CanalFalso();
    const sol = pedirCon(c, "voz", { entrada: "hola" });
    expect(c.enviados).toHaveLength(1);
    expect(c.enviados[0]).toMatchObject({ t: "capacidad.pedir", id: "s1", tipo: "voz", cuerpo: { entrada: "hola" } });
    sol.recibir(crudo({ t: "capacidad.fin", id: "OTRA", tipo: "voz" })); // otra sesión: se ignora
    sol.recibir(crudo({ t: "capacidad.trozo", id: "s1", texto: "Ho", i: 0, total: 2 })); sol.recibir(crudo({ t: "capacidad.trozo", id: "s1", texto: "la", i: 1, total: 2 }));
    sol.recibir(crudo({ t: "capacidad.fin", id: "s1", tipo: "voz", meta: { bytes: 2 } }));
    expect(await sol.promesa).toEqual({ ok: true, id: "s1", tipo: "voz", texto: "Hola", meta: { bytes: 2 } });
  });

  it("trozos desordenados: reúne por ÍNDICE, no por orden de llegada", async () => {
    const c = new CanalFalso();
    const sol = pedirCon(c, "imagen");
    for (const [i, texto] of [[2, "3"], [0, "1"], [1, "2"]] as const) {
      sol.recibir(crudo({ t: "capacidad.trozo", id: "s1", texto, i, total: 3 }));
    }
    sol.recibir(crudo({ t: "capacidad.fin", id: "s1", tipo: "imagen" }));
    expect(await sol.promesa).toEqual({ ok: true, id: "s1", tipo: "imagen", texto: "123" });
  });

  it("fin con trozos perdidos ⇒ {ok:false}, nunca un resultado corrupto", async () => {
    const c = new CanalFalso();
    const sol = pedirCon(c, "render");
    sol.recibir(crudo({ t: "capacidad.trozo", id: "s1", texto: "a", i: 0, total: 3 })); sol.recibir(crudo({ t: "capacidad.trozo", id: "s1", texto: "c", i: 2, total: 3 }));
    sol.recibir(crudo({ t: "capacidad.fin", id: "s1", tipo: "render" }));
    expect(await sol.promesa).toMatchObject({ ok: false, motivo: "Se perdieron trozos del resultado." });
  });

  it("error del servidor: {ok:false, motivo, estado, ocupado, reintentarEnS}", async () => {
    const c = new CanalFalso();
    const sol = pedirCon(c, "transcodificar");
    sol.recibir(crudo({ t: "capacidad.error", id: "s1", estado: 429, mensaje: "La cola de esta neurona está llena.", ocupado: true, reintentarEnS: 8 }));
    expect(await sol.promesa).toEqual({ ok: false, motivo: "La cola de esta neurona está llena.", estado: 429, ocupado: true, reintentarEnS: 8 });
  });

  it("cancelar: manda capacidad.cancelar, cierra con «Cancelado.» e ignora mensajes tardíos", async () => {
    const c = new CanalFalso();
    const sol = pedirCon(c, "palabra");
    sol.cancelar(); sol.cancelar(); // idempotente
    sol.recibir(crudo({ t: "capacidad.fin", id: "s1", tipo: "palabra" }));
    expect(await sol.promesa).toMatchObject({ ok: false, motivo: "Cancelado." });
    expect(c.enviados).toHaveLength(2); // pedir + un solo cancelar (el mensaje tardío se ignoró)
    expect(c.enviados[1]).toEqual({ t: "capacidad.cancelar", id: "s1" });
  });

  it("tiempo agotado: cierra con «Tiempo agotado.» y avisa al servidor con capacidad.cancelar", async () => {
    const c = new CanalFalso();
    const sol = pedirCon(c, "buscar", {}, 0);
    expect(await sol.promesa).toMatchObject({ ok: false, motivo: "Tiempo agotado." });
    expect(c.enviados[1]).toEqual({ t: "capacidad.cancelar", id: "s1" });
  });

  it("tipo no válido ⇒ {ok:false} SIN enviar nada", async () => {
    const c = new CanalFalso();
    const sol = pedirCon(c, "flauta" as CapacidadTipo);
    expect(await sol.promesa).toMatchObject({ ok: false, motivo: "Tipo de capacidad no válido." });
    expect(c.enviados).toHaveLength(0);
  });

  it("tope de 16 KB: petición demasiado grande ⇒ {ok:false} sin enviar", async () => {
    const c = new CanalFalso();
    const sol = pedirCon(c, "construir", { entrada: "x".repeat(CAPACIDAD_MAX_BYTES + 64) });
    expect(await sol.promesa).toMatchObject({ ok: false, motivo: "La petición supera el tope de tamaño por mensaje." });
    expect(c.enviados).toHaveLength(0);
  });

  it("canal cerrado o que lanza ⇒ {ok:false}, sin excepción para quien llama", async () => {
    for (const modo of ["cerrado", "lanzar"] as const) {
      const c = new CanalFalso();
      c[modo] = true;
      const sol = pedirCon(c, "oido");
      expect(await sol.promesa).toMatchObject({ ok: false, motivo: "No se pudo enviar la petición por el canal." });
      expect(c.enviados).toHaveLength(0);
    }
  });
});
