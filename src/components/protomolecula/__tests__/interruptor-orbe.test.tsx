import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
    PROTO_ORB_ABRIR_EVENT,
    PROTO_ORB_FAB_EVENT,
    PROTO_ORB_FAB_KEY,
} from "@/lib/protomolecula/orbe-bus";
import { InterruptorOrbeProtomolecula } from "../interruptor-orbe";

const interruptor = () => screen.getByRole("switch", { name: "Orbe de la Protomolécula" });
const estado = () => interruptor().getAttribute("aria-checked");

describe("Interruptor de la orbe de la Protomolécula", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        cleanup();
        window.localStorage.clear();
    });

    it("al pulsar cambia aria-checked y guarda la preferencia", async () => {
        render(<InterruptorOrbeProtomolecula />);
        await waitFor(() => expect(estado()).toBe("true"));

        fireEvent.click(interruptor());
        expect(estado()).toBe("false");
        expect(window.localStorage.getItem(PROTO_ORB_FAB_KEY)).toBe("false");

        fireEvent.click(interruptor());
        expect(estado()).toBe("true");
        expect(window.localStorage.getItem(PROTO_ORB_FAB_KEY)).toBe("true");
    });

    it("un PROTO_ORB_FAB_EVENT externo con activada=false lo apaga al instante", async () => {
        render(<InterruptorOrbeProtomolecula />);
        await waitFor(() => expect(estado()).toBe("true"));

        act(() => {
            window.dispatchEvent(new CustomEvent(PROTO_ORB_FAB_EVENT, { detail: { activada: false } }));
        });

        expect(estado()).toBe("false");
    });

    it("«Abrir» despacha el evento cancelable de la orbe", async () => {
        const oyente = vi.fn();
        window.addEventListener(PROTO_ORB_ABRIR_EVENT, oyente);
        render(<InterruptorOrbeProtomolecula />);
        await waitFor(() => expect(estado()).toBe("true"));

        fireEvent.click(screen.getByRole("button", { name: "Abrir" }));

        expect(oyente).toHaveBeenCalledTimes(1);
        expect((oyente.mock.calls[0][0] as CustomEvent).cancelable).toBe(true);
        window.removeEventListener(PROTO_ORB_ABRIR_EVENT, oyente);
    });

    it("con la orbe apagada, «Abrir» está deshabilitado", async () => {
        window.localStorage.setItem(PROTO_ORB_FAB_KEY, "false");
        render(<InterruptorOrbeProtomolecula />);

        await waitFor(() => expect(estado()).toBe("false"));
        expect(screen.getByRole("button", { name: "Abrir" })).toBeDisabled();
    });
});
