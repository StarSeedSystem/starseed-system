import { describe, expect, test } from "vitest";
import type { DmMessage } from "@/lib/messages/dm";
import {
    agruparArchivosPorMes,
    contarPorCategoria,
    filtrarArchivos,
    ordenarArchivos,
    recopilarArchivos,
    type ArchivoHilo,
} from "@/lib/mensajeria/archivos";

function msg(partial: Partial<DmMessage> & Pick<DmMessage, "id" | "createdAt">): DmMessage {
    return {
        threadId: "t1",
        sender: "u1",
        body: "",
        attachments: [],
        replyTo: null,
        kind: "user",
        editedAt: null,
        deleted: false,
        formato: null,
        ...partial,
    };
}

describe("recopilarArchivos: categorías por adjunto", () => {
    test("clasifica image/gif/video/audio/vivo/llamada", () => {
        const m = msg({
            id: "m1",
            createdAt: "2026-09-01T00:00:00.000Z",
            attachments: [
                { kind: "image", name: "foto.jpg" },
                { kind: "gif", name: "risa.gif" },
                { kind: "video", name: "clip.mp4" },
                { kind: "audio", name: "nota.ogg" },
                { kind: "vivo", name: "Pizarra" },
                { kind: "llamada", name: "Llamada" },
            ],
        });
        const out = recopilarArchivos([m], "u1");
        expect(out.map((x) => x.categoria)).toEqual(["imagen", "imagen", "video", "audio", "vivo", "llamada"]);
    });

    test("file/ref se clasifican como documento por extensión/mime, y como otro si no coincide", () => {
        const m = msg({
            id: "m2",
            createdAt: "2026-09-02T00:00:00.000Z",
            attachments: [
                { kind: "file", name: "informe.pdf" },
                { kind: "ref", name: "hoja.xlsx" },
                { kind: "file", mime: "text/csv", name: "datos" },
                { kind: "file", name: "app.exe" },
            ],
        });
        const out = recopilarArchivos([m], "u1");
        expect(out.map((x) => x.categoria)).toEqual(["documento", "documento", "documento", "otro"]);
    });

    test("mensajes borrados se saltan por completo", () => {
        const m = msg({
            id: "m3",
            createdAt: "2026-09-03T00:00:00.000Z",
            deleted: true,
            attachments: [{ kind: "image", name: "x.jpg" }],
        });
        expect(recopilarArchivos([m], "u1")).toEqual([]);
    });

    test("mio se calcula respecto al uid dado", () => {
        const m1 = msg({ id: "m4", createdAt: "2026-09-04T00:00:00.000Z", sender: "u1", attachments: [{ kind: "image", name: "a.jpg" }] });
        const m2 = msg({ id: "m5", createdAt: "2026-09-04T00:00:00.000Z", sender: "u2", attachments: [{ kind: "image", name: "b.jpg" }] });
        const out = recopilarArchivos([m1, m2], "u1");
        expect(out.map((x) => x.mio)).toEqual([true, false]);
    });
});

describe("recopilarArchivos: enlaces en el cuerpo", () => {
    test("extrae http/https, quita puntuación colgante y paréntesis, y deduplica por mensaje", () => {
        const m = msg({
            id: "m6",
            createdAt: "2026-09-05T00:00:00.000Z",
            body: "mira esto: https://ejemplo.com/a. y también (https://ejemplo.com/b), otra vez https://ejemplo.com/a",
        });
        const out = recopilarArchivos([m], null);
        const enlaces = out.filter((x) => x.categoria === "enlace");
        expect(enlaces).toHaveLength(2);
        expect(enlaces.map((x) => x.url)).toEqual(["https://ejemplo.com/a", "https://ejemplo.com/b"]);
        expect(enlaces[0].host).toBe("ejemplo.com");
    });
});

describe("recopilarArchivos: mensaje enriquecido", () => {
    test("cuenta como categoría 'mensaje' SOLO si tiene lienzo o doc", () => {
        const conLienzo = msg({
            id: "m7",
            createdAt: "2026-09-06T00:00:00.000Z",
            body: "hola",
            formato: { v: 1, lienzo: { ancho: 100, alto: 100, elementos: [] } },
        });
        const soloEstilo = msg({
            id: "m8",
            createdAt: "2026-09-06T00:00:00.000Z",
            body: "hola con estilo",
            formato: { v: 1, estilo: { negrita: true } },
        });
        const out1 = recopilarArchivos([conLienzo], null);
        const out2 = recopilarArchivos([soloEstilo], null);
        expect(out1.some((x) => x.categoria === "mensaje")).toBe(true);
        expect(out2.some((x) => x.categoria === "mensaje")).toBe(false);
    });
});

