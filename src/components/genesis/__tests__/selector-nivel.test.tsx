import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const acceso = { miembro: false };
const enLaMac = { valor: false };

vi.mock("next/dynamic", () => ({
    default: (cargar: () => Promise<unknown>) => {
        const fuente = String(cargar);
        return () => <div data-testid={/consola-metagenesis/.test(fuente) ? "nivel-meta" : "nivel-poli"} />;
    },
}));
vi.mock("../mi-genesis", () => ({ MiGenesis: () => <div data-testid="nivel-mi" /> }));
vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => ({ miembro: acceso.miembro, dueno: false }) }));
vi.mock("@/lib/metagenesis/remoto", () => ({ abiertoEnLaMac: () => enLaMac.valor }));

import { nivelDeLaUrl, SelectorNivelGenesis } from "../selector-nivel";

function irA(busqueda: string) {
    window.history.replaceState(null, "", `/genesis${busqueda}`);
}

beforeEach(() => {
    acceso.miembro = false;
    enLaMac.valor = false;
    window.localStorage.clear();
    irA("");
});
afterEach(cleanup);

describe("selector de niveles de /genesis", () => {
    it("lee el nivel de la URL; los enlaces viejos con ?pestana= son de MetaGenesis", () => {
        expect(nivelDeLaUrl(new URLSearchParams("nivel=poli"))).toBe("poli");
        expect(nivelDeLaUrl(new URLSearchParams("pestana=oficina"))).toBe("meta");
        expect(nivelDeLaUrl(new URLSearchParams("ambito=grupo-x"))).toBe("meta");
        expect(nivelDeLaUrl(new URLSearchParams("entidad=abc"))).toBe("poli");
        expect(nivelDeLaUrl(new URLSearchParams("nivel=raro"))).toBeNull();
    });

    it("una cuenta sin acceso ve Mi Genesis y PoliGenesis, nunca MetaGenesis", async () => {
        render(<SelectorNivelGenesis />);
        expect(await screen.findByTestId("nivel-mi")).toBeInTheDocument();
        expect(screen.getByTestId("genesis-nivel-poli")).toBeInTheDocument();
        expect(screen.queryByTestId("genesis-nivel-meta")).toBeNull();
        fireEvent.click(screen.getByTestId("genesis-nivel-poli"));
        expect(await screen.findByTestId("nivel-poli")).toBeInTheDocument();
        expect(window.location.search).toContain("nivel=poli");
    });

    it("un enlace viejo de MetaGenesis sin acceso explica y abre Mi Genesis", async () => {
        irA("?pestana=oficina");
        render(<SelectorNivelGenesis />);
        expect(await screen.findByTestId("nivel-mi")).toBeInTheDocument();
        expect(screen.getByText(/no tiene acceso/)).toBeInTheDocument();
        expect(screen.queryByTestId("nivel-meta")).toBeNull();
    });

    it("una cuenta miembro abre MetaGenesis con los enlaces viejos", async () => {
        acceso.miembro = true;
        irA("?pestana=procesos");
        render(<SelectorNivelGenesis />);
        expect(await screen.findByTestId("nivel-meta")).toBeInTheDocument();
        expect(screen.getByTestId("genesis-nivel-meta")).toHaveAttribute("aria-selected", "true");
    });

    it("en esta máquina MetaGenesis está disponible sin preguntar a la base", async () => {
        enLaMac.valor = true;
        render(<SelectorNivelGenesis />);
        await waitFor(() => expect(screen.getByTestId("genesis-nivel-meta")).toBeInTheDocument());
        expect(await screen.findByTestId("nivel-meta")).toBeInTheDocument();
    });
});
