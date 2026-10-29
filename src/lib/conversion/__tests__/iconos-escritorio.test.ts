/**
 * Pruebas de src/lib/conversion/iconos-escritorio.ts
 * (CNV1023C → «Convertir a…» en los iconos del escritorio).
 */
import { describe, it, expect } from "vitest";

import { archivoDeIcono, type IconoEscritorio } from "@/lib/conversion/iconos-escritorio";

const base = (extra: Partial<IconoEscritorio>): IconoEscritorio => ({
    kind: "file",
    name: "informe.pdf",
    ...extra,
});

describe("archivoDeIcono", () => {
    it("un icono de archivo con URL es convertible", () => {
        expect(archivoDeIcono(base({ url: "https://nube.test/informe.pdf" }))).toEqual({
            nombre: "informe.pdf",
            url: "https://nube.test/informe.pdf",
        });
    });

    it("un icono que no es archivo (enlace) no se convierte", () => {
        expect(archivoDeIcono({ kind: "link", name: "Web", url: "https://x.test" })).toBeNull();
    });

    it("un archivo sin URL no se convierte", () => {
        expect(archivoDeIcono(base({ url: undefined }))).toBeNull();
    });

    it("una nota con texto embebido (sin URL) no se convierte", () => {
        expect(archivoDeIcono(base({ fileKind: "note", text: "hola", url: undefined }))).toBeNull();
    });

    it("un nombre vacío cae a «archivo»", () => {
        expect(archivoDeIcono(base({ name: "", url: "https://nube.test/canon.md" }))).toEqual({
            nombre: "archivo",
            url: "https://nube.test/canon.md",
        });
    });
});
