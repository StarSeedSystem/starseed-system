/**
 * XR1010AG · nodo Logic y panel de vínculos. El lienzo 3D (uikit) se simula: se prueba lo que la
 * persona ve y pulsa (jsdom) y que las preferencias quedan guardadas de verdad en localStorage.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { ACCIONES_XR, MAPAS_DEFECTO, type Gatillo } from "../../../../lib/xr/vinculos-xr";
import type { Consentimiento } from "../../../../lib/xr/privacidad";
import type { Sala } from "@/lib/salas/sala";
import { NodoLogic } from "../nodo-logic";
import { ETIQUETAS_ACCION, PanelVinculos } from "../panel-vinculos";

vi.mock("@react-three/uikit", () => ({
    Container: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <div onClick={onClick}>{children}</div>,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

const CLAVE_VINCULOS = "starseed.xr.vinculos.v1", CLAVE_CONFORT = "starseed.xr.confort.v1", CLAVE_CALIDAD = "starseed.xr.calidad.v1";
const leer = (clave: string) => JSON.parse(localStorage.getItem(clave) ?? "null");
const filaDe = (nombre: string) => screen.getByText(nombre).parentElement as HTMLElement;
const cambiar = async (accion: string, gatillo: Gatillo) => {
    fireEvent.click(within(filaDe(accion)).getByText("Cambiar"));
    await waitFor(() => expect(screen.getByText(/Se lo quité|ahora es/)).toBeInTheDocument());
    return gatillo;
};
const salaPrivada: Sala = { id: "s1", tipo: "xr", titulo: "Sala", visibilidad: "privada", transporte: "local", miembros: {}, creadaEn: 1 };

beforeEach(() => { localStorage.clear(); vi.spyOn(console, "log").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PanelVinculos · las 11 acciones y el modo aprender", () => {
    it("lista las 11 acciones por forma de entrada y sus gatillos", () => {
        render(<PanelVinculos entrada="manos" />);
        for (const accion of ACCIONES_XR) expect(screen.getByText(ETIQUETAS_ACCION[accion])).toBeInTheDocument();
        expect(screen.getByText("Vínculos de entrada · manos")).toBeInTheDocument();
    });
    it("al reasignar un gatillo ocupado avisa de quién lo perdió y guarda el cambio", async () => {
        const capturar = vi.fn(() => ({ tipo: "boton" as const, indice: 0, mano: "derecha" as const }));
        render(<PanelVinculos entrada="mandos" capturarGatillo={capturar} />);
        await cambiar("Agarrar", capturar());
        expect(screen.getByText("Se lo quité a «Seleccionar» (botón 0 (derecha)).")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Guardar"));
        expect(leer(CLAVE_VINCULOS).mandos.agarrar[0]).toEqual({ tipo: "boton", indice: 0, mano: "derecha" });
    });
    it("no deja guardar un mapa sin «salir» (dejaría a la persona atrapada)", async () => {
        const capturar = vi.fn(() => ({ tipo: "boton" as const, indice: 5, mano: "derecha" as const }));
        render(<PanelVinculos entrada="mandos" capturarGatillo={capturar} />);
        await cambiar("Agarrar", capturar());
        expect(screen.getByText(/Falta un gatillo para «salir»/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("Guardar"));
        expect(screen.getAllByText(/No se puede guardar/).length).toBeGreaterThan(0);
        expect(localStorage.getItem(CLAVE_VINCULOS)).toBeNull();
    });
    it("«Restaurar» devuelve los valores de fábrica aunque se hayan cambiado", async () => {
        const capturar = vi.fn(() => ({ tipo: "boton" as const, indice: 6, mano: "derecha" as const }));
        render(<PanelVinculos entrada="mandos" capturarGatillo={capturar} />);
        await cambiar("Seleccionar", capturar());
        fireEvent.click(screen.getByText("Guardar"));
        expect(leer(CLAVE_VINCULOS).mandos.seleccionar[0]).toEqual({ tipo: "boton", indice: 6, mano: "derecha" });
        fireEvent.click(screen.getByText("Restaurar"));
        expect(leer(CLAVE_VINCULOS).mandos).toEqual(MAPAS_DEFECTO.mandos);
    });
    it("un gesto reservado por el sistema bloquea el guardado y lo explica", async () => {
        const capturar = vi.fn(() => ({ tipo: "gesto" as const, gesto: "pellizco-palma" as const, mano: "cualquiera" as const }));
        render(<PanelVinculos entrada="manos" capturarGatillo={capturar} />);
        await cambiar("Seleccionar", capturar());
        expect(screen.getByText(/es del sistema del visor y no se puede reasignar/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("Guardar"));
        expect(localStorage.getItem(CLAVE_VINCULOS)).toBeNull();
    });
});

describe("NodoLogic · calidad, comodidad, privacidad y conexiones", () => {
    it("cambiar el giro a 45° persiste en localStorage", () => {
        render(<NodoLogic />);
        fireEvent.click(screen.getByText("Comodidad"));
        fireEvent.click(screen.getByText("45°"));
        expect(leer(CLAVE_CONFORT).anguloSalto).toBe(45);
    });
    it("muestra el nivel actual, el motivo del último cambio y guarda un nivel fijo", () => {
        render(<NodoLogic nivelActual="baja" motivoUltimoCambio="Bajé a Baja: fotogramas lentos." />);
        expect(screen.getByText(/nivel actual: Baja/)).toBeInTheDocument();
        expect(screen.getByText("Bajé a Baja: fotogramas lentos.")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Alta"));
        expect(leer(CLAVE_CALIDAD)).toEqual({ modo: "alta" });
    });
    it("la privacidad marca la cámara como «nunca sale del aparato»", () => {
        render(<NodoLogic />);
        fireEvent.click(screen.getByText("Privacidad"));
        expect(screen.getByText(/camara-passthrough · nunca sale del aparato/)).toBeInTheDocument();
        expect(screen.getByText(/mapa-sala · hasta mismas-cuentas/)).toBeInTheDocument();
    });
    it("un consentimiento vigente se ve con su caducidad y se puede quitar", () => {
        function ConConsentimientos() {
            const [lista, setLista] = useState<Consentimiento[]>([{ dato: "mapa-sala", hasta: "mismas-cuentas", vence: Date.now() + 3_600_000 }]);
            return <NodoLogic consentimientos={lista} alQuitarConsentimiento={(x) => setLista((previa) => previa.filter((c) => c !== x))} />;
        }
        render(<ConConsentimientos />);
        fireEvent.click(screen.getByText("Privacidad"));
        expect(screen.getByText(/mapa-sala → mismas-cuentas · vence en/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("Quitar"));
        expect(screen.queryByText(/mapa-sala → mismas-cuentas/)).toBeNull();
        expect(screen.getByText("Ninguno.")).toBeInTheDocument();
    });
    it("en Conexiones enseña el transporte decidido y abre /servidores", () => {
        const abrir = vi.fn();
        render(<NodoLogic sala={salaPrivada} alcanzabilidad={{ internet: true, servidorPrivado: false, malla: true }} alAbrirServidores={abrir} />);
        fireEvent.click(screen.getByText("Conexiones"));
        expect(screen.getByText(/Transporte actual: Malla P2P/)).toBeInTheDocument();
        expect(screen.getByText(/viaja por la malla P2P/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("Ir a servidores"));
        expect(abrir).toHaveBeenCalledOnce();
    });
});
