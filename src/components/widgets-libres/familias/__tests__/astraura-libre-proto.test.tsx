import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let medida = { width: 240, height: 240 };
const TAM = { micro: 90, s: 150, m: 240, l: 360, xl: 500 } as const;
const tam = (c: keyof typeof TAM) => { medida = { width: TAM[c], height: TAM[c] }; };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/components/dashboard/kit", () => ({ timeAgo: () => "hace 1m" }));

let chat: any[] = [];
vi.mock("@/lib/aurora/aurora-chat-log", () => ({ readAuroraChatEntries: () => chat, AURORA_CHATLOG_CHANGE_EVENT: "x", AURORA_CHATLOG_KEY: "k" }));
vi.mock("@/lib/aurora/open-aurora", () => ({
    getAuroraBridge: () => ({
        subscribe: vi.fn((cb) => { cb({ speaking: false, listening: false, actionStatus: null, enabled: true, supported: true }); return () => {}; }),
        getState: () => ({ speaking: false, listening: false, actionStatus: null, enabled: true, supported: true }),
        start: vi.fn(),
        stop: vi.fn(),
    }),
    openAurora: vi.fn(async () => true),
}));
vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({ useNivelRender: () => "pleno", nivelRender: "pleno" }));
vi.mock("@/lib/protomolecula/orbe4d/proyeccion-ligera", () => ({
    proyectarForma: () => ({ lineas: [], puntos: [] }),
}));

global.window.matchMedia = global.window.matchMedia || function () {
    return {
        matches: false,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {},
    };
};

import { AstrauraLibreProto } from "../astraura-libre-proto";

beforeEach(() => { tam("m"); chat = []; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Astraura Libre Proto", () => {
    it("sin elección, auto en tamaño grande con conversación monta «Conversación»", () => {
        chat = [{ role: "user", text: "Hola", ts: 1 }, { role: "aurora", text: "Todo en calma.", ts: 2 }];
        tam("xl");
        const { unmount } = render(<AstrauraLibreProto />);
        expect(screen.getByText("Todo en calma.")).toBeTruthy();
        expect(screen.getByText("Tú: Hola")).toBeTruthy();
        unmount();
    });

    it("la elección guardada manda", () => {
        chat = [{ role: "aurora", text: "Todo en calma.", ts: 2 }];
        tam("l");
        render(<AstrauraLibreProto widget={{ settings: { astrauraDiseno: "acciones" } } as any} />);
        expect(screen.getByRole("group", { name: "Atajos para empezar rápido" })).toBeTruthy();
        expect(screen.queryByText("Todo en calma.")).toBeNull();
    });

    it("el estado del puente cambia la forma", () => {
        const { unmount } = render(<AstrauraLibreProto />);
        expect(screen.getByText("En calma")).toBeTruthy();
        unmount();
    });

    it("chat vacío dice «Aún no habéis hablado»", () => {
        const { unmount } = render(<AstrauraLibreProto />);
        expect(screen.getByText("Aún no habéis hablado")).toBeTruthy();
        unmount();
    });

    it("elegir otro diseño llama a onUpdateSettings con astrauraDiseno", () => {
        const ajustes = vi.fn();
        const widget = {} as any;
        render(<AstrauraLibreProto widget={widget} onUpdateSettings={ajustes} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        fireEvent.click(screen.getByRole("radio", { name: /Voz/i }));
        expect(ajustes).toHaveBeenCalledWith({ astrauraDiseno: "voz" });
    });
});