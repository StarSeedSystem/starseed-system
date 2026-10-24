import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

// OPF1024H: con varias OSWindow apiladas, Escape cierra SOLO la de arriba.

/** Pila de ventanas como la de un anfitrión: abre en orden y «trae al frente» reordenando (misma clave). */
function Pila({ inicial, alFrente }: { inicial: string[]; alFrente?: string }) {
    const [abiertas, setAbiertas] = useState(inicial);
    return (
        <>
            {alFrente && (
                <button type="button" onClick={() => setAbiertas((p) => [...p.filter((k) => k !== alFrente), alFrente])}>
                    al frente
                </button>
            )}
            {createPortal(
                <>
                    {abiertas.map((k) => (
                        <OSWindow key={k} title={k} icon={Sparkles} accent="#22d3ee" onClose={() => setAbiertas((p) => p.filter((x) => x !== k))}>
                            <p>{`contenido ${k}`}</p>
                        </OSWindow>
                    ))}
                </>,
                document.body,
            )}
        </>
    );
}

const abiertas = () => screen.queryAllByRole("dialog").map((d) => d.getAttribute("aria-label"));
const pulsarEscape = () => act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

describe("OSWindow · Escape con ventanas apiladas (OPF1024H)", () => {
    afterEach(() => cleanup());

    it("dos ventanas: Escape cierra solo la de arriba; otro Escape, la siguiente", () => {
        render(<Pila inicial={["Primera", "Segunda"]} />);
        expect(abiertas()).toEqual(["Primera", "Segunda"]);
        pulsarEscape();
        expect(abiertas()).toEqual(["Primera"]);
        pulsarEscape();
        expect(abiertas()).toEqual([]);
    });

    it("la ventana traída al frente (reordenada, sin volver a montarse) es la que cierra Escape", () => {
        render(<Pila inicial={["Primera", "Segunda"]} alFrente="Primera" />);
        fireEvent.click(screen.getByRole("button", { name: "al frente" }));
        expect(abiertas()).toEqual(["Segunda", "Primera"]);
        pulsarEscape();
        expect(abiertas()).toEqual(["Segunda"]);
    });

    it("si alguien dentro ya atendió el Escape (preventDefault), no se cierra ninguna", () => {
        render(<Pila inicial={["Primera", "Segunda"]} />);
        const atender = (e: KeyboardEvent) => e.preventDefault();
        window.addEventListener("keydown", atender, true);
        try {
            pulsarEscape();
        } finally {
            window.removeEventListener("keydown", atender, true);
        }
        expect(abiertas()).toEqual(["Primera", "Segunda"]);
    });
});
