// ESC1110B — El archivo de símbolo: buenos archivos, SVG hostiles, tamaños, rangos, versión y caída al oficial.
import { describe, expect, it } from "vitest";
import {
    FORMATO_SIMBOLO, SIMBOLO_OFICIAL, TOPES_SIMBOLO, VERSION_SIMBOLO,
    archivoDesdeRecurso, exportarArchivoSimbolo, revisarModelo, revisarSvg, tipoDeArchivoElegido, validarArchivoSimbolo,
} from "../simbolo-archivo";

const SVG_OK = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M0 0L10 0L5 10Z" fill="url(#g)"/></svg>';
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const b64 = (s: string) => btoa(s);
const gltfJson = (extra: object = {}) => `data:model/gltf+json;base64,${b64(JSON.stringify({ asset: { version: "2.0" }, ...extra }))}`;

function glb(json: object, largo?: number): string {
    let texto = JSON.stringify(json);
    while (texto.length % 4) texto += " ";
    const total = 12 + 8 + texto.length;
    const buf = new Uint8Array(total);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, 0x46546c67, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, largo ?? total, true);
    dv.setUint32(12, texto.length, true);
    dv.setUint32(16, 0x4e4f534a, true);
    for (let i = 0; i < texto.length; i++) buf[20 + i] = texto.charCodeAt(i);
    let bin = "";
    buf.forEach((x) => { bin += String.fromCharCode(x); });
    return `data:model/gltf-binary;base64,${btoa(bin)}`;
}

describe("archivo de símbolo · válidos", () => {
    it("el oficial se valida tal cual y se exporta/importa sin pérdida", () => {
        const r = validarArchivoSimbolo(SIMBOLO_OFICIAL);
        expect(r.ok).toBe(true);
        expect(r.archivo).toEqual(SIMBOLO_OFICIAL);
        const ida = validarArchivoSimbolo(exportarArchivoSimbolo(SIMBOLO_OFICIAL));
        expect(ida.ok && ida.archivo).toEqual(SIMBOLO_OFICIAL);
    });

    it("un archivo mínimo hereda todo del oficial", () => {
        const r = validarArchivoSimbolo({ formato: FORMATO_SIMBOLO, version: VERSION_SIMBOLO });
        expect(r.ok).toBe(true);
        expect(r.archivo.fuente).toEqual({ tipo: "oficial" });
        expect(r.archivo.comportamientos).toEqual(SIMBOLO_OFICIAL.comportamientos);
    });

    it("acepta SVG limpio, imagen incrustada, glTF JSON y GLB con recursos incrustados", () => {
        expect(archivoDesdeRecurso("svg", SVG_OK, "Mío").ok).toBe(true);
        expect(archivoDesdeRecurso("imagen", PNG_1PX, "Mío").ok).toBe(true);
        expect(archivoDesdeRecurso("gltf", gltfJson({ buffers: [{ uri: "data:application/octet-stream;base64,AAAA", byteLength: 3 }] }), "Mío").ok).toBe(true);
        expect(revisarModelo(glb({ asset: { version: "2.0" } }))).toBeNull();
    });

    it("clasifica lo que se elige por nombre y tipo", () => {
        expect(tipoDeArchivoElegido("x.simbolo.json")).toBe("simbolo");
        expect(tipoDeArchivoElegido("x.glb")).toBe("gltf");
        expect(tipoDeArchivoElegido("x.svg")).toBe("svg");
        expect(tipoDeArchivoElegido("x.webp")).toBe("imagen");
        expect(tipoDeArchivoElegido("x.exe")).toBeNull();
    });
});

