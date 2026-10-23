import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    destinosParaMenu,
    elegirPorNombre,
    esFormatoValido,
    etiquetaFormato,
    formatoDe,
    idPorExtension,
    leerDestinos,
    leerListaFormatos,
    nombreDeSalida,
    ordenarDestinos,
} from "../formatos";

// Salida REAL de `filee formats …` (Filee 2.0.0 en la Mac de Alex, 2026-10-23).
const REAL = readFileSync(path.join(__dirname, "fixtures", "filee-formats-2.0.0.txt"), "utf8");
const bloque = (cab: string) => {
    const i = REAL.indexOf(cab);
    const j = REAL.indexOf("converts to:", i + cab.length + 14);
    return REAL.slice(i, j < 0 ? undefined : REAL.lastIndexOf("\n", j));
};

describe("leerDestinos (filee formats <formato>)", () => {
    it("lee el bloque de PDF con sus destinos y los que piden motor", () => {
        const d = leerDestinos(bloque("PDF (pdf) converts to:"))!;
        expect(d.nombre).toBe("PDF");
        expect(d.ids).toEqual(["pdf"]);
        expect(d.destinos).toEqual(expect.arrayContaining(["png", "jpg", "docx", "hwpx", "pptx"]));
        expect(d.conMotor).toEqual(expect.arrayContaining(["odt", "rtf", "dwg"]));
        expect(d.destinos).not.toContain("odt");
    });

    it("JPG trae sus alias y MP3 no tiene motores opcionales", () => {
        const jpg = leerDestinos(bloque("JPG (jpg, jpeg, jpe, jfif) converts to:"))!;
        expect(jpg.ids).toEqual(["jpg", "jpeg", "jpe", "jfif"]);
        const mp3 = leerDestinos(bloque("MP3 (mp3) converts to:"))!;
        expect(mp3.destinos.length).toBeGreaterThan(3);
        expect(mp3.conMotor).toEqual([]);
    });

    it("lo que no tiene esa forma es null", () => {
        expect(leerDestinos("filee: unknown format: xyz")).toBeNull();
        expect(leerDestinos("")).toBeNull();
    });
});

describe("leerListaFormatos (filee formats)", () => {
    const lista = leerListaFormatos(REAL);
    it("familias, extensiones y solo lectura", () => {
        expect(lista.find((f) => f.id === "jpg")).toMatchObject({ familia: "Image", extensiones: ["jpg", "jpeg", "jpe", "jfif"], soloLectura: false });
        expect(lista.find((f) => f.id === "rar")).toMatchObject({ familia: "Archive", nombre: "RAR", soloLectura: true });
        expect(lista.find((f) => f.id === "tgz")?.extensiones).toContain("tar.gz");
        expect(lista.length).toBeGreaterThan(150);
    });
    it("de un nombre de archivo saca el id que entiende Filee", () => {
        expect(idPorExtension("Foto.JPEG", lista)).toBe("jpg");
        expect(idPorExtension("respaldo.tgz", lista)).toBe("tgz");
        expect(idPorExtension("sin-extension", lista)).toBe("sin-extension");
    });
});

describe("utilidades", () => {
    it("formatoDe entiende nombres, extensiones, MIME y alias", () => {
        expect(formatoDe("Viaje.HEIC")).toBe("heic");
        expect(formatoDe(".md")).toBe("md");
        expect(formatoDe("image/jpeg")).toBe("jpg");
        expect(formatoDe("https://x.supabase.co/obj/informe.pdf?token=1")).toBe("pdf");
        expect(formatoDe("../../etc/passwd")).toBe("");
        expect(esFormatoValido("mp4")).toBe(true);
        expect(esFormatoValido("mp4; rm -rf /")).toBe(false);
    });

    it("ordena con los habituales primero, sin el origen ni duplicados", () => {
        expect(ordenarDestinos(["tga", "pdf", "png", "docx", "png", "md"], "nota.md")).toEqual(["pdf", "docx", "png", "tga"]);
        const m = destinosParaMenu({ nombre: "PNG", ids: ["png"], destinos: ["jpg", "webp", "pdf", "tga", "qoi"], conMotor: [] }, "a.png", 3);
        expect(m).toEqual({ principales: ["pdf", "jpg", "webp"], resto: 2 });
        expect(destinosParaMenu(null, "a.png")).toEqual({ principales: [], resto: 0 });
    });

    it("nombre de salida sin rutas ni caracteres raros", () => {
        expect(nombreDeSalida("Viaje a Oaxaca.HEIC", "jpg")).toBe("Viaje a Oaxaca.jpg");
        expect(nombreDeSalida("../../secreto.pdf", "docx")).toBe("secreto.docx");
        expect(nombreDeSalida("", "pdf")).toBe("archivo.pdf");
        expect(etiquetaFormato("docx")).toBe("Word (DOCX)");
        expect(etiquetaFormato("tga")).toBe("TGA");
    });

    it("elige el archivo que la persona nombró", () => {
        const lista = [
            { name: "informe octubre.pdf" },
            { name: "Informe de gastos.xlsx" },
            { name: "foto-playa.heic" },
        ];
        expect(elegirPorNombre(lista, "informe octubre.pdf")?.name).toBe("informe octubre.pdf");
        expect(elegirPorNombre(lista, "el informe de gastos")?.name).toBe("Informe de gastos.xlsx");
        expect(elegirPorNombre(lista, "foto de la playa")?.name).toBe("foto-playa.heic");
        expect(elegirPorNombre(lista, "contrato")).toBeNull();
    });
});
