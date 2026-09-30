import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ArrowUp } from "lucide-react";
import { MicroDato } from "@/modules/weather/components/widgets/_clima/piezas";
import { MicroB } from "@/components/dashboard/widgets/gen2/_paquete-b/piezas-b";

afterEach(cleanup);

/** Tamaño en px de la cifra (lo fija el propio componente en línea). */
function tamCifra(texto: string): number {
    return parseFloat((screen.getByText(texto) as HTMLElement).style.fontSize);
}

describe("MicroDato (clima y cosmos en una tesela micro)", () => {
    it("tesela apaisada (108×65): glifo y cifra EN FILA, la cifra medida por el alto", () => {
        const { container } = render(<MicroDato info={{ ancho: 108, alto: 65 }} etiqueta="Viento S a 2 km/h" glifo={<ArrowUp />} cifra="2" unidad="km/h" />);
        expect(container.querySelector("[data-micro-dato]")?.getAttribute("data-micro-dato")).toBe("fila");
        expect(screen.getByRole("img", { name: "Viento S a 2 km/h" })).toBeTruthy();
        expect(tamCifra("2")).toBeLessThanOrEqual(26); // 65 × 0,4
        expect(screen.getByText("km/h")).toBeTruthy();
    });

    it("una fila de móvil (178×46): la cifra baja a lo que cabe en 46 px", () => {
        render(<MicroDato info={{ ancho: 178, alto: 46 }} etiqueta="Humedad 86 %" cifra="86%" />);
        expect(tamCifra("86%")).toBeLessThanOrEqual(19);
    });

    it("si no cabe en fila y hay alto, se apila; si no, suelta la unidad (sigue en el nombre)", () => {
        const { container, unmount } = render(<MicroDato info={{ ancho: 90, alto: 65 }} etiqueta="Rayos X clase B3.2" rotulo="Rayos X" cifra="B3.2" />);
        expect(container.querySelector("[data-micro-dato]")?.getAttribute("data-micro-dato")).toBe("pila");
        unmount();
        render(<MicroDato info={{ ancho: 80, alto: 46 }} etiqueta="Viento solar 512 km/s" cifra="512" unidad="km/s" rotulo="Viento" />);
        expect(screen.queryByText("km/s")).toBeNull();
        expect(screen.getByRole("img", { name: "Viento solar 512 km/s" })).toBeTruthy();
    });

    it("caja más alta que ancha: se apila", () => {
        const { container } = render(<MicroDato info={{ ancho: 70, alto: 100 }} etiqueta="Kp 3,3" rotulo="Kp" cifra="3,3" />);
        expect(container.querySelector("[data-micro-dato]")?.getAttribute("data-micro-dato")).toBe("pila");
    });
});

describe("MicroB (paquete B en una tesela micro)", () => {
    it("glifo a la izquierda y cifra a la derecha; el rótulo que no cabe se retira (queda en el nombre)", () => {
        const { container } = render(<MicroB glifo={(l) => <svg data-lado={l} />} cifra="0,0" rotulo="kWh/m² hoy" etiqueta="Hoy: 0,0 kWh/m² de sol" />);
        expect(container.querySelector("[data-micro-b]")?.getAttribute("data-micro-b")).toBe("fila");
        expect(Number(container.querySelector("svg")?.getAttribute("data-lado"))).toBeLessThanOrEqual(47); // 65 − 18
        expect(screen.getByRole("img", { name: "Hoy: 0,0 kWh/m² de sol" })).toBeTruthy();
        expect(screen.queryByText("kWh/m² hoy")).toBeNull();
    });

    it("con acción, la tesela entera es el botón", () => {
        render(<MicroB glifo={() => <span>♉︎</span>} rotulo="Tauro" etiqueta="Añade tu nacimiento" onClick={() => {}} />);
        const boton = screen.getByRole("button", { name: "Añade tu nacimiento" });
        expect(boton.className).toMatch(/cursor-pointer/);
    });
});
