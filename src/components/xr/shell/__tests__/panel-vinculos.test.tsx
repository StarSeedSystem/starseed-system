import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ACCIONES_XR, MAPAS_DEFECTO, type AccionXR } from "../../../../lib/xr/vinculos-xr";
import { consentimiento } from "../../../../lib/xr/privacidad";

vi.mock("@react-three/uikit", () => ({
    Container: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) =>
        onClick ? <button onClick={onClick}>{children}</button> : <div>{children}</div>,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../panel-cristal", () => ({
    PanelCristal: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Texto3D: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

import { ETIQUETAS_ACCION, PanelVinculos, puedeGuardarMapa } from "../panel-vinculos";
import { NodoLogic } from "../nodo-logic";

const CONFORT = "starseed.xr.confort.v1";
const CALIDAD = "starseed.xr.calidad.v1";
const VINCULOS = "starseed.xr.vinculos.v1";
const guardado = (clave: string): Record<string, unknown> => JSON.parse(localStorage.getItem(clave) ?? "null");

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function cambiar(accion: AccionXR): void {
    fireEvent.click(screen.getAllByRole("button", { name: "Cambiar" })[ACCIONES_XR.indexOf(accion)]);
}

describe("panel de vínculos", () => {
    it("lista las 11 acciones de la forma de entrada", () => {
        render(<PanelVinculos entrada="mandos" />);
        for (const accion of ACCIONES_XR) expect(screen.getByText(ETIQUETAS_ACCION[accion])).toBeInTheDocument();
    });
    it("reasignar un gatillo ocupado avisa de quién lo perdió", () => {
        const { rerender } = render(<PanelVinculos entrada="mandos" captura={null} />);
        cambiar("salir");
        rerender(<PanelVinculos entrada="mandos" captura={{ tipo: "boton", indice: 3, mano: "derecha" }} />);
        expect(screen.getByText(/Se lo quité a «Recentrar»/)).toBeInTheDocument();
    });
    it("no deja guardar un mapa sin «salir»", () => {
        const resultado = puedeGuardarMapa("mandos", { ...MAPAS_DEFECTO.mandos, salir: [] });
        expect(resultado.ok).toBe(false);
        expect(resultado.problemas.join(" ")).toContain("salir");
    });
    it("un gesto reservado tampoco se puede guardar", () => {
        const mapa = {
            ...MAPAS_DEFECTO.manos,
            seleccionar: [{ tipo: "gesto" as const, gesto: "pellizco-palma" as const, mano: "cualquiera" as const }],
        };
        const resultado = puedeGuardarMapa("manos", mapa);
        expect(resultado.ok).toBe(false);
        expect(resultado.problemas.join(" ")).toContain("pellizco-palma");
    });
    it("«Restaurar» devuelve los valores por defecto", () => {
        const { rerender } = render(<PanelVinculos entrada="mandos" captura={null} />);
        cambiar("salir");
        rerender(<PanelVinculos entrada="mandos" captura={{ tipo: "boton", indice: 3, mano: "derecha" }} />);
        fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
        expect(guardado(VINCULOS).mandos).toEqual(MAPAS_DEFECTO.mandos);
    });
});

describe("nodo Logic", () => {
    it("cambiar el giro a 45° persiste", () => {
        render(<NodoLogic />);
        fireEvent.click(screen.getByRole("button", { name: "Comodidad" }));
        fireEvent.click(screen.getByRole("button", { name: "45°" }));
        expect(guardado(CONFORT).anguloSalto).toBe(45);
    });
    it("el nivel fijo de calidad persiste y se ve al instante", () => {
        render(<NodoLogic />);
        fireEvent.click(screen.getByRole("button", { name: "Alta" }));
        expect(guardado(CALIDAD)).toEqual({ modo: "alta" });
        expect(screen.getByText(/Fija en Alta/)).toBeInTheDocument();
    });
    it("la privacidad muestra la cámara como «nunca sale del aparato»", () => {
        render(<NodoLogic />);
        fireEvent.click(screen.getByRole("button", { name: "Privacidad" }));
        expect(screen.getByText(/Cámara del passthrough: nunca sale del aparato/i)).toBeInTheDocument();
    });
    it("el consentimiento vigente se puede quitar", () => {
        const quitar = vi.fn();
        render(
            <NodoLogic
                consentimientos={[consentimiento("mapa-sala", "mismas-cuentas", Date.now())]}
                alQuitarConsentimiento={quitar}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Privacidad" }));
        expect(screen.getByText(/caduca/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
        expect(quitar).toHaveBeenCalledWith("mapa-sala");
    });
    it("las conexiones explican el transporte de la sala y enlazan a /servidores", () => {
        const sala = {
            id: "s", tipo: "xr" as const, titulo: "Sala", visibilidad: "publica" as const,
            transporte: "servidor-publico" as const, miembros: {}, creadaEn: 0,
        };
        render(<NodoLogic sala={sala} alcanzabilidad={{ internet: true, servidorPrivado: false, malla: false }} />);
        fireEvent.click(screen.getByRole("button", { name: "Conexiones" }));
        expect(screen.getByText(/Transporte: Servidor público/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Abrir /servidores" })).toBeInTheDocument();
    });
});
