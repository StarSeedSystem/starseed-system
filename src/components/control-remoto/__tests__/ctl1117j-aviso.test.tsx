import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const ruta = vi.hoisted(() => ({ abiertas: [] as string[] }));
vi.mock("@/lib/notifications/avisos-mensajes", () => ({ abrirRuta: (r: string) => void ruta.abiertas.push(r) }));

import { AvisoPeticionControl } from "../aviso-peticion-control";
import { AjustesIndicadorControl } from "../ajustes-indicador";
import { _vaciarAvisosPeticion, armarAviso, mostrarAvisoPeticion } from "@/lib/control-remoto/aviso-peticion";

afterEach(() => {
    cleanup();
    _vaciarAvisosPeticion();
    ruta.abiertas = [];
});

describe("CTL1117J · la ventana del aviso de petición", () => {
    it("enseña quién pide, qué y el estado, y su botón SOLO abre el ajuste local (no enciende nada)", async () => {
        render(<AvisoPeticionControl />);
        expect(screen.queryByTestId("aviso-peticion-control")).toBeNull();
        act(() => mostrarAvisoPeticion(armarAviso({ de: "f".repeat(64), nombre: "Mac de Alex", tipo: "abrir-sesion", nivel: "controlar", estado: "apagado", desde: 1 }, { codigo: null, alcance: "total", id: "x1" })));
        expect(screen.getByRole("alertdialog")).toHaveTextContent("Mac de Alex (aparato ffffffff)");
        expect(screen.getByRole("alertdialog")).toHaveTextContent("Solo tú puedes encenderlo, aquí.");
        await userEvent.click(screen.getByTestId("aviso-peticion-abrir"));
        expect(ruta.abiertas).toEqual(["/senales#control-entre-neuronas"]);
        expect(screen.queryByTestId("aviso-peticion-control")).toBeNull();
    });
    it("Cerrar lo quita", async () => {
        render(<AvisoPeticionControl />);
        act(() => mostrarAvisoPeticion(armarAviso({ de: "f".repeat(64), nombre: "Mac", tipo: "presentarse", nivel: "controlar", estado: "por-aceptar", desde: 1 }, { codigo: "AAAA-BBBB-CCCC", alcance: "total", id: "x2" })));
        await userEvent.click(screen.getByTestId("aviso-peticion-cerrar"));
        expect(screen.queryByTestId("aviso-peticion-control")).toBeNull();
    });
});

describe("CTL1117J · el ajuste «Control total» / «Protegido»", () => {
    it("de fábrica es «Control total» y lo cambia a «Protegido» con su frase honesta", async () => {
        const poner = vi.fn(async (p: object) => ({ indicador: "punto" as const, ver_toques: true, alcance: "total" as const, ...p }));
        render(<AjustesIndicadorControl disponible quien={null} onTerminar={() => undefined} leer={async () => ({ indicador: "punto", ver_toques: true, alcance: "total" })} poner={poner as never} />);
        expect(await screen.findByTestId("alcance-total")).toHaveAttribute("aria-checked", "true");
        expect(screen.getByTestId("alcance-ayuda")).toHaveTextContent("operar todo el aparato");
        await userEvent.click(screen.getByTestId("alcance-protegido"));
        expect(poner).toHaveBeenCalledWith({ alcance: "protegido" });
        expect(await screen.findByTestId("alcance-protegido")).toHaveAttribute("aria-checked", "true");
        expect(screen.getByTestId("alcance-ayuda")).toHaveTextContent("no las ventanas de permisos");
    });
});
