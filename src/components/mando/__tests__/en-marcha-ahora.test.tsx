import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { EnMarchaAhora, EnMarchaAhoraVista } from "../en-marcha-ahora";
import { leerRegistroCarril } from "@/lib/mando/carril-claude";
import { parsearEstadoPuerta } from "@/lib/mando/puerta-integracion";
import type { EnMarcha } from "@/lib/mando/en-marcha";

const AHORA = Date.parse("2026-11-11T07:30:00Z");
const iso = (min: number) => new Date(AHORA - min * 60_000).toISOString();

const OCUPADO: EnMarcha = {
    generadoMs: AHORA,
    carril: leerRegistroCarril({
        latido: iso(2),
        tareas: [
            { id: "MED1111E", ola: "1111", titulo: "Medidores de Genesis: que se vean los procesos activos (carril de Claude y puerta)", estado: "en_curso", desde: iso(125) },
            { id: "VER1111F", ola: "1111", titulo: "Centro de Versiones", estado: "en_curso", desde: iso(125) },
            { id: "LLA1111H", ola: "1111", titulo: "Llamadas, remates de LLA1111A", estado: "pendiente", desde: iso(125) },
        ],
    }),
    puerta: parsearEstadoPuerta({ nombre: "1111f", ramas: ["opus1106/MED1111E", "opus1106/VER1111F"], paso: "pruebas", inicio: iso(18), actualizado: iso(9), resultado: "en_curso" }),
    publicacion: { activa: true, fase: "ci", detalle: "CI en GitHub Actions: tsc, vitest, núcleo mesh y next build.", actualizadoMs: AHORA - 4 * 60_000, ultimaMs: AHORA - 5 * 3_600_000 },
};
const QUIETO: EnMarcha = {
    generadoMs: AHORA,
    carril: leerRegistroCarril({ latido: iso(1), tareas: [] }),
    puerta: parsearEstadoPuerta({ nombre: "1111e", ramas: ["opus1106/LLA1111A"], paso: "terminado", inicio: iso(130), actualizado: iso(95), fin: iso(95), resultado: "verde", pruebas: { archivos: 939, pruebas: 10673, falladas: 0, omitidas: 13 } }),
    publicacion: { activa: true, fase: "esperando", detalle: "Esperando a que haya algo que publicar.", actualizadoMs: AHORA - 60_000, ultimaMs: AHORA - 5 * 3_600_000 },
};

afterEach(cleanup);

