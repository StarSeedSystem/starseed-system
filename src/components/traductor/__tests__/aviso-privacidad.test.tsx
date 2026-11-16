import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvisoPrivacidad } from "../aviso-privacidad";
import { AVISOS, type IdMotor } from "@/lib/traductor/privacidad";

const onAceptar = vi.fn();
const onCambiarMotor = vi.fn();

function renderAviso(motor: IdMotor) {
    vi.clearAllMocks();
    return render(<AvisoPrivacidad motor={motor} onAceptar={onAceptar} onCambiarMotor={onCambiarMotor} />);
}

describe("AvisoPrivacidad", () => {
    const motores: IdMotor[] = ["paquete-local", "navegador", "libretranslate", "malla", "astraura"];

    for (const motor of motores) {
        it(`muestra el texto correcto para el motor "${motor}"`, () => {
            const aviso = AVISOS[motor];
            renderAviso(motor);

            expect(screen.getByText(aviso.titulo)).toBeInTheDocument();
            expect(screen.getByText(aviso.sale)).toBeInTheDocument();
            const textoEsperado = aviso.sale_del_aparato ? /envía datos fuera de tu aparato/ : /no envía datos a terceros/;
            expect(screen.getByText(textoEsperado)).toBeInTheDocument();
        });

        it(`tiene los tres botones esperados para "${motor}"`, () => {
            renderAviso(motor);

            expect(screen.getByRole("button", { name: /continuar con este motor/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /usar solo en mi aparato/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
        });
    }

    it("Escape cierra el diálogo (llama a onAceptar con falso o cierra)", async () => {
        renderAviso("libretranslate");

        expect(screen.getByRole("dialog")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("clic en «Usar solo en mi aparato» llama a onCambiarMotor", async () => {
        renderAviso("libretranslate");

        await userEvent.click(screen.getByRole("button", { name: /usar solo en mi aparato/i }));

        expect(onCambiarMotor).toHaveBeenCalledTimes(1);
    });

    it("clic en «Continuar con este motor» llama a onAceptar", async () => {
        renderAviso("libretranslate");

        await userEvent.click(screen.getByRole("button", { name: /continuar con este motor/i }));

        expect(onAceptar).toHaveBeenCalledTimes(1);
    });

    it("clic en «Cancelar» cierra el diálogo", async () => {
        renderAviso("libretranslate");

        await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("el diálogo tiene role=\"dialog\" y aria-modal=\"true\"", () => {
        renderAviso("astraura");

        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAttribute("aria-labelledby", "titulo-aviso-privacidad");
    });

    it("el primer botón tiene ref para foco automático", () => {
        renderAviso("malla");

        const primerBoton = screen.getByRole("button", { name: /continuar con este motor/i });
        expect(primerBoton).toBeInTheDocument();
    });
});