describe("filtrarArchivos", () => {
    const xs: ArchivoHilo[] = [
        { id: "1", mensajeId: "m1", adjuntoIndice: 0, categoria: "imagen", nombre: "foto.jpg", remitente: "u1", mio: true, fecha: "2026-09-01T00:00:00.000Z" },
        { id: "2", mensajeId: "m2", adjuntoIndice: 0, categoria: "documento", nombre: "informe.pdf", remitente: "u2", mio: false, fecha: "2026-09-02T00:00:00.000Z" },
        { id: "3", mensajeId: "m3", adjuntoIndice: null, categoria: "enlace", nombre: "ejemplo.com", host: "ejemplo.com", remitente: "u2", mio: false, fecha: "2026-09-03T00:00:00.000Z" },
    ];

    test("por categoría", () => {
        expect(filtrarArchivos(xs, { categoria: "imagen" }).map((x) => x.id)).toEqual(["1"]);
        expect(filtrarArchivos(xs, { categoria: "todo" })).toHaveLength(3);
    });

    test("por remitente", () => {
        expect(filtrarArchivos(xs, { remitente: "yo" }).map((x) => x.id)).toEqual(["1"]);
        expect(filtrarArchivos(xs, { remitente: "otros" }).map((x) => x.id)).toEqual(["2", "3"]);
    });

    test("por texto (nombre u host)", () => {
        expect(filtrarArchivos(xs, { texto: "informe" }).map((x) => x.id)).toEqual(["2"]);
        expect(filtrarArchivos(xs, { texto: "ejemplo" }).map((x) => x.id)).toEqual(["3"]);
    });
});

describe("ordenarArchivos", () => {
    const xs: ArchivoHilo[] = [
        { id: "a", mensajeId: "m", adjuntoIndice: 0, categoria: "video", nombre: "Beta", tamano: 100, remitente: null, mio: false, fecha: "2026-09-02T00:00:00.000Z" },
        { id: "b", mensajeId: "m", adjuntoIndice: 0, categoria: "documento", nombre: "alfa", tamano: 300, remitente: null, mio: false, fecha: "2026-09-03T00:00:00.000Z" },
        { id: "c", mensajeId: "m", adjuntoIndice: 0, categoria: "audio", nombre: "gamma", tamano: 200, remitente: null, mio: false, fecha: "2026-09-01T00:00:00.000Z" },
    ];

    test("reciente / antiguo", () => {
        expect(ordenarArchivos(xs, "reciente").map((x) => x.id)).toEqual(["b", "a", "c"]);
        expect(ordenarArchivos(xs, "antiguo").map((x) => x.id)).toEqual(["c", "a", "b"]);
    });

    test("nombre (localeCompare es-ES)", () => {
        expect(ordenarArchivos(xs, "nombre").map((x) => x.id)).toEqual(["b", "a", "c"]);
    });

    test("tamano (mayor primero)", () => {
        expect(ordenarArchivos(xs, "tamano").map((x) => x.id)).toEqual(["b", "c", "a"]);
    });

    test("tipo (alfabético por categoría)", () => {
        expect(ordenarArchivos(xs, "tipo").map((x) => x.id)).toEqual(["c", "b", "a"]); // audio < documento < video
    });

    test("es estable ante empates", () => {
        const empatados: ArchivoHilo[] = [
            { id: "x1", mensajeId: "m", adjuntoIndice: 0, categoria: "otro", nombre: "n", remitente: null, mio: false, fecha: "2026-01-01T00:00:00.000Z" },
            { id: "x2", mensajeId: "m", adjuntoIndice: 0, categoria: "otro", nombre: "n", remitente: null, mio: false, fecha: "2026-01-01T00:00:00.000Z" },
        ];
        expect(ordenarArchivos(empatados, "reciente").map((x) => x.id)).toEqual(["x1", "x2"]);
    });
});

describe("agruparArchivosPorMes", () => {
    test("agrupa por mes calendario, más reciente primero, con título es-ES", () => {
        const xs: ArchivoHilo[] = [
            { id: "1", mensajeId: "m", adjuntoIndice: null, categoria: "enlace", nombre: "x", remitente: null, mio: false, fecha: "2026-09-05T00:00:00.000Z" },
            { id: "2", mensajeId: "m", adjuntoIndice: null, categoria: "enlace", nombre: "x", remitente: null, mio: false, fecha: "2026-09-20T00:00:00.000Z" },
            { id: "3", mensajeId: "m", adjuntoIndice: null, categoria: "enlace", nombre: "x", remitente: null, mio: false, fecha: "2026-08-01T00:00:00.000Z" },
        ];
        const grupos = agruparArchivosPorMes(xs);
        expect(grupos.map((g) => g.clave)).toEqual(["2026-09", "2026-08"]);
        expect(grupos[0].titulo).toBe("septiembre de 2026");
        expect(grupos[0].archivos.map((a) => a.id)).toEqual(["1", "2"]);
        expect(grupos[1].titulo).toBe("agosto de 2026");
    });
});

describe("contarPorCategoria", () => {
    test("devuelve todas las categorías, con 0 para las que no aparecen", () => {
        const xs: ArchivoHilo[] = [
            { id: "1", mensajeId: "m", adjuntoIndice: 0, categoria: "imagen", nombre: "a", remitente: null, mio: false, fecha: "2026-09-01T00:00:00.000Z" },
            { id: "2", mensajeId: "m", adjuntoIndice: 0, categoria: "imagen", nombre: "b", remitente: null, mio: false, fecha: "2026-09-01T00:00:00.000Z" },
        ];
        const out = contarPorCategoria(xs);
        expect(out.imagen).toBe(2);
        expect(out.video).toBe(0);
        expect(out.documento).toBe(0);
        expect(Object.keys(out).sort()).toEqual(
            ["audio", "documento", "enlace", "imagen", "llamada", "mensaje", "otro", "video", "vivo"].sort(),
        );
    });
});