describe("EnMarchaAhoraVista", () => {
    it("ocupado: los tres bloques en orden (carril, puerta, publicación) con ids, títulos, minutos y paso", () => {
        render(<EnMarchaAhoraVista datos={OCUPADO} ahora={AHORA} />);
        const raiz = screen.getByTestId("en-marcha-ahora");
        expect(raiz).toHaveAttribute("data-algo-corre", "si");
        expect(screen.getByTestId("en-marcha-frase")).toHaveTextContent("Corre ahora: 2 agentes de Claude, la puerta de integración, la publicación.");
        const bloques = ["carril", "puerta", "publicacion"].map((id) => screen.getByTestId(`en-marcha-${id}`));
        // Orden en el documento.
        expect(bloques[0].compareDocumentPosition(bloques[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(bloques[1].compareDocumentPosition(bloques[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const agentes = within(screen.getByTestId("en-marcha-agentes"));
        expect(agentes.getByText("MED1111E")).toBeInTheDocument();
        expect(agentes.getByText(/Medidores de Genesis: que se vean los procesos activos \(carril de Claude y puerta\)/)).toBeInTheDocument();
        expect(agentes.getAllByText(/2 h 05 min en marcha · carril de Claude/)).toHaveLength(2);
        expect(within(screen.getByTestId("en-marcha-cola")).getByText(/Llamadas, remates/)).toBeInTheDocument();
        expect(screen.getByTestId("en-marcha-cola")).toHaveTextContent("aún no son agentes");
        expect(screen.getByTestId("en-marcha-puerta-texto")).toHaveTextContent("MED1111E, VER1111F: corriendo todas las pruebas (paso 3 de 5) · 9 min en este paso");
        expect(screen.getByTestId("en-marcha-publicacion-estado")).toHaveTextContent("publicando");
    });

    it("quieto: dice que no corre nada y nombra lo último que terminó con sus cuentas", () => {
        render(<EnMarchaAhoraVista datos={QUIETO} ahora={AHORA} />);
        expect(screen.getByTestId("en-marcha-ahora")).toHaveAttribute("data-algo-corre", "no");
        expect(screen.getByTestId("en-marcha-frase")).toHaveTextContent("No corre nada ahora. Lo último que terminó: la puerta integró LLA1111A en verde (10.673 pruebas en 939 archivos · 13 omitidas), hace 1 h 35 min.");
        expect(screen.getByTestId("en-marcha-carril-texto")).toHaveTextContent("el carril de Claude no tiene nada abierto");
        expect(screen.getByTestId("en-marcha-puerta-estado")).toHaveTextContent("terminó en verde");
        expect(screen.getByTestId("en-marcha-puerta-resultado")).toHaveTextContent("estado escrito por la puerta");
        expect(screen.queryByTestId("en-marcha-agentes")).toBeNull();
    });

    it("sin latido: las tareas se nombran como «sin latido» y no como vivas", () => {
        const viejo: EnMarcha = { ...OCUPADO, carril: leerRegistroCarril({ latido: iso(70), tareas: [{ id: "MED1111E", titulo: "Medidores", estado: "en_curso", desde: iso(200) }] }), puerta: null, publicacion: null };
        render(<EnMarchaAhoraVista datos={viejo} ahora={AHORA} />);
        expect(screen.getByTestId("en-marcha-carril-estado")).toHaveTextContent("sin latido");
        expect(screen.getByTestId("en-marcha-sin-latido")).toHaveTextContent("sin latido desde hace 1 h 10 min · no cuenta como viva");
        expect(screen.queryByTestId("en-marcha-agentes")).toBeNull();
        expect(screen.getByTestId("en-marcha-ahora")).toHaveAttribute("data-algo-corre", "no");
    });

    it("sin ningún dato: lo dice, no inventa", () => {
        render(<EnMarchaAhoraVista datos={null} ahora={AHORA} />);
        expect(screen.getByTestId("en-marcha-frase")).toHaveTextContent("No corre nada ahora. No consta cuándo terminó lo último.");
        expect(screen.getByTestId("en-marcha-puerta-estado")).toHaveTextContent("sin datos");
    });

    it("rojo: enseña el primer fallo", () => {
        const rojo: EnMarcha = { ...QUIETO, puerta: parsearEstadoPuerta({ ramas: ["opus1106/X"], paso: "terminado", resultado: "rojo", fin: iso(3), actualizado: iso(3), fallo: "tsc en rojo: src/a.ts(1,1): error TS2304 · se deshizo la fusión" }) };
        render(<EnMarchaAhoraVista datos={rojo} ahora={AHORA} />);
        expect(screen.getByTestId("en-marcha-puerta-texto")).toHaveTextContent("X: en rojo — tsc en rojo: src/a.ts(1,1): error TS2304 · se deshizo la fusión hace 3 min");
    });
});

describe("EnMarchaAhora con datos dados no pide nada", () => {
    it("pinta lo recibido", () => {
        render(<EnMarchaAhora datos={QUIETO} />);
        expect(screen.getByTestId("en-marcha-ahora")).toBeInTheDocument();
    });
});

describe("EnMarchaAhoraVista · versión de prueba (PRB1111V)", () => {
    it("enseña la prueba en marcha con plataformas y su paso", () => {
        const datos: EnMarcha = {
            ...QUIETO,
            pruebas: { numero: 40, etiqueta: "prueba.40", fase: "compilando", esperaA: null, falloEn: [], desdeMs: AHORA - 20 * 60_000, generadoMs: AHORA, plataformas: [{ id: "macos", titulo: "macOS", estado: "compilando", desdeMs: AHORA - 15 * 60_000, pasoActual: "Compilar", pasosHechos: 6, pasosTotal: 11, tipicoMin: null }] },
        };
        render(<EnMarchaAhoraVista datos={datos} ahora={AHORA} />);
        expect(screen.getByTestId("en-marcha-prueba-texto")).toBeInTheDocument();
        expect(screen.getByTestId("en-marcha-prueba-plataformas")).toHaveTextContent(/macOS/);
    });
    it("sin prueba no hay bloque", () => {
        render(<EnMarchaAhoraVista datos={QUIETO} ahora={AHORA} />);
        expect(screen.queryByTestId("en-marcha-prueba-texto")).toBeNull();
    });
});
