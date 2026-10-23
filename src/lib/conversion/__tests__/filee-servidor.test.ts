// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { _ponerEjecutor, convertirConFilee, destinosFilee, estadoFilee, nombreSeguro } from "../filee-servidor";
import { listZipEntries } from "@/lib/files/simple-zip";

let bin = "";
const llamadas: string[][] = [];

beforeAll(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "filee-bin-"));
    bin = path.join(dir, "filee");
    await fs.writeFile(bin, "#!/bin/sh\nexit 0\n");
    await fs.chmod(bin, 0o755);
    process.env.FILEE_BIN = bin;
});
afterAll(() => {
    delete process.env.FILEE_BIN;
    _ponerEjecutor(null);
});
afterEach(() => {
    llamadas.length = 0;
    _ponerEjecutor(null);
});

/** Filee falso: escribe en `-o` lo que se le pida y contesta como el de verdad (--json). */
function falso(opciones: { salidas?: (dir: string, base: string, a: string) => string[]; error?: string; version?: string } = {}) {
    _ponerEjecutor(async (_bin, args) => {
        llamadas.push(args);
        if (args[0] === "version") return { stdout: `filee ${opciones.version ?? "2.0.0"}\n`, stderr: "", code: 0 };
        if (args[0] === "formats") {
            return { stdout: "Markdown (md, markdown) converts to:\n  pdf, docx, png\nWith optional engines (x):\n  odt\n", stderr: "", code: 0 };
        }
        const origen = args[1];
        const a = args[args.indexOf("--to") + 1];
        const out = args[args.indexOf("-o") + 1];
        const base = path.basename(origen).replace(/\.[^.]+$/, "");
        if (opciones.error) {
            return { stdout: JSON.stringify({ converted: 0, failed: 1, files: [{ source: origen, state: "failed", outputs: [], error: opciones.error }] }), stderr: "", code: 1 };
        }
        const salidas = opciones.salidas ? opciones.salidas(out, base, a) : [path.join(out, `${base}.${a}`)];
        for (const s of salidas) {
            await fs.mkdir(path.dirname(s), { recursive: true }).catch(() => undefined);
            await fs.writeFile(s, `contenido ${path.basename(s)}`).catch(() => undefined);
        }
        return { stdout: JSON.stringify({ converted: 1, failed: 0, files: [{ source: origen, state: "done", outputs: salidas }] }, null, 2), stderr: "", code: 0 };
    });
}

const md = new TextEncoder().encode("# Hola\n");

describe("Filee en la neurona", () => {
    it("estado y destinos leen la orden de verdad", async () => {
        falso();
        const e = await estadoFilee(true);
        expect(e).toMatchObject({ instalado: true, version: "2.0.0" });
        const d = await destinosFilee("nota.md");
        expect(d?.destinos).toEqual(["pdf", "docx", "png"]);
        expect(d?.conMotor).toEqual(["odt"]);
    });

    it("convierte un archivo: argumentos en lista, nunca por shell, y borra su carpeta", async () => {
        falso();
        const r = await convertirConFilee({ bytes: md, nombre: "Mi nota.md", a: "docx", calidad: 80 });
        expect(r.ok).toBe(true);
        expect(r.nombre).toBe("Mi nota.docx");
        expect(new TextDecoder().decode(r.bytes)).toBe("contenido Mi nota.docx");
        const conv = llamadas.find((a) => a[0] === "convert")!;
        expect(conv).toEqual(expect.arrayContaining(["--to", "docx", "--json", "--overwrite", "--quality", "80"]));
        const carpeta = path.dirname(path.dirname(conv[1]));
        await expect(fs.access(carpeta)).rejects.toBeTruthy();
    });

    it("varias salidas (PDF de varias páginas a PNG) vuelven en un ZIP", async () => {
        falso({ salidas: (dir, base) => [1, 2, 3].map((n) => path.join(dir, `${base}-${n}.png`)) });
        const r = await convertirConFilee({ bytes: md, nombre: "libro.pdf", a: "png" });
        expect(r.ok).toBe(true);
        expect(r.salidas).toBe(3);
        expect(r.nombre).toBe("libro-png.zip");
        const ab = r.bytes!.buffer.slice(r.bytes!.byteOffset, r.bytes!.byteOffset + r.bytes!.byteLength) as ArrayBuffer;
        expect(listZipEntries(ab).map((e) => e.name)).toEqual(["libro-1.png", "libro-2.png", "libro-3.png"]);
    });

    it("lo que Filee no puede hacer se dice tal cual (422)", async () => {
        falso({ error: "No engine can do this conversion (md → odt)" });
        const r = await convertirConFilee({ bytes: md, nombre: "a.md", a: "odt" });
        expect(r).toMatchObject({ ok: false, status: 422, motivo: "No engine can do this conversion (md → odt)" });
    });

    it("no acepta salidas fuera de su carpeta", async () => {
        falso({ salidas: () => [path.join(os.tmpdir(), "fuera-de-sitio.pdf")] });
        const r = await convertirConFilee({ bytes: md, nombre: "a.md", a: "pdf" });
        expect(r).toMatchObject({ ok: false, status: 422 });
        await fs.rm(path.join(os.tmpdir(), "fuera-de-sitio.pdf"), { force: true });
    });

    it("entradas malas: formato raro, vacío", async () => {
        falso();
        expect(await convertirConFilee({ bytes: md, nombre: "a.md", a: "pdf; rm -rf /" })).toMatchObject({ ok: false, status: 400 });
        expect(await convertirConFilee({ bytes: new Uint8Array(), nombre: "a.md", a: "pdf" })).toMatchObject({ ok: false, status: 400 });
    });

    it("sin Filee en la neurona: 503 honesto", async () => {
        _ponerEjecutor(async () => ({ stdout: "", stderr: "no", code: 127 }));
        await estadoFilee(true);
        const r = await convertirConFilee({ bytes: md, nombre: "a.md", a: "pdf" });
        expect(r).toMatchObject({ ok: false, status: 503 });
    });

    it("nombre seguro sin rutas ni control", () => {
        expect(nombreSeguro("../../etc/passwd")).toBe("passwd");
        expect(nombreSeguro("a\u0000b?.md")).toBe("a_b_.md");
        expect(nombreSeguro("...")).toBe("archivo");
    });
});
