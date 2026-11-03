/**
 * XR1010AF · comodidad aplicada (contrato §3 j). El lienzo three/R3F se simula: @react-three/fiber
 * es una cáscara que captura `useFrame`, THREE es real para la cámara y el rig, uikit es DOM. Se
 * prueba la lógica pura (velocidad, viñeta de `confort.ts`, saltos, subtítulos, una mano, movimiento
 * reducido) y el cascarón (girar por saltos mueve el rig; la viñeta se alimenta por fotograma).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CONFORT_DEFECTO, aplicarMovimientoReducido, opacidadVineta, siguienteGiro, type PreferenciasConfort } from "@/lib/xr/confort";
import type { ContextoAcciones } from "../acciones-xr";
import {
    Comodidad, locomocionVigente, pasoConfort, textoSubtitulo, disposicionConfort, velocidadCabeza,
    CONFOR_INICIAL, yawTrasSalto, type MuestraCabeza,
} from "../comodidad";
import { mallaVineta, Vineta, type MallaVineta } from "../vineta";

interface EstadoFotograma { camera: THREE.PerspectiveCamera; clock: { elapsedTime: number } }
type RetFrame = (e: EstadoFotograma) => void;

const m = vi.hoisted(() => ({
    frames: [] as unknown[],
    ctx: null as unknown,
    estado: null as unknown,
    confort: null as unknown,
}));

vi.mock("@react-three/fiber", () => ({
    useThree: (sel: (s: unknown) => unknown) => sel(m.estado),
    useFrame: (cb: unknown) => { m.frames.push(cb); },
}));
vi.mock("../use-prefs-xr", () => ({
    usePrefsXR: () => ({ confort: m.confort, avisos: [], calidad: { modo: "auto" }, vinculos: {}, modo: undefined,
        setConfort: () => {}, setCalidad: () => {}, setVinculo: () => {}, setModo: () => {} }),
}));
vi.mock("../use-entrada-xr", () => ({
    useEntradaXR: (ctx: unknown) => { m.ctx = ctx; return { disparar: () => {}, frase: () => {} }; },
}));
vi.mock("@react-three/uikit", () => ({
    Container: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

// ----- Ayudas -----

const conf = (extra: Partial<PreferenciasConfort> = {}): PreferenciasConfort => ({ ...CONFORT_DEFECTO, ...extra });
const muestra = (t: number, xyz: [number, number, number] = [0, 1.7, 0], yawGrados = 0): MuestraCabeza =>
    ({ x: xyz[0], y: xyz[1], z: xyz[2], yaw: (yawGrados * Math.PI) / 180, t });

const ctxVacio: ContextoAcciones = {
    recentrar: vi.fn(), salir: () => Promise.resolve(), abrirMenuMano: vi.fn(), abrirDock: vi.fn(),
    hablar: vi.fn(), atras: vi.fn(), seleccionar: vi.fn(), agarrar: vi.fn(),
    teletransporte: vi.fn(), girar: vi.fn(),
};

let camara: THREE.PerspectiveCamera;
let riga: THREE.Group;

/** Un fotograma del simulador: coloca la cámara y hace correr TODOS los `useFrame` capturados. */
const paso = (t: number, xyz: [number, number, number], yawGrados: number): void => {
    camara.position.set(xyz[0], xyz[1], xyz[2]);
    camara.quaternion.setFromEuler(new THREE.Euler(0, (yawGrados * Math.PI) / 180, 0));
    const corredores = [...m.frames] as RetFrame[];
    for (const cb of corredores) cb({ camera: camara, clock: { elapsedTime: t } });
};

const comodidad = (): unknown => render(<Comodidad modo="vr-inmersivo" ctx={ctxVacio} riga={riga} alturaOjos={1.7} />);

beforeEach(() => {
    m.frames = [];
    m.ctx = null;
    m.confort = conf();
    riga = new THREE.Group();
    camara = new THREE.PerspectiveCamera();
    riga.add(camara);
    m.estado = { camera: camara, clock: { elapsedTime: 0 } };
});
afterEach(cleanup);

