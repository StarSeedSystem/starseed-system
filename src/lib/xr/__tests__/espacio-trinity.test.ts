import { describe, expect, it } from "vitest";
import { OBJETIVO_MIN_RAYO_DEG, OBJETIVO_MIN_TACTO_M, debeRecentrar, disponerTrinity, normalDePanel, posicionesDock, type EntradaEspacio } from "../espacio-trinity";
import type { NodoTrinity } from "../tipos";

const E: EntradaEspacio = { alturaOjos: 1.65, postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo" };
const ojos = (e: EntradaEspacio): [number, number, number] => [0, e.alturaOjos, 0];

describe("disposición Trinity en el espacio", () => {
  it("cada panel mira a los ojos (su normal apunta hacia la cabeza)", () => {
    const d = disponerTrinity(E);
    for (const id of ["zenith", "horizon", "logic"] as NodoTrinity[]) {
      const n = d.nodos[id];
      const norm = normalDePanel(n.rotacion);
      const haciaOjos = [ojos(E)[0] - n.posicion[0], ojos(E)[1] - n.posicion[1], ojos(E)[2] - n.posicion[2]];
      const l = Math.hypot(...haciaOjos);
      const cos = (norm[0] * haciaOjos[0] + norm[1] * haciaOjos[1] + norm[2] * haciaOjos[2]) / l;
      expect(cos).toBeGreaterThan(0.99);
    }
  });
  it("los cardinales se mantienen: Zenith arriba, Horizon a la izquierda, Logic a la derecha, Anchor abajo", () => {
    const { nodos } = disponerTrinity(E);
    expect(nodos.zenith.elevacionDeg).toBeGreaterThan(0);
    expect(nodos.horizon.posicion[0]).toBeLessThan(0);
    expect(nodos.logic.posicion[0]).toBeGreaterThan(0);
    expect(nodos.anchor.posicion[1]).toBeLessThan(E.alturaOjos);
    expect(nodos.anchor.capa).toBe("cercana");
  });
  it("ser zurdo no espeja los cardinales: sólo cambia la mano del menú", () => {
    const der = disponerTrinity(E);
    const izq = disponerTrinity({ ...E, manoDominante: "izquierda" });
    expect(izq.nodos.horizon.posicion).toEqual(der.nodos.horizon.posicion);
    expect(izq.nodos.logic.posicion).toEqual(der.nodos.logic.posicion);
    expect(der.mano).toBe("izquierda");
    expect(izq.mano).toBe("derecha");
  });
  it("a distancias de brazo cómodas: ni pegado a la cara ni lejos", () => {
    const { nodos } = disponerTrinity(E);
    for (const id of ["zenith", "horizon", "logic"] as NodoTrinity[]) {
      expect(nodos[id].distancia).toBeGreaterThanOrEqual(1.0);
      expect(nodos[id].distancia).toBeLessThanOrEqual(2.5);
    }
  });
  it("la escala y la altura se acotan y el techo no se atraviesa", () => {
    const a = disponerTrinity({ ...E, escala: 10, alturaOjos: 99 });
    const b = disponerTrinity({ ...E, escala: 1.5, alturaOjos: 2.1 });
    expect(a.nodos.zenith.ancho).toBeCloseTo(b.nodos.zenith.ancho, 3);
    const bajo = disponerTrinity({ ...E, techo: 2.2 });
    expect(bajo.nodos.zenith.posicion[1] + bajo.nodos.zenith.alto / 2).toBeLessThanOrEqual(2.2);
  });
  it("sentado queda más cerca que de pie y a una mano agrupa Logic con Horizon", () => {
    expect(disponerTrinity({ ...E, postura: "sentado" }).nodos.zenith.distancia).toBeLessThan(disponerTrinity(E).nodos.zenith.distancia);
    const u = disponerTrinity({ ...E, postura: "una-mano" });
    expect(u.nodos.logic.agrupadoCon).toBe("horizon");
    expect(u.nodos.logic.visible).toBe(false);
  });
  it("en AR los paneles son más opacos y se anclan al mundo; en 2D a la pantalla y sin menú de mano", () => {
    expect(disponerTrinity({ ...E, modo: "ar-passthrough" }).opacidadMinima).toBeGreaterThan(disponerTrinity(E).opacidadMinima);
    expect(disponerTrinity({ ...E, modo: "ar-passthrough" }).nodos.zenith.anclaje).toBe("mundo");
    const p = disponerTrinity({ ...E, modo: "2d" });
    expect(p.nodos.zenith.anclaje).toBe("pantalla");
    expect(p.nodos.menuMano.visible).toBe(false);
  });
  it("el menú de mano nunca usa el pellizco de palma, que reserva el sistema", () => {
    const { activacionMenu } = disponerTrinity(E);
    expect(activacionMenu.manos).not.toMatch(/pellizco/i);
    expect(activacionMenu.cosenoPalma).toBeGreaterThan(0.3);
  });
  it("los umbrales de objetivo mínimo son los de la guía de confort", () => {
    expect(OBJETIVO_MIN_TACTO_M).toBeGreaterThanOrEqual(0.03);
    expect(OBJETIVO_MIN_RAYO_DEG).toBeGreaterThanOrEqual(2);
  });
});

describe("dock y recentrado", () => {
  it("los botones del dock son equidistantes del pecho y no pasan de un arco de unos 100 grados", () => {
    const ps = posicionesDock(30, E);
    expect(ps.length).toBeLessThanOrEqual(16);
    const radios = ps.map((p) => Math.hypot(p.posicion[0], p.posicion[2]));
    for (const r of radios) expect(r).toBeCloseTo(radios[0], 2);
    expect(posicionesDock(1, E)).toHaveLength(1);
    expect(posicionesDock(0, E)).toHaveLength(1);
  });
  it("sólo recentra si se mira muy lejos durante un rato", () => {
    expect(debeRecentrar(Math.PI * 0.6, 0, 1)).toBe(false);
    expect(debeRecentrar(Math.PI * 0.6, 0, 5)).toBe(true);
    expect(debeRecentrar(0.2, 0, 60)).toBe(false);
    expect(debeRecentrar(-Math.PI * 0.9 + 2 * Math.PI, 0, 4)).toBe(true);
  });
});
