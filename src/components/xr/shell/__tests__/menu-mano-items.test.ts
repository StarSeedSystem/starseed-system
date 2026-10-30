/** XR1010N · pruebas del menú de mano (node puro: entrada → salida, sin red, sin WebGL). */
import { describe, expect, it } from "vitest";
import { ACCIONES_XR } from "../../../../lib/xr/vinculos-xr";
import { disponerTrinity, type NodoEspacial } from "../../../../lib/xr/espacio-trinity";
import type { Postura, Vec3 } from "../../../../lib/xr/tipos";
import { cuatEulerYXZ, gatillosBotonMenuMano, itemsMenuMano, posicionMenu, type Cuat } from "../menu-mano-items";

const POSE_IDENT = { pos: [0.3, 1.2, -0.4] as Vec3, rot: [0, 0, 0, 1] as Cuat };

const nodoMenu = (postura: Postura, manoDominante: "izquierda" | "derecha"): NodoEspacial =>
  disponerTrinity({ alturaOjos: 1.6, postura, manoDominante, modo: "vr-inmersivo" }).nodos.menuMano;

describe("itemsMenuMano", () => {
  it("«salir» es el primer tocable y «recentrar» siempre segundo, en las tres posturas", () => {
    for (const postura of ["de-pie", "sentado", "una-mano"] as Postura[]) {
      const items = itemsMenuMano({ postura, hablando: false, calidadAuto: true });
      expect(items[0].id).toBe("salir");
      expect(items[1].id).toBe("recentrar");
    }
  });

  it("en postura de una mano la lista es más corta pero conserva «salir» y «recentrar»", () => {
    const larga = itemsMenuMano({ postura: "de-pie", hablando: false, calidadAuto: true });
    const corta = itemsMenuMano({ postura: "una-mano", hablando: false, calidadAuto: true });
    expect(corta.length).toBeLessThan(larga.length);
    expect(corta.map((i) => i.id)).toContain("salir");
    expect(corta.map((i) => i.id)).toContain("recentrar");
  });

  it("«hablando» cambia la etiqueta de voz, «calidadAuto» la de calidad; ids únicos y etiquetas honestas", () => {
    const durante = itemsMenuMano({ postura: "de-pie", hablando: true, calidadAuto: false });
    const normal = itemsMenuMano({ postura: "de-pie", hablando: false, calidadAuto: false });
    expect(durante.find((i) => i.id === "hablar")?.etiqueta).toBe("Detener voz");
    expect(normal.find((i) => i.id === "hablar")?.etiqueta).toBe("Hablar");
    const auto = itemsMenuMano({ postura: "de-pie", hablando: false, calidadAuto: true });
    expect(auto.find((i) => i.id === "calidad")?.accion).toBe("calidad");
    expect(new Set(durante.map((i) => i.id)).size).toBe(durante.length);
    for (const item of durante) expect(item.etiqueta.length).toBeGreaterThan(0);
  });

  it("las acciones del menú están mapeadas a AccionXR; calidad y ajustes quedan aparte", () => {
    const items = itemsMenuMano({ postura: "sentado", hablando: false, calidadAuto: true });
    for (const item of items) {
      if (item.accion !== "calidad" && item.accion !== "ajustes") expect(ACCIONES_XR).toContain(item.accion);
    }
    expect(items.find((i) => i.id === "dock")?.accion).toBe("abrir-dock");
    expect(items.find((i) => i.id === "recentrar")?.accion).toBe("recentrar");
    expect(items.find((i) => i.id === "salir")?.accion).toBe("salir");
  });
});

describe("posicionMenu", () => {
  /** Nodo propio con desplazamiento lateral ±x para poner a prueba el espejo entre manos. */
  const nodoX: NodoEspacial = { ...nodoMenu("de-pie", "derecha"), posicion: [0.02, 0.09, -0.02] as Vec3 };

  it("cambia de mano con la dominante: espeja el desplazamiento local", () => {
    const izquierda = posicionMenu(POSE_IDENT, "izquierda", nodoX);
    const derecha = posicionMenu(POSE_IDENT, "derecha", nodoX);
    expect(izquierda.posicion[0]).toBeCloseTo(POSE_IDENT.pos[0] + 0.02, 5);
    expect(derecha.posicion[0]).toBeCloseTo(POSE_IDENT.pos[0] - 0.02, 5);
  });

  it("queda pegado a la muñeca (≤ 15 cm), con el nodo real de la Trinity", () => {
    const { posicion } = posicionMenu(POSE_IDENT, "izquierda", nodoMenu("sentado", "derecha"));
    const d = Math.hypot(posicion[0] - POSE_IDENT.pos[0], posicion[1] - POSE_IDENT.pos[1], posicion[2] - POSE_IDENT.pos[2]);
    expect(d).toBeLessThanOrEqual(0.15);
    expect(posicion[1]).toBeGreaterThan(POSE_IDENT.pos[1]);
  });

  it("sin cabeza: aplica la inclinación del nodo sobre la muñeca; con ella, mira a la cabeza", () => {
    const nodo = nodoMenu("de-pie", "derecha");
    const plano = posicionMenu({ pos: [0, 0, 0], rot: [0, 0, 0, 1] }, "izquierda", nodo);
    expect(plano.rotacion[0]).toBeCloseTo(cuatEulerYXZ(nodo.rotacion)[0], 5);
    expect(plano.rotacion[3]).toBeCloseTo(cuatEulerYXZ(nodo.rotacion)[3], 5);
    const muneca = { pos: POSE_IDENT.pos, rot: [0.7071068, 0, 0, 0.7071068] as Cuat };
    const cabeza: Vec3 = [0.9, 1.6, -0.4];
    const girada = posicionMenu(muneca, "izquierda", nodo, cabeza);
    const yaw = Math.atan2(cabeza[0] - girada.posicion[0], cabeza[2] - girada.posicion[2]);
    expect(girada.rotacion).toEqual([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
    expect(Math.abs(girada.rotacion[1])).toBeGreaterThan(0); // la cabeza queda de costado: el panel gira a mirarla
  });

  it("el cuaternión de entrada rota el desplazamiento: muñeca girada 90° en y saca el panel del eje", () => {
    const nodo = { ...nodoMenu("de-pie", "derecha"), posicion: [0, 0.09, -0.02] as Vec3 };
    const muneca = { pos: [0, 1.2, 0] as Vec3, rot: [0, 0.7071068, 0, 0.7071068] as Cuat };
    const { posicion } = posicionMenu(muneca, "izquierda", nodo);
    expect(posicion[0]).toBeCloseTo(-0.02, 5); // (0, .09, -.02) rotado 90° en y → (−.02, .09, 0)
    expect(posicion[1]).toBeCloseTo(1.29, 5);
    expect(posicion[2]).toBeCloseTo(0, 5);
  });

  it("gatillos de botón del mapa: por defecto el A/X izquierdo (botón 4), sin frases ni gestos", () => {
    expect(gatillosBotonMenuMano({ "menu-mano": [{ tipo: "boton", indice: 4, mano: "izquierda" }, { tipo: "frase", texto: "abre el menú" }] }))
      .toEqual([{ mano: "izquierda", indice: 4 }]);
    expect(gatillosBotonMenuMano({})).toEqual([]);
  });
});
