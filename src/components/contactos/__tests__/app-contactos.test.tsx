// @vitest-environment jsdom
/**
 * app-contactos.test.tsx — la app entera con el almacén mockeado: cabeceras de grupo por
 * letra y por relación, búsqueda sin tildes, filtros de la barra lateral, enlace profundo
 * `?c=`, libreta vacía e invitación sin sesión.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { CategoriaContactos, Contacto } from "@/lib/contactos/tipos";

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;

const est = vi.hoisted(() => ({
    contactos: [] as Contacto[],
    categorias: [] as CategoriaContactos[],
    listo: true,
    sinSesion: false,
    error: null as string | null,
    query: "",
    replace: [] as string[],
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: (u: string) => est.replace.push(u), push: vi.fn() }),
    usePathname: () => "/contactos",
    useSearchParams: () => new URLSearchParams(est.query),
}));
vi.mock("@/lib/social/os-profiles", () => ({
    searchUsers: vi.fn(async () => []),
    fetchProfileByUsername: vi.fn(async () => null),
}));
vi.mock("@/components/library/save-to-library", () => ({
    SaveToLibrary: ({ item }: { item: { type: string; route?: string; title: string } }) => (
        <span data-testid="guardar-biblioteca" data-tipo={item.type} data-ruta={item.route}>
            {item.title}
        </span>
    ),
}));
vi.mock("@/components/contactos/app/presencia-contactos", () => ({
    usePresenciaContactos: () => ({ "u-bea": true }),
}));
vi.mock("@/lib/contactos/store", () => ({
    useContactos: () => ({
        listo: est.listo,
        sinSesion: est.sinSesion,
        contactos: est.contactos,
        categorias: est.categorias,
        listas: [],
        error: est.error,
        porId: (id: string) => est.contactos.find((c) => c.id === id),
        porUserId: (uid: string) => est.contactos.find((c) => c.userId === uid),
        crear: vi.fn(),
        actualizar: vi.fn(),
        eliminar: vi.fn(),
        alternarFavorito: vi.fn(),
        cambiarVisibilidad: vi.fn(async () => null),
        crearCategoria: vi.fn(),
        editarCategoria: vi.fn(),
        eliminarCategoria: vi.fn(),
        crearLista: vi.fn(),
        editarLista: vi.fn(),
        eliminarLista: vi.fn(),
        importar: vi.fn(() => ({ nuevos: 0, fusionados: 0 })),
    }),
    useNotasContacto: () => ({ listo: true, notas: [], error: null, agregar: vi.fn(), editar: vi.fn(), eliminar: vi.fn() }),
}));

import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { AppContactos } from "@/components/contactos/app/app-contactos";

function c(id: string, nombre: string, extra: Partial<Contacto> = {}): Contacto {
    return {
        id,
        nombre,
        userId: null,
        username: null,
        perfil: null,
        relacion: "amistad",
        telefonos: [],
        correos: [],
        enlaces: [],
        categorias: [],
        listas: [],
        favorito: false,
        visibilidad: "privada",
        origen: "manual",
        creado: "2026-01-01T10:00:00.000Z",
        actualizado: "2026-01-01T10:00:00.000Z",
        borrado: null,
        ...extra,
    };
}

function montar() {
    return render(
        <ConfirmProvider>
            <AppContactos />
        </ConfirmProvider>,
    );
}

const cabeceras = () => screen.getAllByTestId("cabecera-grupo").map((h) => h.textContent);
const nombresFilas = () => screen.getAllByTestId("fila-contacto").map((f) => f.textContent ?? "");

beforeEach(() => {
    // El orden/agrupación elegidos se recuerdan por espectador: cada prueba empieza limpia.
    localStorage.clear();
    est.listo = true;
    est.sinSesion = false;
    est.error = null;
    est.query = "";
    est.replace = [];
    est.categorias = [{ id: "cat-huerto", nombre: "Huerto", color: "#10B981", creado: "", actualizado: "" }];
    est.contactos = [
        c("id-ana", "Ana Álvarez", { relacion: "familia", favorito: true }),
        c("id-alvaro", "Álvaro Benítez", { relacion: "trabajo", apodo: "Alvi", categorias: ["cat-huerto"] }),
        c("id-bea", "Beatriz Núñez", { userId: "u-bea", username: "bea", visibilidad: "publica", telefonos: [{ id: "t", etiqueta: "móvil", valor: "+34 600 000 000" }] }),
        c("id-nandu", "Ñandú Pérez"),
        c("id-lucia", "lucía rivas", { relacion: "trabajo" }),
    ];
});
afterEach(() => cleanup());

describe("AppContactos · lista", () => {
    test("agrupa por letra (A, B, L, Ñ) con índice A–Z", () => {
        montar();
        expect(screen.getByRole("heading", { level: 1, name: "Contactos" })).toBeInTheDocument();
        expect(cabeceras()).toEqual(["A", "B", "L", "Ñ"]);
        expect(screen.getByRole("navigation", { name: "Índice alfabético" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ir a la letra B" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Ir a la letra Z" })).toBeDisabled();
    });

    test("la búsqueda no distingue tildes y encuentra por apodo, @ o categoría", () => {
        montar();
        const buscar = screen.getByLabelText("Buscar contactos");
        fireEvent.change(buscar, { target: { value: "benitez" } });
        expect(nombresFilas()).toHaveLength(1);
        expect(nombresFilas()[0]).toContain("Álvaro Benítez");

        fireEvent.change(buscar, { target: { value: "NUNEZ" } });
        expect(nombresFilas()[0]).toContain("Beatriz Núñez");

        fireEvent.change(buscar, { target: { value: "huerto" } });
        expect(nombresFilas()).toHaveLength(1);
        expect(nombresFilas()[0]).toContain("Álvaro Benítez");

        fireEvent.change(buscar, { target: { value: "nadie-así" } });
        expect(screen.getByText("Nadie coincide con «nadie-así».")).toBeInTheDocument();
    });

    test("agrupar por relación pinta una cabecera por relación en el orden del contrato", () => {
        montar();
        fireEvent.change(screen.getByLabelText("Agrupar"), { target: { value: "relacion" } });
        expect(cabeceras()).toEqual(["Familia", "Amistad", "Trabajo"]);
        fireEvent.change(screen.getByLabelText("Agrupar"), { target: { value: "categoria" } });
        expect(cabeceras()).toEqual(["Huerto", "Sin categoría"]);
        fireEvent.change(screen.getByLabelText("Agrupar"), { target: { value: "ninguna" } });
        expect(screen.queryAllByTestId("cabecera-grupo")).toHaveLength(0);
        expect(nombresFilas()).toHaveLength(5);
        // La elección se recuerda para la próxima visita.
        expect(JSON.parse(localStorage.getItem("starseed.contactos.vista.v1") ?? "{}")).toMatchObject({ agrupacion: "ninguna" });
    });

    test("la barra lateral filtra (Favoritos, Públicos, relación) con sus recuentos", () => {
        montar();
        const barra = screen.getByTestId("barra-lateral-contactos");
        fireEvent.click(within(barra).getByRole("button", { name: /Favoritos/ }));
        expect(screen.getByRole("heading", { level: 2, name: "Favoritos" })).toBeInTheDocument();
        expect(nombresFilas()).toHaveLength(1);
        expect(nombresFilas()[0]).toContain("Ana Álvarez");

        fireEvent.click(within(barra).getByRole("button", { name: /Públicos/ }));
        expect(nombresFilas()).toHaveLength(1);
        expect(nombresFilas()[0]).toContain("Beatriz Núñez");

        const trabajo = within(barra).getByRole("button", { name: /Trabajo/ });
        expect(trabajo).toHaveTextContent("2");
        fireEvent.click(trabajo);
        expect(nombresFilas()).toHaveLength(2);
    });

    test("abrir una fila fija `?c=` en la URL", () => {
        montar();
        fireEvent.click(screen.getAllByTestId("fila-contacto")[0]);
        expect(est.replace.at(-1)).toMatch(/^\/contactos\?c=id-/);
    });
});

describe("AppContactos · ficha y estados", () => {
    test("`?c=` abre la ficha con acciones rápidas y Guardar en Biblioteca sin datos privados", async () => {
        est.query = "c=id-bea";
        montar();
        const ficha = await screen.findByTestId("ficha-contacto");
        expect(within(ficha).getByRole("heading", { level: 2, name: "Beatriz Núñez" })).toBeInTheDocument();
        expect(within(ficha).getByRole("link", { name: /Mensaje/ })).toHaveAttribute("href", "/messages?to=@bea");
        expect(within(ficha).getByRole("link", { name: /Perfil/ })).toHaveAttribute("href", "/profile/bea");
        expect(within(ficha).getByRole("link", { name: /Llamar/ })).toHaveAttribute("href", "tel:+34600000000");
        expect(within(ficha).getByText(/Correo: Sin correo/)).toBeInTheDocument();
        expect(within(ficha).getByRole("switch", { name: "Contacto público" })).toHaveAttribute("aria-checked", "true");
        const guardar = within(ficha).getByTestId("guardar-biblioteca");
        expect(guardar).toHaveAttribute("data-tipo", "contact");
        expect(guardar).toHaveAttribute("data-ruta", "/contactos?c=id-bea");
        expect(guardar.textContent).toBe("Beatriz Núñez");
        expect(within(ficha).getByText("Solo tú ves estas notas")).toBeInTheDocument();
    });

    test("un `?c=` que ya no existe limpia la URL", async () => {
        est.query = "c=desaparecido";
        montar();
        await waitFor(() => expect(est.replace).toContain("/contactos"));
    });

    test("libreta vacía: guía para importar o crear", () => {
        est.contactos = [];
        montar();
        expect(screen.getByTestId("contactos-vacio")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Importar vCard/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Crear contacto/ })).toBeInTheDocument();
    });

    test("sin sesión: invitación elegante a entrar", () => {
        est.sinSesion = true;
        montar();
        expect(screen.getByText("Tu libreta de contactos te espera")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Entrar en StarSeed/ })).toHaveAttribute("href", "/login");
    });

    test("un error de la nube se avisa sin tumbar la app", () => {
        est.error = "sin red";
        montar();
        expect(screen.getByText(/No hay sincronía con la nube ahora mismo \(sin red\)/)).toBeInTheDocument();
        expect(cabeceras().length).toBeGreaterThan(0);
    });
});
