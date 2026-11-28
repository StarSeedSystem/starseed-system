import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PanelTeToca } from "../panel-te-toca";
import type { AccionAlex } from "@/lib/mando/acciones-alex";

const accion: AccionAlex = {
    id: "K1",
    titulo: "Revisar el despliegue",
    por_que: "Queda una comprobación pendiente.",
    urgencia: "media",
    comando: "starseed-puente puertas",
    por_que_no_lo_hago_yo: "Necesita tu visto bueno.",
};

describe("PanelTeToca", () => {
    afterEach(() => {
        cleanup();
    });

    it("nombra a Maggasukha en la región accesible", () => {
        render(<PanelTeToca acciones={[accion]} alCerrar={() => {}} alCambiar={() => {}} />);
        expect(screen.getByRole("region", { name: "Acciones que esperan a Maggasukha" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Acciones que esperan a Alex" })).toBeNull();
    });
});
