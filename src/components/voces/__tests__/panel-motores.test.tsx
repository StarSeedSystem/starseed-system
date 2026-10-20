/**
 * Panel de motores de voz (2026-10-20 · COL1012Md, Genesis publicado en el A1).
 *
 * Dos partes:
 *  1. La función pura `textoSinAcceso`: sin sesión (401) y sin pertenencia a MetaGenesis (403) dicen cosas
 *     distintas, y cualquier otro estado no es un asunto de acceso.
 *  2. El componente con `fetch` simulado (revisión de COL1012Md-d1): el resultado de «Cargar este modelo»
 *     (éxito, fallo del demonio, respuesta rota) se queda en pantalla aunque la lectura de después vaya bien,
 *     y solo el aviso de una lectura fallida se borra cuando la lectura vuelve a funcionar. Antes la lectura
 *     de después borraba cualquier aviso y un fallo del reinicio se callaba: justo lo que «basta de ilusiones» prohíbe.
 *
 * Se simulan `@/components/ui/{card,badge,button}` porque dependen de `useAppearance`; la red es un `fetch` de mentira
 * (el test no sale de la máquina).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PanelMotores, textoSinAcceso } from "@/components/voces/panel-motores";

vi.mock("@/components/ui/card", () => ({
    Card: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
    CardHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
    CardTitle: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
    CardDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    CardContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/badge", () => ({
    Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/button", () => ({
    Button: ({
        children,
        disabled,
        onClick,
    }: {
        children?: ReactNode;
        disabled?: boolean;
        onClick?: () => void;
    }) => (
        <button type="button" disabled={disabled} onClick={onClick}>
            {children}
        </button>
    ),
}));

describe("textoSinAcceso", () => {
    it("401 pide iniciar sesión y 403 dice que solo entran los miembros de MetaGenesis", () => {
        expect(textoSinAcceso(401)).toContain("iniciar sesión");
        expect(textoSinAcceso(403)).toContain("miembros de MetaGenesis");
        expect(textoSinAcceso(401)).not.toBe(textoSinAcceso(403));
    });

    it("el resto de estados (404 consola apagada, 500, 503…) no son de acceso: null", () => {
        for (const status of [200, 400, 404, 429, 500, 503]) {
            expect(textoSinAcceso(status), String(status)).toBeNull();
        }
    });
});

/** Estado de motores de mentira: Q4_K_M cargado y Q8_0 en disco, listo para pulsar «Cargar este modelo». */
const ESTADO = {
    demonio: { vivo: true, latenciaMs: 12, modeloCargado: "omnivoice-Q4_K_M.gguf", puerto: 8880 },
    modelos: [
        { archivo: "omnivoice-Q4_K_M.gguf", tamano: "Q4_K_M", bytes: 400 * 1024 * 1024, tokenizer: true },
        { archivo: "omnivoice-Q8_0.gguf", tamano: "Q8_0", bytes: 700 * 1024 * 1024, tokenizer: true },
    ],
    niveles: [
        { etiqueta: "Nivel 1", motorInterno: "omnivoice", requisitos: "ninguno", ramMB: 900, latencia: "baja", calidad: "alta" },
    ],
};

function respuesta(status: number, cuerpo: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            if (cuerpo === undefined) throw new Error("sin JSON");
            return cuerpo;
        },
    } as unknown as Response;
}

/** `fetch` de mentira: los GET devuelven lo que diga `get()` y el POST lo que diga `post()`. */
function simularRed(opciones: { get: () => Response; post?: () => Response }) {
    const llamadas: { metodo: string }[] = [];
    const falso = vi.fn(async (_url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        llamadas.push({ metodo });
        if (metodo === "POST") {
            if (!opciones.post) throw new Error("POST inesperado");
            return opciones.post();
        }
        return opciones.get();
    });
    vi.stubGlobal("fetch", falso);
    return { llamadas, falso };
}

async function pulsarCargarQ8() {
    const boton = await screen.findByRole("button", { name: "Cargar este modelo" });
    fireEvent.click(boton);
}

describe("PanelMotores · avisos tras «Cargar este modelo»", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("el éxito del reinicio se queda en pantalla aunque el GET de después vaya bien", async () => {
        const red = simularRed({
            get: () => respuesta(200, ESTADO),
            post: () => respuesta(200, { ok: true, modelo: "Q8_0", segundos: 7 }),
        });
        render(<PanelMotores />);
        await pulsarCargarQ8();

        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("«Q8_0» cargado en 7 s."));
        // Hubo lectura inicial, POST y lectura de después; y aun así el aviso sigue ahí.
        await waitFor(() => expect(red.llamadas.map((l) => l.metodo)).toEqual(["GET", "POST", "GET"]));
        expect(screen.getByRole("status").textContent).toBe("«Q8_0» cargado en 7 s.");
    });

    it("el fallo del demonio (ok:false) se dice y no lo borra la lectura de después", async () => {
        const red = simularRed({
            get: () => respuesta(200, ESTADO),
            post: () => respuesta(500, { ok: false, modelo: "Q8_0", segundos: 3 }),
        });
        render(<PanelMotores />);
        await pulsarCargarQ8();

        await waitFor(() => expect(red.llamadas.map((l) => l.metodo)).toEqual(["GET", "POST", "GET"]));
        const aviso = await screen.findByRole("status");
        expect(aviso.textContent).toContain("No se pudo cargar «Q8_0»");
    });

    it("una respuesta del POST sin JSON dice «El reinicio del demonio falló.» y se conserva", async () => {
        const red = simularRed({
            get: () => respuesta(200, ESTADO),
            post: () => respuesta(502, undefined),
        });
        render(<PanelMotores />);
        await pulsarCargarQ8();

        await waitFor(() => expect(red.llamadas.map((l) => l.metodo)).toEqual(["GET", "POST", "GET"]));
        expect((await screen.findByRole("status")).textContent).toBe("El reinicio del demonio falló.");
    });

    it("un POST cerrado por la puerta (403) dice que solo entran miembros, y la lectura de después (403) lo sustituye por el mismo motivo", async () => {
        let get = 0;
        simularRed({
            // La primera lectura va bien (la sesión vale); la de después ya llega cerrada.
            get: () => (get++ === 0 ? respuesta(200, ESTADO) : respuesta(403, { error: "no" })),
            post: () => respuesta(403, { error: "no" }),
        });
        render(<PanelMotores />);
        await pulsarCargarQ8();

        await waitFor(() => {
            expect(screen.getByRole("status").textContent).toBe(textoSinAcceso(403));
        });
        expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
    });
});

describe("PanelMotores · avisos de una lectura fallida", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("un GET con 401 dice que hay que iniciar sesión, deja reintentar y el aviso se borra cuando la lectura vuelve a ir bien", async () => {
        let get = 0;
        simularRed({
            get: () => (get++ === 0 ? respuesta(401, { error: "no" }) : respuesta(200, ESTADO)),
        });
        render(<PanelMotores />);

        const aviso = await screen.findByRole("status");
        expect(aviso.textContent).toBe(textoSinAcceso(401));
        fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

        await waitFor(() => expect(screen.getByText("Demonio local OmniVoice")).toBeTruthy());
        expect(screen.queryByRole("status")).toBeNull();
    });
});