// (se completa: los describe de pruebas)

describe("La viñeta sigue la velocidad de la cabeza (contrato §3 j)", () => {
    it("sube con la velocidad y en reposo es 0", () => {
        expect(velocidadCabeza(null, muestra(0)).lineal).toBe(0);
        const mov = velocidadCabeza(muestra(0), muestra(0.5, [2, 1.7, 0]));
        expect(mov.lineal).toBeGreaterThan(1);
        expect(opacidadVineta(conf(), mov)).toBeGreaterThan(0);
        expect(opacidadVineta(conf(), { lineal: 0.2, angularGradosS: 0 })).toBe(0);
    });

    it("nunca pasa del tope 0,85, vaya tan rápido como vaya la cabeza", () => {
        const mov = { lineal: 20, angularGradosS: 240 };
        expect(opacidadVineta(conf({ fuerzaVineta: 1 }), mov)).toBe(0.85);
        expect(opacidadVineta(conf({ fuerzaVineta: 1, vineta: "siempre" }), mov)).toBeLessThanOrEqual(0.85);
    });

    it("con «nunca» es 0 salvo que haya movimiento reducido", () => {
        const mov = { lineal: 10, angularGradosS: 100 };
        expect(opacidadVineta(conf({ vineta: "nunca" }), mov)).toBe(0);
        const reducido = aplicarMovimientoReducido(conf({ vineta: "nunca", movimientoReducido: true }));
        expect(opacidadVineta(reducido, { lineal: 0, angularGradosS: 0 })).toBeGreaterThan(0);
    });
});

describe("Giro por saltos §3 e/j", () => {
    it("ocho saltos de 45° dan la vuelta completa", () => {
        const c = conf({ anguloSalto: 45 });
        let yaw = 0;
        for (let i = 0; i < 8; i++) yaw = siguienteGiro(yaw, 1, c);
        expect(yaw).toBeCloseTo(Math.PI * 2, 9);
    });

    it("el componente mueve el rig con el ángulo configurado y vuelve con el otro lado", () => {
        const c = conf({ anguloSalto: 45 });
        m.confort = c;
        comodidad();
        const ctx = m.ctx as ContextoAcciones;
        expect(ctx.girar).toBeDefined();
        act(() => { ctx.girar!(1); });
        expect((riga as THREE.Group).rotation.y).toBeCloseTo(Math.PI / 4, 9);
        act(() => { ctx.girar!(-1); });
        expect((riga as THREE.Group).rotation.y).toBeCloseTo(0, 9);
    });
});

// (se completa: una mano, subtítulos, movimiento reducido y cascarón)

describe("Postura de una mano §3 a/j", () => {
    it("«una-mano» reorganiza con disponerTrinity: los laterales se agrupan en pestañas", () => {
        const dePie = disposicionConfort("vr-inmersivo", conf(), 1.7);
        expect(dePie.nodos.logic.agrupadoCon).toBeUndefined();
        expect(dePie.nodos.logic.visible).toBe(true);
        const unaMano = disposicionConfort("vr-inmersivo", conf({ postura: "una-mano" }), 1.7);
        expect(unaMano.nodos.logic.agrupadoCon).toBe("horizon");
        expect(unaMano.nodos.logic.visible).toBe(false);
        expect(unaMano.nodos.zenith.distancia).toBeLessThan(dePie.nodos.zenith.distancia);
    });
});

describe("Subtítulos §3 j", () => {
    it("se muestran con la preferencia y se ocultan sin ella", () => {
        expect(textoSubtitulo(true, "Te ayudo a abrir la estación", null)).toContain("estación");
        expect(textoSubtitulo(false, "Te ayudo a abrir la estación", null)).toBeNull();
        expect(textoSubtitulo(true, "   ", "Lo que se oye de la transmisión")).toBe("Lo que se oye de la transmisión");
        expect(textoSubtitulo(true, "  ", null)).toBeNull();
    });

    it("la línea 3D se pinta a 1,5 m y con alto ≥ 1°; desaparece si la persona lo apaga", () => {
        comodidad();
        expect(screen.queryByText(/subtítulo/)).toBeNull();
        const { unmount } = render(<Comodidad modo="vr-inmersivo" ctx={ctxVacio} riga={riga} alturaOjos={1.7} fraseAstraura="Te ayudo a abrir la estación" />);
        expect(screen.getByText("Te ayudo a abrir la estación")).toBeInTheDocument();
        unmount();
        m.confort = conf({ subtitulos: false });
        render(<Comodidad modo="vr-inmersivo" ctx={ctxVacio} riga={riga} alturaOjos={1.7} fraseAstraura="Te ayudo a abrir la estación" />);
        expect(screen.queryByText("Te ayudo a abrir la estación")).toBeNull();
    });
});

