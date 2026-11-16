/**
 * PanelMotorVoz — prueba de no exposición del comando del demonio (IMG-profunda).
 *
 * El comando exacto para levantar el demonio (rutas, modelos, puertos) NO debe
 * aparecer en la interfaz: es información interna de la neurona.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelMotorVoz } from "@/components/voces/panel-motor";

vi.mock("@/components/ui/card", () => ({
    Card: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
    CardHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
    CardTitle: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
    CardDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    CardContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
    Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
    Button: ({
        children,
        disabled,
        onClick,
    }: {
        children?: ReactNode;
        disabled?: boolean;
        onClick?: () => void;
    }) => (
        <button type="button" disabled={disabled} onClick={onClick}>
            {children}
        </button>
    ),
}));

vi.mock("@/components/ui/select", () => ({
    Select: ({ children, value, onValueChange }: { children?: ReactNode; value: string; onValueChange: (v: string) => void }) => (
        <div>
            <select value={value} onChange={(e) => onValueChange(e.target.value)}>
                {children}
            </select>
        </div>
    ),
    SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
    ),
}));

vi.mock("@/components/ui/label", () => ({
    Label: ({ children, htmlFor }: { children?: ReactNode; htmlFor?: string }) => (
        <label htmlFor={htmlFor}>{children}</label>
    ),
}));

vi.mock("@/components/ui/table", () => ({
    Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
    TableHeader: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
    TableBody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
    TableRow: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
    TableHead: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
    TableCell: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
}));

vi.mock("@/lib/aurora/voz-starseed/capacidades", () => ({
    detectarCapacidades: vi.fn().mockResolvedValue(null),
    olvidarCapacidades: vi.fn(),
}));

vi.mock("@/lib/aurora/voz-starseed/motor", () => ({
    fijarNivel: vi.fn(),
    nivelPreferido: () => "auto" as const,
}));

vi.mock("@/lib/aurora/voz-starseed/niveles", () => ({
    NIVELES: {
        estudio: { etiqueta: "Estudio", motorInterno: "omnivoice", ramMB: 900, requisitos: "daemon local", latencia: "~50 ms" },
        alta: { etiqueta: "Alta", motorInterno: "omnivoice", ramMB: 700, requisitos: "daemon local", latencia: "~80 ms" },
        ligera: { etiqueta: "Ligera", motorInterno: "navegador", ramMB: 0, requisitos: "ninguno", latencia: "~200 ms" },
        minima: { etiqueta: "Mínima", motorInterno: "navegador", ramMB: 0, requisitos: "ninguno", latencia: "~300 ms" },
    },
    nivelPara: () => "ligera" as const,
}));

function respuesta(status: number, cuerpo: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => cuerpo,
    } as unknown as Response;
}

function simularRed(getFn: () => Response) {
    const falso = vi.fn(async (_url: string) => getFn());
    vi.stubGlobal("fetch", falso);
    return falso;
}

const SALUD_APAGADA = {
    vivo: false,
    latenciaMs: null,
    modelo: null,
    estado: "apagado" as const,
    despertandoDesdeMs: null,
    memoriaLibreMb: null,
};

describe("PanelMotorVoz · no expone el comando del demonio", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("cuando el demonio está apagado, NO muestra el comando exacto (rutas/modelos/puertos)", async () => {
        simularRed(() => respuesta(200, SALUD_APAGADA));
        render(<PanelMotorVoz />);

        await screen.findByText(/El demonio está apagado/i);

        const pre = screen.getByRole("code");
        expect(pre).toBeInTheDocument();

        const texto = pre.textContent ?? "";
        expect(texto).not.toContain("omnivoice.cpp");
        expect(texto).not.toContain("omnivoice-base-Q8_0.gguf");
        expect(texto).not.toContain("omnivoice-tokenizer-Q8_0.gguf");
        expect(texto).not.toContain("--host 127.0.0.1");
        expect(texto).not.toContain("--port 4500");
        expect(texto).not.toContain("--lang Spanish");
    });

    it("cuando el demonio está apagado, muestra un mensaje genérico de cómo iniciarlo", async () => {
        simularRed(() => respuesta(200, SALUD_APAGADA));
        render(<PanelMotorVoz />);

        await screen.findByText(/El demonio está apagado/i);

        const pre = screen.getByRole("code");
        expect(pre).toBeInTheDocument();

        const texto = pre.textContent ?? "";
        expect(texto.toLowerCase()).toMatch(/ejecuta|inicia|levanta|arranca/);
    });
});