import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MedidorEtapas } from "../medidor-etapas";
import type { PasoTarea } from "@/lib/mando/etapas";

const paso = (p: Partial<PasoTarea> & { id: string }): PasoTarea => ({
    etapa: "escribiendo",
    indice: 0,
    porcentaje: 17,
    minutosEnEtapa: 3,
    desenlace: "en marcha",
    detalle: "",
    ...p,
});

// Sin limpieza entre pruebas los renders se acumulan en el mismo documento y
// testing-library encuentra el mismo testid dos veces.
afterEach(cleanup);

describe("MedidorEtapas", () => {
    it("sin tareas no finge actividad", () => {
        render(<MedidorEtapas pasos={[]} />);
        expect(screen.getByTestId("medidor-etapas-vacio")).toBeDefined();
    });

    it("un atasco se lee con la palabra, no solo con color", () => {
        render(<MedidorEtapas pasos={[paso({ id: "p316F", etapa: "visto bueno", indice: 4, porcentaje: 83, minutosEnEtapa: 147, desenlace: "atascada", detalle: "147 min esperando tu visto bueno" })]} />);
        expect(screen.getByTestId("etapa-p316F").textContent).toContain("atascada");
        expect(screen.getByTestId("etapa-p316F").textContent).toContain("147");
    });

    it("la barra publica su porcentaje para lectores de pantalla", () => {
        render(<MedidorEtapas pasos={[paso({ id: "A", porcentaje: 50, indice: 2 })]} />);
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    });

    it("la cabecera cuenta en marcha y atascadas", () => {
        render(<MedidorEtapas pasos={[paso({ id: "A" }), paso({ id: "B", desenlace: "atascada" })]} />);
        expect(screen.getByTestId("medidor-etapas").textContent).toContain("1 en marcha · 1 atascadas");
    });

    it("lo atascado va por encima de lo que va bien, y lo integrado al final", () => {
        render(
            <MedidorEtapas
                pasos={[
                    paso({ id: "buena" }),
                    paso({ id: "lista", desenlace: "integrada", etapa: "integrada", indice: 5, porcentaje: 100 }),
                    paso({ id: "mala", desenlace: "atascada", minutosEnEtapa: 60 }),
                ]}
            />,
        );
        const filas = screen.getByTestId("medidor-etapas").querySelectorAll("li");
        expect(filas[0].getAttribute("data-testid")).toBe("etapa-mala");
        expect(filas[2].getAttribute("data-testid")).toBe("etapa-lista");
    });

    it("la etapa actual se lee en texto", () => {
        render(<MedidorEtapas pasos={[paso({ id: "A", etapa: "revisando", indice: 3 })]} />);
        expect(screen.getByTestId("etapa-A").textContent).toContain("revisando");
    });
});
