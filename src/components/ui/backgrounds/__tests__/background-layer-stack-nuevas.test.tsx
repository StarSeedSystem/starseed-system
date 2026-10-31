/**
 * BackgroundLayerStack — la PILA de capas de fondo del OS (rescate RTFSH1018G).
 * Los helpers puros de cada capa ya están probados en src/lib/appearance/__tests__/difusion.ts
 * (→ difusion.test.ts); aquí se prueba la pila EN SÍ: el orden configurado, el z-index que sube,
 * la opacidad/mezcla en la envoltura SIN doble aplicación y el silencio con capas invisibles.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import { AppearanceProvider } from "@/context/appearance-context";
import { BackgroundLayerStack } from "../background-layer-stack";

/** Config de apariencia sembrada en localStorage (el provider la carga al montar). */
const sembrar = (capas: unknown[]) => {
    localStorage.setItem(
        "appearance-config-v2",
        JSON.stringify({ background: { type: "spline", layers: capas } }),
    );
};

const capa = (cambios: Partial<BackgroundLayer>): Record<string, unknown> => ({
    id: "c1",
    kind: "color",
    visible: true,
    opacity: 1,
    blend: "normal",
    value: "#0a0118",
    ...cambios,
});

const wrap = (ui: React.ReactNode) => <AppearanceProvider>{ui}</AppearanceProvider>;

describe("BackgroundLayerStack", () => {
    beforeEach(() => {
        cleanup();
        localStorage.clear();
    });
    afterEach(cleanup);

    it("respeta el ORDEN configurado y el z-index va subiendo por capa", async () => {
        sembrar([
            capa({ id: "c1", kind: "color", value: "#0a0118" }),
            capa({ id: "g1", kind: "gradiente", value: "linear-gradient(90deg, #7c3aed, #f0e7ff)" }),
            capa({
                id: "d1", kind: "difusion",
                difusion: { modo: "desenfoque", desenfoquePx: 8, opacidad: 1, textura: "ninguna" },
            }),
        ]);
        const { container } = render(wrap(<BackgroundLayerStack />));
        await waitFor(() => expect(container.children).toHaveLength(3));
        const envolturas = Array.from(container.children) as HTMLElement[];
        expect(envolturas.map((e) => e.style.zIndex)).toEqual(["-9", "-8", "-7"]);
        // El cuerpo de cada capa lo pinta la capa, en SU orden: color, gradiente y difusión.
        expect((envolturas[0].firstElementChild as HTMLElement).style.background).toBe("rgb(10, 1, 24)");
        expect((envolturas[1].firstElementChild as HTMLElement).style.background)
            .toBe("linear-gradient(90deg, rgb(124, 58, 237), rgb(240, 231, 255))");
        // El desenfoque de la capa 3 difumina lo de abajo (backdrop-filter en el cuerpo).
        const difusion = (envolturas[2].firstElementChild as HTMLElement).firstElementChild as HTMLElement;
        expect(difusion.style.backdropFilter).toBe("blur(8px)");
    });

    it("la opacidad y la mezcla van en la envoltura; el cuerpo NO las aplica otra vez", async () => {
        sembrar([
            capa({
                id: "d2", kind: "difusion", opacity: 0.42, blend: "screen",
                difusion: { modo: "negro", desenfoquePx: 0, opacidad: 1, textura: "ninguna" },
            }),
        ]);
        const { container } = render(wrap(<BackgroundLayerStack />));
        await waitFor(() => expect(container.children).toHaveLength(1));
        const envoltura = container.children[0] as HTMLElement;
        expect(envoltura.style.opacity).toBe("0.42");
        expect(envoltura.style.mixBlendMode).toBe("screen");
        // El velo de la capa se pinta con SU opacidad interna (1), no con la de la envoltura:
        // la pila ya neutralizó la capa interior para no aplicar 0,42 dos veces.
        const cuerpo = (envoltura.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
        expect(cuerpo.style.backgroundColor).toBe("rgb(0, 0, 0)"); // alfa 1, un velo negro lleno
        expect((envoltura.firstElementChild as HTMLElement).style.opacity).toBe("1");
    });

    it("una capa invisible no se pinta y sin capas la pila no pinta NADA", async () => {
        sembrar([
            capa({ id: "s3", kind: "shader", visible: false, preset: { components: [] } }),
            capa({ id: "c2", kind: "color", value: "#101010" }),
        ]);
        const invisibles = render(wrap(<BackgroundLayerStack />));
        await waitFor(() => expect(invisibles.container.children).toHaveLength(1));
        const visible = invisibles.container.children[0] as HTMLElement;
        expect(visible.style.zIndex).toBe("-8"); // el índice SUBE aunque la capa de abajo no se pinte
        expect((visible.firstElementChild as HTMLElement).style.background).toBe("rgb(16, 16, 16)");
        expect(invisibles.container.querySelector("[data-testid='capa-shader-s3']")).toBeNull();
        invisibles.unmount();

        localStorage.clear();
        const vacias = render(wrap(<BackgroundLayerStack />));
        await waitFor(() => vacias.container.textContent);
        await new Promise<void>(r => setTimeout(r, 50)); // da margen a que algo se pintara por error
        expect(vacias.container.textContent).toBe("");
        expect(vacias.container.children).toHaveLength(0);
    });
});
