/** XR1010AF · comodidad y accesibilidad (contrato §3 j): funciones puras directas y cascarón R3F con lienzo simulado. */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFORT_DEFECTO, opacidadVineta, type PreferenciasConfort } from "@/lib/xr/confort";
import type { ContextoAcciones } from "../acciones-xr";
import type { MeshBasicMaterial } from "three";

const h = vi.hoisted(() => ({
  confort: null as unknown as PreferenciasConfort, frames: [] as Array<(e: unknown) => void>, ctx: null as ContextoAcciones | null,
  camara: { position: { x: 0, y: 1.6, z: 0 }, rotation: { y: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: (e: unknown) => void) => { h.frames.push(cb); }, useThree: (sel: (s: unknown) => unknown) => sel(h.camara),
}));
vi.mock("../panel-cristal", () => ({ Texto3D: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("../vineta", async (importOriginal) => ({ ...(await importOriginal<typeof import("../vineta")>()),
  Vineta: ({ opacidad }: { opacidad: number }) => <div data-testid="vineta" data-opacidad={opacidad} /> }));
vi.mock("../use-prefs-xr", () => ({ usePrefsXR: () => ({ confort: h.confort, avisos: [] }) }));
vi.mock("../use-entrada-xr", async () => {
  const { ejecutarAccion } = await import("../acciones-xr");
  return { useEntradaXR: (ctx: ContextoAcciones) => ((h.ctx = ctx), { disparar: (a: Parameters<typeof ejecutarAccion>[0]) => ejecutarAccion(a, ctx), frase: () => {} }) };
});
import { Comodidad, agruparUnaMano, avisoMovimientoReducido, confortEfectivo, lineaSubtitulo, pasoDeGiro, poseSubtitulo, totalGiro, velocidades } from "../comodidad";
import { ajustarVineta, crearVineta } from "../vineta";

function avanza(t: number): void {
  for (const cb of h.frames) cb({ camera: h.camara, clock: { elapsedTime: t } });
}
beforeEach(() => { h.confort = { ...CONFORT_DEFECTO }; h.frames.length = 0; h.ctx = null; });

describe("puro: velocidades, viñeta, giro por saltos, movimiento reducido, subtítulos y una mano", () => {
  const mov = { lineal: 99, angularGradosS: 987 };
  const vel = (de: [number, number, number, number] | null, a: [number, number, number, number]) =>
    velocidades(de ? { x: de[0], z: de[1], yaw: de[2], t: de[3] } : null, { x: a[0], z: a[1], yaw: a[2], t: a[3] });
  it("velocidad m/s y angular: la primera medida y los datos raros son cero, el movimiento se mide", () => {
    expect(vel(null, [1, 0, 0.5, 1])).toEqual({ lineal: 0, angularGradosS: 0 });
    expect(vel([0, 0, 0, 0], [1, 0, Math.PI / 2, 0.5])).toEqual({ lineal: 2, angularGradosS: 180 }); expect(vel([0, 0, 0, NaN], [0, 0, 0, 2])).toEqual({ lineal: 0, angularGradosS: 0 });
  });
  it("la viñeta sube con la velocidad y nunca pasa de 0,85; con «nunca» es 0 salvo movimiento reducido", () => {
    expect(opacidadVineta(CONFORT_DEFECTO, { lineal: 0.3, angularGradosS: 17 })).toBe(0);
    expect(opacidadVineta(CONFORT_DEFECTO, { lineal: 2.4, angularGradosS: 111 })).toBeGreaterThan(0);
    const conFuerza = opacidadVineta(CONFORT_DEFECTO, mov);
    expect(conFuerza).toBeCloseTo(0.6, 9);
    expect(opacidadVineta({ ...CONFORT_DEFECTO, fuerzaVineta: 0.85 }, mov)).toBeCloseTo(0.85, 9);
    expect(opacidadVineta({ ...CONFORT_DEFECTO, vineta: "nunca" }, mov)).toBe(0);
    expect(opacidadVineta({ ...CONFORT_DEFECTO, vineta: "nunca", movimientoReducido: true }, mov)).toBeGreaterThan(0);
    expect(opacidadVineta({ ...CONFORT_DEFECTO, vineta: "siempre" }, { lineal: 0, angularGradosS: 0 })).toBeGreaterThan(0);
  });
  it("la malla: anillo negro, transparente, depthTest apagado, encima de todo, a 0,1 m y alfa ≤ 0,85", () => {
    const camara = { position: { x: 5, y: 2, z: 7 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
    const malla = crearVineta(), material = malla.material as MeshBasicMaterial;
    expect([material.color.getHex(), material.transparent, material.depthTest, malla.renderOrder >= 999]).toEqual([0, true, false, true]);
    ajustarVineta(malla, camara, 1);
    expect([material.opacity, malla.visible, ...malla.position.toArray().map((n) => +n.toFixed(6))]).toEqual([0.85, true, 5, 2, 6.9]);
    ajustarVineta(malla, camara, -3);
    expect([material.opacity, malla.visible]).toEqual([0, false]);
    malla.geometry.dispose(); material.dispose();
  });
  it("ocho saltos de 45° dan la vuelta; el paso por defecto es 30° alineado a rejilla", () => {
    const c45 = { ...CONFORT_DEFECTO, anguloSalto: 45 as const };
    expect([totalGiro(0, 1, 8, c45), totalGiro(0, -1, 8, c45)]).toEqual([Math.PI * 2, -Math.PI * 2]);
    expect(Math.round((totalGiro(0, 1, 12, CONFORT_DEFECTO) * 180) / Math.PI)).toBe(360);
    expect([pasoDeGiro(0, 1, c45), pasoDeGiro(0.11, -1, c45)]).toEqual([Math.PI / 4, -0.11]);
  });
  it("el movimiento reducido manda: saltos y teletransporte, con un aviso una vez", () => {
    const continuo = { ...CONFORT_DEFECTO, giro: "continuo", locomocion: "continua", movimientoReducido: true } as PreferenciasConfort;
    const efectivo = confortEfectivo(continuo);
    expect([efectivo.giro, efectivo.locomocion]).toEqual(["saltos", "teletransporte"]);
    expect(avisoMovimientoReducido(continuo, efectivo)).toMatch(/movimiento reducido/);
    expect(avisoMovimientoReducido(CONFORT_DEFECTO, confortEfectivo(CONFORT_DEFECTO))).toBeNull();
  });
  it("los subtítulos van al 1,5 m, bajo la mirada, y se ocultan con la preferencia apagada", () => {
    expect([lineaSubtitulo(false, "Crea un mundo virtual"), lineaSubtitulo(true, undefined, null)]).toEqual([null, null]);
    expect(lineaSubtitulo(true, "", " Ana entra al mundo ")).toBe("Ana entra al mundo"); const { pos, alto } = poseSubtitulo(1.5, 1, 0);
    expect(pos[1] < 0 && pos[2] === -1.5 && alto > 0).toBe(true);
  });
  it("agrupa dock y menú en la mano dominante; en otra postura no cambia nada", () => {
    expect(agruparUnaMano("una-mano", "izquierda", ["dock", "menú de mano", "dock"])).toEqual({ mano: "izquierda", paneles: ["dock", "menú de mano"] });
    expect([agruparUnaMano("de-pie", "derecha", ["dock"]), agruparUnaMano("una-mano", "derecha", ["  ", ""])]).toEqual([null, null]);
  });
});
describe("Comodidad en el lienzo simulado", () => {
  const rig = { current: { rotation: { y: 0 } } };
  beforeEach(() => { rig.current.rotation.y = 0; h.camara.position.x = 0; h.camara.rotation.y = 0; });
  afterEach(cleanup);
  it("las acciones de giro mueven el rig con el ángulo configurado (8 saltos de 45° dan la vuelta)", () => {
    h.confort.anguloSalto = 45;
    render(<Comodidad rig={rig} />);
    for (let i = 0; i < 8; i += 1) act(() => h.ctx!.girar(1));
    expect(rig.current.rotation.y).toBeCloseTo(Math.PI * 2, 5);
    act(() => h.ctx!.girar(-1));
    expect(rig.current.rotation.y).toBeCloseTo(Math.PI * 2 - Math.PI / 4, 5);
  });
  it("la viñeta sube al girar la cabeza rápido y se apaga al parar", () => {
    render(<Comodidad rig={rig} />); const vineta = screen.getByTestId("vineta");
    act(() => avanza(0)); h.camara.rotation.y = 1.2; act(() => avanza(0.4));
    expect(Number(vineta.dataset.opacidad)).toBeCloseTo(0.6, 6);
    act(() => avanza(0.8));
    expect(vineta.dataset.opacidad).toBe("0");
  });
  it("los subtítulos muestran lo que dice Astraura y se ocultan con la preferencia", () => {
    const FRASE = "Crea un mundo virtual para cinco amigos", vista = render(<Comodidad fraseAstraura={FRASE} rig={rig} />);
    expect(screen.getByText(FRASE)).toBeInTheDocument();
    h.confort = { ...CONFORT_DEFECTO, subtitulos: false };
    vista.rerender(<Comodidad fraseAstraura={FRASE} rig={rig} />);
    expect(screen.queryByText(/Crea un mundo virtual/)).toBeNull();
  });
  it("movimiento reducido manda (y lo dice una vez) y una-mano cambia la postura", () => {
    h.confort = { ...CONFORT_DEFECTO, postura: "una-mano", manoDominante: "izquierda" };
    render(<Comodidad rig={rig} />);
    expect(screen.getByText("Modo a una mano: dock · menú de mano")).toBeInTheDocument();
    cleanup(); h.frames.length = 0;
    h.confort = { ...CONFORT_DEFECTO, giro: "continuo", locomocion: "continua", movimientoReducido: true };
    render(<Comodidad rig={rig} />);
    expect(screen.getByText(/movimiento reducido está activo/)).toBeInTheDocument();
    act(() => h.ctx!.girar(-1));
    expect(rig.current.rotation.y).toBeCloseTo(-Math.PI / 6, 6);
  });
});
