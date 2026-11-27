/**
 * TRM1125D · pestaña «Terminal» de la ventana de control: salida en vivo, nivel, aviso del modo completo, historial.
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TerminalRemota, textoCaducidad, type PropsTerminalRemota } from "../terminal-remota";

afterEach(cleanup);

function props(extra: Partial<PropsTerminalRemota> = {}): PropsTerminalRemota {
    return {
        nivel: "usuario",
        modo: "tipado",
        lineas: [],
        historial: [],
        ocupada: false,
        alEnviar: vi.fn(),
        alTerminar: vi.fn(),
        ...extra,
    };
}

describe("textoCaducidad", () => {
    it("dice horas y minutos, y avisa cuando ya caducó", () => {
        expect(textoCaducidad(90 * 60_000)).toBe("1 h 30 min");
        expect(textoCaducidad(5 * 60_000)).toBe("5 min");
        expect(textoCaducidad(20_000)).toBe("menos de 1 min");
        expect(textoCaducidad(0)).toBe("caducado");
    });
});

describe("TerminalRemota", () => {
    it("enseña el nivel concedido", () => {
        render(<TerminalRemota {...props({ nivel: "administrador" })} />);
        expect(screen.getByText(/Nivel concedido: administrador/)).toBeInTheDocument();
    });

    it("sin permiso no deja escribir y lo explica", () => {
        render(<TerminalRemota {...props({ nivel: null })} />);
        expect(screen.getByLabelText("Orden")).toBeDisabled();
        expect(screen.getByText(/no ha dado permiso de terminal/i)).toBeInTheDocument();
    });

    it("envía la orden con Intro y limpia el campo", () => {
        const p = props();
        render(<TerminalRemota {...p} />);
        const campo = screen.getByLabelText("Orden") as HTMLInputElement;
        fireEvent.change(campo, { target: { value: "ls -la" } });
        fireEvent.keyDown(campo, { key: "Enter" });
        expect(p.alEnviar).toHaveBeenCalledWith("ls -la");
        expect(campo.value).toBe("");
    });

    it("no envía una orden mientras otra se ejecuta", () => {
        const p = props({ ocupada: true });
        render(<TerminalRemota {...p} />);
        const campo = screen.getByLabelText("Orden");
        fireEvent.change(campo, { target: { value: "pwd" } });
        fireEvent.keyDown(campo, { key: "Enter" });
        expect(p.alEnviar).not.toHaveBeenCalled();
    });

    it("la flecha arriba recupera la última orden del historial", () => {
        render(<TerminalRemota {...props({ historial: [{ orden: "uptime", resumen: "terminó bien.", cuando: 1 }] })} />);
        const campo = screen.getByLabelText("Orden") as HTMLInputElement;
        fireEvent.keyDown(campo, { key: "ArrowUp" });
        expect(campo.value).toBe("uptime");
    });

    it("la salida en vivo va en una región de registro y marca los errores", () => {
        render(<TerminalRemota {...props({ lineas: [{ flujo: "stdout", texto: "hola" }, { flujo: "stderr", texto: "fallo" }] })} />);
        expect(screen.getByRole("log")).toHaveTextContent("hola");
        expect(screen.getByText("fallo")).toHaveAttribute("data-flujo", "stderr");
    });

    it("el modo completo muestra su aviso con la caducidad", () => {
        render(<TerminalRemota {...props({ nivel: "administrador", modo: "completo", restanteMs: 30 * 60_000 })} />);
        expect(screen.getByRole("alert")).toHaveTextContent(/administrador completo/i);
        expect(screen.getByRole("alert")).toHaveTextContent("30 min");
    });

    it("«Terminar» solo se pulsa con una orden en curso y la corta", () => {
        const { unmount } = render(<TerminalRemota {...props()} />);
        expect(screen.getByRole("button", { name: "Terminar" })).toBeDisabled();
        unmount();
        const con = props({ ocupada: true });
        render(<TerminalRemota {...con} />);
        fireEvent.click(screen.getByRole("button", { name: "Terminar" }));
        expect(con.alTerminar).toHaveBeenCalledTimes(1);
    });

    it("enseña el historial con el resumen de cada orden", () => {
        render(<TerminalRemota {...props({ historial: [{ orden: "df -h", resumen: "terminó con código 1.", cuando: 1 }] })} />);
        expect(screen.getByText("df -h")).toBeInTheDocument();
        expect(screen.getByText("terminó con código 1.")).toBeInTheDocument();
    });
});
