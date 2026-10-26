/**
 * GUIA1025U · las demostraciones de la guía completa, de verdad y sin huérfanas.
 *
 * La guardia por código fuente está en `lib/onboarding/__tests__/guia-completa-catalogo.test.ts`; aquí se
 * comprueba con los módulos reales: toda clave exportada por `DEMOS_SISTEMA`, `DEMOS_RED` y `StepDemo` la usa
 * un paso del catálogo (y al revés), y `DemoPaso` las carga a demanda y las pinta.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEMOS_SISTEMA } from "../demos-sistema";
import { DEMOS_RED } from "../demos-red";
import { CLAVES_STEPDEMO, StepDemo } from "../aurora-guide-demos";
import { DemoPaso } from "../demo-paso";
import { ACENTOS_TRINITY, CLAVES_DEMO, PASOS_GUIA } from "@/lib/onboarding/guia-completa";

vi.mock("next/image", () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} />,
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/escritorios",
}));

beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (q: string) => ({
            matches: q.includes("reduced-motion"),
            media: q,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
        }),
    });
});
afterEach(() => cleanup());

const enCatalogo = new Set<string>(PASOS_GUIA.map((p) => p.demo).filter((d): d is NonNullable<typeof d> => d !== null));

describe("guardia de huérfanas · con los módulos reales", () => {
    it("toda demostración exportada en DEMOS_SISTEMA, DEMOS_RED o StepDemo está en un paso del catálogo", () => {
        const exportadas = [...Object.keys(DEMOS_SISTEMA), ...Object.keys(DEMOS_RED), ...CLAVES_STEPDEMO];
        expect(exportadas.length).toBeGreaterThanOrEqual(21);
        const huerfanas = exportadas.filter((k) => !enCatalogo.has(k));
        expect(huerfanas, `demostraciones sin paso: ${huerfanas.join(", ")}`).toEqual([]);
    });

    it("todo paso con demostración apunta a una que existe", () => {
        const existentes = new Set<string>([...Object.keys(DEMOS_SISTEMA), ...Object.keys(DEMOS_RED), ...CLAVES_STEPDEMO]);
        const inventadas = [...enCatalogo].filter((k) => !existentes.has(k));
        expect(inventadas, `pasos con una demo que no existe: ${inventadas.join(", ")}`).toEqual([]);
        expect(new Set(CLAVES_DEMO)).toEqual(existentes);
    });

    it("StepDemo pinta algo para cada una de sus claves y nada para una desconocida", () => {
        for (const clave of CLAVES_STEPDEMO) {
            const { container, unmount } = render(<StepDemo stepKey={clave} accent={ACENTOS_TRINITY.aurora} reduce />);
            expect(container.innerHTML.length, clave).toBeGreaterThan(0);
            unmount();
        }
        const { container } = render(<StepDemo stepKey="no-existe" accent={ACENTOS_TRINITY.aurora} reduce />);
        expect(container.innerHTML).toBe("");
    });

    it("la Librería ya no tiene la demo vieja suelta: usa la de Librería y Biblioteca", () => {
        expect(CLAVES_STEPDEMO as readonly string[]).not.toContain("libreria");
        expect(Object.keys(DEMOS_RED)).toContain("libreria-biblioteca");
    });
});

describe("DemoPaso · carga a demanda", () => {
    it("sin clave no pinta nada", () => {
        const { container } = render(<DemoPaso clave={null} accent="#fff" reduce />);
        expect(container.innerHTML).toBe("");
    });

    it("enseña un marco quieto mientras llega y luego la demostración, para cada clave del catálogo", async () => {
        for (const clave of CLAVES_DEMO) {
            const { container, unmount } = render(<DemoPaso clave={clave} accent={ACENTOS_TRINITY.zenith} reduce />);
            const envoltorio = container.querySelector(`[data-demo="${clave}"]`);
            expect(envoltorio, clave).not.toBeNull();
            // Cargada: ya no queda el marco y hay contenido dentro.
            await waitFor(
                () => {
                    expect(screen.queryByTestId("demo-cargando")).toBeNull();
                    expect((envoltorio as HTMLElement).innerHTML.length).toBeGreaterThan(0);
                },
                { timeout: 8000 },
            );
            unmount();
        }
    }, 60_000);
});
