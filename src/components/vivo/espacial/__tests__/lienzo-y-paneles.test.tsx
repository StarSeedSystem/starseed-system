/**
 * Lienzo 3D con three/R3F simulados (humo: monta, respeta el modo eco) y paneles: el inspector
 * en solo lectura no deja tocar nada, y los deslizadores solo confirman AL SOLTAR (un cambio por
 * gesto, no uno por píxel: presupuesto de tráfico).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ canvas: null as Record<string, unknown> | null }));

vi.mock("@react-three/fiber", () => ({
    Canvas: (props: Record<string, unknown>) => {
        h.canvas = props;
        return <div data-testid="canvas" aria-label={props["aria-label"] as string} />;
    },
    useFrame: () => undefined,
    useThree: () => ({}),
}));
vi.mock("@react-three/drei", () => ({
    Grid: () => null,
    OrbitControls: () => null,
    Sky: () => null,
    Stars: () => null,
    TransformControls: () => null,
}));

import LienzoEscena from "../lienzo-escena";
import { PanelInspector } from "../paneles";
import { crearObjeto, docVacio, sanearObjeto } from "@/lib/vivo/espacial/modelo";
import type { SesionEscena } from "@/lib/vivo/espacial/sesion";

afterEach(() => {
    cleanup();
    h.canvas = null;
});

function propsLienzo(eco: boolean) {
    return {
        sesion: { poses: new Map(), arrastres: new Map() } as unknown as SesionEscena,
        doc: docVacio(),
        otros: [],
        seleccion: null,
        onSeleccionar: vi.fn(),
        modoGizmo: "translate" as const,
        puedeEditar: true,
        eco,
        reducido: false,
        camaraRef: { current: null },
        raizOverlay: null,
        onXR: vi.fn(),
        onErrorObjeto: vi.fn(),
    };
}

describe("LienzoEscena (three simulado)", () => {
    test("monta el lienzo con alfa (para AR) y calidad completa", () => {
        render(<LienzoEscena {...propsLienzo(false)} />);
        expect(screen.getByTestId("canvas")).toHaveAttribute("aria-label", "Escena 3D compartida");
        expect(h.canvas?.shadows).toBe(true);
        expect(h.canvas?.dpr).toEqual([1, 2]);
        expect((h.canvas?.gl as { alpha: boolean }).alpha).toBe(true);
    });

    test("en modo eco: sin sombras ni antialias, menos píxeles", () => {
        render(<LienzoEscena {...propsLienzo(true)} />);
        expect(h.canvas?.shadows).toBe(false);
        expect(h.canvas?.dpr).toEqual([1, 1.25]);
        expect((h.canvas?.gl as { antialias: boolean }).antialias).toBe(false);
    });
});

const caja = sanearObjeto(crearObjeto("caja", { color: "#10B981" }, { actualizado: 1, por: "a", id: "o_1" }))!;

function inspector(puedeEditar: boolean, onActualizar = vi.fn()) {
    render(
        <PanelInspector
            obj={caja}
            puedeEditar={puedeEditar}
            modoGizmo="translate"
            onModoGizmo={vi.fn()}
            onActualizar={onActualizar}
            onDuplicar={vi.fn()}
            onBorrar={vi.fn()}
            onCerrar={vi.fn()}
        />,
    );
    return onActualizar;
}

describe("PanelInspector", () => {
    test("en solo lectura todo está desactivado y no hay acciones", () => {
        inspector(false);
        expect(screen.getByText(/Modo lectura/)).toBeInTheDocument();
        expect(screen.getByLabelText("Nombre")).toBeDisabled();
        expect(screen.getByLabelText("Posición (m) X")).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Borrar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Mover" })).toBeNull();
    });

    test("los deslizadores confirman al soltar, no en cada movimiento", () => {
        const onActualizar = inspector(true);
        const metal = screen.getByLabelText(/Metálico/);
        fireEvent.change(metal, { target: { value: "0.5" } });
        fireEvent.change(metal, { target: { value: "0.7" } });
        expect(onActualizar).not.toHaveBeenCalled();
        fireEvent.pointerUp(metal);
        expect(onActualizar).toHaveBeenCalledTimes(1);
        expect(onActualizar).toHaveBeenCalledWith({ material: expect.objectContaining({ metalico: 0.7 }) });
    });

    test("un número se confirma con Intro y el giro va en grados", () => {
        const onActualizar = inspector(true);
        const giroY = screen.getByLabelText("Giro (grados) Y");
        fireEvent.change(giroY, { target: { value: "90" } });
        fireEvent.keyDown(giroY, { key: "Enter" });
        const rot = (onActualizar.mock.calls[0][0] as { rot: number[] }).rot;
        expect(rot[1]).toBeCloseTo(Math.PI / 2);
    });

    test("borrar pide una segunda confirmación", () => {
        const onBorrar = vi.fn();
        render(
            <PanelInspector
                obj={caja}
                puedeEditar
                modoGizmo="translate"
                onModoGizmo={vi.fn()}
                onActualizar={vi.fn()}
                onDuplicar={vi.fn()}
                onBorrar={onBorrar}
                onCerrar={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
        expect(onBorrar).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: /Pulsa otra vez/ }));
        expect(onBorrar).toHaveBeenCalledTimes(1);
    });
});
