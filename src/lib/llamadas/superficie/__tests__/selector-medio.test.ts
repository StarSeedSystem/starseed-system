import { describe, expect, it } from "vitest";
import { alCaerMedio, decidirMedio, medioPuedeLlevar, opcionesMedio } from "../selector-medio";

describe("selector de medio (LLA1108C)", () => {
  it("Bluetooth no puede llevar audio ni vídeo y lo dice", () => {
    const r = medioPuedeLlevar("bluetooth", "voz");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/tiempo real/);
    expect(medioPuedeLlevar("red-local", "pantalla").ok).toBe(true);
  });
  it("opciones: automático siempre; los demás según haya enlace y capacidad", () => {
    const o = opcionesMedio("voz", { "red-local": true, bluetooth: true });
    expect(o[0]).toMatchObject({ medio: "automatico", disponible: true });
    expect(o.find((x) => x.medio === "red-local")?.disponible).toBe(true);
    expect(o.find((x) => x.medio === "bluetooth")?.disponible).toBe(false);
    expect(o.find((x) => x.medio === "turn")?.motivo).toMatch(/No hay enlace/);
  });
  it("pedir un medio disponible re-rutea; uno ausente deja la llamada como está", () => {
    const ok = decidirMedio({ pedido: "wifi-directo", actual: "cuenta", tipo: "voz", hay: { "wifi-directo": true, cuenta: true }, sugerido: "wifi-directo" });
    expect(ok).toMatchObject({ usar: "wifi-directo", reRutar: true, respetado: true });
    const no = decidirMedio({ pedido: "turn", actual: "cuenta", tipo: "voz", hay: { cuenta: true }, sugerido: "cuenta" });
    expect(no).toMatchObject({ usar: "automatico", reRutar: false, respetado: false });
    expect(no.texto).toMatch(/no se corta/);
    const bt = decidirMedio({ pedido: "bluetooth", actual: "red-local", tipo: "voz", hay: { bluetooth: true }, sugerido: "red-local" });
    expect(bt.respetado).toBe(false);
  });
  it("automático re-rutea solo si el sugerido difiere", () => {
    expect(decidirMedio({ pedido: "automatico", actual: "cuenta", tipo: "voz", hay: {}, sugerido: "red-local" }).reRutar).toBe(true);
    expect(decidirMedio({ pedido: "automatico", actual: "red-local", tipo: "voz", hay: {}, sugerido: "red-local" }).reRutar).toBe(false);
  });
  it("si cae el medio fijado se pasa a otro capaz; bluetooth no vale de recambio", () => {
    const a = alCaerMedio({ fijado: "red-local", hay: { bluetooth: true, cuenta: true }, tipo: "voz" });
    expect(a).toMatchObject({ reRutar: true, usar: "automatico" });
    expect(a.texto).toMatch(/cuenta/);
    const b = alCaerMedio({ fijado: "red-local", hay: { bluetooth: true }, tipo: "voz" });
    expect(b.reRutar).toBe(false);
    expect(alCaerMedio({ fijado: "red-local", hay: { "red-local": true }, tipo: "voz" }).respetado).toBe(true);
  });
});
