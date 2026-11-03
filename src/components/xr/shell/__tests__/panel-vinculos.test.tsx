/**
 * XR1010AG · nodo Logic y panel de vínculos. El lienzo (uikit) se simula: se prueba la
 * decisión real (persistencia de prefs, avisos al robar un gatillo, mapa inválido, restaurar,
 * privacidad y conexiones) con `localStorage` de jsdom.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@react-three/uikit", () => ({
    Container: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <div onClick={onClick}>{children}</div>,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

import { consentimiento } from "../../../../lib/xr/privacidad";
import type { Sala } from "../../../../lib/salas/sala";
import { NodoLogic } from "../nodo-logic";
import { ETIQUETA_ACCION, PanelVinculos } from "../panel-vinculos";
import { leerCalidad, leerConfort, leerVinculos } from "../prefs-xr";

const fila = (nombre: string): HTMLElement => screen.getByText(nombre).parentElement as HTMLElement;
const pulsarEn = (nombre: string, control: string) => fireEvent.click(within(fila(nombre)).getByText(control));
const abrir = (pestana: string) => fireEvent.click(screen.getByText(pestana));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("calidad y comodidad del nodo Logic", () => {
    it("fija un nivel de calidad, lo persiste y vuelve a Auto", () => {
        render(<NodoLogic />);
        fireEvent.click(screen.getByText("Alta"));
        expect(leerCalidad().modo).toBe("alta");
        fireEvent.click(screen.getByText("Auto"));
        expect(leerCalidad().modo).toBe("auto");
    });

    it("cambiar el giro a 45° persiste en las preferencias", () => {
        render(<NodoLogic />);
        abrir("Comodidad");
        fireEvent.click(screen.getByText("45°"));
        expect(leerConfort().confort.anguloSalto).toBe(45);
        expect(leerConfort().confort.giro).toBe("saltos");
    });

    it("muestra el nivel actual y el motivo del último cambio de calidad", () => {
        render(<NodoLogic nivelActual="baja" motivoCambio="bajé a Baja: fotogramas lentos" />);
        expect(screen.getByText("Nivel actual: Baja")).toBeInTheDocument();
        expect(screen.getByText("bajé a Baja: fotogramas lentos")).toBeInTheDocument();
    });
});

describe("vínculos de entrada", () => {
    it("lista las 11 acciones de la forma de entrada presente", () => {
        render(<PanelVinculos entrada="mandos" />);
        for (const etiqueta of Object.values(ETIQUETA_ACCION)) expect(screen.getByText(etiqueta)).toBeInTheDocument();
    });

    it("reasignar un gatillo ocupado avisa de quién lo perdió", () => {
        render(<PanelVinculos entrada="teclado-raton" />);
        pulsarEn("Hablar", "Cambiar");
        fireEvent.keyDown(window, { code: "KeyC" });
        expect(screen.getByText(/Se lo quité a «Recentrar»/)).toBeInTheDocument();
        expect(leerVinculos()["teclado-raton"]?.hablar).toContainEqual({ tipo: "tecla", codigo: "KeyC" });
    });

    it("no deja guardar un mapa sin «salir»", () => {
        render(<PanelVinculos entrada="teclado-raton" />);
        pulsarEn("Hablar", "Cambiar");
        fireEvent.keyDown(window, { code: "Escape" });
        expect(screen.getByText(/Falta un gatillo para «salir»/)).toBeInTheDocument();
        expect(leerVinculos()["teclado-raton"]?.salir).toEqual([{ tipo: "tecla", codigo: "Escape" }]);
    });

    it("«Restaurar» devuelve los valores por defecto", () => {
        render(<PanelVinculos entrada="teclado-raton" />);
        pulsarEn("Hablar", "Cambiar");
        fireEvent.keyDown(window, { code: "KeyD" });
        fireEvent.click(screen.getByText("Restaurar"));
        const mapa = leerVinculos()["teclado-raton"];
        expect(mapa?.hablar).toEqual([{ tipo: "tecla", codigo: "Space" }]);
        expect(mapa?.["abrir-dock"]).toEqual([{ tipo: "tecla", codigo: "KeyD" }]);
    });

    it("nunca ofrece el gesto reservado del sistema", () => {
        render(<PanelVinculos entrada="manos" />);
        pulsarEn("Hablar", "Cambiar");
        expect(screen.queryByText("gesto pellizco-palma")).not.toBeInTheDocument();
        expect(screen.getAllByText("gesto pellizco").length).toBeGreaterThan(1);
    });
});

describe("privacidad y conexiones", () => {
    it("la cámara se muestra como «nunca sale del aparato»", () => {
        render(<NodoLogic />);
        abrir("Privacidad");
        expect(screen.getByText(/Nunca sale del aparato/i)).toBeInTheDocument();
    });

    it("un consentimiento vigente se puede quitar", () => {
        const ahora = Date.now();
        render(<NodoLogic consentimientos={[consentimiento("voz-texto", "nube-terceros", ahora)]} ahora={ahora} />);
        abrir("Privacidad");
        expect(screen.getByText(/voz texto → nube-terceros/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("Quitar"));
        expect(screen.queryByText(/voz texto → nube-terceros/)).not.toBeInTheDocument();
    });

    it("las conexiones explican el transporte y abren servidores", () => {
        const alAbrirServidores = vi.fn();
        const sala: Sala = { id: "s1", tipo: "xr", titulo: "Sala", visibilidad: "publica", transporte: "local", miembros: {}, creadaEn: 0 };
        render(<NodoLogic sala={sala} alcanzabilidad={{ internet: true, servidorPrivado: false, malla: false }} alAbrirServidores={alAbrirServidores} />);
        abrir("Conexiones");
        expect(screen.getByText(/Transporte actual: servidor público/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("Ver servidores y estaciones"));
        expect(alAbrirServidores).toHaveBeenCalledTimes(1);
    });
});
