import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
const mocks = vi.hoisted(() => ({
    medida: { width: 360, height: 360 },
    chat: [] as Array<{ role: "user" | "aurora"; text: string; ts: number }>,
    puente: { supported: true, enabled: true, speaking: false, listening: false, actionStatus: "" },
    oyente: null as (() => void) | null,
}));
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({
        ref: { current: null },
        size: { ...mocks.medida, tier: "regular", vTier: "regular", landscape: true },
    }),
}));
vi.mock("@/lib/aurora/aurora-chat-log", () => ({
    readAuroraChatEntries: () => mocks.chat,
    AURORA_CHATLOG_CHANGE_EVENT: "starseed:aurora-chatlog",
    AURORA_CHATLOG_KEY: "starseed.aurora.chatlog.v1",
}));
vi.mock("@/lib/aurora/open-aurora", () => ({
    getAuroraBridge: () => ({
        getState: () => ({ ...mocks.puente }),
        subscribe: (cb: () => void) => {
            mocks.oyente = cb;
            cb();
            return () => { mocks.oyente = null; };
        },
        start: () => {},
        stop: () => {},
    }),
    openAurora: vi.fn(async () => true),
}));
vi.mock("@/components/protomolecula/protomolecula-ligera", () => ({
    ProtomoleculaLigera: ({ estado }: { estado: string }) => (
        <svg data-testid="protomolecula-ligera" data-estado={estado} aria-hidden="true" />
    ),
}));
vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...resto}>{children}</a>
    ),
}));
beforeEach(() => {
    localStorage.clear();
    mocks.medida = { width: 360, height: 360 }; mocks.chat = [];
    mocks.puente = { supported: true, enabled: true, speaking: false, listening: false, actionStatus: "" }; mocks.oyente = null;
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
import { AstrauraLibreProto } from "../astraura-libre-proto";
describe("AstrauraLibreProto", () => {
    const widget = (diseno: string) => ({ settings: { astrauraDiseno: diseno } } as unknown as DashboardWidget);

    it("en auto y tamaño grande con conversación monta Conversación", () => {
        mocks.chat = [{ role: "user", text: "¿Qué tal?", ts: 1 }, { role: "aurora", text: "Todo en calma.", ts: 2 }];
        render(<AstrauraLibreProto />);
        expect(screen.getByRole("list", { name: "Última conversación" })).toBeTruthy();
    });

    it("la elección guardada manda sobre el modo automático", () => {
        mocks.chat = [{ role: "aurora", text: "Todo en calma.", ts: 2 }];
        render(<AstrauraLibreProto widget={widget("acciones")} />);
        expect(screen.getByRole("group", { name: "Atajos para empezar rápido" })).toBeTruthy();
        expect(screen.queryByRole("list", { name: "Última conversación" })).toBeNull();
    });

    it("el estado del puente cambia la forma de la Protomolécula", () => {
        render(<AstrauraLibreProto widget={widget("acciones")} />);
        expect(screen.getByTestId("protomolecula-ligera").getAttribute("data-estado")).toBe("calma");
        act(() => { mocks.puente.speaking = true; mocks.oyente?.(); });
        expect(screen.getByTestId("protomolecula-ligera").getAttribute("data-estado")).toBe("hablando");
    });

    it("con el chat vacío explica que aún no habéis hablado", () => {
        render(<AstrauraLibreProto widget={widget("conversacion")} />);
        expect(screen.getByText(/Aún no habéis hablado/)).toBeTruthy();
    });

    it("elegir otro diseño guarda el ajuste del widget", () => {
        const onUpdateSettings = vi.fn();
        render(<AstrauraLibreProto onUpdateSettings={onUpdateSettings} />);
        fireEvent.click(screen.getByRole("button", { name: "Diseño" }));
        fireEvent.click(screen.getByRole("radio", { name: /Acciones/ }));
        expect(onUpdateSettings).toHaveBeenCalledWith({ astrauraDiseno: "acciones" });
    });
});
