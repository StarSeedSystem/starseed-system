import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
    leerCola,
    leerFeedDirector,
    publicarEntrega,
    publicarMensaje,
} from "@/lib/mando/chat-director";
import type { MensajeDirector } from "@/lib/mando/chat-director-tipos";

let raiz: string;

function mensajeBase(): Omit<MensajeDirector, "id" | "t"> {
    return {
        de: "alex",
        rol: "alex",
        tipo: "mensaje",
        texto: "Hola, esto es una prueba del chat del Director.",
        canal: "mando",
    };
}

beforeEach(async () => {
    raiz = await mkdtemp(path.join(os.tmpdir(), "chat-director-"));
    process.env.STARSEED_ROOT = raiz;
    await mkdir(path.join(raiz, "starseed_memory_root", "mando", "director"), { recursive: true });
});

afterEach(async () => {
    delete process.env.STARSEED_ROOT;
    await rm(raiz, { recursive: true, force: true });
});

describe("leerCola", () => {
    it("archivo inexistente devuelve []", async () => {
        expect(await leerCola(path.join(raiz, "no-existe.jsonl"))).toEqual([]);
    });

    it("devulve líneas no vacías", async () => {
        const f = path.join(raiz, "cola.jsonl");
        await writeFile(f, '{"a":1}\n\n{"a":2}\n', "utf8");
        expect(await leerCola(f)).toEqual(['{"a":1}', '{"a":2}']);
    });

    it("descarta la primera línea cuando la cola quedó cortada", async () => {
        const f = path.join(raiz, "cola.jsonl");
        await writeFile(f, "primera-linea\nsegunda\ntercera", "utf8");
        expect(await leerCola(f, 20)).toEqual(["segunda", "tercera"]);
    });
});

describe("publicar y leer", () => {
    it("publica un mensaje con id y t, y aparece en el feed", async () => {
        const m = await publicarMensaje(mensajeBase());
        expect(m.id).toMatch(/^md-\d+-[0-9a-f]{4}$/);
        expect(m.t).toBe(new Date(m.t).toISOString());
        const feed = await leerFeedDirector();
        expect(feed.mensajes).toHaveLength(1);
        expect(feed.mensajes[0].texto).toContain("Hola");
        expect(feed.entregas).toEqual({});
    });

    it("respeta un id y una t dados", async () => {
        const m = await publicarMensaje({
            ...mensajeBase(), id: "md-1-abcd", t: "2026-10-04T09:00:00Z",
        });
        expect(m.id).toBe("md-1-abcd");
        expect(m.t).toBe("2026-10-04T09:00:00Z");
    });

    it("una línea rota en la cola no tira la lectura", async () => {
        await publicarMensaje(mensajeBase());
        const ruta = path.join(raiz, "starseed_memory_root", "mando", "director", "chat.jsonl");
        await appendFile(ruta, "{esto no es json\n", "utf8");
        const feed = await leerFeedDirector();
        expect(feed.mensajes).toHaveLength(1);
    });

    it("tacha una clave «sk-…» inventada y corta a 20000", async () => {
        const secreto = "sk-abc123def456ghi789jkl";
        const m = await publicarMensaje({ ...mensajeBase(), texto: `mi clave ${secreto} adiós` });
        expect(m.texto).not.toContain(secreto);
        expect(m.texto).toContain("••••");
        const largo = await publicarMensaje({ ...mensajeBase(), texto: "x".repeat(21000) });
        expect(largo.texto).toHaveLength(20000);
    });

    it("deja copia en la bandeja y entrega pendiente para claude-cowork", async () => {
        const m = await publicarMensaje({ ...mensajeBase(), canales: ["claude-cowork"] });
        const bandeja = path.join(
            raiz, "starseed_memory_root", "mando", "director", "bandeja", "claude-cowork.jsonl",
        );
        const lineas = await leerCola(bandeja);
        expect(lineas).toHaveLength(1);
        const feed = await leerFeedDirector();
        expect(feed.entregas[m.id]).toEqual({ "claude-cowork": "pendiente" });
    });

    it("publicarEntrega apunta el último estado", async () => {
        const m = await publicarMensaje({ ...mensajeBase(), canales: ["claude-cowork"] });
        await publicarEntrega(m.id, "claude-cowork", "respondido", "contestado en la revisión");
        const feed = await leerFeedDirector();
        expect(feed.entregas[m.id]).toEqual({ "claude-cowork": "respondido" });
    });
});

describe("leerFeedDirector: fusión", () => {
    it("funde chat, canal, eventos y bitácora en orden por t", async () => {
        const mem = path.join(raiz, "starseed_memory_root");
        await mkdir(path.join(mem, "mando"), { recursive: true });
        await mkdir(path.join(mem, "olas"), { recursive: true });
        await mkdir(path.join(mem, "relevo"), { recursive: true });
        await writeFile(
            path.join(mem, "mando", "canal.jsonl"),
            JSON.stringify({ t: "2026-10-04T08:00:00Z", epoch: 1759564800, quien: "director", tipo: "hecho", texto: "ola integrada" }) + "\n",
            "utf8",
        );
        await writeFile(
            path.join(mem, "olas", "eventos.jsonl"),
            JSON.stringify({ t: "2026-10-04T08:30:00Z", tipo: "commit", texto: "commit abc", tarea: "CDD1004" }) + "\n",
            "utf8",
        );
        await writeFile(
            path.join(mem, "relevo", "bitacora.jsonl"),
            JSON.stringify({ t: "2026-10-04T07:00:00Z", quien: "hermes", tipo: "nota", texto: "relevo hecho" }) + "\n",
            "utf8",
        );
        await publicarMensaje({
            ...mensajeBase(), id: "md-2-abcd", t: "2026-10-04T09:00:00Z", tipo: "respuesta",
            rol: "director", modelo: "hermes/predeterminado",
        });
        const feed = await leerFeedDirector();
        expect(feed.mensajes.map((m) => m.id)).toEqual([
            "rb-2026-10-04T07:00:00Z-hermes",
            "cn-1759564800000-director",
            "ev-2026-10-04T08:30:00Z-CDD1004-commit",
            "md-2-abcd",
        ]);
        expect(feed.ultimoModelo).toBe("hermes/predeterminado");
    });

    it("filtra por `desde` y limita al último `limite`", async () => {
        await publicarMensaje({ ...mensajeBase(), id: "md-10-abcd", t: "2026-10-04T08:00:00Z" });
        await publicarMensaje({ ...mensajeBase(), id: "md-11-abcd", t: "2026-10-04T09:00:00Z" });
        await publicarMensaje({ ...mensajeBase(), id: "md-12-abcd", t: "2026-10-04T10:00:00Z" });
        const feed = await leerFeedDirector({ desde: "2026-10-04T08:30:00Z", limite: 1 });
        expect(feed.mensajes.map((m) => m.id)).toEqual(["md-12-abcd"]);
    });

    it("con `desde` conserva ultimoModelo aunque lo nuevo no traiga respuesta del director", async () => {
        await publicarMensaje({
            ...mensajeBase(), id: "md-20-abcd", t: "2026-10-04T08:00:00Z", tipo: "respuesta",
            rol: "director", modelo: "hermes/x",
        });
        await publicarMensaje({ ...mensajeBase(), id: "md-21-abcd", t: "2026-10-04T09:00:00Z" });
        const feed = await leerFeedDirector({ desde: "2026-10-04T08:00:00Z" });
        expect(feed.mensajes.map((m) => m.id)).toEqual(["md-21-abcd"]);
        expect(feed.ultimoModelo).toBe("hermes/x");
    });
});
