import { describe, expect, it } from "vitest";
import { SUPERFICIE_INICIAL as I, diferenciaPistas, duracionHablada, puedeCambiarTipo, reducirSuperficie as r, tamanosPermitidos, textoEstado, type Superficie } from "../maquina";

const conectada = (): Superficie => r(r(I, { t: "llamar", tipo: "voz" }), { t: "conectar", ahora: 1000 });

describe("máquina de la superficie de llamada (LLA1108C)", () => {
  it("saliente → conectada → terminada con duración y medio", () => {
    let s = r(I, { t: "llamar", tipo: "voz" });
    expect(s.estado).toBe("saliente");
    s = r(s, { t: "conectar", ahora: 1000 });
    expect(s.estado).toBe("conectada");
    expect(s.tamano).toBe("burbuja");
    s = r(s, { t: "terminar", fin: "colgada", ahora: 66_000, medio: "red local" });
    expect(s).toMatchObject({ estado: "terminada", duracionMs: 65_000, medioUsado: "red local", tamano: "panel" });
  });
  it("entrante pide atención (panel) y rechazar la deja terminada sin duración", () => {
    let s = r(I, { t: "sonar", tipo: "video" });
    expect(s.tamano).toBe("panel");
    s = r(s, { t: "terminar", fin: "rechazada", ahora: 5 });
    expect(s.duracionMs).toBe(0);
    expect(textoEstado(s, "Ana")).toBe("Llamada rechazada");
  });
  it("no se puede llamar con otra llamada viva ni conectar desde conectada", () => {
    const c = conectada();
    expect(r(c, { t: "llamar", tipo: "video" })).toBe(c);
    expect(r(c, { t: "conectar", ahora: 5 })).toBe(c);
  });
  it("la espera no cuenta en el cronómetro", () => {
    let s = conectada();
    s = r(s, { t: "en-espera", ahora: 11_000 });
    expect(duracionHablada(s, 20_000)).toBe(10_000);
    s = r(s, { t: "reanudar", ahora: 31_000 });
    expect(s.enEsperaMs).toBe(20_000);
    expect(duracionHablada(s, 41_000)).toBe(20_000);
  });
  it("reconectando solo desde viva y vuelve a conectada", () => {
    expect(r(r(I, { t: "llamar", tipo: "voz" }), { t: "enlace-perdido" }).estado).toBe("saliente");
    const s = r(conectada(), { t: "enlace-perdido" });
    expect(s.estado).toBe("reconectando");
    expect(r(s, { t: "enlace-recuperado" }).estado).toBe("conectada");
  });
  it("tamaños: pantalla completa recuerda el previo y Esc vuelve a él, interrumpible", () => {
    let s = r(conectada(), { t: "tamano", tamano: "panel" });
    s = r(s, { t: "alternar-completa" });
    expect(s.tamano).toBe("pantalla-completa");
    // otra orden a mitad: se cambia de destino sin pasar por estados raros
    s = r(s, { t: "escape" });
    expect(s.tamano).toBe("panel");
    s = r(r(s, { t: "tamano", tamano: "burbuja" }), { t: "alternar-completa" });
    expect(r(s, { t: "escape" }).tamano).toBe("burbuja");
    expect(r(I, { t: "escape" })).toBe(I);
    expect(r(I, { t: "tamano", tamano: "panel" })).toBe(I);
  });
  it("tamaños permitidos por estado", () => {
    expect(tamanosPermitidos("entrante")).not.toContain("burbuja");
    expect(tamanosPermitidos("conectada")).toContain("burbuja");
    expect(tamanosPermitidos("inactiva")).toEqual([]);
  });
  it("cambio de tipo sin colgar: solo conectada, uno a la vez, nunca desde/hacia grupo", () => {
    const c = conectada();
    expect(puedeCambiarTipo(c, "video").ok).toBe(true);
    expect(puedeCambiarTipo(c, "voz").ok).toBe(false);
    expect(puedeCambiarTipo(r(c, { t: "en-espera", ahora: 2 }), "video").ok).toBe(false);
    expect(puedeCambiarTipo({ ...c, tipo: "grupo" }, "video").ok).toBe(false);
    let s = r(c, { t: "cambiar-tipo", a: "video" });
    expect(s.cambiandoA).toBe("video");
    expect(puedeCambiarTipo(s, "pantalla").ok).toBe(false);
    s = r(s, { t: "tipo-cambiado", tipo: "video" });
    expect(s).toMatchObject({ tipo: "video", cambiandoA: null, estado: "conectada" });
    s = r(r(s, { t: "cambiar-tipo", a: "pantalla" }), { t: "tipo-fallido" });
    expect(s).toMatchObject({ tipo: "video", cambiandoA: null });
  });
  it("diferencia de pistas voz→video→pantalla→vivo", () => {
    expect(diferenciaPistas("voz", "video")).toEqual({ anadir: ["camara"], quitar: [] });
    expect(diferenciaPistas("video", "pantalla")).toEqual({ anadir: ["pantalla"], quitar: ["camara"] });
    expect(diferenciaPistas("pantalla", "vivo")).toEqual({ anadir: ["camara"], quitar: ["pantalla"] });
    expect(diferenciaPistas("voz", "voz")).toEqual({ anadir: [], quitar: [] });
  });
  it("descartar el resumen vuelve a inactiva", () => {
    const t = r(conectada(), { t: "terminar", fin: "colgada", ahora: 3000 });
    expect(r(t, { t: "descartar" })).toBe(I);
    expect(r(conectada(), { t: "descartar" }).estado).toBe("conectada");
  });
});
