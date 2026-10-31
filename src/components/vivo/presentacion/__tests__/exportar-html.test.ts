import { describe, expect, it } from "vitest";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import { exportarPresentacionHtml } from "../exportar-html";

const meta: MetaPresentacion = { titulo: "Asamblea de otoño", tema: "cosmos", proporcion: "16:9" };

function diapositiva(texto: string): Diapositiva {
    return {
        lienzo: {
            ancho: 960,
            alto: 540,
            elementos: [
                {
                    id: `texto-${texto}`,
                    tipo: "texto",
                    x: 80,
                    y: 80,
                    w: 800,
                    h: 200,
                    z: 1,
                    texto: { bloques: [{ tipo: "titulo", nivel: 1, tramos: [{ texto }] }] },
                },
            ],
        },
    };
}

interface Descarga {
    nombre: string;
    texto: string;
    mime: string;
}

describe("exportarPresentacionHtml", () => {
    it("con cero diapositivas devuelve false y no descarga", () => {
        const llamadas: Descarga[] = [];
        const ok = exportarPresentacionHtml(meta, [], (nombre, texto, mime) => {
            llamadas.push({ nombre, texto, mime });
        });
        expect(ok).toBe(false);
        expect(llamadas).toHaveLength(0);
    });

    it("con dos diapositivas descarga una vez un HTML con las dos y la fecha", () => {
        const llamadas: Descarga[] = [];
        const ok = exportarPresentacionHtml(meta, [diapositiva("Primera"), diapositiva("Segunda")], (nombre, texto, mime) => {
            llamadas.push({ nombre, texto, mime });
        });
        expect(ok).toBe(true);
        expect(llamadas).toHaveLength(1);
        const [descarga] = llamadas;
        expect(descarga.nombre.endsWith(".html")).toBe(true);
        expect(descarga.mime).toBe("text/html;charset=utf-8");
        expect(descarga.texto.startsWith("<!doctype html>")).toBe(true);
        expect(descarga.texto).toContain("Primera");
        expect(descarga.texto).toContain("Segunda");
        expect(descarga.texto).toMatch(/<!-- Fecha: \d{4}-\d{2}-\d{2}/);
    });
});
