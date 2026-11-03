import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MAPAS_DEFECTO } from "../../../../lib/xr/vinculos-xr";
import { consentimiento } from "../../../../lib/xr/privacidad";

vi.mock("@react-three/uikit", () => ({
    Container: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <div onClick={onClick}>{children}</div>,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    Input: ({ value, onValueChange }: { value?: string; onValueChange?: (v: string) => void }) => (
        <input value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)} />
    ),
}));

import { NodoLogic } from "../nodo-logic";
import { PanelVinculos } from "../panel-vinculos";

const irA = (pestana: string): void => { fireEvent.click(screen.getByText(pestana)); };
const guardado = (clave: string): Record<string, unknown> => JSON.parse(localStorage.getItem(clave) ?? "{}");
beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

describe("Nodo Logic · calidad, confort y privacidad", () => {
    it("cambiar el giro a 45° lo persiste en las preferencias", () => {
        render(<NodoLogic />);
        irA("Comodidad");
        fireEvent.click(screen.getByText("45°"));
        expect(guardado("starseed.xr.confort.v1")).toMatchObject({ anguloSalto: 45 });
    });

    it("elegir un nivel fijo de calidad lo persiste", () => {
        render(<NodoLogic />);
        fireEvent.click(screen.getByText("Alta"));
        expect(guardado("starseed.xr.calidad.v1")).toEqual({ modo: "alta" });
    });

    it("la pestaña de privacidad dice que la cámara nunca sale del aparato", () => {
        render(<NodoLogic />);
        irA("Privacidad");
        expect(screen.getByText("Nunca sale del aparato")).toBeInTheDocument();
    });

    it("un consentimiento vigente se muestra con su caducidad y se puede quitar", () => {
        const permiso = consentimiento("mapa-sala", "mismas-cuentas", Date.now());
        render(<NodoLogic consentimientos={[permiso]} />);
        irA("Privacidad");
        expect(screen.getByText(/Consentimiento: mapa-sala/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("Quitar"));
        expect(screen.queryByText(/Consentimiento: mapa-sala/)).toBeNull();
    });
});

describe("Panel de vínculos · aprender, validar y restaurar", () => {
    it("lista las 11 acciones de la forma de entrada", () => {
        render(<PanelVinculos entrada="mandos" />);
        for (const nombre of ["Seleccionar", "Agarrar", "Menú de mano", "Abrir dock", "Recentrar", "Salir", "Hablar", "Teletransporte", "Girar a la izquierda", "Girar a la derecha", "Atrás"]) {
            expect(screen.getByText(nombre)).toBeInTheDocument();
        }
    });

    it("reasignar un gatillo ocupado avisa de quién lo perdió", () => {
        render(<PanelVinculos entrada="teclado-raton" />);
        fireEvent.click(screen.getAllByText("Cambiar")[5]);
        fireEvent.keyDown(window, { code: "KeyM" });
        expect(screen.getByText(/Se lo quité a «Menú de mano»/)).toBeInTheDocument();
    });

    it("no deja guardar un mapa sin «salir»", () => {
        const sinSalir = { ...MAPAS_DEFECTO["teclado-raton"] };
        delete sinSalir.salir;
        const alGuardar = vi.fn();
        render(<PanelVinculos entrada="teclado-raton" mapaInicial={sinSalir} alGuardar={alGuardar} />);
        fireEvent.click(screen.getByText("Guardar"));
        expect(alGuardar).not.toHaveBeenCalled();
        expect(screen.getByText(/Falta un gatillo para «salir»/)).toBeInTheDocument();
    });

    it("«Restaurar» devuelve el mapa por defecto y lo guarda", () => {
        const sinSalir = { ...MAPAS_DEFECTO["teclado-raton"] };
        delete sinSalir.salir;
        const alGuardar = vi.fn();
        render(<PanelVinculos entrada="teclado-raton" mapaInicial={sinSalir} alGuardar={alGuardar} />);
        fireEvent.click(screen.getByText("Restaurar"));
        expect(alGuardar).toHaveBeenCalledWith(MAPAS_DEFECTO["teclado-raton"]);
        expect(screen.getByText("Tecla Escape")).toBeInTheDocument();
    });
});
