/**
 * Presentación en vivo — render: diapositiva escalada con los elementos del lienzo, modo
 * presentador (teclado, notas, salir), modo «seguir» (sin navegar, con el láser de quien presenta),
 * clasificador (seleccionar, mover con Alt+flechas) y la página: editor para editores, aviso de
 * «X está presentando» y seguir la presentación.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { UnidadColab } from "@/lib/vivo/doc-colaborativo/modelo";
import type { InstantaneaSala, Presente } from "@/lib/vivo/doc-colaborativo/motor";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";

const estado = vi.hoisted(() => ({ inst: null as unknown }));

vi.mock("@/lib/vivo/doc-colaborativo/usar-sala", () => ({
    useSalaColaborativa: () => ({
        apertura: "listo",
        espacio: { id: "esp1", title: "Asamblea de otoño" },
        sala: {
            cambiar: () => [],
            unidad: () => undefined,
            meta: () => ({ titulo: "", tema: "cosmos", proporcion: "16:9" }),
            enfocar: () => {},
            presentar: () => {},
            enviar: () => {},
            alConflicto: () => () => {},
            alEvento: () => () => {},
            instantanea: () => estado.inst,
            yo: { uid: "luis", nombre: "Luis", color: "#10B981" },
        },
        inst: estado.inst,
        reintentar: () => {},
    }),
}));
vi.mock("@/lib/spaces/spaces", () => ({ updateSpaceMeta: vi.fn(async () => true) }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { message: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));

import { VistaDiapositiva } from "@/components/vivo/presentacion/vista-diapositiva";
import { ModoPresentador } from "@/components/vivo/presentacion/modo-presentador";
import { Clasificador } from "@/components/vivo/presentacion/clasificador";
import { PaginaPresentacion } from "@/components/vivo/presentacion/pagina-presentacion";
import { META_PRESENTACION_INICIAL, estiloBaseDe, lienzoEfectivo } from "@/lib/vivo/presentacion";

const meta: MetaPresentacion = { ...META_PRESENTACION_INICIAL, titulo: "Asamblea de otoño" };

function diapo(id: string, orden: string, texto: string, notas?: string): UnidadColab<Diapositiva> {
    const d: Diapositiva = {
        lienzo: {
            ancho: 960,
            alto: 540,
            elementos: [{ id: `t-${id}`, tipo: "texto", x: 40, y: 40, w: 600, h: 100, z: 1, texto: { bloques: [{ tipo: "titulo", nivel: 1, tramos: [{ texto }] }] } }],
        },
    };
    if (notas) d.notas = notas;
    return { id, orden, actualizado: 1, autor: "ana", datos: d };
}

const MAZO = [diapo("d0001", "a", "Bienvenida", "Saludar y agradecer"), diapo("d0002", "b", "Presupuesto"), diapo("d0003", "c", "Votación")];

function presente(extra: Partial<Presente> = {}): Presente {
    return { clave: "tab-ana", uid: "ana", nombre: "Ana", color: "#7C5CFF", unidad: null, modo: "editar", presentando: null, desde: 1, ...extra };
}

function instantanea(extra: Partial<InstantaneaSala<Diapositiva, MetaPresentacion>> = {}): InstantaneaSala<Diapositiva, MetaPresentacion> {
    return { cargando: false, error: null, unidades: MAZO, meta, guardado: "guardado", puedeEditar: true, presentes: [], conectado: true, version: 1, revision: 2, ...extra };
}

const rectOriginal = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
    // jsdom no maqueta: todo mide 960 × 540 para que el escalado pinte algo.
    HTMLElement.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, top: 0, left: 0, right: 960, bottom: 540, width: 960, height: 540, toJSON: () => ({}) } as DOMRect;
    };
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        disconnect() {}
        unobserve() {}
    };
});
afterEach(() => {
    cleanup();
    HTMLElement.prototype.getBoundingClientRect = rectOriginal;
});

describe("VistaDiapositiva", () => {
    test("pinta los textos del lienzo con el fondo del tema", () => {
        render(<VistaDiapositiva lienzo={lienzoEfectivo(MAZO[0].datos!, meta)} estiloBase={estiloBaseDe(meta)} etiqueta="Portada" />);
        expect(screen.getByRole("img", { name: "Portada" })).toBeInTheDocument();
        expect(screen.getByText("Bienvenida")).toBeInTheDocument();
    });
});

describe("ModoPresentador", () => {
    test("teclado: avanzar, ir al final, notas del orador y salir", () => {
        const onIndice = vi.fn();
        const onSalir = vi.fn();
        render(<ModoPresentador unidades={MAZO} meta={meta} estiloBase={estiloBaseDe(meta)} indice={0} onIndice={onIndice} onSalir={onSalir} sinPantallaCompleta />);
        expect(screen.getByRole("dialog", { name: "Presentación · diapositiva 1 de 3" })).toBeInTheDocument();
        expect(screen.getByText("1 / 3")).toBeInTheDocument();
        fireEvent.keyDown(window, { key: "ArrowRight" });
        expect(onIndice).toHaveBeenLastCalledWith(1);
        fireEvent.keyDown(window, { key: "End" });
        expect(onIndice).toHaveBeenLastCalledWith(2);
        fireEvent.keyDown(window, { key: "n" });
        expect(screen.getByText("Saludar y agradecer")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Siguiente (→)" }));
        expect(onIndice).toHaveBeenCalledTimes(3);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onSalir).toHaveBeenCalled();
    });

    test("siguiendo a quien presenta: no se navega por cuenta propia y se ve su láser", () => {
        const onSoltar = vi.fn();
        render(
            <ModoPresentador
                unidades={MAZO}
                meta={meta}
                estiloBase={estiloBaseDe(meta)}
                indice={1}
                onIndice={null}
                onSalir={() => {}}
                siguiendoA="Ana"
                onSoltar={onSoltar}
                laserRemoto={{ x: 0.5, y: 0.25 }}
                sinPantallaCompleta
            />,
        );
        expect(screen.getByText("Ana")).toBeInTheDocument();
        expect(screen.getByText("2 / 3")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Siguiente (→)" })).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Puntero láser (L)" })).toBeNull();
        expect(document.querySelector("[data-modo-presentador] span[style*='left: 50%']")).not.toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Navegar por mi cuenta" }));
        expect(onSoltar).toHaveBeenCalled();
    });
});

describe("Clasificador", () => {
    test("miniaturas numeradas; elegir y mover con Alt+flechas", () => {
        const onSeleccionar = vi.fn();
        const onMover = vi.fn();
        render(
            <Clasificador
                unidades={MAZO}
                meta={meta}
                estiloBase={estiloBaseDe(meta)}
                seleccionada="d0001"
                onSeleccionar={onSeleccionar}
                puedeEditar
                onNueva={() => {}}
                onDuplicar={() => {}}
                onBorrar={() => {}}
                onMover={onMover}
                presentes={[presente({ unidad: "d0002" })]}
            />,
        );
        expect(screen.getByText("Diapositivas · 3")).toBeInTheDocument();
        const primera = screen.getByRole("button", { name: "Diapositiva 1: Bienvenida" });
        expect(primera).toHaveAttribute("aria-current", "true");
        expect(screen.getByLabelText("Aquí: Ana")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Diapositiva 3: Votación" }));
        expect(onSeleccionar).toHaveBeenCalledWith("d0003");
        fireEvent.keyDown(primera, { key: "ArrowDown", altKey: true });
        expect(onMover).toHaveBeenCalledWith("d0001", 1);
    });
});

describe("PaginaPresentacion", () => {
    test("quien edita ve el escenario, las notas y el botón Presentar", () => {
        estado.inst = instantanea();
        render(<PaginaPresentacion espacioId="esp1" />);
        expect(screen.getByRole("textbox", { name: "Título de la presentación" })).toHaveValue("Asamblea de otoño");
        expect(document.querySelector("[data-editor-diapositiva]")).not.toBeNull();
        expect(screen.getByRole("textbox", { name: /Notas del orador/ })).toHaveValue("Saludar y agradecer");
        fireEvent.click(screen.getByRole("button", { name: /Presentar$/ }));
        expect(screen.getByRole("dialog", { name: "Presentación · diapositiva 1 de 3" })).toBeInTheDocument();
    });

    test("si alguien presenta a todos, se avisa y se puede seguir su presentación", () => {
        estado.inst = instantanea({ puedeEditar: false, presentes: [presente({ presentando: { id: "d0002", indice: 1 } })] });
        render(<PaginaPresentacion espacioId="esp1" />);
        expect(screen.getByText(/está presentando a todos \(diapositiva 2\)/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Seguir la presentación/ }));
        expect(screen.getByRole("dialog", { name: "Presentación · diapositiva 2 de 3" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Navegar por mi cuenta" })).toBeInTheDocument();
    });
});
