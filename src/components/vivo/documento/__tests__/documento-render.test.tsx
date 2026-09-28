/**
 * Documento en vivo — render: la hoja editable traduce lo que escribes a cambios POR BLOQUE (con
 * ids estables) y repinta lo que llega de otras personas; el visor de solo lectura pinta sin
 * contentEditable; la página decide editor/visor por permiso y cuenta palabras; el estado de
 * guardado y la presencia se dicen en español.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BloqueDoc } from "@/lib/mensajeria/formato-tipos";
import type { CambioUnidad, UnidadColab } from "@/lib/vivo/doc-colaborativo/modelo";
import type { InstantaneaSala, Presente } from "@/lib/vivo/doc-colaborativo/motor";
import type { MetaDocumento } from "@/lib/vivo/documento";

const estado = vi.hoisted(() => ({
    inst: null as unknown,
    cambios: [] as unknown[],
}));

vi.mock("@/lib/vivo/doc-colaborativo/usar-sala", () => ({
    useSalaColaborativa: () => ({
        apertura: "listo",
        espacio: { id: "esp1", title: "Plan del huerto" },
        sala: {
            cambiar: (c: unknown[]) => {
                estado.cambios.push(...c);
                return [];
            },
            unidad: () => undefined,
            meta: () => ({ titulo: "" }),
            enfocar: () => {},
            alConflicto: () => () => {},
            instantanea: () => estado.inst,
            yo: { uid: "ana", nombre: "Ana", color: "#7C5CFF" },
        },
        inst: estado.inst,
        reintentar: () => {},
    }),
}));
vi.mock("@/lib/spaces/spaces", () => ({ updateSpaceMeta: vi.fn(async () => true) }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { message: vi.fn(), success: vi.fn(), error: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));

import { HojaEditable } from "@/components/vivo/documento/hoja-editable";
import { VistaDocumento } from "@/components/vivo/documento/vista-documento";
import { AvataresPresencia, EstadoGuardadoChip, personasUnicas } from "@/components/vivo/documento/comun-colab";
import { PaginaDocumento } from "@/components/vivo/documento/pagina-documento";

const p = (texto: string): BloqueDoc => ({ tipo: "parrafo", tramos: texto ? [{ texto }] : [] });
const h = (texto: string): BloqueDoc => ({ tipo: "titulo", nivel: 1, tramos: [{ texto }] });
const unidad = (id: string, orden: string, datos: BloqueDoc): UnidadColab<BloqueDoc> => ({ id, orden, actualizado: 1, autor: "ana", datos });

function presente(extra: Partial<Presente> = {}): Presente {
    return { clave: "k1", uid: "luis", nombre: "Luis Pérez", color: "#10B981", unidad: null, modo: "editar", presentando: null, desde: 1, ...extra };
}

function instantanea(unidades: UnidadColab<BloqueDoc>[], extra: Partial<InstantaneaSala<BloqueDoc, MetaDocumento>> = {}): InstantaneaSala<BloqueDoc, MetaDocumento> {
    return { cargando: false, error: null, unidades, meta: { titulo: "Plan del huerto" }, guardado: "guardado", puedeEditar: true, presentes: [], conectado: true, version: 1, revision: 3, ...extra };
}

beforeEach(() => {
    estado.cambios = [];
    if (!("ResizeObserver" in globalThis)) {
        (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
            observe() {}
            disconnect() {}
            unobserve() {}
        };
    }
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("HojaEditable", () => {
    test("pinta los bloques y traduce lo escrito a un cambio SOLO del bloque tocado", () => {
        const onCambios = vi.fn<(c: CambioUnidad<BloqueDoc>[]) => void>();
        const unidades = [unidad("b0001", "a", h("Objetivos")), unidad("b0002", "b", p("Regar los martes"))];
        render(<HojaEditable unidades={unidades} onCambios={onCambios} onDeshacer={() => {}} onRehacer={() => {}} onFoco={() => {}} presentes={[]} etiqueta="Texto del documento" />);
        const editable = screen.getByRole("textbox", { name: "Texto del documento" });
        expect(editable).toHaveAttribute("contenteditable", "true");
        expect(editable.textContent).toContain("Objetivos");
        expect(editable.textContent).toContain("Regar los martes");

        // El navegador escribe en el segundo párrafo…
        const parrafo = editable.children[1] as HTMLElement;
        parrafo.textContent = "Regar los martes y jueves";
        fireEvent.input(editable, { inputType: "insertText" });
        expect(onCambios).toHaveBeenCalledTimes(1);
        expect(onCambios.mock.calls[0][0]).toEqual([{ id: "b0002", datos: p("Regar los martes y jueves") }]);
    });

    test("un documento vacío no genera cambios hasta que se escribe; lo nuevo nace con clave", () => {
        const onCambios = vi.fn<(c: CambioUnidad<BloqueDoc>[]) => void>();
        render(<HojaEditable unidades={[]} onCambios={onCambios} onDeshacer={() => {}} onRehacer={() => {}} onFoco={() => {}} presentes={[]} etiqueta="Texto" />);
        const editable = screen.getByRole("textbox", { name: "Texto" });
        fireEvent.input(editable, { inputType: "insertText" });
        expect(onCambios).not.toHaveBeenCalled();
        (editable.children[0] as HTMLElement).textContent = "Hola";
        fireEvent.input(editable, { inputType: "insertText" });
        const [cambio] = onCambios.mock.calls[0][0];
        expect(cambio.datos).toEqual(p("Hola"));
        expect(typeof cambio.orden).toBe("string");
    });

    test("lo que escribe otra persona aparece (con una pausa si estabas escribiendo)", () => {
        vi.useFakeTimers();
        const props = { onCambios: () => {}, onDeshacer: () => {}, onRehacer: () => {}, onFoco: () => {}, presentes: [], etiqueta: "Texto" };
        const antes = [unidad("b0001", "a", p("uno"))];
        const { rerender } = render(<HojaEditable unidades={antes} {...props} />);
        const despues = [unidad("b0001", "a", p("uno")), unidad("b0002", "b", p("dos, de Luis"))];
        rerender(<HojaEditable unidades={despues} {...props} />);
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(screen.getByRole("textbox", { name: "Texto" }).textContent).toContain("dos, de Luis");
    });
});

describe("presencia en la hoja", () => {
    test("se marca el bloque donde escribe otra persona, con su nombre, fuera del contentEditable", async () => {
        const original = HTMLElement.prototype.getBoundingClientRect;
        HTMLElement.prototype.getBoundingClientRect = function () {
            return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) } as DOMRect;
        };
        try {
            const unidades = [unidad("b0001", "a", p("uno")), unidad("b0002", "b", p("dos"))];
            render(
                <HojaEditable
                    unidades={unidades}
                    onCambios={() => {}}
                    onDeshacer={() => {}}
                    onRehacer={() => {}}
                    onFoco={() => {}}
                    presentes={[presente({ unidad: "b0002" })]}
                    etiqueta="Texto"
                />,
            );
            await waitFor(() => expect(document.querySelector("[data-marcas-presencia]")).not.toBeNull());
            const capa = document.querySelector("[data-marcas-presencia]") as HTMLElement;
            expect(capa).toHaveTextContent("Luis Pérez");
            expect(screen.getByRole("textbox", { name: "Texto" }).textContent).not.toContain("Luis Pérez");
        } finally {
            HTMLElement.prototype.getBoundingClientRect = original;
        }
    });
});

describe("VistaDocumento (solo lectura)", () => {
    test("pinta el documento sin nada editable y avisa si está vacío", () => {
        const { rerender } = render(<VistaDocumento unidades={[unidad("b0001", "a", h("Acta")), unidad("b0002", "b", p("Se aprueba el plan."))]} presentes={[]} />);
        expect(screen.getByRole("heading", { name: "Acta" })).toBeInTheDocument();
        expect(screen.getByText("Se aprueba el plan.")).toBeInTheDocument();
        expect(document.querySelector("[contenteditable='true']")).toBeNull();
        rerender(<VistaDocumento unidades={[]} presentes={[]} />);
        expect(screen.getByText(/aún está vacío/)).toBeInTheDocument();
    });
});

describe("estado y presencia", () => {
    test("estado de guardado en palabras y «solo lectura» para quien no edita", () => {
        const { rerender } = render(<EstadoGuardadoChip guardado="guardado" puedeEditar conectado />);
        expect(screen.getByText("Guardado")).toBeInTheDocument();
        expect(screen.getByText("En vivo")).toBeInTheDocument();
        rerender(<EstadoGuardadoChip guardado="sin-conexion" puedeEditar conectado={false} />);
        expect(screen.getByText("Sin conexión · reintentando")).toBeInTheDocument();
        rerender(<EstadoGuardadoChip guardado="guardado" puedeEditar={false} conectado />);
        expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    });

    test("una persona con dos pestañas cuenta una vez; sin nadie se dice", () => {
        expect(personasUnicas([presente(), presente({ clave: "k2", modo: "ver" })])).toHaveLength(1);
        const { rerender } = render(<AvataresPresencia presentes={[]} />);
        expect(screen.getByText("Solo tú por ahora")).toBeInTheDocument();
        rerender(<AvataresPresencia presentes={[presente(), presente({ clave: "k2" })]} />);
        expect(screen.getByRole("button", { name: /1 persona más aquí: Luis Pérez/ })).toBeInTheDocument();
        expect(screen.getByText("LP")).toBeInTheDocument();
    });
});

describe("PaginaDocumento", () => {
    test("con permiso de edición: título editable, hoja editable y recuento de palabras", () => {
        estado.inst = instantanea([unidad("b0001", "a", h("Objetivos")), unidad("b0002", "b", p("Regar los martes y jueves"))]);
        render(<PaginaDocumento espacioId="esp1" />);
        expect(screen.getByRole("textbox", { name: "Título del documento" })).toHaveValue("Plan del huerto");
        expect(screen.getByRole("textbox", { name: /Texto del documento/ })).toBeInTheDocument();
        expect(screen.getByLabelText("Recuento")).toHaveTextContent("6 palabras");
        expect(screen.getByRole("navigation", { name: "Esquema del documento" })).toHaveTextContent("Objetivos");
    });

    test("sin permiso: el mismo documento en lectura y el aviso de cómo pedir edición", () => {
        estado.inst = instantanea([unidad("b0001", "a", p("Solo para leer"))], { puedeEditar: false });
        render(<PaginaDocumento espacioId="esp1" />);
        expect(screen.queryByRole("textbox", { name: "Título del documento" })).toBeNull();
        expect(screen.getByRole("heading", { name: "Plan del huerto" })).toBeInTheDocument();
        expect(within(screen.getByLabelText("Documento (solo lectura)")).getByText("Solo para leer")).toBeInTheDocument();
        expect(screen.getByText(/pide que te inviten como editor/)).toBeInTheDocument();
    });

    test("un enlace a otra cosa (una pizarra) se explica en vez de romperse", () => {
        estado.inst = instantanea([], { puedeEditar: false, error: "Este enlace no abre un documento." });
        render(<PaginaDocumento espacioId="esp1" />);
        expect(screen.getByRole("heading", { name: "Este enlace no abre un documento" })).toBeInTheDocument();
    });
});
