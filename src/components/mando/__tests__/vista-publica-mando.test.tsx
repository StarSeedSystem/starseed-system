// Pruebas de `vista-publica-mando.tsx` y de la herramienta «Puente de Mando»
// de los kits de entidad (Ola 1009P · PT1009Db · contrato §5 y §7).
// La vista pública pinta solo la lista blanca de `vistaPublica` (misma entrada
// con datos privados reconocibles que la prueba de PT1007C) y la herramienta
// aparece únicamente con la bandera NEXT_PUBLIC_STARSEED_MANDO_TODOS=1.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { vistaPublica } from "@/lib/mando/vista-publica";
import { VistaPublicaMando } from "@/components/mando/vista-publica-mando";
import { PuenteMandoTool } from "@/components/social/toolkits";

const BANDERA = "NEXT_PUBLIC_STARSEED_MANDO_TODOS";
const banderaOriginal = process.env[BANDERA];

afterEach(() => {
    cleanup();
    if (banderaOriginal === undefined) delete process.env[BANDERA];
    else process.env[BANDERA] = banderaOriginal;
});

const estadoConPrivados = {
    ambito: { nombre: "MiAmbito", visibilidad: "publico" as const },
    olas: [
        {
            nombre: "Ola 1",
            avance: 0.5,
            tareas: [
                { id: "t1", titulo: "Tarea pública", estado: "pendiente", prompt: "PROMPT-SECRETO", archivos: ["ruta/privada.ts"], registro: {}, proveedor: "proveedor-x" },
            ],
        },
    ],
    integradas: [
        { titulo: "Integración 1", fecha: "2026-01-01T00:00:00Z", archivos: ["ruta/privada.ts"], commit: "abc123" },
    ],
    motor: { estado: "corriendo", ultimo_reporte: Date.now() - 300000, proveedores: ["proveedor-x"] },
    medidores: { creditos: 123.45 },
    chat: [
        { canal: "publico", autor: "usuario1", texto: "Hola público" },
        { canal: "interno", autor: "sistema", texto: "Secreto interno" },
    ],
};

describe("VistaPublicaMando", () => {
    it("con null no pinta nada", () => {
        const { container } = render(<VistaPublicaMando vista={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("pinta lo público y NADA privado", () => {
        const vista = vistaPublica(estadoConPrivados);
        expect(vista).not.toBeNull();
        const { container } = render(<VistaPublicaMando vista={vista} />);

        expect(screen.getByText(/Mando de MiAmbito/)).toBeInTheDocument();
        expect(screen.getByText("Ola 1")).toBeInTheDocument();
        expect(screen.getByText("Integración 1")).toBeInTheDocument();
        expect(screen.getByText(/Motor vivo hace 5 min/)).toBeInTheDocument();
        expect(screen.getByText("Hola público")).toBeInTheDocument();

        const html = container.innerHTML;
        expect(html).not.toContain("PROMPT-SECRETO");
        expect(html).not.toContain("ruta/privada.ts");
        expect(html).not.toContain("proveedor-x");
        expect(html).not.toContain("123.45");
        expect(html).not.toContain("Secreto interno");
        expect(html).not.toContain("abc123");
    });
});

describe("PuenteMandoTool (bandera)", () => {
    it("sin la bandera no pinta nada", () => {
        delete process.env[BANDERA];
        const { container } = render(<PuenteMandoTool slug="mi-grupo" />);
        expect(container).toBeEmptyDOMElement();
    });

    it("con la bandera aparece y enlaza al Mando del ámbito", () => {
        process.env[BANDERA] = "1";
        render(<PuenteMandoTool slug="mi grupo" visibilidad="publico" />);
        const enlace = screen.getByRole("link", { name: /Abrir Mando/ });
        expect(enlace).toHaveAttribute("href", "/mando?ambito=mi%20grupo");
        expect(screen.getByText("Puente de Mando")).toBeInTheDocument();
        expect(screen.getByText("público")).toBeInTheDocument();
    });
});
