import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    agruparPorDia, coincide, colorDe, esImagen, formatoNumero, iniciales, plural, recortar, relevancia, rotuloDia, seriePorDia, tiempoCorto, tiempoRelativo,
} from "../formato";
import { marcaLectura, presenciaDe, resumirHilos, vistaPrevia } from "../mensajes-datos";
import { mediaCafe } from "../cafe-datos";
import { mediaDe } from "../feed-red-datos";
import { porRelevancia } from "../vistas";
import { filasQueCaben, columnasQueCaben } from "../tamano";

const H = 3_600_000;
const mediodia = new Date(2026, 8, 29, 12, 0).getTime();

describe("formato", () => {
    it("tiempos relativos en español, sin «hace -3 min»", () => {
        expect(tiempoRelativo(mediodia + 60_000, mediodia)).toBe("ahora");
        expect(tiempoRelativo(mediodia - 5 * 60_000, mediodia)).toBe("hace 5 min");
        expect(tiempoRelativo(mediodia - 3 * H, mediodia)).toBe("hace 3 h");
        expect(tiempoRelativo(mediodia - 24 * H, mediodia)).toBe("ayer");
        expect(tiempoRelativo(mediodia - 4 * 24 * H, mediodia)).toBe("hace 4 días");
        expect(tiempoRelativo(new Date(2026, 7, 12).getTime(), mediodia)).toBe("12 ago");
        expect(tiempoCorto(mediodia - 3 * H, mediodia)).toBe("3 h");
        expect(rotuloDia(mediodia - 2 * 24 * H, mediodia)).toBe("El domingo");
    });
    it("iniciales, color estable, recorte sin partir palabras, plural y cifras", () => {
        expect(iniciales("Alex Bordón")).toBe("AB");
        expect(iniciales("@luz")).toBe("L");
        expect(iniciales("")).toBe("·");
        expect(colorDe("luz")).toBe(colorDe("luz"));
        expect(recortar("una frase bastante larga para recortar", 20)).toBe("una frase bastante…");
        expect(plural(1, "miembro", "miembros")).toBe("1 miembro");
        expect(formatoNumero(12_345)).toMatch(/mil/);
        expect(coincide("Huerto Común", "comun")).toBe(true);
        expect(esImagen("https://x.org/a.webp?w=2")).toBe(true);
        expect(esImagen("javascript:alert(1)")).toBe(false);
    });
    it("agrupa por día y cuenta por día sin inventar", () => {
        const g = agruparPorDia([mediodia - H, mediodia - 2 * H, mediodia - 25 * H], (x) => x, mediodia);
        expect(g.map((x) => [x.rotulo, x.elementos.length])).toEqual([["Hoy", 2], ["Ayer", 1]]);
        expect(seriePorDia([mediodia - H, mediodia - 25 * H, mediodia - 30 * 24 * H], mediodia, 7)).toEqual([0, 0, 0, 0, 0, 1, 1]);
    });
    it("relevancia: señales reales y frescura", () => {
        const viva = relevancia({ reacciones: 9, comentarios: 3, ms: mediodia - 3 * H }, mediodia);
        const quieta = relevancia({ reacciones: 0, comentarios: 0, ms: mediodia - H }, mediodia);
        expect(viva).toBeGreaterThan(quieta);
        const lista = porRelevancia([{ id: "q", reacciones: 0, comentarios: 0, ms: mediodia - H }, { id: "v", reacciones: 9, comentarios: 3, ms: mediodia - 3 * H }] as never[], mediodia) as Array<{ id: string }>;
        expect(lista.map((x) => x.id)).toEqual(["v", "q"]);
    });
    it("cuánto cabe", () => {
        expect(filasQueCaben(0, 50)).toBe(1);
        expect(filasQueCaben(260, 50, 2, 10)).toBe(5);
        expect(columnasQueCaben(700, 220, 1, 5)).toBe(3);
    });
});

describe("mensajes", () => {
    beforeEach(() => vi.useRealTimers());
    it("vista previa honesta de adjuntos y borrados", () => {
        expect(vistaPrevia({ body: "", attachments: [{ kind: "image", name: "a.jpg" }], deleted: false })).toEqual({ texto: "Foto: a.jpg", adjunto: "Foto" });
        expect(vistaPrevia({ body: "hola", attachments: [], deleted: true }).texto).toBe("Mensaje eliminado");
    });
    it("la marca de lectura más reciente gana (local o de la cuenta)", () => {
        const m = marcaLectura({ id: "h", meta: { readMarks: { yo: new Date(mediodia).toISOString() } } }, "yo", { h: new Date(mediodia - H).toISOString() });
        expect(m).toBe(mediodia);
    });
    it("no leídos: solo de otros, posteriores a la marca, sin sistema ni borrados", () => {
        const iso = (h: number) => new Date(mediodia - h * H).toISOString();
        const hilos = [{ id: "h", kind: "dm", title: null, avatar_url: null, meta: {}, last_msg_at: iso(0), created_at: iso(10) }];
        const msgs = [
            { id: "1", thread_id: "h", sender: "luz", body: "tres", attachments: [], kind: "user", deleted: false, created_at: iso(0.5) },
            { id: "2", thread_id: "h", sender: "yo", body: "mío", attachments: [], kind: "user", deleted: false, created_at: iso(1) },
            { id: "3", thread_id: "h", sender: "luz", body: "borrado", attachments: [], kind: "user", deleted: true, created_at: iso(1.5) },
            { id: "4", thread_id: "h", sender: null, body: "sistema", attachments: [], kind: "system", deleted: false, created_at: iso(1.8) },
            { id: "5", thread_id: "h", sender: "luz", body: "viejo", attachments: [], kind: "user", deleted: false, created_at: iso(5) },
        ];
        const [r] = resumirHilos(hilos, { h: ["yo", "luz"] }, msgs, "yo", { h: mediodia - 3 * H }, false);
        expect(r.noLeidos).toBe(1);
        expect(r.companero).toBe("luz");
        expect(r.ultimo?.texto).toBe("tres");
        expect(r.recientes).toHaveLength(4);
        expect(presenciaDe(mediodia - 60_000, mediodia)).toBe("en-linea");
        expect(presenciaDe(mediodia - 3600_000, mediodia)).toBeNull();
    });
});

describe("medios", () => {
    it("Café: galería, vídeo con póster y enlaces", () => {
        expect(mediaCafe({ kind: "gallery", urls: ["a", "b"] })).toEqual({ url: "a", tipo: "imagen", n: 2 });
        expect(mediaCafe({ kind: "video", url: "v.mp4", poster: "p.jpg" }).url).toBe("p.jpg");
        expect(mediaCafe(null).tipo).toBeNull();
    });
    it("Lienzo: imagen primero, luego adjunto con miniatura", () => {
        expect(mediaDe({ media: ["https://x.org/a.png"], attachments: [] }).tipo).toBe("imagen");
        expect(mediaDe({ media: [], attachments: [{ id: "1", kind: "enlace", thumbnail: "https://x.org/t.jpg" }] })).toMatchObject({ url: "https://x.org/t.jpg", tipo: "enlace" });
        expect(mediaDe({ media: [], attachments: [] }).tipo).toBeNull();
    });
});
