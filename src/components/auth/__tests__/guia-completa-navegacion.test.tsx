/**
 * GUIA1025U · la introducción de la ventana de acceso recorre la guía COMPLETA, con o sin cuenta.
 *
 * Alex (2026-10-26): «A la guía introducción le faltan varios pasos que no sé por qué no aparecen completos
 * desde cualquier medio, creando o no la cuenta.» Aquí se monta la ventana real (diálogo y página) y se
 * recorre: los 24 pasos en orden, los capítulos, el índice, «Saltar a crear cuenta», retomar donde se quedó,
 * teclado, deslizar con el dedo y movimiento reducido.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render as renderCrudo, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { AppearanceProvider } from "@/context/appearance-context";

const sim = vi.hoisted(() => ({ push: vi.fn(), navegarSuave: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: sim.push, refresh: vi.fn() }),
    usePathname: () => "/login",
}));
vi.mock("@/lib/onboarding/director-rito", () => ({
    navegarSuave: sim.navegarSuave,
    etapaActual: () => null,
}));
// El formulario ya tiene sus pruebas; aquí solo importa en qué pestaña llega.
vi.mock("@/components/auth/auth-form", () => ({
    AuthForm: ({ pestanaInicial }: { pestanaInicial?: string }) => (
        <div data-testid="auth-form" data-pestana={pestanaInicial}>
            <input aria-label="Correo" />
        </div>
    ),
}));
vi.mock("@/components/onboarding/demo-gestos-hibridos", () => ({ DemoGestosHibridos: () => <div data-testid="demo-gestos" /> }));
vi.mock("@/components/onboarding/aurora-guide-demos", () => ({
    StepDemo: ({ stepKey, reduce }: { stepKey: string; reduce: boolean }) => <div data-testid={`demo-${stepKey}`} data-reduce={String(reduce)} />,
}));

import { PaginaAcceso, VentanaAcceso } from "../ventana-acceso";
import { pedirAccesoDesdeGuia } from "@/lib/onboarding/guia-acceso";
import {
    CAPITULOS_GUIA,
    PASOS_GUIA,
    TOTAL_PASOS,
    ULTIMO_PASO,
    etiquetaProgreso,
    indiceDePaso,
    primerPasoDelCapitulo,
} from "@/lib/onboarding/guia-completa";
import { guardarProgresoGuia, leerProgresoGuia } from "@/lib/onboarding/guia-progreso";
import { CLAVE_INTRO_SALTADA } from "@/lib/onboarding/primer-arranque";

const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

function movimientoReducido(reducido: boolean) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (q: string) => ({
            matches: reducido && q.includes("reduced-motion"),
            media: q,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
        }),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    delete document.body.dataset.ssGuia;
    movimientoReducido(true);
});
afterEach(() => cleanup());

const titulo = (id: string) => (PASOS_GUIA.find((p) => p.id === id) as (typeof PASOS_GUIA)[number]).titulo;
const abrirIntro = (extra: Partial<Parameters<typeof VentanaAcceso>[0]> = {}) => {
    const alCerrar = vi.fn();
    const alSaltar = vi.fn();
    const r = render(<VentanaAcceso pasoInicial="intro" onSaltar={alSaltar} onCerrar={alCerrar} {...extra} />);
    return { ...r, alCerrar, alSaltar };
};
const esperarPaso = (id: string) => screen.findByRole("heading", { name: titulo(id) }, { timeout: 5000 });
const botonSiguiente = () => screen.getByRole("button", { name: /^(Siguiente|Crear cuenta o entrar)$/ });

describe("la guía completa en la ventana de acceso", () => {
    it("recorre los pasos del catálogo, uno a uno y en orden, hasta el formulario de la cuenta", async () => {
        abrirIntro();
        for (let i = 0; i < TOTAL_PASOS; i++) {
            const paso = PASOS_GUIA[i];
            await esperarPaso(paso.id);
            expect(screen.getByTestId("progreso-guia").textContent).toBe(etiquetaProgreso(i));
            // La demostración del paso (si la tiene) se monta con su clave.
            if (paso.demo) await waitFor(() => expect(document.querySelector(`[data-demo="${paso.demo}"]`)).not.toBeNull());
            if (i < ULTIMO_PASO) {
                if (paso.id === "bienvenida") expect(screen.getByRole("button", { name: "Ya tengo cuenta" })).toBeInTheDocument();
                fireEvent.click(botonSiguiente());
            }
        }
        expect(await screen.findByTestId("auth-form")).toHaveAttribute("data-pestana", "signup");
        // Los diez temas que Alex pidió explicar pasaron por la ventana.
        expect(PASOS_GUIA.filter((p) => p.demo).length).toBeGreaterThanOrEqual(21);
    }, 90_000);

    it("la barra de capítulos lleva al primer paso de cada capítulo y marca el actual", async () => {
        abrirIntro();
        await esperarPaso("bienvenida");
        const barra = screen.getByRole("group", { name: "Capítulos de la guía" });
        expect(within(barra).getAllByRole("button")).toHaveLength(9);
        expect(within(barra).getByRole("button", { name: /^Ir al capítulo 1 de 9/ })).toHaveAttribute("aria-current", "step");

        const red = CAPITULOS_GUIA[3];
        fireEvent.click(within(barra).getByRole("button", { name: `Ir al capítulo 4 de 9: ${red.titulo}` }));
        await esperarPaso(PASOS_GUIA[primerPasoDelCapitulo(red.id)].id);
        expect(within(barra).getByRole("button", { name: /^Ir al capítulo 4 de 9/ })).toHaveAttribute("aria-current", "step");
        expect(within(barra).getByRole("button", { name: /^Ir al capítulo 1 de 9/ })).not.toHaveAttribute("aria-current");
    });

    it("el índice es accesible: se abre y cierra, lista los capítulos y lleva a un paso del capítulo en curso", async () => {
        abrirIntro();
        await esperarPaso("bienvenida");
        const boton = screen.getByTestId("indice-guia-boton");
        expect(boton).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByTestId("indice-guia")).toBeNull();

        fireEvent.click(boton);
        expect(boton).toHaveAttribute("aria-expanded", "true");
        const indice = screen.getByRole("navigation", { name: "Índice de capítulos" });
        expect(within(indice).getAllByRole("button", { name: /^Capítulo \d: / })).toHaveLength(9);
        // El capítulo en curso enseña sus pasos.
        expect(within(indice).getByRole("button", { name: /^Ir al paso 2: Qué es StarSeed OS$/ })).toBeInTheDocument();

        fireEvent.click(within(indice).getByRole("button", { name: /^Capítulo 6: Genesis y PoliGenesis/ }));
        await esperarPaso("genesis");
        expect(screen.queryByTestId("indice-guia")).toBeNull();
        expect(screen.getByTestId("indice-guia-boton").textContent).toContain("Genesis y PoliGenesis");
    });

    it("«Saltar a crear cuenta» está en cada paso de la guía y lleva al formulario en «Crear cuenta»", async () => {
        const { alSaltar } = abrirIntro();
        // Los siete primeros pasos (bienvenida, qué es, Trinity y gestos): siempre a mano.
        for (const paso of PASOS_GUIA.slice(0, 7)) {
            await esperarPaso(paso.id);
            expect(screen.getByRole("button", { name: "Saltar a crear cuenta" })).toBeInTheDocument();
            fireEvent.click(botonSiguiente());
        }
        await esperarPaso(PASOS_GUIA[7].id);
        fireEvent.click(screen.getByRole("button", { name: "Saltar a crear cuenta" }));
        await esperarPaso("cuenta");
        expect(await screen.findByTestId("auth-form")).toHaveAttribute("data-pestana", "signup");
        // En la cuenta ya no hace falta saltar, y «Explorar sin cuenta» sigue ahí.
        expect(screen.queryByRole("button", { name: "Saltar a crear cuenta" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Explorar sin cuenta" }));
        expect(alSaltar).toHaveBeenCalledTimes(1);
    }, 30_000);

    it("«Explorar sin cuenta» está en TODOS los pasos", async () => {
        abrirIntro();
        for (const c of CAPITULOS_GUIA.slice(0, 8)) {
            fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^Ir al capítulo \\d de 9: ${c.titulo}$`) }));
            await esperarPaso(PASOS_GUIA[primerPasoDelCapitulo(c.id)].id);
            expect(screen.getByRole("button", { name: "Explorar sin cuenta" })).toBeInTheDocument();
        }
    }, 30_000);

    it("«Atrás» vuelve un paso y no existe en el primero", async () => {
        abrirIntro();
        await esperarPaso("bienvenida");
        expect(screen.queryByRole("button", { name: "Atrás" })).toBeNull();
        fireEvent.click(botonSiguiente());
        await esperarPaso("que-es");
        fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
        await esperarPaso("bienvenida");
    });
});

describe("retomar donde se quedó", () => {
    it("apunta el paso que se lee, y llegar a la cuenta lo borra", async () => {
        abrirIntro();
        await esperarPaso("bienvenida");
        expect(leerProgresoGuia()).toBeNull(); // sin moverse no se apunta nada
        fireEvent.click(botonSiguiente());
        await esperarPaso("que-es");
        fireEvent.click(botonSiguiente());
        await esperarPaso("orbe");
        expect(leerProgresoGuia()).toBe(indiceDePaso("orbe"));
        fireEvent.click(screen.getByRole("button", { name: /^Ir al capítulo 9 de 9/ }));
        await esperarPaso("cuenta");
        expect(leerProgresoGuia()).toBeNull();
    });

    it("al volver a abrirla sigue por el mismo paso y ofrece «Empezar de nuevo»", async () => {
        guardarProgresoGuia(indiceDePaso("malla"));
        abrirIntro();
        await esperarPaso("malla");
        expect(screen.getByTestId("progreso-guia").textContent).toBe(etiquetaProgreso(indiceDePaso("malla")));
        expect(screen.getByTestId("guia-retomada").textContent).toContain("Retomas donde lo dejaste");

        fireEvent.click(screen.getByRole("button", { name: /Empezar de nuevo/ }));
        await esperarPaso("bienvenida");
        expect(screen.queryByTestId("guia-retomada")).toBeNull();
        expect(leerProgresoGuia()).toBeNull();
    });

    it("pedir un paso concreto no retoma nada", async () => {
        guardarProgresoGuia(indiceDePaso("malla"));
        abrirIntro({ pasoGuiaInicial: "genesis" });
        await esperarPaso("genesis");
        expect(screen.queryByTestId("guia-retomada")).toBeNull();
    });

    it("abrir directo en la cuenta no borra lo que se llevaba leído", async () => {
        guardarProgresoGuia(indiceDePaso("malla"));
        render(<VentanaAcceso pasoInicial="acceso" onSaltar={vi.fn()} onCerrar={vi.fn()} />);
        await esperarPaso("cuenta");
        expect(leerProgresoGuia()).toBe(indiceDePaso("malla"));
    });
});

describe("teclado, dedo y movimiento", () => {
    it("las flechas pasan de paso, no se meten en el formulario y ceden ante la guía de Aurora", async () => {
        abrirIntro();
        await esperarPaso("bienvenida");
        fireEvent.keyDown(window, { key: "ArrowRight" });
        await esperarPaso("que-es");
        fireEvent.keyDown(window, { key: "ArrowRight" });
        await esperarPaso("orbe");
        fireEvent.keyDown(window, { key: "ArrowLeft" });
        await esperarPaso("que-es");

        // Con la guía de Aurora por encima, las flechas son de ella.
        document.body.dataset.ssGuia = "1";
        fireEvent.keyDown(window, { key: "ArrowRight" });
        await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
        expect(screen.getByRole("heading", { name: titulo("que-es") })).toBeInTheDocument();
        delete document.body.dataset.ssGuia;

        // En la cuenta (el formulario) no hacen nada.
        fireEvent.click(screen.getByRole("button", { name: /^Ir al capítulo 9 de 9/ }));
        await esperarPaso("cuenta");
        fireEvent.keyDown(screen.getByLabelText("Correo"), { key: "ArrowLeft" });
        await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
        expect(screen.getByRole("heading", { name: titulo("cuenta") })).toBeInTheDocument();
    }, 30_000);

    it("Escape cierra la ventana; con el foco en el índice, cierra solo el índice", async () => {
        const { alCerrar } = abrirIntro();
        await esperarPaso("bienvenida");
        fireEvent.click(screen.getByTestId("indice-guia-boton"));
        const indice = screen.getByRole("navigation", { name: "Índice de capítulos" });
        const capitulo = within(indice).getByRole("button", { name: /^Capítulo 2: / });
        capitulo.focus();
        fireEvent.keyDown(capitulo, { key: "Escape" });
        await waitFor(() => expect(screen.queryByTestId("indice-guia")).toBeNull());
        expect(alCerrar).not.toHaveBeenCalled();

        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
        await waitFor(() => expect(alCerrar).toHaveBeenCalled());
    });

    const p = (x: number) => ({ pointerId: 7, pointerType: "mouse", isPrimary: true, button: 0, clientX: x, clientY: 300 });
    const deslizar = (desde: number, hasta: number) => {
        const zona = screen.getByTestId("pasos-guia");
        fireEvent.pointerDown(zona, p(desde));
        const salto = (hasta - desde) / 6;
        for (let i = 1; i <= 6; i++) fireEvent.pointerMove(zona, p(desde + salto * i));
        fireEvent.pointerUp(zona, p(hasta));
    };

    it("deslizar a la izquierda avanza y a la derecha retrocede", async () => {
        Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, writable: true, value: vi.fn() });
        abrirIntro();
        await esperarPaso("bienvenida");
        deslizar(300, 120);
        await esperarPaso("que-es");
        deslizar(120, 300);
        await esperarPaso("bienvenida");
    }, 30_000);

    it("en la práctica de gestos el dedo es de la práctica: no se desliza de paso", async () => {
        Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, writable: true, value: vi.fn() });
        abrirIntro({ pasoGuiaInicial: "gestos-hibridos" });
        await esperarPaso("gestos-hibridos");
        deslizar(300, 120);
        await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
        expect(screen.getByRole("heading", { name: titulo("gestos-hibridos") })).toBeInTheDocument();
    }, 30_000);

    it("respeta prefers-reduced-motion: las demostraciones llegan quietas", async () => {
        movimientoReducido(true);
        abrirIntro({ pasoGuiaInicial: "orbe" });
        await esperarPaso("orbe");
        expect(await screen.findByTestId("demo-orbe")).toHaveAttribute("data-reduce", "true");
    });

    it("todo lo que se pulsa mide al menos 44 px", async () => {
        abrirIntro();
        await esperarPaso("bienvenida");
        fireEvent.click(botonSiguiente());
        await esperarPaso("que-es");
        const tarjeta = screen.getByTestId("ventana-bienvenida");
        const grandes = (b: HTMLElement) => /min-h-\[44px\]|\bh-11\b/.test(b.className);
        const pequenos = within(tarjeta)
            .getAllByRole("button")
            // La X común de la ventana tiene su propia medida en `BotonCerrar`.
            .filter((b) => !b.hasAttribute("data-boton-cerrar"))
            .filter((b) => !grandes(b));
        expect(pequenos.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([]);
    });
});

describe("la página (/login y /bienvenida)", () => {
    it("trae la misma guía: capítulos, índice y «Paso 24 de 24» en la cuenta", async () => {
        render(<PaginaAcceso desde="login" />);
        await esperarPaso("cuenta");
        expect(screen.getAllByRole("button", { name: /^Ir al capítulo \d de 9/ })).toHaveLength(9);
        expect(screen.getByTestId("progreso-guia").textContent).toBe("Paso 24 de 24");
        // Y se puede volver al principio sin salir de la página.
        fireEvent.click(screen.getByRole("button", { name: /^Ir al capítulo 1 de 9/ }));
        await esperarPaso("bienvenida");
    });

    it("lo que pide la guía de Aurora al terminar sin cuenta lleva al formulario en la pestaña que toca", async () => {
        render(<PaginaAcceso desde="bienvenida" pasoInicial="intro" />);
        await esperarPaso("bienvenida");
        act(() => { pedirAccesoDesdeGuia("entrar"); });
        await esperarPaso("cuenta");
        expect(await screen.findByTestId("auth-form")).toHaveAttribute("data-pestana", "signin");

        fireEvent.click(screen.getByRole("button", { name: /^Ir al capítulo 1 de 9/ }));
        await esperarPaso("bienvenida");
        act(() => { pedirAccesoDesdeGuia("crear-cuenta"); });
        await esperarPaso("cuenta");
        await waitFor(() => expect(screen.getByTestId("auth-form")).toHaveAttribute("data-pestana", "signup"));
    });

    it("«Explorar sin cuenta» desde cualquier paso deja la marca y lleva a los escritorios", async () => {
        render(<PaginaAcceso desde="login" pasoInicial="intro" />);
        await esperarPaso("bienvenida");
        fireEvent.click(screen.getByRole("button", { name: "Explorar sin cuenta" }));
        expect(window.localStorage.getItem(CLAVE_INTRO_SALTADA)).toBe("1");
        expect(sim.navegarSuave).toHaveBeenCalledWith(expect.anything(), "/escritorios");
    });

    it("el pie queda pegado abajo y la página se desplaza por dentro, sin desbordar", async () => {
        render(<PaginaAcceso desde="login" pasoInicial="intro" />);
        await esperarPaso("bienvenida");
        const pie = screen.getByRole("navigation", { name: "Navegación de la introducción" });
        expect(pie.className).toContain("sticky");
        expect(screen.getByTestId("pagina-acceso").className).toContain("overflow-y-auto");
    });
});
