// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * /metagenesis fuera de la Mac (2026-10-10): explica a quien no es miembro, avisa si la Mac está
 * apagada y, conectado, pone la guardia en modo remoto y pinta la consola con el aviso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const estado = {
    miembro: true as boolean,
    fila: null as unknown,
    sondas: {} as Record<string, { ok: boolean; tipo?: string; estado?: number }>,
};
const ponerModoRemoto = vi.fn();

vi.mock("@/lib/metagenesis/accesos", () => ({
    miAccesoMetaGenesis: async () => ({ miembro: estado.miembro, dueno: false }),
}));
vi.mock("@/lib/metagenesis/motor", () => ({
    proveedorTokenDeLaSesion: () => async () => "token-de-prueba",
    leerMotor: async () => ({ ok: true, fila: estado.fila }),
    sondearMotor: async (base: string) => estado.sondas[base] ?? { ok: false, tipo: "sin-respuesta" },
}));
vi.mock("@/lib/mando/guardia-fetch", () => ({
    ponerModoRemoto: (m: unknown) => ponerModoRemoto(m),
    fetchSinGuardia: () => fetch,
}));

import { AppearanceProvider } from "@/context/appearance-context";
import { MetaGenesisRemoto } from "../metagenesis-remoto";

function pintar() {
    return render(
        <AppearanceProvider>
            <MetaGenesisRemoto>
                <p>consola</p>
            </MetaGenesisRemoto>
        </AppearanceProvider>,
    );
}

const MOTOR = "https://ala-bosque-rio.trycloudflare.com";

describe("MetaGenesisRemoto fuera de la Mac", () => {
    beforeEach(() => {
        estado.miembro = true;
        estado.fila = null;
        estado.sondas = {};
        ponerModoRemoto.mockClear();
    });
    afterEach(() => cleanup());

    it("cuenta que no es miembro: lo explica y lleva a su Genesis, sin pintar la consola", async () => {
        estado.miembro = false;
        pintar();
        expect(await screen.findByText(/solo para desarrolladores de StarSeed OS con permiso/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Ir a mi Genesis/ }).getAttribute("href")).toBe("/genesis");
        expect(screen.queryByText("consola")).toBeNull();
    });

    it("Mac apagada: dice cuánto hace del último latido y no pinta la consola", async () => {
        estado.fila = {
            url: MOTOR,
            encendido: true,
            ultimo_latido: new Date(Date.now() - 5 * 60_000).toISOString(),
            arrancado_en: null,
            maquina: "Mac-de-Alex",
            motivo: null,
        };
        pintar();
        expect(await screen.findByText(/La Mac está apagada o sin túnel \(último latido hace 5 min\)/)).toBeInTheDocument();
        expect(screen.queryByText("consola")).toBeNull();
        expect(ponerModoRemoto).not.toHaveBeenCalledWith(expect.objectContaining({ base: MOTOR }));
    });

    it("conectado: modo remoto hacia el motor, aviso visible y la consola pintada", async () => {
        estado.fila = {
            url: MOTOR,
            encendido: true,
            ultimo_latido: new Date().toISOString(),
            arrancado_en: null,
            maquina: "Mac-de-Alex",
            motivo: null,
        };
        estado.sondas[MOTOR] = { ok: true };
        pintar();
        expect(await screen.findByTestId("metagenesis-remoto-conectado")).toHaveTextContent("Conectado a MetaGenesis en la Mac (Mac-de-Alex)");
        expect(screen.getByText("consola")).toBeInTheDocument();
        expect(ponerModoRemoto).toHaveBeenCalledWith(expect.objectContaining({ base: MOTOR }));
        // La URL del túnel nunca se pinta.
        expect(document.body.textContent).not.toContain("trycloudflare");
    });
});
