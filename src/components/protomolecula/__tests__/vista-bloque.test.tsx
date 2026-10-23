// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { VistaBloqueProtomolecula, copiaPropia } from "../vista-bloque";
import { serializarBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { PREFIJO_MOLECULA, type AlmacenLocal } from "@/lib/protomolecula/almacen-moleculas";
import { limpiarRegistro, registrarAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Molecula } from "@/lib/protomolecula/tipos";

const molecula = (): Molecula => ({
    id: "mol-original",
    titulo: "Paisaje sonoro",
    ambito: "publica",
    capas: [{ id: "c1", tipo: "grafo-audio", titulo: "Ambiente", formato: "webaudio", referencia: null, orden: 0, visible: true, bloqueada: false }],
    atomos: [{ id: "a1", herramientaId: "reverb-prueba", capaId: "c1", estado: "activo" }],
    valores: { "a1::mezcla": 30, "a1::tiempo": 1.5 },
    version: 3,
    creadaEn: 1,
    actualizadaEn: 2,
});

function textoDe(m: Molecula): string {
    const r = serializarBloque(m);
    if (!r.ok) throw new Error(r.motivo);
    return r.valor;
}

function almacenFalso(): AlmacenLocal & { datos: Map<string, string> } {
    const datos = new Map<string, string>();
    return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

beforeEach(() => {
    limpiarRegistro();
    registrarAtomo({
        herramientaId: "reverb-prueba",
        nombre: "Reverberación",
        categoria: "audio",
        integracion: "libreria-js",
        control: "total",
        parametros: [
            { id: "mezcla", nombre: "Mezcla", tipo: "numero", min: 0, max: 100, unidad: "%" },
            { id: "tiempo", nombre: "Tiempo", tipo: "numero", min: 0, max: 10, unidad: "s" },
        ],
        entradas: [],
        salidas: [],
    });
});
afterEach(() => {
    cleanup();
    limpiarRegistro();
});

describe("VistaBloqueProtomolecula", () => {
    it("pinta la tarjeta con título, ámbito, capas y herramienta", () => {
        render(<VistaBloqueProtomolecula texto={textoDe(molecula())} almacen={almacenFalso()} navegar={vi.fn()} />);
        expect(screen.getByText("Paisaje sonoro")).toBeInTheDocument();
        expect(screen.getByText("publica")).toBeInTheDocument();
        expect(screen.getByText(/Ambiente · grafo-audio/)).toBeInTheDocument();
        expect(screen.getByText("Reverberación")).toBeInTheDocument();
    });

    it("los valores salen con su unidad", () => {
        render(<VistaBloqueProtomolecula texto={textoDe(molecula())} almacen={almacenFalso()} navegar={vi.fn()} />);
        expect(screen.getByText("30 %")).toBeInTheDocument();
        expect(screen.getByText("1,5 s")).toBeInTheDocument();
    });

    it("un texto inválido pinta el aviso y el motivo", () => {
        render(<VistaBloqueProtomolecula texto="{no es json" />);
        expect(screen.getByText("Esta molécula no se puede mostrar")).toBeInTheDocument();
        expect(screen.getByText(/JSON no válido/)).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("una versión desconocida también dice su motivo", () => {
        render(<VistaBloqueProtomolecula texto={JSON.stringify({ pm: 99, molecula: molecula() })} />);
        expect(screen.getByText(/versión no soportada/)).toBeInTheDocument();
    });

    it("«Abrir copia propia» guarda una copia con id nuevo y navega a ella", () => {
        const almacen = almacenFalso();
        const navegar = vi.fn();
        const texto = textoDe(molecula());
        render(<VistaBloqueProtomolecula texto={texto} almacen={almacen} navegar={navegar} />);
        fireEvent.click(screen.getByRole("button", { name: /abrir copia propia/i }));
        const claves = [...almacen.datos.keys()].filter((k) => k.startsWith(PREFIJO_MOLECULA));
        expect(claves).toHaveLength(1);
        const guardada = JSON.parse(almacen.datos.get(claves[0])!) as Molecula;
        expect(guardada.id).not.toBe("mol-original");
        expect(guardada.ambito).toBe("personal");
        expect(navegar).toHaveBeenCalledWith(`/protomolecula?molecula=${encodeURIComponent(guardada.id)}`);
        expect(almacen.datos.has(PREFIJO_MOLECULA + "mol-original")).toBe(false);
        expect(screen.getByText("Paisaje sonoro")).toBeInTheDocument();
    });

    it("sin almacén no navega (no promete una copia que no existe)", () => {
        const navegar = vi.fn();
        render(<VistaBloqueProtomolecula texto={textoDe(molecula())} almacen={null} navegar={navegar} />);
        fireEvent.click(screen.getByRole("button", { name: /abrir copia propia/i }));
        expect(navegar).not.toHaveBeenCalled();
    });

    it("copiaPropia deja la original intacta y no comparte objetos", () => {
        const original = molecula();
        const antes = JSON.stringify(original);
        const copia = copiaPropia(original, "mol-nueva", 50);
        copia.valores["a1::mezcla"] = 99;
        copia.capas[0].titulo = "Cambiada";
        expect(JSON.stringify(original)).toBe(antes);
        expect(copia).toMatchObject({ id: "mol-nueva", titulo: "Paisaje sonoro (copia)", creadaEn: 50, version: 1 });
    });
});
