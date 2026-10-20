import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { PLANTILLAS_AVATAR } from "@/lib/avatares/plantillas";
import SelectorAvatar3d from "../selector-avatar-3d";

/* Regresión (RTAV1011Ld): el selector declaraba sus listas de opciones DENTRO del componente y las usaba como dependencias del
 * efecto de carga. Eran arrays nuevos en cada render y el efecto hacía setState con Maps nuevos: se volvía a renderizar sin fin
 * (en una Mac de 8 GB congelaría la página en cuanto alguien lo montase). Se mockean solo módulos del proyecto: el resolutor de
 * la Biblioteca (cuenta las llamadas), el visor 3D (no hay WebGL en jsdom) y la escritura de preferencias (no hay cuenta). */

const hoisted = vi.hoisted(() => ({ refs: [] as string[], TOPE_CORTAFUEGOS: 50 }));

vi.mock("@/lib/avatares/adaptadores/resolver-ref-biblioteca", () => ({
    // Pasado el cortafuegos devuelve una promesa que nunca vuelve: un bucle hace FALLAR la prueba (más de 7 llamadas) en vez de colgarla.
    getFuenteParaRef: (ref: string) => {
        hoisted.refs.push(ref);
        if (hoisted.refs.length > hoisted.TOPE_CORTAFUEGOS) return new Promise<never>(() => undefined);
        return Promise.resolve({ tipo: "procedural" as const, svg: "" });
    },
}));
vi.mock("@/components/avatares/avatar-vivo", () => ({ AvatarVivo: () => null }));
vi.mock("@/lib/sync/user-prefs", () => ({ mergeUserPrefs: async () => undefined }));

const montar = (props: React.ComponentProps<typeof SelectorAvatar3d> = {}) =>
    render(<AppearanceProvider><SelectorAvatar3d {...props} /></AppearanceProvider>);

/** Deja pasar `turnos` vueltas de microtareas, cada una dentro de su propio `act` para que React vuelva a renderizar entre ellas. */
async function reposar(turnos: number): Promise<void> {
    for (let i = 0; i < turnos; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
}

beforeEach(() => {
    hoisted.refs.length = 0;
});
afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe("SelectorAvatar3d · carga de fuentes", () => {
    it("monta con 7 lecturas (1 fija + 6 plantillas) y no vuelve a leer aunque pasen muchos turnos", async () => {
        montar();
        await reposar(200);
        expect(hoisted.refs).toHaveLength(1 + PLANTILLAS_AVATAR.length);
        await reposar(200);
        expect(hoisted.refs).toHaveLength(1 + PLANTILLAS_AVATAR.length);
    });

    it("con un avatar ya elegido lee UNA vez más (el actual) y se queda ahí", async () => {
        const ref = "biblioteca:avatares/plantillas/arla.vrm";
        localStorage.setItem("starseed.profile.metadata.p1", JSON.stringify({ avatar_3d: { ref } }));
        montar({ profileId: "p1" });
        await reposar(200);
        expect(hoisted.refs).toHaveLength(2 + PLANTILLAS_AVATAR.length);
        expect(hoisted.refs.filter((r) => r === ref)).toHaveLength(2); // una como plantilla y otra como avatar actual
        await reposar(200);
        expect(hoisted.refs).toHaveLength(2 + PLANTILLAS_AVATAR.length);
    });

    it("abrir las opciones no relee nada", async () => {
        montar();
        await reposar(20);
        fireEvent.click(screen.getByRole("button", { name: "Ver opciones" }));
        await reposar(200);
        expect(hoisted.refs).toHaveLength(1 + PLANTILLAS_AVATAR.length);
    });
});

describe("SelectorAvatar3d · opciones honestas", () => {
    it("ofrece el orbe y las 6 plantillas CC0, sin la falsa «Persona VRM», y cada plantilla dice lo que pesa", async () => {
        montar();
        await reposar(20);
        fireEvent.click(screen.getByRole("button", { name: "Ver opciones" }));
        expect(screen.queryByLabelText("Elegir Persona VRM")).toBeNull();
        expect(screen.getByLabelText("Elegir Orbe gris")).toBeTruthy();
        for (const p of PLANTILLAS_AVATAR) {
            const tarjeta = screen.getByLabelText(`Elegir ${p.nombre}`);
            const mb = `${(p.bytesVrm / 1e6).toFixed(1).replace(".", ",")} MB`;
            expect(within(tarjeta).getByText(mb)).toBeTruthy();
        }
        expect(within(screen.getByLabelText("Elegir Avatar Senet 2026")).getByText("8,9 MB")).toBeTruthy();
    });
});
