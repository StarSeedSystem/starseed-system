import assert from "node:assert/strict";
import { test } from "node:test";

import { crearApp, MOTORES, resolverModelo, unirCatalogos } from "../src/app.mjs";

const MOTORES_FALSOS = [
    { id: "bitnet", nombre: "BitNet", base: "http://b/v1" },
    { id: "ollama", nombre: "Ollama", base: "http://o/v1" },
];

function fetchFalso(rutas) {
    const llamadas = [];
    const f = async (url, init = {}) => {
        llamadas.push({ url, init });
        const r = rutas[url];
        if (!r) throw new Error("sin red");
        return new Response(JSON.stringify(typeof r === "function" ? r(init) : r), { status: 200, headers: { "content-type": "application/json" } });
    };
    f.llamadas = llamadas;
    return f;
}

const RUTAS = {
    "http://b/v1/models": { data: [{ id: "bitnet-b1.58-2b-4t" }] },
    "http://o/v1/models": { data: [{ id: "qwen2.5:0.5b" }, { id: "bitnet-b1.58-2b-4t" }] },
    "http://b/v1/chat/completions": (init) => ({ eco: JSON.parse(init.body).model, choices: [{ message: { content: "ok" } }] }),
};

test("une los catálogos con ids por motor y resuelve sin ambigüedad", () => {
    const cat = unirCatalogos([{ motor: MOTORES_FALSOS[0], modelos: [{ id: "a" }] }, { motor: MOTORES_FALSOS[1], modelos: [{ id: "a" }, { id: "b" }, null] }]);
    assert.deepEqual(cat.map((m) => m.id), ["bitnet/a", "ollama/a", "ollama/b"]);
    assert.deepEqual(resolverModelo("ollama/a", cat), { motor: "ollama", modelo: "a" });
    assert.deepEqual(resolverModelo("b", cat), { motor: "ollama", modelo: "b" });
    assert.equal(resolverModelo("a", cat), null); // dos motores lo tienen: hay que decir cuál
});

test("salud sin token; el resto pide Bearer cuando hay token", async () => {
    const app = crearApp({ token: "t0k", motores: MOTORES_FALSOS, fetchImpl: fetchFalso(RUTAS) });
    assert.equal((await app.request("/salud")).status, 200);
    assert.equal((await app.request("/v1/models")).status, 401);
    const r = await app.request("/v1/models", { headers: { Authorization: "Bearer t0k" } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).data.length, 3);
});

test("la conversación va al motor del modelo, con su nombre real", async () => {
    const f = fetchFalso(RUTAS);
    const app = crearApp({ motores: MOTORES_FALSOS, fetchImpl: f });
    const r = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "bitnet/bitnet-b1.58-2b-4t", messages: [{ role: "user", content: "hola" }] }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).eco, "bitnet-b1.58-2b-4t");
});

test("modelo desconocido o motor caído: error claro al estilo OpenAI", async () => {
    const app = crearApp({ motores: MOTORES_FALSOS, fetchImpl: fetchFalso(RUTAS) });
    const r = await app.request("/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "nada" }), headers: { "Content-Type": "application/json" } });
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error.code, "modelo_desconocido");
    const roto = crearApp({ motores: MOTORES_FALSOS, fetchImpl: fetchFalso({ ...RUTAS, "http://b/v1/chat/completions": undefined }) });
    const r2 = await roto.request("/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "bitnet/bitnet-b1.58-2b-4t" }), headers: { "Content-Type": "application/json" } });
    assert.equal(r2.status, 502);
});

test("los motores reales tienen ids y puertos únicos, bases locales en /v1, sin pisar 8000 ni 8787", () => {
    const ids = MOTORES.map((m) => m.id);
    const puertos = MOTORES.map((m) => new URL(m.base).port);
    assert.equal(new Set(ids).size, MOTORES.length);
    assert.equal(new Set(puertos).size, MOTORES.length);
    for (const m of MOTORES) {
        const u = new URL(m.base);
        assert.equal(u.hostname, "127.0.0.1");
        assert.ok(u.pathname.endsWith("/v1"));
        assert.ok(!["8000", "8787"].includes(u.port), `${m.id} pisa el puerto ${u.port}`);
    }
    assert.ok(ids.includes("powerinfer"));
    assert.ok(ids.includes("transformers"));
});

test("powerinfer lista SmallThinker y sale como powerinfer/<modelo>", async () => {
    const f = fetchFalso({ "http://127.0.0.1:8794/v1/models": { data: [{ id: "smallthinker-4b-a06b" }] } });
    const app = crearApp({ motores: MOTORES, fetchImpl: f });
    const r = await app.request("/v1/models");
    assert.equal(r.status, 200);
    const ids = (await r.json()).data.map((m) => m.id);
    assert.ok(ids.includes("powerinfer/smallthinker-4b-a06b"));
});
