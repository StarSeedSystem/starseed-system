/**
 * ACC1025B · Las vistas de detrás de la puerta: el perfil por defecto es la cabecera REAL con los datos vacíos
 * (nadie ve datos de nadie), y la Biblioteca y los Correos son bloques neutros sin texto inventado.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const visto = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock("@/components/profile/profile-header", () => ({
    ProfileHeader: (props: Record<string, unknown>) => {
        visto.props.push(props);
        return <div data-testid="cabecera-del-perfil" />;
    },
}));

import VistaPreviaPorDefecto, { VistaPrevia, VistaPreviaBiblioteca, VistaPreviaCorreos, VistaPreviaPerfil } from "../vista-previa-sesion";

afterEach(() => {
    cleanup();
    visto.props = [];
});

describe("VistaPreviaPerfil", () => {
    it("pinta la cabecera del perfil con datos VACÍOS y sin ser de nadie", () => {
        render(<VistaPreviaPerfil />);
        expect(screen.getByTestId("cabecera-del-perfil")).toBeInTheDocument();
        expect(visto.props).toHaveLength(1);
        expect(visto.props[0].profileData).toEqual({
            name: "Tu nombre",
            handle: "@usuario",
            bio: "",
            avatar: "",
            cover: "",
            isUser: false,
            pageType: "personal",
        });
    });

    it("lleva los carriles de pestañas del perfil y bloques de sección, todos sin contenido real", () => {
        const { container } = render(<VistaPreviaPerfil />);
        const pestanas = screen.getAllByRole("tab");
        expect(pestanas.map((p) => p.textContent?.trim())).toEqual([
            "Dashboard",
            "Agenda",
            "Publicaciones",
            "Conexiones",
            "Biblioteca",
            "Colecciones",
            "Enlaces",
        ]);
        // Ninguna imagen ni enlace: es decoración, no una página con datos.
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector("a[href]")).toBeNull();
    });

    it("solo hay una pestaña seleccionada: «Dashboard»", () => {
        render(<VistaPreviaPerfil />);
        const seleccionada = screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
        expect(seleccionada).toHaveLength(1);
        expect(seleccionada[0].textContent).toContain("Dashboard");
    });
});

describe("Vistas neutras y selector", () => {
    it("la Biblioteca es un bloque neutro de carpetas, sin cabecera de perfil", () => {
        render(<VistaPreviaBiblioteca />);
        expect(screen.getByTestId("vista-previa-biblioteca")).toBeInTheDocument();
        expect(screen.queryByTestId("cabecera-del-perfil")).toBeNull();
    });

    it("los Correos son una bandeja neutra con sus pestañas", () => {
        render(<VistaPreviaCorreos />);
        expect(screen.getByTestId("vista-previa-correos")).toBeInTheDocument();
        expect(screen.getAllByRole("tab").map((p) => p.textContent?.trim())).toEqual(["Recibidos", "Enviados", "Externos"]);
    });

    it("el selector elige cada vista y el perfil es la de por defecto", () => {
        const { rerender } = render(<VistaPrevia vista="biblioteca" />);
        expect(screen.getByTestId("vista-previa-biblioteca")).toBeInTheDocument();
        rerender(<VistaPrevia vista="correos" />);
        expect(screen.getByTestId("vista-previa-correos")).toBeInTheDocument();
        rerender(<VistaPrevia vista="perfil" />);
        expect(screen.getByTestId("vista-previa-perfil")).toBeInTheDocument();
        // El export por defecto (el que carga `React.lazy`) es el mismo selector.
        expect(VistaPreviaPorDefecto).toBe(VistaPrevia);
    });
});
