import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, test } from "node:test";

import { MAX_BYTES, _ponerEjecutor, crearApp, estadoFilee, leerDestinos, nombreSeguro, zipSimple } from "../src/app.mjs";

let bin = "";
const llamadas = [];

before(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "conversor-bin-"));
    bin = path.join(dir, "filee");
    await fs.writeFile(bin, "#!/bin/sh\nexit 0\n");
    await fs.chmod(bin, 0o755);
    process.env.FILEE_BIN = bin;
});

after(async () => {
    delete process.env.FILEE_BIN;
    _ponerEjecutor(null);
    await fs.rm(path.dirname(bin), { recursive: true, force: true });
});

afterEach(() => {
    llamadas.length = 0;
    _ponerEjecutor(null);
});

/** Filee falso: contesta version/formats y escribe en `-o` lo que se le pida. */
function falso(opciones = {}) {
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
        return { stdout: JSON.stringify({ converted: 1, failed: 0, files: [{ source: origen, state: "done", outputs: salidas }] }), stderr: "", code: 0 };
    });
}

const md = new TextEncoder().encode("# Hola\n");

function peticion(app, nombre = "Mi nota.md", a = "docx", calidad) {
    const fd = new FormData();
    fd.append("archivo", new File([md], nombre));
    fd.append("a", a);
    if (calidad !== undefined) fd.append("calidad", String(calidad));
    return app.request("/convertir", { method: "POST", body: fd });
}

test("lee los destinos que dice Filee y ordena el nombre de salida sin rutas", () => {
    const d = leerDestinos("Markdown (md, markdown) converts to:\n  pdf, docx\nWith optional engines (x):\n  odt, pdf\n");
    assert.deepEqual(d, { nombre: "Markdown", ids: ["md", "markdown"], destinos: ["pdf", "docx"], conMotor: ["odt"] });
    assert.equal(leerDestinos("no es filee"), null);
    assert.equal(nombreSeguro("../../etc/passwd"), "passwd");
    assert.equal(nombreSeguro("a\u0000b?.md"), "a_b_.md");
    assert.equal(nombreSeguro("..."), "archivo");
});

test("salud abierta; formatos y convertir piden Bearer cuando hay token", async () => {
    falso();
    const app = crearApp({ token: "t0k" });
    assert.equal((await app.request("/salud")).status, 200);
    assert.equal((await app.request("/formatos?de=md")).status, 401);
    assert.equal((await peticion(app)).status, 401);
    const r = await app.request("/formatos?de=md", { headers: { Authorization: "Bearer t0k" } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j.destinos, ["pdf", "docx", "png"]);
    assert.deepEqual(j.conMotor, ["odt"]);
    assert.equal(j.filee.version, "2.0.0");
});

test("formato desconocido o sin Filee: respuestas honestas", async () => {
    falso();
    const app = crearApp();
    const r = await app.request("/formatos?de=md;rm -rf /");
    assert.equal(r.status, 400);
    const j = await app.request("/formatos?de=md");
    assert.equal(j.status, 200);
    _ponerEjecutor(async () => ({ stdout: "", stderr: "no", code: 127 }));
    await estadoFilee(true);
    const sin = await app.request("/formatos?de=md");
    assert.equal(sin.status, 503);
});

test("convierte: argumentos en lista, calidad y carpeta temporal borrada", async () => {
    falso();
    const app = crearApp();
    const r = await peticion(app, "Mi nota.md", "docx", 80);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.match(r.headers.get("content-disposition"), /Mi%20nota\.docx/);
    assert.equal(await r.text(), "contenido Mi nota.docx");
    const conv = llamadas.find((a) => a[0] === "convert");
    assert.ok(conv);
    assert.equal(conv[0], "convert");
    assert.ok(path.isAbsolute(conv[1]));
    assert.ok(conv[1].includes(path.join("entrada", "Mi nota.md")));
    assert.ok(conv.includes("--to") && conv.includes("docx") && conv.includes("--json") && conv.includes("--overwrite"));
    assert.deepEqual(conv.slice(-2), ["--quality", "80"]);
    const carpeta = path.dirname(conv[conv.indexOf("-o") + 1]);
    await assert.rejects(fs.access(carpeta));
});

test("varias salidas (PDF de páginas a PNG) vuelven en un ZIP válido", async () => {
    falso({ salidas: (dir, base) => [1, 2, 3].map((n) => path.join(dir, `${base}-${n}.png`)) });
    const app = crearApp();
    const r = await peticion(app, "libro.pdf", "png");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-conversor-salidas"), "3");
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString("hex"), "504b0304");
    assert.ok(bytes.includes("libro-1.png"));
    assert.ok(bytes.includes("libro-3.png"));
});

