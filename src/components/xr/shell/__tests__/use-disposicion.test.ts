import { describe, expect, it } from "vitest";
import { debeRecentrar, disponerTrinity, normalDePanel, type EntradaEspacio } from "../../../../lib/xr/espacio-trinity";

/**
 * Rescate de pruebas de `refs/archivo/nube/40958786619` (XR1010J «Rig de la Trinity»): los casos de la
 * rama que main no cubría, adaptados a la API actual (`src/lib/xr/espacio-trinity.ts`). La máquina de
 * estado de recentrado de la rama (`siguienteBase` con `fueraDesde`/orden) no existe en main, que cambió
 * a propósito a la decisión pura `debeRecentrar`: esos casos se descartan.
 */
const base = (extra: Partial<EntradaEspacio> = {}): EntradaEspacio =>
  ({ alturaOjos: 1.62, postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo", ...extra });

describe("recentrado (rescate nube/40958786619)", () => {
  it("la base no salta cuando la cabeza gira menos del umbral (70°)", () => {
    expect(debeRecentrar((68 * Math.PI) / 180, 0, 10_000)).toBe(false);
  });
});

describe("disposición de la Trinity (rescate nube/40958786619)", () => {
  const d = disponerTrinity(base());

  it("cambiar de postura mueve los nodos y las distancias son 1,8 / 1,6 / 1,2 m", () => {
    const pie = disponerTrinity(base({ postura: "de-pie" }));
    const silla = disponerTrinity(base({ postura: "sentado" }));
    expect(pie.nodos.zenith.distancia).toBe(1.8);
    expect(silla.nodos.zenith.distancia).toBe(1.6);
    expect(disponerTrinity(base({ postura: "una-mano" })).nodos.zenith.distancia).toBe(1.2);
    expect(pie.nodos.horizon.posicion).not.toEqual(silla.nodos.horizon.posicion);
  });

  it("el dock (Anchor) mira al pecho, un punto entre los ojos y el suelo (muelle: −41° · 85 %)", () => {
    const ojos: [number, number, number] = [0, 1.62, 0];
    const a = d.nodos.anchor;
    const h = [ojos[0] - a.posicion[0], ojos[1] - a.posicion[1], ojos[2] - a.posicion[2]];
    expect(Math.abs(normalDePanel(a.rotacion).reduce((s, x, i) => s + x * h[i], 0) / Math.hypot(...h))).toBeGreaterThan(0.99);
  });

  it("en AR la opacidad mínima sube a 0,82 y el anclaje es el mundo; en VR queda 0,6", () => {
    const ar = disponerTrinity(base({ modo: "ar-passthrough" }));
    const vr = disponerTrinity(base({ modo: "vr-inmersivo" }));
    expect([ar.opacidadMinima, ar.nodos.zenith.anclaje, vr.opacidadMinima]).toEqual([0.82, "mundo", 0.6]);
  });

  it("en postura una-mano Logic comparte panel con Horizon (agrupado y oculto)", () => {
    const u = disponerTrinity(base({ postura: "una-mano" }));
    expect(u.nodos.logic.visible).toBe(false);
    expect(u.nodos.logic.agrupadoCon).toBe("horizon");
    expect(u.nodos.horizon.visible).toBe(true);
    expect(u.nodos.horizon.azimutDeg).toBe(u.nodos.logic.azimutDeg);
  });
});
