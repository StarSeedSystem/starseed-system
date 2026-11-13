/** (MED1113A) «Procesos de la dirección» en «Qué corre ahora»: activos, la puerta, los callados y lo terminado. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { EnMarchaAhoraVista } from "../en-marcha-ahora";
import type { EnMarcha } from "@/lib/mando/en-marcha";
import { leerEstadoDireccion } from "@/lib/mando/procesos-direccion";
import { parsearEstadoPuerta } from "@/lib/mando/puerta-integracion";

const AHORA = Date.parse("2026-11-13T05:00:00Z");
const hace = (min: number) => AHORA - min * 60_000;
const iso = (min: number) => new Date(hace(min)).toISOString();

const base = { modelo: "claude-opus-5-5", tipo: "agente", rama: null, fase: null, desdeMs: hace(90), cerradoMs: null, porque: "", relevable: false };
const DATOS: EnMarcha = {
    generadoMs: AHORA,
    carril: null,
    publicacion: null,
    puerta: parsearEstadoPuerta({ nombre: "1113g", ramas: ["opus1106/GEN1113INT"], paso: "pruebas", inicio: iso(6), actualizado: iso(1), resultado: "en_curso" }),
    direccion: leerEstadoDireccion({
        generadoMs: AHORA,
        procesos: [
            { ...base, id: "MED1113A", titulo: "Medidores de Genesis", donde: "~/Documents/starseed-opus/OPUS1106-MED1113A", estado: "activo", senal: "latido", ultimaSenalMs: hace(2) },
            { ...base, id: "FIX1112G", titulo: "Arreglo", donde: "~/Documents/starseed-opus/OPUS1106-FIX1112G", estado: "en-silencio", senal: "commits en su árbol", ultimaSenalMs: hace(294) },
            { ...base, id: "GEN1113F", titulo: "Bot de peticiones", donde: "~/x", estado: "terminado", senal: null, ultimaSenalMs: null, cerradoMs: hace(50), porque: "marcador .listo" },
        ],
    }),
};

afterEach(cleanup);

describe("EnMarchaAhoraVista · procesos de la dirección", () => {
    it("pinta los activos con modelo, árbol y desde cuándo, y la puerta como proceso", () => {
        render(<EnMarchaAhoraVista datos={DATOS} ahora={AHORA} />);
        expect(screen.getByTestId("en-marcha-direccion-estado")).toHaveTextContent("2 activos · 1 en silencio");
        const fila = screen.getByTestId("direccion-MED1113A");
        expect(fila).toHaveAttribute("data-estado", "activo");
        expect(fila).toHaveTextContent("claude-opus-5-5 · ~/Documents/starseed-opus/OPUS1106-MED1113A");
        expect(fila).toHaveTextContent("activo · latido hace 2 min");
        expect(screen.getByTestId("direccion-puerta")).toHaveTextContent("puerta 1113g");
        expect(screen.getByTestId("en-marcha-frase")).toHaveTextContent("Corre ahora: 1 agente de la dirección, la puerta de integración.");
    });

    it("los callados van aparte, con su hora, y no cuentan; lo terminado se lista", () => {
        render(<EnMarchaAhoraVista datos={DATOS} ahora={AHORA} />);
        expect(screen.getByTestId("en-marcha-direccion-silencio")).toHaveTextContent("no cuentan como activos");
        expect(screen.getByTestId("direccion-FIX1112G")).toHaveAttribute("data-estado", "en-silencio");
        expect(screen.getByTestId("direccion-FIX1112G")).toHaveTextContent(/en silencio desde las \d\d:\d\d \(hace 294 min/);
        expect(screen.getByTestId("en-marcha-direccion-terminados")).toHaveTextContent("GEN1113F");
    });

    it("sin medida lo dice sin cifra", () => {
        render(<EnMarchaAhoraVista datos={{ ...DATOS, puerta: null, direccion: null }} ahora={AHORA} />);
        expect(screen.getByTestId("en-marcha-direccion-estado")).toHaveTextContent("sin medida");
        expect(screen.getByTestId("en-marcha-direccion-texto")).toHaveTextContent("no se pudo medir");
    });
});
