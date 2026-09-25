import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Las dos consolas se sustituyen por marcas: aquí solo se prueba QUÉ se monta y adónde se va.
vi.mock("@/components/mando/centro-mando", () => ({
    CentroMando: () => <div data-testid="consola-proyecto">consola del proyecto</div>,
}));
vi.mock("@/components/mi-mando/mi-puente-de-mando", () => ({
    MiPuenteDeMando: () => <div data-testid="mi-puente">mi puente</div>,
}));
const reemplazar = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: reemplazar, push: vi.fn() }) }));

import MandoPage from "@/app/(app)/mando/page";
import MiMandoPage from "@/app/(app)/mi-mando/page";

const fetchOriginal = globalThis.fetch;

function responder(cuerpo: unknown, ok = true) {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(cuerpo), { status: ok ? 200 : 500 })) as typeof fetch;
}

beforeEach(() => {
    reemplazar.mockReset();
});

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("/mando · el Mando del proyecto solo donde hay acceso", () => {
    it("mientras pregunta no monta ninguna consola", () => {
        globalThis.fetch = vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch;
        render(<MandoPage />);
        expect(screen.getByRole("status")).toHaveTextContent("Preparando el Puente de Mando");
        expect(screen.queryByTestId("consola-proyecto")).not.toBeInTheDocument();
    });

    it("sin acceso al proyecto: va a /mi-mando y nunca carga la consola", async () => {
        responder({ proyecto: false });
        render(<MandoPage />);
        await waitFor(() => expect(reemplazar).toHaveBeenCalledWith("/mi-mando"));
        expect(screen.queryByTestId("consola-proyecto")).not.toBeInTheDocument();
    });

    it("si la pregunta falla, se trata como sin acceso", async () => {
        globalThis.fetch = vi.fn(async () => {
            throw new Error("sin red");
        }) as typeof fetch;
        render(<MandoPage />);
        await waitFor(() => expect(reemplazar).toHaveBeenCalledWith("/mi-mando"));
    });

    it("con acceso: la consola del proyecto y un enlace a Mi Puente de Mando", async () => {
        responder({ proyecto: true });
        render(<MandoPage />);
        expect(await screen.findByTestId("consola-proyecto")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Mi Puente de Mando/ })).toHaveAttribute("href", "/mi-mando");
        expect(reemplazar).not.toHaveBeenCalled();
    });
});

describe("/mi-mando · el panel de cada persona", () => {
    it("siempre monta Mi Puente de Mando; sin acceso, sin enlace al proyecto", async () => {
        responder({ proyecto: false });
        render(<MiMandoPage />);
        expect(await screen.findByTestId("mi-puente")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Mando del proyecto/ })).not.toBeInTheDocument();
    });

    it("con acceso, ofrece volver al Mando del proyecto", async () => {
        responder({ proyecto: true });
        render(<MiMandoPage />);
        expect(await screen.findByRole("link", { name: /Mando del proyecto/ })).toHaveAttribute("href", "/mando");
    });
});
