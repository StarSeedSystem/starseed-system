import { describe, expect, it } from "vitest";
import {
    adjuntoDeElemento,
    claseAnimacionTexto,
    docDesdeTexto,
    docVacio,
    enlaceSeguro,
    estiloACss,
    formatoVacio,
    hostDeUrl,
    segmentarGrafemas,
    textoPlanoDeFormato,
    urlMediaSegura,
    urlsDeFormato,
    validarFormato,
    MAX_DATA_IMAGEN_BYTES,
} from "@/lib/mensajeria/formato";
import { LIMITES_FORMATO, type FormatoMensaje } from "@/lib/mensajeria/formato-tipos";

function ok(f: unknown): FormatoMensaje {
    const r = validarFormato(f);
    if (!r.ok) throw new Error(`se esperaba válido: ${r.error}`);
    return r.formato;
}

function error(f: unknown): string {
    const r = validarFormato(f);
    if (r.ok) throw new Error("se esperaba un error");
    return r.error;
}

const dataPng = (bytes: number) => `data:image/png;base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

describe("validarFormato · estructura", () => {
    it("rechaza lo que no es un objeto y versiones futuras", () => {
        expect(error(null)).toMatch(/no es válido/);
        expect(error("hola")).toMatch(/no es válido/);
        expect(error([])).toMatch(/no es válido/);
        expect(error({ v: 2 })).toMatch(/más nuevo/);
    });

    it("acepta un formato vacío y fija v: 1", () => {
        expect(ok({})).toEqual({ v: 1 });
        expect(ok({ v: 1 })).toEqual({ v: 1 });
    });

    it("descarta claves desconocidas en todos los niveles", () => {
        const f = ok({
            v: 1,
            hack: "<script>",
            estilo: { color: "#fff", onclick: "alert(1)", style: "x" },
            doc: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "hola", html: "<b>", marcas: ["negrita", "parpadeo"] }], extra: 1 }], meta: {} },
            lienzo: { ancho: 540, alto: 540, elementos: [{ id: "a", tipo: "forma", x: 0, y: 0, w: 10, h: 10, z: 0, onload: "x", forma: { tipo: "rect", color: "#000", svg: "<svg/>" } }], script: "x" },
        });
        expect(f).toEqual({
            v: 1,
            estilo: { color: "#fff" },
            doc: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "hola", marcas: ["negrita"] }] }] },
            lienzo: { ancho: 540, alto: 540, elementos: [{ id: "a", tipo: "forma", x: 0, y: 0, w: 10, h: 10, z: 0, forma: { tipo: "rect", color: "#000" } }] },
        });
    });

    it("omite bloques y elementos de tipos desconocidos sin romper", () => {
        const f = ok({
            doc: { bloques: [{ tipo: "tabla" }, { tipo: "separador" }] },
            lienzo: { ancho: 300, alto: 300, elementos: [{ tipo: "script", x: 0, y: 0, w: 1, h: 1, z: 0 }] },
        });
        expect(f.doc?.bloques).toEqual([{ tipo: "separador" }]);
        expect(f.lienzo?.elementos).toEqual([]);
    });
});

describe("validarFormato · estilo", () => {
    it("acota tamaño y grosor del marco", () => {
        expect(ok({ estilo: { tamano: 2 } }).estilo?.tamano).toBe(LIMITES_FORMATO.tamanoMin);
        expect(ok({ estilo: { tamano: 999 } }).estilo?.tamano).toBe(LIMITES_FORMATO.tamanoMax);
        expect(ok({ estilo: { grosorMarco: 40 } }).estilo?.grosorMarco).toBe(6);
        expect(ok({ estilo: { grosorMarco: -3 } }).estilo?.grosorMarco).toBe(0);
        expect(ok({ estilo: { tamano: Number.NaN } }).estilo).toBeUndefined();
    });

    it("solo admite colores hex e ids de fondo conocidos", () => {
        const f = ok({
            estilo: { color: "red", colorMarco: "#ABCDEF", fondo: "url(javascript:alert(1))" },
        });
        expect(f.estilo).toEqual({ colorMarco: "#abcdef" });
        expect(ok({ estilo: { fondo: "cosmos" } }).estilo?.fondo).toBe("cosmos");
        expect(ok({ estilo: { fondo: "#11223344" } }).estilo?.fondo).toBe("#11223344");
        expect(ok({ estilo: { fondo: "#12" } }).estilo).toBeUndefined();
    });

    it("filtra fuentes, animaciones y alineaciones desconocidas", () => {
        const f = ok({ estilo: { fuente: "comic", animacionTexto: "explotar", animacionFondo: "lluvia", alineacion: "arriba", negrita: "sí" } });
        expect(f.estilo).toBeUndefined();
        const g = ok({ estilo: { fuente: "serif", animacionTexto: "ola", animacionFondo: "aurora", alineacion: "centro", negrita: true } });
        expect(g.estilo).toEqual({ fuente: "serif", animacionTexto: "ola", animacionFondo: "aurora", alineacion: "centro", negrita: true });
    });
});

describe("validarFormato · enlaces y medios", () => {
    it("rechaza enlaces javascript:, data: y rutas protocolo-relativas", () => {
        for (const enlace of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<b>", "//evil.example", "/\\evil.example", "vbscript:x"]) {
            expect(error({ doc: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "x", enlace }] }] } })).toMatch(/no está permitido/);
        }
    });

    it("acepta http(s), mailto y rutas internas", () => {
        const f = ok({
            doc: {
                bloques: [
                    {
                        tipo: "parrafo",
                        tramos: [
                            { texto: "a", enlace: "https://starseed.example/x?y=1" },
                            { texto: "b", enlace: "http://ejemplo.org" },
                            { texto: "c", enlace: "mailto:hola@starseed.example" },
                            { texto: "d", enlace: "/perfil/alex" },
                        ],
                    },
                ],
            },
        });
        expect(f.doc?.bloques[0]).toMatchObject({ tramos: [{ enlace: "https://starseed.example/x?y=1" }, { enlace: "http://ejemplo.org" }, { enlace: "mailto:hola@starseed.example" }, { enlace: "/perfil/alex" }] });
    });

    it("rechaza medios blob:, javascript: y http:", () => {
        const base = { x: 0, y: 0, w: 100, h: 100, z: 1 };
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "imagen", url: "blob:https://x/1" }] } })).toMatch(/blob:/);
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "video", url: "javascript:alert(1)" }] } })).toMatch(/no está permitida/);
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "audio", url: "http://x.org/a.mp3" }] } })).toMatch(/https/);
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "web", url: "javascript:alert(1)" }] } })).toMatch(/https/);
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "web", url: "http://ejemplo.org" }] } })).toMatch(/https/);
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "app", ruta: "https://evil.example" }] } })).toMatch(/ruta interna/);
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "app", ruta: "/api/borrar" }] } })).toMatch(/ruta interna/);
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "app", ruta: "/auth/callback?x=1" }] } })).toMatch(/ruta interna/);
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "imagen", url: "/api/mando/estado" }] } })).toMatch(/no es un archivo/);
    });

    it("acepta https, rutas del OS y data:image pequeño; rechaza data:image grande o no-imagen", () => {
        expect(urlMediaSegura("https://cdn.example/a.png")).toEqual({ ok: true, url: "https://cdn.example/a.png" });
        expect(urlMediaSegura("/storage/v1/a.png")).toEqual({ ok: true, url: "/storage/v1/a.png" });
        expect(urlMediaSegura(dataPng(1000), { permitirDataImagen: true }).ok).toBe(true);
        expect(urlMediaSegura(dataPng(1000)).ok).toBe(false);
        expect(urlMediaSegura(dataPng(MAX_DATA_IMAGEN_BYTES + 10), { permitirDataImagen: true })).toMatchObject({ ok: false, error: expect.stringMatching(/300 KB/) });
        expect(urlMediaSegura("data:text/html;base64,PGI+", { permitirDataImagen: true }).ok).toBe(false);
        expect(enlaceSeguro("https://a b.com")).toBeNull();
        expect(hostDeUrl("https://www.ejemplo.org/x")).toBe("ejemplo.org");
    });

    it("valida los adjuntos vivos y descarta los mal formados", () => {
        const base = { x: 0, y: 0, w: 200, h: 120, z: 1 };
        const vivo = { kind: "vivo", tipoVivo: "pizarra", sesionId: "abc-123", route: "/vivo/abc-123", name: "Pizarra", permiso: "editar", secreto: "x" };
        const f = ok({ lienzo: { ancho: 540, alto: 540, elementos: [{ ...base, tipo: "vivo", vivo }, { ...base, tipo: "vivo", vivo: { ...vivo, route: "javascript:x" } }] } });
        expect(f.lienzo?.elementos).toHaveLength(1);
        expect(f.lienzo?.elementos[0].vivo).toEqual({ kind: "vivo", tipoVivo: "pizarra", sesionId: "abc-123", route: "/vivo/abc-123", name: "Pizarra", permiso: "editar" });
    });
});

describe("validarFormato · límites", () => {
    it("acota posiciones, tamaños, rotación, z y opacidad del lienzo", () => {
        const f = ok({
            lienzo: {
                ancho: 99_999,
                alto: 10,
                elementos: [{ id: "a", tipo: "forma", x: -1e9, y: 1e9, w: 0, h: 1e9, rot: 450, z: -5, opacidad: 7, radio: -1, forma: { tipo: "hexagono", color: "verde" } }],
            },
        });
        expect(f.lienzo?.ancho).toBe(LIMITES_FORMATO.lienzoMax);
        expect(f.lienzo?.alto).toBe(100);
        const el = f.lienzo!.elementos[0];
        expect(el.x).toBe(-LIMITES_FORMATO.lienzoMax);
        expect(el.y).toBe(LIMITES_FORMATO.lienzoMax);
        expect(el.w).toBe(4);
        expect(el.h).toBe(LIMITES_FORMATO.lienzoMax * 2);
        expect(el.rot).toBe(90);
        expect(el.z).toBe(0);
        expect(el.opacidad).toBeUndefined();
        expect(el.radio).toBeUndefined();
        expect(el.forma).toEqual({ tipo: "rect", color: "#7c5cff" });
    });

    it("rechaza más elementos o bloques de los permitidos", () => {
        const elementos = Array.from({ length: LIMITES_FORMATO.elementosLienzo + 1 }, (_, i) => ({ id: `e${i}`, tipo: "forma", x: 0, y: 0, w: 5, h: 5, z: i }));
        expect(error({ lienzo: { ancho: 540, alto: 540, elementos } })).toMatch(/caben 40/);
        const bloques = Array.from({ length: LIMITES_FORMATO.bloquesDoc + 1 }, () => ({ tipo: "separador" }));
        expect(error({ doc: { bloques } })).toMatch(/demasiados bloques/);
    });

    it("rechaza un formato que supera el tamaño máximo", () => {
        const texto = "x".repeat(19_000);
        const bloques = Array.from({ length: 10 }, () => ({ tipo: "parrafo", tramos: [{ texto }] }));
        expect(error({ doc: { bloques } })).toMatch(/máximo es 150 KB/);
        const enorme = { doc: { bloques: [{ tipo: "codigo", texto: "y".repeat(LIMITES_FORMATO.bytes * 5) }] } };
        expect(error(enorme)).toMatch(/demasiado grande/);
    });

    it("hace únicos los ids repetidos y fuerza silencio si hay reproducción automática", () => {
        const base = { x: 0, y: 0, w: 100, h: 100, z: 1 };
        const f = ok({
            lienzo: {
                ancho: 540,
                alto: 540,
                elementos: [
                    { ...base, id: "x", tipo: "video", url: "https://cdn.example/v.mp4", autoplay: true, silenciado: false, bucle: true },
                    { ...base, id: "x", tipo: "forma" },
                ],
            },
        });
        const [v, forma] = f.lienzo!.elementos;
        expect(v).toMatchObject({ autoplay: true, silenciado: true, bucle: true });
        expect(forma.id).not.toBe("x");
    });

    it("limpia caracteres de control del texto", () => {
        const f = ok({ doc: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "a\u0000b\r\nc" }] }] } });
        expect(f.doc?.bloques[0]).toEqual({ tipo: "parrafo", tramos: [{ texto: "ab\nc" }] });
    });
});

describe("textoPlanoDeFormato", () => {
    it("convierte el documento con saltos de línea y marcadores de lista", () => {
        const f: FormatoMensaje = {
            v: 1,
            doc: {
                bloques: [
                    { tipo: "titulo", nivel: 1, tramos: [{ texto: "Plan " }, { texto: "semanal", marcas: ["negrita"] }] },
                    { tipo: "parrafo", tramos: [{ texto: "Hola a todas" }] },
                    { tipo: "lista", ordenada: false, items: [[{ texto: "pan" }], [{ texto: "café" }]] },
                    { tipo: "lista", ordenada: true, items: [[{ texto: "uno" }], [{ texto: "dos" }]] },
                    { tipo: "tareas", items: [{ hecha: true, tramos: [{ texto: "hecho" }] }, { hecha: false, tramos: [{ texto: "pendiente" }] }] },
                    { tipo: "cita", tramos: [{ texto: "Sé el cambio" }] },
                    { tipo: "separador" },
                    { tipo: "codigo", texto: "const a = 1;\nconst b = 2;" },
                ],
            },
        };
        expect(textoPlanoDeFormato(f)).toBe(
            ["Plan semanal", "Hola a todas", "• pan", "• café", "1. uno", "2. dos", "[x] hecho", "[ ] pendiente", "> Sé el cambio", "———", "const a = 1;", "const b = 2;"].join("\n"),
        );
    });

    it("convierte el lienzo en orden de lectura con marcadores", () => {
        const base = { w: 100, h: 100, z: 0 };
        const f: FormatoMensaje = {
            v: 1,
            lienzo: {
                ancho: 540,
                alto: 540,
                elementos: [
                    { ...base, id: "w", tipo: "web", x: 0, y: 300, url: "https://www.ejemplo.org/x" },
                    { ...base, id: "t", tipo: "texto", x: 0, y: 0, texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "Mirad esto" }] }] } },
                    { ...base, id: "i", tipo: "imagen", x: 0, y: 120, url: "https://cdn.example/a.png" },
                    { ...base, id: "v", tipo: "video", x: 200, y: 120, url: "https://cdn.example/a.mp4" },
                    { ...base, id: "a", tipo: "app", x: 0, y: 400, ruta: "/pizarra", nombre: "Pizarra" },
                    { ...base, id: "f", tipo: "forma", x: 0, y: 500, forma: { tipo: "rect", color: "#fff" } },
                ],
            },
        };
        expect(textoPlanoDeFormato(f)).toBe("Mirad esto\n[imagen]\n[vídeo]\n[ventana: ejemplo.org]\n[app: Pizarra]");
    });

    it("un formato solo de estilo no tiene texto propio", () => {
        expect(textoPlanoDeFormato({ v: 1, estilo: { color: "#fff" } })).toBe("");
    });
});

describe("estiloACss y animaciones", () => {
    it("traduce el estilo a CSS y vuelve a filtrar valores peligrosos", () => {
        expect(estiloACss({ fuente: "serif", tamano: 20, color: "#ff0000", colorMarco: "#00ff00", grosorMarco: 3, fondo: "cosmos", alineacion: "centro", negrita: true, cursiva: true })).toEqual({
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "20px",
            color: "#ff0000",
            border: "3px solid #00ff00",
            background: "radial-gradient(120% 120% at 0% 0%,#2a1650,#0b0d1a 70%)",
            textAlign: "center",
            fontWeight: 700,
            fontStyle: "italic",
        });
        expect(estiloACss({ color: "red;background:url(x)", fondo: "url(javascript:1)" } as never)).toEqual({});
        expect(estiloACss(null)).toEqual({});
        expect(estiloACss({ colorMarco: "#fff" }).border).toBe("2px solid #fff");
        expect(estiloACss({ colorMarco: "#fff", grosorMarco: 0 }).border).toBeUndefined();
    });

    it("da clases estables por animación", () => {
        expect(claseAnimacionTexto("ola")).toBe("ss-rt-anim ss-rt-ola");
        expect(claseAnimacionTexto("ninguna")).toBe("");
        expect(claseAnimacionTexto(undefined)).toBe("");
        expect(claseAnimacionTexto("x" as never)).toBe("");
    });

    it("segmenta grafemas compuestos", () => {
        expect(segmentarGrafemas("ñá")).toHaveLength(2);
        expect(segmentarGrafemas("é")).toHaveLength(1);
    });
});

describe("ayudas", () => {
    it("docDesdeTexto, docVacio y formatoVacio", () => {
        const d = docDesdeTexto("uno\n\ndos");
        expect(d.bloques).toHaveLength(3);
        expect(docVacio(d)).toBe(false);
        expect(docVacio(docDesdeTexto("  "))).toBe(true);
        expect(formatoVacio({ v: 1 })).toBe(true);
        expect(formatoVacio({ v: 1, estilo: { negrita: true } })).toBe(false);
    });

    it("urlsDeFormato y adjuntoDeElemento", () => {
        const f: FormatoMensaje = {
            v: 1,
            lienzo: { ancho: 540, alto: 540, elementos: [{ id: "i", tipo: "imagen", x: 0, y: 0, w: 1, h: 1, z: 0, url: "https://c/a.png", nombre: "a.png", mime: "image/png" }] },
        };
        expect([...urlsDeFormato(f)]).toEqual(["https://c/a.png"]);
        expect(adjuntoDeElemento(f.lienzo!.elementos[0])).toEqual({ kind: "image", url: "https://c/a.png", name: "a.png", mime: "image/png" });
    });
});
