/**
 * (AST1113A) La tira de presencia montada de verdad: lee los medidores de MetaGenesis (y nada del backend 1.58),
 * ocupa su sitio desde el primer instante, pinta las cifras de las pastillas, dice qué falta cuando no puede
 * leerlas y pone la edad a lo que no es de ahora. El punto de la orbe no suma a medias.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/astraura/astraura-158-feed", () => ({ useAstraura158Feed: () => ({ unread: 0 }) }));

import { Astraura158PresenceBar, Astraura158PresenceDot, __reiniciarPresenciaParaPruebas } from "../astraura-158-presence";

type Respuestas = Record<string, { status: number; body?: unknown } | "red">;

function servir(r: Respuestas) {
    const llamadas: string[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            llamadas.push(url);
            const x = r[url];
            if (!x || x === "red") throw new TypeError("Failed to fetch");
            return new Response(x.body === undefined ? "no" : JSON.stringify(x.body), { status: x.status, headers: { "Content-Type": "application/json" } });
        }),
    );
    return llamadas;
}

const ahoraISO = () => new Date().toISOString();
const medidor = (cuenta: number, filas: number, extra: Record<string, unknown> = {}) => ({
    detalle: { cuenta, filas: Array.from({ length: filas }, (_, i) => ({ id: `T${i}`, titulo: "x", acciones: [] })), resumen: "r" },
    datosDe: ahoraISO(),
    obsoleto: false,
    ...extra,
});

beforeEach(() => __reiniciarPresenciaParaPruebas());
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __reiniciarPresenciaParaPruebas();
});

describe("tira de presencia", () => {
    it("ocupa su sitio desde el principio («Midiendo…») y luego pinta las cifras de las pastillas", async () => {
        const llamadas = servir({
            "/api/mando/medidores?clave=en-curso": { status: 200, body: medidor(6, 7) },
            "/api/mando/medidores?clave=agentes": { status: 200, body: medidor(8, 8) },
            "/api/mando/aprobaciones": { status: 200, body: { aprobaciones: [] } },
        });
        render(<Astraura158PresenceBar />);
        const tira = screen.getByTestId("tira-presencia");
        expect(tira).toHaveAttribute("data-estado", "cargando");
        expect(tira.firstElementChild?.className).toMatch(/\bh-9 sm:h-8\b/);
        await waitFor(() => expect(tira).toHaveAttribute("data-estado", "con-cifras"));
        const cifras = screen.getByTestId("cifras-presencia");
        // «En curso» cuenta 6 aunque su ventana tenga 7 filas (una rancia): la tira dice la pastilla.
        expect(cifras.textContent).toMatch(/6 procesos activos\s*·\s*8 agentes vivos\s*·\s*0 por aprobar/);
        expect(cifras.getAttribute("aria-label")).toMatch(/en vivo/);
        expect(screen.queryByTestId("edad-presencia")).toBeNull();
        expect(llamadas.sort()).toEqual(["/api/mando/aprobaciones", "/api/mando/medidores?clave=agentes", "/api/mando/medidores?clave=en-curso"]);
        expect(llamadas.some((u) => /processes|swarm|8790|astraura-158/.test(u))).toBe(false);
    });

    it("en la web publicada (404) no hay número: dice que no hay cifras y por qué", async () => {
        servir({
            "/api/mando/medidores?clave=en-curso": { status: 404 },
            "/api/mando/medidores?clave=agentes": { status: 404 },
            "/api/mando/aprobaciones": { status: 404 },
        });
        render(<Astraura158PresenceBar />);
        await waitFor(() => expect(screen.getByTestId("tira-presencia")).toHaveAttribute("data-estado", "sin-cifras"));
        const cifras = screen.getByTestId("cifras-presencia");
        expect(cifras.textContent).toMatch(/Sin cifras reales/);
        expect(cifras.textContent).toMatch(/no disponible aquí/);
        expect(cifras.textContent).not.toMatch(/\d/);
        fireEvent.click(cifras);
        expect(screen.getByTestId("detalle-presencia").textContent).toMatch(/no sirve los medidores de MetaGenesis/);
    });

    it("sin sesión: lo dice; y una cifra que falta va como «—», nunca como 0", async () => {
        servir({
            "/api/mando/medidores?clave=en-curso": { status: 200, body: medidor(2, 2) },
            "/api/mando/medidores?clave=agentes": { status: 200, body: medidor(3, 3) },
            "/api/mando/aprobaciones": { status: 401, body: { error: "sesión" } },
        });
        render(<Astraura158PresenceBar />);
        await waitFor(() => expect(screen.getByTestId("tira-presencia")).toHaveAttribute("data-estado", "con-cifras"));
        expect(screen.getByTestId("cifras-presencia").textContent).toMatch(/2 procesos activos\s*·\s*3 agentes vivos\s*·\s*— por aprobar/);
        fireEvent.click(screen.getByTestId("cifras-presencia"));
        expect(screen.getByTestId("detalle-presencia").textContent).toMatch(/Sin aprobaciones pendientes: hace falta iniciar sesión/);
    });

    it("una cifra de hace 7 minutos lleva su edad a la vista", async () => {
        servir({
            "/api/mando/medidores?clave=en-curso": { status: 200, body: medidor(1, 1, { datosDe: new Date(Date.now() - 7 * 60_000).toISOString(), obsoleto: true }) },
            "/api/mando/medidores?clave=agentes": { status: 200, body: medidor(1, 1) },
            "/api/mando/aprobaciones": { status: 200, body: { aprobaciones: [] } },
        });
        render(<Astraura158PresenceBar />);
        await waitFor(() => expect(screen.getByTestId("edad-presencia").textContent).toBe("7 min"));
        expect(screen.getByTestId("cifras-presencia").getAttribute("aria-label")).toMatch(/medido hace 7 min/);
    });

    it("sin red: lo dice (sin conexión)", async () => {
        servir({});
        render(<Astraura158PresenceBar />);
        await waitFor(() => expect(screen.getByTestId("cifras-presencia").textContent).toMatch(/sin conexión/));
    });
});

describe("punto de la orbe", () => {
    it("suma las tres cifras de los medidores", async () => {
        servir({
            "/api/mando/medidores?clave=en-curso": { status: 200, body: medidor(2, 2) },
            "/api/mando/medidores?clave=agentes": { status: 200, body: medidor(3, 3) },
            "/api/mando/aprobaciones": { status: 200, body: { aprobaciones: [{}] } },
        });
        render(<Astraura158PresenceDot />);
        await waitFor(() => expect(screen.getByRole("button").textContent).toBe("6"));
    });

    it("si falta una, no pinta nada (una suma a medias mentiría)", async () => {
        servir({
            "/api/mando/medidores?clave=en-curso": { status: 200, body: medidor(2, 2) },
            "/api/mando/medidores?clave=agentes": { status: 403 },
            "/api/mando/aprobaciones": { status: 200, body: { aprobaciones: [] } },
        });
        const { container } = render(<Astraura158PresenceDot />);
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(container.innerHTML).toBe("");
    });
});
