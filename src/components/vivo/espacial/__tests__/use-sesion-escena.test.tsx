/**
 * `useSesionEscena`: snapshots estables con `useSyncExternalStore` — el componente se asienta en
 * pocos renders (nada de bucle React #185), cambia cuando la sesión cambia de verdad, y cierra la
 * sesión al desmontar.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { docVacio } from "@/lib/vivo/espacial/modelo";
import type { AlmacenEscena } from "@/lib/vivo/espacial/sesion";
import type { ConexionEscena } from "@/lib/vivo/espacial/canal";

const h = vi.hoisted(() => ({ cerrado: false, presencia: null as null | ((e: Record<string, unknown>) => void) }));

vi.mock("@/lib/llamadas/identidad", () => ({
    miIdentidad: async () => ({ base: "u1", uid: null, nombre: "Alex", avatar: null, invitado: false }),
    clavePestana: (b: string) => `${b}:tab`,
    leerInvitado: () => ({ id: "inv-x", nombre: "" }),
}));
vi.mock("@/lib/vivo/espacial/dependencias", () => {
    const almacen: AlmacenEscena = {
        leer: async (id) => ({
            fila: { id, titulo: "Estable", dueno: "u1", acceso: "invite", rev: 1, doc: docVacio(), descartados: 0, actualizada: "" },
        }),
        guardar: async (_id, rev) => ({ ok: true, rev: rev + 1 }),
        puedeEditar: async () => true,
    };
    const conexion: ConexionEscena = {
        tema: "t",
        suscrito: () => true,
        enviar: () => undefined,
        publicarPresencia: () => undefined,
        onPresencia: (cb) => {
            h.presencia = cb;
            return () => undefined;
        },
        onMensaje: () => () => undefined,
        onFila: () => () => undefined,
        onSuscrito: () => () => undefined,
        cerrar: () => {
            h.cerrado = true;
        },
    };
    return { dependenciasReales: () => ({ almacen, abrirCanal: () => conexion }) };
});

import { useSesionEscena } from "../use-sesion-escena";
import { ESTADO_SESION_INICIAL } from "@/lib/vivo/espacial/sesion";

afterEach(cleanup);

let renders = 0;
const vistos: unknown[] = [];
function Prueba() {
    const { estado, avatares } = useSesionEscena({ tipo: "espacio", id: "11111111-2222-3333-4444-555555555555" });
    renders += 1;
    vistos.push(estado);
    return (
        <div>
            <span data-testid="fase">{estado.fase}</span>
            <span data-testid="titulo">{estado.titulo}</span>
            <span data-testid="otros">{avatares.otros.length}</span>
        </div>
    );
}

describe("useSesionEscena", () => {
    test("arranca con el estado inicial constante, se asienta y no entra en bucle", async () => {
        renders = 0;
        vistos.length = 0;
        const { unmount } = render(<Prueba />);
        expect(vistos[0]).toBe(ESTADO_SESION_INICIAL);
        expect(await screen.findByText("Estable")).toBeInTheDocument();
        expect(screen.getByTestId("fase")).toHaveTextContent("lista");
        const tras = renders;
        await act(async () => {
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(renders).toBe(tras); // sin cambios, sin renders
        expect(renders).toBeLessThan(12);

        // Una presencia con el mismo contenido no re-renderiza; una persona nueva, sí.
        act(() => h.presencia?.({ "ana:1": [{ nombre: "Ana" }] }));
        expect(screen.getByTestId("otros")).toHaveTextContent("1");
        const conAna = renders;
        act(() => h.presencia?.({ "ana:1": [{ nombre: "Ana" }] }));
        expect(renders).toBe(conAna);

        unmount();
        expect(h.cerrado).toBe(true);
    });
});
