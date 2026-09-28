import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const desbloquear = vi.fn(async () => true);
vi.mock("@/lib/bloqueo/passkey-verificacion", () => ({ desbloquearConPasskey: () => desbloquear() }));

import { PantallaBloqueo } from "../pantalla-bloqueo";
import { crearSecreto } from "@/lib/bloqueo/secreto-local";
import type { ConfigBloqueo } from "@/lib/bloqueo/politica-bloqueo";

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

async function pulsar(digitos: string) {
    for (const d of digitos) fireEvent.click(screen.getByRole("button", { name: d }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Desbloquear" })); await new Promise((r) => setTimeout(r, 50)); });
}

describe("PantallaBloqueo", () => {
    it("PIN incorrecto lo dice; el correcto desbloquea", async () => {
        const cfg: ConfigBloqueo = { metodo: "pin", alAbrir: true, minutosInactividad: 0, secreto: await crearSecreto("pin", "2468", 1000), v: 1 };
        const ok = vi.fn();
        render(<PantallaBloqueo cfg={cfg} onDesbloqueado={ok} />);
        expect(screen.getByRole("dialog", { name: "Pantalla de bloqueo" })).toBeTruthy();
        await pulsar("1111");
        expect(screen.getByRole("alert").textContent).toMatch(/PIN incorrecto/);
        expect(ok).not.toHaveBeenCalled();
        await pulsar("2468");
        expect(ok).toHaveBeenCalledTimes(1);
    });
    it("con biometría ofrece la huella primero y el PIN como respaldo", async () => {
        const cfg: ConfigBloqueo = {
            metodo: "biometria", alAbrir: true, minutosInactividad: 0, v: 1,
            passkey: { credencialId: "a", clavePublica: "b", alg: -7, creadaEn: 1, v: 1 },
            respaldo: await crearSecreto("pin", "1357", 1000),
        };
        const ok = vi.fn();
        render(<PantallaBloqueo cfg={cfg} onDesbloqueado={ok} />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Desbloquear con huella o rostro" })); await new Promise((r) => setTimeout(r, 20)); });
        expect(desbloquear).toHaveBeenCalled();
        expect(ok).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Usar PIN" }));
        expect(screen.getByRole("group", { name: "Teclado del PIN" })).toBeTruthy();
    });
});
