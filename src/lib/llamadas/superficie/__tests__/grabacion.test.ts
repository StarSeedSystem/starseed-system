import { describe, expect, it, vi } from "vitest";
import { GRABACION_INICIAL as G, aplicarAviso, avisosParaNuevo, hayGrabacion, iniciarGrabacion, pararGrabacion, quitarParticipante, resolverDestino, textoIndicador, type AvisoGrabacion } from "../grabacion";

const deps = (o: Partial<Parameters<typeof iniciarGrabacion>[1]> = {}) => ({
  yo: "mac", nombre: "Mac", ahora: () => 100, nuevoId: () => "g1", otros: () => ["tablet", "movil"],
  avisar: vi.fn(async (_a: AvisoGrabacion) => ["tablet", "movil"]), arrancar: vi.fn(async () => {}), ...o,
});

describe("consentimiento de grabación (LLA1108C)", () => {
  it("apagada por defecto, sin indicador", () => {
    expect(G.fase).toBe("apagada");
    expect(hayGrabacion(G)).toBe(false);
  });
  it("avisa a todos ANTES de arrancar y enciende el indicador", async () => {
    const d = deps();
    const orden: string[] = [];
    d.avisar.mockImplementation(async () => { orden.push("aviso"); return ["tablet", "movil"]; });
    d.arrancar.mockImplementation(async () => { orden.push("arranca"); });
    const r = await iniciarGrabacion(G, d);
    expect(r.ok).toBe(true);
    expect(orden).toEqual(["aviso", "arranca"]);
    expect(r.estado.fase).toBe("grabando");
    expect(hayGrabacion(r.estado)).toBe(true);
    expect(textoIndicador(r.estado, "mac")).toBe("Grabando (tú)");
    expect(d.avisar.mock.calls[0][0]).toMatchObject({ activa: true, de: "mac", id: "g1" });
  });
  it("falla cerrado si el aviso no llega a alguien: no se graba", async () => {
    const d = deps({ avisar: vi.fn(async () => ["tablet"]) });
    const r = await iniciarGrabacion(G, d);
    expect(r.ok).toBe(false);
    expect(d.arrancar).not.toHaveBeenCalled();
    expect(r.estado.fase).toBe("apagada");
    expect(r.motivo).toMatch(/todos/);
  });
  it("si falla la difusión entera tampoco graba; si falla la grabadora retira el aviso", async () => {
    expect((await iniciarGrabacion(G, deps({ avisar: vi.fn(async () => { throw new Error("x"); }) }))).ok).toBe(false);
    const d = deps({ arrancar: vi.fn(async () => { throw new Error("sin permiso"); }) });
    const r = await iniciarGrabacion(G, d);
    expect(r.ok).toBe(false);
    expect(d.avisar).toHaveBeenCalledTimes(2);
    expect(d.avisar.mock.calls[1][0].activa).toBe(false);
  });
  it("solo, sin otros participantes, graba sin difundir", async () => {
    const d = deps({ otros: () => [] });
    expect((await iniciarGrabacion(G, d)).ok).toBe(true);
    expect(d.avisar).not.toHaveBeenCalled();
  });
  it("las demás neuronas ven el indicador rojo; idempotente; se apaga al parar", () => {
    const a: AvisoGrabacion = { k: "grabacion", id: "g1", de: "mac", nombre: "Alex", activa: true, en: 1 };
    const s = aplicarAviso(G, a);
    expect(aplicarAviso(s, a)).toBe(s);
    expect(hayGrabacion(s)).toBe(true);
    expect(textoIndicador(s, "tablet")).toBe("Alex está grabando esta llamada");
    expect(aplicarAviso(s, { ...a, id: "otro", activa: false })).toBe(s);
    expect(hayGrabacion(aplicarAviso(s, { ...a, activa: false }))).toBe(false);
  });
  it("quien entra tarde recibe el aviso; si el que graba se va, se apaga", () => {
    const s = aplicarAviso(G, { k: "grabacion", id: "g1", de: "mac", nombre: "Alex", activa: true, en: 1 });
    expect(avisosParaNuevo(s)).toHaveLength(1);
    expect(avisosParaNuevo(s)[0].activa).toBe(true);
    expect(hayGrabacion(quitarParticipante(s, "mac"))).toBe(false);
  });
  it("parar → decidir → guardar o descartar", async () => {
    const r = await iniciarGrabacion(G, deps());
    const d = deps();
    const p = await pararGrabacion(r.estado, d);
    expect(p.fase).toBe("decidiendo");
    expect(hayGrabacion(p)).toBe(false);
    expect(d.avisar.mock.calls[0][0].activa).toBe(false);
    expect(resolverDestino(p, "biblioteca")).toMatchObject({ guardar: "biblioteca", estado: { fase: "apagada" } });
    expect(resolverDestino(p, "descartar").guardar).toBeNull();
    expect(resolverDestino(G, "archivos").guardar).toBeNull();
  });
});
