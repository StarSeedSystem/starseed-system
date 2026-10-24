/**
 * OPF1024I · La página de la Constitución pinta la cita del fundamento con su negrita.
 * La cita (`CITA_FUNDAMENTO`) se escribe en Markdown (`**…**`); la persona debe ver la
 * negrita, nunca los asteriscos. El texto de la Constitución no se toca: solo cómo se pinta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";

// La tarjeta de cristal necesita el proveedor de apariencia; aquí solo importa el contenido.
vi.mock("@/components/ui/card", () => {
    const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    return { Card: Caja, CardHeader: Caja, CardTitle: Caja, CardDescription: Caja, CardContent: Caja };
});

import ConstitutionPage from "@/app/(app)/info/constitution/page";

afterEach(cleanup);

describe("Constitución · cita del fundamento", () => {
    it("no enseña marcadores de Markdown literales en ninguna parte de la página", () => {
        const { container } = render(<ConstitutionPage />);
        expect(container.textContent ?? "").not.toContain("**");
    });

    it("pinta en negrita cada fragmento marcado con **…** en la cita", () => {
        const { container } = render(<ConstitutionPage />);
        const cita = container.querySelector("blockquote");
        expect(cita).not.toBeNull();
        const negritas = Array.from(cita!.querySelectorAll("strong")).map((n) =>
            (n.textContent ?? "").replace(/\s+/g, " "),
        );
        expect(negritas).toEqual([
            "diamante en esencia de conciencia",
            "piedra filosofal",
            "semilla",
            "sistema completo",
            "alquimia de la transformación a oro",
        ]);
        // El texto de alrededor sigue entero (comillas incluidas).
        const texto = (cita!.textContent ?? "").replace(/\s+/g, " ");
        expect(texto.startsWith("«El fundamento filosófico de StarSeed es el diamante")).toBe(true);
        expect(texto.endsWith("económicamente ecológico y autosustentable.»")).toBe(true);
    });
});
