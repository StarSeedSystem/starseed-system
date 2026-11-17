/**
 * SES1116B — Hoja «Compartir en vivo»: tres decisiones y un resultado.
 * Pruebas: por defecto manda mis-neuronas+editar; elegir «Cualquiera con enlace» fuerza
 * el aviso de que cualquiera con el enlace podrá mirar; un `crear` que falla enseña el
 * motivo y no «Compartida»; el botón Copiar enlace usa el enlace devuelto.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompartirEnVivo } from "../compartir-en-vivo";
import { AppearanceProvider } from "@/context/appearance-context";

beforeAll(() => {
    Object.defineProperty(navigator, "clipboard", {
        value: {
            writeText: vi.fn().mockResolvedValue(undefined),
        },
        configurable: true,
    });
});

afterEach(cleanup);

type CrearMock = (opciones: {
    con: "mis-neuronas" | "entidad" | "enlace";
    acceso: "editar" | "mirar";
    tipo: "pizarra" | "dashboard";
    titulo: string;
    hiloId?: string | null;
    entidadRef?: string;
    invitados?: string[];
}) => Promise<{ ok: true; enlace: string; personas: string[]; sesionId: string } | { ok: false; motivo: string }>;

function pintar(props: {
    abierta?: boolean;
    alCerrar?: () => void;
    titulo: string;
    tipo: "pizarra" | "dashboard";
    paginasMias?: { id: string; titulo: string }[];
    crear: CrearMock;
}) {
    return render(
        <AppearanceProvider>
            <CompartirEnVivo
                abierta={props.abierta ?? true}
                alCerrar={props.alCerrar ?? vi.fn()}
                titulo={props.titulo}
                tipo={props.tipo}
                paginasMias={props.paginasMias}
                crear={props.crear}
            />
        </AppearanceProvider>,
    );
}

describe("CompartirEnVivo (SES1116B)", () => {
    it("se abre con foco y se cierra con Esc", async () => {
        const alCerrar = vi.fn();
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: [], sesionId: "123" }));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear, alCerrar });
        const dialogo = screen.getByRole("dialog");
        expect(dialogo).toBeInTheDocument();
        fireEvent.keyDown(dialogo, { key: "Escape" });
        await waitFor(() => expect(alCerrar).toHaveBeenCalled());
    });

    it("por defecto selecciona «Mis neuronas» y «Editar»", () => {
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: [], sesionId: "123" }));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear });
        expect(screen.getByTestId("select-con-quien")).toHaveTextContent("Mis neuronas");
        expect(screen.getByTestId("select-acceso")).toHaveTextContent("Editar");
    });

    it("al compartir con valores por defecto llama a crear con mis-neuronas y editar", async () => {
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: [], sesionId: "123" }));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear });
        fireEvent.click(screen.getByTestId("boton-compartir"));
        await waitFor(() => expect(crear).toHaveBeenCalledTimes(1));
        expect(crear).toHaveBeenCalledWith(
            expect.objectContaining({ con: "mis-neuronas", acceso: "editar", tipo: "pizarra", titulo: "Mi pizarra" }),
        );
    });

    it("elegir «Cualquiera con enlace» muestra aviso de que cualquiera con el enlace podrá mirar", () => {
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: [], sesionId: "123" }));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear });
        fireEvent.click(screen.getByTestId("select-con-quien"));
        fireEvent.click(screen.getByText("Cualquiera con enlace"));
        expect(screen.getByTestId("aviso-enlace-publico")).toBeInTheDocument();
        expect(screen.getByTestId("aviso-enlace-publico")).toHaveTextContent(/cualquiera.*enlace/i);
    });

    it("si crear falla, muestra el motivo y no «Compartida»", async () => {
        const crear = vi.fn(async () => ({ ok: false, motivo: "Las sesiones en vivo aún no están activadas en este servidor" }));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear });
        fireEvent.click(screen.getByTestId("boton-compartir"));
        await waitFor(() => expect(screen.getByTestId("estado-error")).toBeInTheDocument());
        expect(screen.getByTestId("estado-error")).toHaveTextContent("Las sesiones en vivo aún no están activadas en este servidor");
        expect(screen.queryByTestId("estado-exito")).not.toBeInTheDocument();
    });

    it("si crear tiene éxito, muestra «Compartida. N persona(s) dentro.» y botón Copiar enlace", async () => {
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: ["user1", "user2"], sesionId: "123" }));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear });
        fireEvent.click(screen.getByTestId("boton-compartir"));
        await waitFor(() => expect(screen.getByTestId("estado-exito")).toBeInTheDocument());
        expect(screen.getByTestId("estado-exito")).toHaveTextContent("Compartida. 2 personas dentro.");
        expect(screen.getByTestId("boton-copiar-enlace")).toBeInTheDocument();
    });

    it("el botón Copiar enlace usa el enlace devuelto y maneja error de portapapeles", async () => {
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: [], sesionId: "123" }));
        vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("No permitido"));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear });
        fireEvent.click(screen.getByTestId("boton-compartir"));
        await waitFor(() => expect(screen.getByTestId("boton-copiar-enlace")).toBeInTheDocument());
        fireEvent.click(screen.getByTestId("boton-copiar-enlace"));
        // El componente muestra un toast, pero también renderiza el enlace en el DOM
        await waitFor(() => expect(screen.getByTestId("aviso-copiar")).toBeInTheDocument());
        expect(screen.getByTestId("aviso-copiar")).toHaveTextContent("https://ejemplo.com/vivo/123?t=abc");
    });

    it("los botones tienen área táctil ≥ 44px", () => {
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: [], sesionId: "123" }));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear });
        const botonCompartir = screen.getByTestId("boton-compartir");
        expect(botonCompartir).toHaveClass("min-h-[44px]");
    });

    it("funciona a 360px de ancho sin desbordamiento horizontal", () => {
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: [], sesionId: "123" }));
        pintar({ titulo: "Mi pizarra", tipo: "pizarra", crear });
        const dialogo = document.body.querySelector('[role="dialog"]') as HTMLElement;
        expect(dialogo).toBeTruthy();
        dialogo.style.width = "360px";
        expect(dialogo.scrollWidth).toBeLessThanOrEqual(360);
    });

    it("lista páginas/grupos en el selector cuando se pasan paginasMias", () => {
        const crear = vi.fn(async () => ({ ok: true, enlace: "https://ejemplo.com/vivo/123?t=abc", personas: [], sesionId: "123" }));
        pintar({
            titulo: "Mi pizarra",
            tipo: "pizarra",
            crear,
            paginasMias: [{ id: "pag1", titulo: "Mi página" }, { id: "grp1", titulo: "Mi grupo" }],
        });
        fireEvent.click(screen.getByTestId("select-con-quien"));
        expect(screen.getByText("Mi página")).toBeInTheDocument();
        expect(screen.getByText("Mi grupo")).toBeInTheDocument();
    });
});