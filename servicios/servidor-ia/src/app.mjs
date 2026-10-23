/**
 * Servidor propio de IA de una neurona, sobre Hono (2026-10-23).
 *
 * Es el plano de datos de la topología «Un servidor propio para toda mi IA» de Recursos de IA
 * (architecture/recursos-ia-neurona.md §2 y §7): la neurona que procesa une sus motores locales —
 * BitNet 1.58 (llama-server en :8790), Ollama, TurboFieldfare (:8080), LM Studio y Laya (decisiones)
 * — tras UNA API compatible con OpenAI, y las demás neuronas de la cuenta la usan por la malla
 * local o la red de StarSeed. Hono porque corre igual en Node, Bun, Deno y Workers: el mismo
 * servidor vale para la Mac, el A1 de Oracle, un Raspberry o un borde en la nube.
 *
 * Seguridad: sin token solo escucha en 127.0.0.1 (lo decide bin/servidor-ia.mjs); con token, todo
 * lo que no es /salud pide `Authorization: Bearer <token>`. Los modelos se nombran
 * `<motor>/<modelo>` para que dos motores con el mismo nombre no se pisen.
 */
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { cors } from "hono/cors";

export const VERSION = "1.0.0";

/** Motores que conoce (todos en el bucle local de la neurona). */
export const MOTORES = [
    { id: "bitnet", nombre: "BitNet 1.58 (Astraura)", base: "http://127.0.0.1:8790/v1" },
    { id: "turbo-fieldfare", nombre: "TurboFieldfare · Gemma 4 26B-A4B", base: "http://127.0.0.1:8080/v1" },
    { id: "ollama", nombre: "Ollama", base: "http://127.0.0.1:11434/v1" },
    { id: "lmstudio", nombre: "LM Studio", base: "http://127.0.0.1:1234/v1" },
];
export const LAYA = "http://127.0.0.1:4470/v1/systemone";
const CATALOGO_MS = 30_000;
const SONDA_MS = 1_500;

/** Une los catálogos de cada motor en uno, con ids `<motor>/<modelo>`. PURA. */
export function unirCatalogos(porMotor) {
    const data = [];
    for (const { motor, modelos } of porMotor) {
        for (const m of modelos || []) {
            if (!m || typeof m.id !== "string") continue;
            data.push({ id: `${motor.id}/${m.id}`, object: "model", owned_by: motor.id, motor: motor.nombre });
        }
    }
    return data;
}

/** ¿Qué motor sirve este modelo? Acepta `<motor>/<modelo>` o el nombre a secas si no es ambiguo. PURA. */
export function resolverModelo(id, catalogo) {
    if (typeof id !== "string" || !id) return null;
    const exacto = catalogo.find((m) => m.id === id);
    if (exacto) return { motor: exacto.owned_by, modelo: id.slice(exacto.owned_by.length + 1) };
    const sueltos = catalogo.filter((m) => m.id.endsWith(`/${id}`));
    return sueltos.length === 1 ? { motor: sueltos[0].owned_by, modelo: id } : null;
}

function errorOpenAI(c, estado, mensaje, codigo) {
    return c.json({ error: { message: mensaje, type: "invalid_request_error", code: codigo } }, estado);
}

export function crearApp({ token = "", motores = MOTORES, fetchImpl = fetch, origenes = [], laya = LAYA } = {}) {
    const app = new Hono();
    let cache = { t: 0, data: [] };

    async function catalogo(fresco = false) {
        if (!fresco && Date.now() - cache.t < CATALOGO_MS) return cache.data;
        const porMotor = await Promise.all(
            motores.map(async (motor) => {
                try {
                    const r = await fetchImpl(`${motor.base}/models`, { signal: AbortSignal.timeout(SONDA_MS) });
                    if (!r.ok) return { motor, modelos: [] };
                    const j = await r.json();
                    return { motor, modelos: Array.isArray(j?.data) ? j.data : [] };
                } catch {
                    return { motor, modelos: [] };
                }
            }),
        );
        cache = { t: Date.now(), data: unirCatalogos(porMotor) };
        return cache.data;
    }

    // Navegadores de la cuenta (la web del OS) pueden llamarlo; el resto, solo de máquina a máquina.
    app.use("*", cors({ origin: (o) => (origenes.includes(o) ? o : ""), allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "OPTIONS"] }));
    app.get("/salud", (c) => c.json({ ok: true, servicio: "servidor-ia", version: VERSION, con_token: Boolean(token) }));
    if (token) {
        app.use("/v1/*", bearerAuth({ token }));
        app.use("/motores", bearerAuth({ token }));
    }

    app.get("/motores", async (c) => {
        const data = await catalogo(c.req.query("fresco") === "1");
        return c.json({
            motores: motores.map((m) => ({ id: m.id, nombre: m.nombre, modelos: data.filter((x) => x.owned_by === m.id).length })),
        });
    });

    app.get("/v1/models", async (c) => c.json({ object: "list", data: await catalogo() }));

    app.post("/v1/chat/completions", async (c) => {
        let cuerpo;
        try {
            cuerpo = await c.req.json();
        } catch {
            return errorOpenAI(c, 400, "El cuerpo no es JSON.", "json_invalido");
        }
        const destino = resolverModelo(cuerpo?.model, await catalogo());
        if (!destino) return errorOpenAI(c, 404, `Ningún motor de esta neurona sirve «${cuerpo?.model ?? ""}».`, "modelo_desconocido");
        const motor = motores.find((m) => m.id === destino.motor);
        try {
            const r = await fetchImpl(`${motor.base}/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...cuerpo, model: destino.modelo }),
            });
            // Se devuelve tal cual (también en flujo, `stream: true`): el cuerpo pasa sin copiarse.
            return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("content-type") || "application/json" } });
        } catch {
            return errorOpenAI(c, 502, `${motor.nombre} no contesta ahora.`, "motor_caido");
        }
    });

    // Decisiones tipadas (contrato openjev) con Laya local: lo mismo que /api/jev/systemone.
    app.post("/v1/systemone", async (c) => {
        try {
            const r = await fetchImpl(laya, { method: "POST", headers: { "Content-Type": "application/json" }, body: await c.req.text() });
            return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json" } });
        } catch {
            return errorOpenAI(c, 502, "Laya no contesta en esta neurona.", "motor_caido");
        }
    });

    return app;
}