describe("archivo de símbolo · hostiles y fuera de norma → oficial con motivo", () => {
    const svg = (cuerpo: string) => `<svg xmlns="http://www.w3.org/2000/svg">${cuerpo}</svg>`;
    it.each([
        ["script", svg("<script>alert(1)</script>")],
        ["manejador on…", svg('<rect width="1" height="1" onload="alert(1)"/>')],
        ["foreignObject", svg("<foreignObject><div/></foreignObject>")],
        ["imagen externa", svg('<image href="https://x.y/z.png"/>')],
        ["enlace externo", svg('<a href="https://x.y"><rect/></a>')],
        ["xlink externo", svg('<use xlink:href="http://x.y/s.svg#a"/>')],
        ["url() remota", svg('<rect style="fill:url(https://x.y/p)"/>')],
        ["@import", svg("<style>@import url(https://x.y/a.css);</style>")],
        ["javascript:", svg('<a href="javascript:alert(1)"><rect/></a>')],
        ["entidades", '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>'],
        ["no es svg", "<html><body/></html>"],
    ])("SVG con %s", (_n, texto) => {
        expect(revisarSvg(texto)).not.toBeNull();
        const r = archivoDesdeRecurso("svg", texto, "malo");
        expect(r.ok).toBe(false);
        expect(r.archivo).toBe(SIMBOLO_OFICIAL);
        if (!r.ok) expect(r.motivo.length).toBeGreaterThan(5);
    });

    it("rechaza URLs remotas o relativas en vez de data:", () => {
        expect(archivoDesdeRecurso("imagen", "https://x.y/a.png", "m").ok).toBe(false);
        expect(archivoDesdeRecurso("gltf", "https://x.y/a.glb", "m").ok).toBe(false);
        expect(archivoDesdeRecurso("gltf", gltfJson({ buffers: [{ uri: "modelo.bin" }] }), "m").ok).toBe(false);
        expect(archivoDesdeRecurso("gltf", gltfJson({ images: [{ uri: "https://x.y/t.png" }] }), "m").ok).toBe(false);
        expect(revisarModelo(glb({ asset: { version: "2.0" }, buffers: [{ uri: "fuera.bin" }] }))).toMatch(/externos/);
    });

    it("rechaza GLB roto, glTF 1.0 y tipos raros", () => {
        expect(revisarModelo(glb({ asset: { version: "2.0" } }, 9999))).toMatch(/longitud/);
        expect(revisarModelo(gltfJson({ asset: { version: "1.0" } }))).toMatch(/2\.0/);
        expect(validarArchivoSimbolo({ formato: FORMATO_SIMBOLO, version: 1, fuente: { tipo: "flash", datos: "x" } }).ok).toBe(false);
    });

    it("rechaza lo que pesa de más", () => {
        const grande = "A".repeat(Math.ceil(((TOPES_SIMBOLO.imagen + 10) * 4) / 3));
        expect(archivoDesdeRecurso("imagen", `data:image/png;base64,${grande}`, "m").ok).toBe(false);
        const svgGrande = `<svg>${" ".repeat(TOPES_SIMBOLO.svg + 1)}</svg>`;
        expect(revisarSvg(svgGrande)).toMatch(/pesa/);
        expect(validarArchivoSimbolo("x".repeat(TOPES_SIMBOLO.archivo + 1)).ok).toBe(false);
    });

    it("versión equivocada, formato ajeno o JSON roto → oficial", () => {
        for (const malo of [{ formato: FORMATO_SIMBOLO, version: 2 }, { formato: "otro", version: 1 }, "{no json", 42, null]) {
            const r = validarArchivoSimbolo(malo);
            expect(r.ok).toBe(false);
            expect(r.archivo).toBe(SIMBOLO_OFICIAL);
        }
        const r = validarArchivoSimbolo({ formato: FORMATO_SIMBOLO, version: 2 });
        expect(!r.ok && r.motivo).toMatch(/versión/);
    });
});

describe("archivo de símbolo · rangos y regla de marca", () => {
    it("acota los números fuera de rango y avisa", () => {
        const r = validarArchivoSimbolo({
            ...SIMBOLO_OFICIAL,
            pose: { guinada: 400, cabeceo: -90, escala: 9, flotacion: -1 },
            comportamientos: { ...SIMBOLO_OFICIAL.comportamientos, velocidadFlor: 99, pausaFlor: 0 },
        });
        expect(r.ok).toBe(true);
        expect(r.archivo.pose).toEqual({ guinada: 45, cabeceo: -30, escala: 1.5, flotacion: 0 });
        expect(r.archivo.comportamientos.velocidadFlor).toBe(3);
        expect(r.archivo.comportamientos.pausaFlor).toBe(1);
        expect(r.avisos.length).toBeGreaterThanOrEqual(6);
        const raro = validarArchivoSimbolo({ ...SIMBOLO_OFICIAL, pose: { guinada: "mucho" } });
        expect(raro.archivo.pose.guinada).toBe(SIMBOLO_OFICIAL.pose.guinada);
    });

    it("el oficial nunca se recolorea: ignora material y color de luces; la luz solo se matiza", () => {
        const r = validarArchivoSimbolo({
            ...SIMBOLO_OFICIAL,
            material: { color: "#FF0000", rugosidad: 1, metalico: 1, laca: 0 },
            luces: { clave: { intensidad: 99, color: "#FF0000" }, relleno: { intensidad: 0.4, color: "#00FF00" }, contra: SIMBOLO_OFICIAL.luces.contra, entorno: 0 },
        });
        expect(r.archivo.material).toEqual(SIMBOLO_OFICIAL.material);
        expect(r.archivo.luces.clave.color).toBe(SIMBOLO_OFICIAL.luces.clave.color);
        expect(r.archivo.luces.relleno.color).toBe(SIMBOLO_OFICIAL.luces.relleno.color);
        expect(r.archivo.luces.clave.intensidad).toBeCloseTo(SIMBOLO_OFICIAL.luces.clave.intensidad * 1.4, 9);
        expect(r.archivo.luces.entorno).toBeCloseTo(SIMBOLO_OFICIAL.luces.entorno * 0.6, 9);
        expect(r.avisos.some((a) => /marca/.test(a))).toBe(true);
    });

    it("un símbolo propio sí lleva su material y descarta campos desconocidos", () => {
        const r = archivoDesdeRecurso("svg", SVG_OK, "<b>Mi marca</b>");
        expect(r.ok).toBe(true);
        const propio = validarArchivoSimbolo({ ...r.archivo, material: { color: "#12ab34", rugosidad: 0.2, metalico: 0.9, laca: 0 }, script: "x" });
        expect(propio.archivo.material.color).toBe("#12AB34");
        expect((propio.archivo as unknown as Record<string, unknown>).script).toBeUndefined();
        expect(r.archivo.nombre).toBe("bMi marca/b");
    });
});