test("errores de Filee y salidas fuera de su carpeta se dicen tal cual", async () => {
    falso({ error: "No engine can do this conversion (md → odt)" });
    const app = crearApp();
    const r = await peticion(app, "a.md", "odt");
    assert.equal(r.status, 422);
    assert.equal((await r.json()).motivo, "No engine can do this conversion (md → odt)");
    falso({ salidas: () => [path.join(os.tmpdir(), "fuera-de-sitio.pdf")] });
    const r2 = await peticion(app, "a.md", "pdf");
    assert.equal(r2.status, 422);
    await fs.rm(path.join(os.tmpdir(), "fuera-de-sitio.pdf"), { force: true });
});

test("entradas malas: formato raro, archivo vacío o sin archivo", async () => {
    falso();
    const app = crearApp();
    assert.equal((await peticion(app, "a.md", "pdf; rm -rf /")).status, 400);
    const fd = new FormData();
    fd.append("archivo", new File([new Uint8Array()], "vacio.md"));
    fd.append("a", "pdf");
    assert.equal((await app.request("/convertir", { method: "POST", body: fd })).status, 400);
    const sin = new FormData();
    sin.append("a", "pdf");
    assert.equal((await app.request("/convertir", { method: "POST", body: sin })).status, 400);
    const enorme = new Request("http://x/convertir", {
        method: "POST",
        headers: { "content-length": String(MAX_BYTES + 16 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" },
        body: "--x--",
    });
    assert.equal((await app.fetch(enorme)).status, 413);
});

test("sin Filee en la neurona: 503", async () => {
    _ponerEjecutor(async () => ({ stdout: "", stderr: "no", code: 127 }));
    await estadoFilee(true);
    const app = crearApp();
    assert.equal((await peticion(app)).status, 503);
});

test("como mucho dos conversiones a la vez (429 a la tercera)", async () => {
    let liberar;
    const puerta = new Promise((res) => { liberar = res; });
    let bloqueados = 0;
    _ponerEjecutor(async (_bin, args) => {
        if (args[0] === "version") return { stdout: "filee 2.0.0\n", stderr: "", code: 0 };
        if (args[0] === "formats") return { stdout: "Markdown (md) converts to:\n  png\n", stderr: "", code: 0 };
        bloqueados++;
        await puerta;
        const out = args[args.indexOf("-o") + 1];
        const a = args[args.indexOf("--to") + 1];
        const s = path.join(out, `${path.basename(args[1]).replace(/\.[^.]+$/, "")}.${a}`);
        await fs.mkdir(out, { recursive: true });
        await fs.writeFile(s, "ok");
        return { stdout: JSON.stringify({ files: [{ state: "done", outputs: [s] }] }), stderr: "", code: 0 };
    });
    const app = crearApp();
    const p1 = peticion(app, "a.md", "png");
    const p2 = peticion(app, "b.md", "png");
    while (bloqueados < 2) await new Promise((r) => setTimeout(r, 5));
    const r3 = await peticion(app, "c.md", "png");
    assert.equal(r3.status, 429);
    liberar();
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
});

test("zipSimple produce un ZIP STORE con firma local y EOCD", () => {
    const z = zipSimple([{ path: "a.txt", data: "hola" }, { path: "b.txt", data: "mundo" }]);
    assert.equal(Buffer.from(z.subarray(0, 4)).toString("hex"), "504b0304");
    assert.equal(Buffer.from(z.subarray(z.length - 22, z.length - 18)).toString("hex"), "504b0506");
});
