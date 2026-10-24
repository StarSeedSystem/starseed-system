// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * Los botones «Desconectar» y «Usar como contenedor» de la tarjeta de cada neurona (COL1012I).
 *
 * Tres capas: la ficha pura de `botonesNeurona` (rescatada de una rama nube), el traductor puro latido → tarjeta
 * (`colmena-tarjeta.ts`) y el componente de verdad (`MetaGenesisAutonoma`) con el cliente simulado.
 * Los casos de la rama nube se adaptaron al contrato de hoy: el destino es el id del nodo (nunca «lider»),
 * `punto.t` va en segundos y ningún texto promete un traspaso que aún no existe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { botonesNeurona, type NeuronaColmena } from "@/lib/metagenesis/colmena";
import {
    avisoDeOrdenANodo,
    botonesDeNodo,
    lineaDeNodo,
    neuronaDeNodo,
    ordenDeBoton,
    porQueNoSePuedeMandar,
    soDeMedio,
    ultimoPunto,
} from "@/lib/metagenesis/colmena-tarjeta";
import type { EstadoAutonomo, NodoVista, OrdenVista } from "@/lib/metagenesis/remoto-nodos";

const estado = { miembro: true, lectura: null as unknown };
const enviarOrden = vi.fn(async (..._a: unknown[]) => ({ ok: true, clave: "nonce-1", modo: "bus" }) as { ok: true; clave: string; modo: string } | { ok: false; motivo: string });

vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => ({ miembro: estado.miembro, dueno: false }) }));
vi.mock("@/lib/metagenesis/remoto-nodos-cliente", () => ({
    leerEstadoAutonomo: async () => estado.lectura,
    enviarOrden: (...a: unknown[]) => enviarOrden(...a),
}));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));

import { AppearanceProvider } from "@/context/appearance-context";
import { MetaGenesisAutonoma } from "../metagenesis-autonoma";

describe("colmena-botones · botones de una neurona (rescatado de rama nube)", () => {
    // Los textos del contrato (traspaso a otro contenedor) solo son verdad con el relevo cableado: estas pruebas
    // lo declaran. Sin la bandera se asume que NO está activo (ver el bloque «sin traspaso» más abajo).
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 } as NeuronaColmena);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBeFalsy();
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({
            nodo: "mac-a1b2c3",
            vivo: true,
            so: "macos",
            enCurso: 0,
            contenedor: { activo: true, agentes: 3, apto: true, motivo: "" },
            relevoActivo: true,
        } as NeuronaColmena);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });

    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1, relevoActivo: true } as NeuronaColmena);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });
});
