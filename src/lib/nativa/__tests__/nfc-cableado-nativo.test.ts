/**
 * NFC1126B · el NFC nativo está cableado en los tres sitios que el encargo nombra:
 * `capabilities/default.json` (permisos de la web), `build.rs` (permisos de los comandos)
 * y `Cargo.toml` (sin plugin ajeno: el HCE es Kotlin propio). Falla si un lado se desvía.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..", "..", "..", "..");
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const COMANDOS = ["nfc_capacidad", "nfc_iniciar", "nfc_parar", "nfc_escribir_etiqueta"];

describe("NFC nativo · cableado", () => {
    it("la capability principal permite los cuatro comandos", () => {
        const permisos: string[] = JSON.parse(leer("native/src-tauri/capabilities/default.json")).permissions;
        for (const c of COMANDOS) expect(permisos, c).toContain(`allow-${c.replace(/_/g, "-")}`);
    });

    it("ninguna otra capability (servidor de capas, escritorio) los concede", () => {
        for (const f of ["desktop", "acceso-equipo", "servidor-capas", "servidor-capas-android"]) {
            expect(leer(`native/src-tauri/capabilities/${f}.json`)).not.toMatch(/nfc/i);
        }
    });

    it("build.rs y lib.rs registran los mismos cuatro comandos", () => {
        const build = leer("native/src-tauri/build.rs");
        const lib = leer("native/src-tauri/src/lib.rs");
        for (const c of COMANDOS) {
            expect(build, `${c} en build.rs`).toContain(`"${c}"`);
            expect(lib, `${c} en generate_handler`).toContain(`nfc::${c},`);
        }
    });

    it("Cargo.toml no mete tauri-plugin-nfc: el HCE y el lector son Kotlin propio", () => {
        expect(leer("native/src-tauri/Cargo.toml")).not.toMatch(/^\s*tauri-plugin-nfc\b/m);
    });

    it("el proyecto de Android se genera: gen/android no se versiona y el parche lo escribe build.rs", () => {
        expect(leer("native/src-tauri/build.rs")).toContain("nfc_parche::aplicar");
        expect(leer("native/src-tauri/src/nfc_parche.rs")).toContain("app.starseed.nativa.HceStarSeed");
    });
});
