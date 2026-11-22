/**
 * DIR1121: los canales de dirección se llaman igual en todos los medios y su nombre
 * sale de una sola fuente (`src/lib/mando/canales-nombres.ts`, que a su vez refleja
 * `~/.starseed/canales-direccion.json`). Esta guardia impide que un componente de
 * Genesis vuelva a escribir a mano un nombre viejo de canal.
 *
 * Los nombres viejos se arman por partes a propósito: así este archivo no vuelve a
 * sembrar el repositorio con las cadenas que la guardia persigue.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

const ARCHIVOS = [
    "src/components/mando/panel-chat-especializado.tsx",
    "src/components/mando/centro-mando.tsx",
];

const NOMBRES_VIEJOS = [
    ["Dirección", "principal"],
    ["Dirección", "general"],
    ["Dirección", "MetaGenesis"],
    ["Producción", "audiovisual,", "diseño y promoción"],
    ["Producción", "audiovisual", "y diseño"],
    ["Magga", "cortex"],
    ["Puente de", "Mando"],
    ["Síntesis de", "producción"],
    ["GENESIS", "·", "StarSeed", "OS"],
].map((partes) => partes.join(" "));

function plegar(texto: string): string {
    return texto.normalize("NFC").toLocaleLowerCase("es");
}

describe("los canales de dirección no escriben su nombre a mano", () => {
    it.each(ARCHIVOS)("%s lee el nombre del módulo único y no repite nombres viejos", (relativo) => {
        const codigo = readFileSync(path.join(RAIZ, relativo), "utf8");
        const texto = plegar(codigo);
        const encontrados = NOMBRES_VIEJOS.filter((viejo) => texto.includes(plegar(viejo)));
        expect(encontrados, `${relativo} todavía escribe: ${encontrados.join(", ")}`).toEqual([]);
        expect(codigo).toContain("@/lib/mando/canales-nombres");
    });
});
