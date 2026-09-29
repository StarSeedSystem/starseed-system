import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ capas: [] as any[], actualizar: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { background: { type: "gradient", layers: h.capas }, animations: { enabled: false }, themeStore: { osTheme: "default" } }, updateConfig: h.actualizar }),
}));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { hashE, serieE, tiempoE } from "../medios";
import { MusicPlayerWidget } from "../../media/music-player-widget";
import { RadioWidget } from "../../media/radio-widget";
import { MediaControlWidget } from "../../media/media-control-widget";
import { OmnifrecuenciasWidget } from "../../media/omnifrecuencias-widget";
import { AudiomorphicBgWidget } from "../../media/audiomorphic-bg-widget";
import { getMediaEngine } from "@/components/dashboard/apps/media/media-engine";

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); h.actualizar.mockClear(); h.capas = []; getMediaEngine().pause(); });

describe("piezas de medios (puras)", () => {
    it("el dibujo de una pista es determinista", () => {
        expect(hashE("sh-1")).toBe(hashE("sh-1"));
        expect(hashE("sh-1")).not.toBe(hashE("sh-2"));
        expect(serieE(42, 5)).toEqual(serieE(42, 5));
        expect(serieE(42, 5).every((v) => v >= 0 && v < 1)).toBe(true);
        expect(tiempoE(125)).toBe("2:05");
        expect(tiempoE(Number.NaN)).toBe("0:00");
    });
});

describe.each([
    ["Reproductor", MusicPlayerWidget, "MUSIC_PLAYER"],
    ["Radio", RadioWidget, "RADIO_LIVE"],
    ["Control de medios", MediaControlWidget, "MEDIA_CONTROL"],
    ["Omnifrecuencias", OmnifrecuenciasWidget, "OMNIFRECUENCIAS"],
    ["Audiomorphic", AudiomorphicBgWidget, "AUDIOMORPHIC_BG"],
] as const)("%s por tamaño", (_n, Widget, tipo) => {
    it.each(TODAS)(`${tipo} se pinta en %s`, (clase) => {
        const { container } = montarEn(clase, <Widget />, "#d946ef");
        expect(container.querySelector(`[data-widget-e='${tipo}']`)?.getAttribute("data-clase")).toBe(clase);
    });
});

describe("comportamiento de medios", () => {
    it("el reproductor dice que no suena nada y rotula la cola de demostración", () => {
        montarEn("l", <MusicPlayerWidget />);
        expect(screen.getByText("Nada sonando")).toBeTruthy();
        expect(screen.getByText("demostración")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Abrir audio" })).toBeTruthy();
    });

    it("tocar una pista la pone a sonar en el motor compartido (solo con gesto)", () => {
        montarEn("l", <MusicPlayerWidget />);
        expect(getMediaEngine().getSnapshot().track).toBeNull();
        act(() => { fireEvent.click(screen.getByRole("button", { name: /Reproducir Deriva Astral/ })); });
        expect(getMediaEngine().getSnapshot().track?.id).toBe("sh-1");
    });

    it("la radio sintoniza desde la lista y lo recuerda", () => {
        montarEn("l", <RadioWidget />);
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Sintonizar Drone Zone" })); });
        expect(getMediaEngine().getSnapshot().track?.id).toBe("soma-dronezone");
        expect(window.localStorage.getItem("starseed.radio.ultima.v1")).toBe("soma-dronezone");
        expect(screen.getByRole("group", { name: "Dial de emisoras" })).toBeTruthy();
    });

    it("el control de medios enciende la capa Audiomorphic sin tocar el fondo base", () => {
        montarEn("l", <MediaControlWidget />);
        fireEvent.click(screen.getByRole("switch", { name: "Visualización Audiomorphic en el fondo" }));
        const patch = h.actualizar.mock.calls[0][0];
        expect(patch.background.type).toBeUndefined();
        expect(patch.background.layers.some((l: any) => l.kind === "audiomorphic" && l.visible)).toBe(true);
        expect(screen.getByText("La salida la decide el sistema.")).toBeTruthy();
    });

    it("omnifrecuencias enseña su aviso honesto y la lista real", () => {
        montarEn("l", <OmnifrecuenciasWidget />);
        expect(screen.getByText(/no un tratamiento médico/)).toBeTruthy();
        expect(screen.getAllByRole("button", { name: /^Reproducir / }).length).toBeGreaterThan(3);
    });

    it("audiomorphic en micro es el propio interruptor", () => {
        montarEn("micro", <AudiomorphicBgWidget />);
        const sw = screen.getByRole("switch");
        expect(sw.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(sw);
        expect(h.actualizar).toHaveBeenCalledTimes(1);
    });
});