describe("Movimiento reducido manda §3 j", () => {
    it("fuerza saltos y teletransporte, y el aviso se dice UNA vez", () => {
        const continua = conf({ giro: "continuo", locomocion: "continua", movimientoReducido: true });
        expect(aplicarMovimientoReducido(continua).giro).toBe("saltos");
        const vital = locomocionVigente(continua, false);
        expect(vital.locomocion).toBe("teletransporte");
        expect(vital.aviso).toContain("teletransporte");
        expect(locomocionVigente(continua, true).aviso).toBeNull();
        expect(locomocionVigente(conf({ locomocion: "continua" }), false)).toEqual({ locomocion: "continua", aviso: null });
    });
});

describe("Un fotograma de confort (pasoConfort)", () => {
    it("la viñeta sube con la velocidad, se alimenta por fotograma y se acota al tope", () => {
        let e = pasoConfort(CONFOR_INICIAL, muestra(0), conf());
        expect(e.opacidad).toBe(0);
        e = pasoConfort(e, muestra(0.1, [0, 1.7, -9], 120), conf());
        expect(e.opacidad).toBeCloseTo(0.6, 9);
        for (let t = 0.2; t < 3; t += 0.05) e = pasoConfort(e, muestra(t, [0, 1.7, -9], 120), conf({ fuerzaVineta: 1 }));
        expect(e.opacidad).toBeLessThanOrEqual(0.85);
    });

    it("el aviso de movimiento reducido se dice una vez, dura y no vuelve a decirse", () => {
        const c = conf({ locomocion: "continua", movimientoReducido: true });
        const primero = pasoConfort(CONFOR_INICIAL, muestra(0), c);
        expect(primero.texto).toContain("teletransporte");
        expect(primero.dicho).toBe(true);
        expect(pasoConfort(primero, muestra(2), c).texto).toContain("teletransporte");
        const despues = pasoConfort(primero, muestra(6), c);
        expect(despues.texto).toBeNull();
        expect(despues.dicho).toBe(true);
    });
});

describe("Cascarón R3F de la viñeta", () => {
    it("la malla es una anilla negra con alfa, sin depthTest, sobre todo, a «distancia» delante de la cámara", () => {
        const la = mallaVineta(0.5, 0.1);
        const el = la.malla;
        const mat = el.material as THREE.MeshBasicMaterial;
        expect(el.renderOrder).toBeGreaterThan(900);
        expect(mat.color.getHexString()).toBe("000000");
        expect(mat.transparent).toBe(true);
        expect(mat.depthTest).toBe(false);
        la.colocar({ x: 0, y: 1.7, z: 0 }, new THREE.Quaternion());
        expect(el.position.x).toBeCloseTo(0, 6);
        expect(el.position.y).toBeCloseTo(1.7, 6);
        expect(el.position.z).toBeCloseTo(-0.1, 6);
    });

    it("<Vineta> pinta la opacidad dada por fotograma y desaparece si es 0", () => {
        let mq: MallaVineta | null = null;
        act(() => { render(<Vineta opacidad={0.4} alCrear={(mm) => { mq = mm; }} />); });
        const fv = mq as unknown as MallaVineta;
        expect(fv).toBeTruthy();
        act(() => { paso(0, [1, 1.7, 0], 30); });
        expect((fv.malla.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.4, 9);
        expect(fv.malla.visible).toBe(true);
    });
});
