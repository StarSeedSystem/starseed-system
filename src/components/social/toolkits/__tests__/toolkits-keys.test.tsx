import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline, RosterStrip, type TimelineEntry } from "../shared";

const entradas: TimelineEntry[] = [
    { id: "sesion-circular", time: "18:00", title: "Círculo de apertura", status: "done" },
    { time: "18:30", title: "Círculo de apertura", detail: "Duplicada para probar la clave" },
    { time: "19:00", title: "Acuerdos", status: "upcoming" },
];

describe("Timeline · claves estables", () => {
    it("renderiza cada entrada con su contenido", () => {
        render(<Timeline entries={entradas} accent="#34d399" />);
        expect(screen.getAllByText("Círculo de apertura").length).toBe(2);
        expect(screen.getByText("Acuerdos")).toBeTruthy();
        expect(screen.getByText("Duplicada para probar la clave")).toBeTruthy();
    });

    it("acepta un id externo sin romper el render", () => {
        const { container } = render(<Timeline entries={[{ id: "hito-7", title: "Hito" }]} />);
        expect(container.querySelectorAll("li").length).toBe(1);
    });
});

describe("RosterStrip · claves estables", () => {
    it("renderiza el recuento y los avatares sintéticos", () => {
        render(<RosterStrip seed="starseed" count={12} label="miembros" />);
        expect(screen.getByText("12")).toBeTruthy();
        expect(screen.getByText("miembros")).toBeTruthy();
    });
});
