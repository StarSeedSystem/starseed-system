import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/components/ui/label", () => ({
    Label: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
}));
vi.mock("@/components/ui/select", () => ({
    Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: ReactNode; value?: string }) => (
        <div data-value={value}>{children}</div>
    ),
    SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));
vi.mock("@/components/ui/table", () => ({
    Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
    TableHeader: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
    TableBody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
    TableRow: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
    TableHead: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
    TableCell: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
}));

type EstadoSaludMock = {
    vivo: boolean;
    latenciaMs: number | null;
    modelo: string | null;
    estado: "vivo" | "despertando" | "apagado";
    despertandoDesdeMs: number | null;
    memoriaLibreMb: number | null;
};

const ESTADO_APAGADO: EstadoSaludMock = {
    vivo: false,
    latenciaMs: null,
    modelo: null,
    estado: "apagado",
    despertandoDesdeMs: null,
    memoriaLibreMb: null,
};

function simularSalud(estado: EstadoSaludMock): Response {
    return {
        ok: true,
        status: 200,
        json: async () => estado,
    } as unknown as Response;
}

function simularRed(getSalud: () => Response) {
    const falso = vi.fn(async (_url: string) => getSalud());
    vi.stubGlobal("fetch", falso);
    return falso;
}

describe("PanelMotorVoz", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("no expone el COMANDO_DAEMON cuando el demonio está apagado", async () => {
        const fetchMock = simularRed(() => simularSalud(ESTADO_APAGADO));
        render(<PanelMotorVoz />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
        });

        expect(screen.getByText(/Demonio:.*apagado/i)).toBeTruthy();

        expect(document.body.textContent).not.toContain("tts-server --model");
        expect(document.body.textContent).not.toContain("omnivoice-base-Q8_0.gguf");
        expect(document.body.textContent).not.toContain("--codec omnivoice-tokenizer-Q8_0.gguf");
    });
});