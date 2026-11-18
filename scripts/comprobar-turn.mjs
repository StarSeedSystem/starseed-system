#!/usr/bin/env node
/**
 * scripts/comprobar-turn.mjs — ¿producción entrega un servidor TURN?
 *
 * Uso: node scripts/comprobar-turn.mjs [url-base]
 *   · url-base: raíz del despliegue a comprobar (por defecto http://localhost:3000).
 *
 * Pide la MISMA ruta que usa el cliente de llamadas: `GET /api/llamadas/ice`
 * (constante RUTA_SERVIDOR_ICE exportada por src/lib/llamadas/ice-servidor.ts; la lógica
 * es gemela de src/lib/llamadas/resumen-ice.ts). Imprime `turn=si|no urls=<n> turns=<n>` y,
 * si hay TURN, el esquema y host de cada servidor de retransmisión: nunca usuarios,
 * credenciales ni URLs completas. Sale con 0 si hay TURN y 2 si no lo hay.
 */

/** Igual que RUTA_ICE (src/lib/llamadas/ice.ts), reexportada por ice-servidor.ts. */
const RUTA = "/api/llamadas/ice";
const TOPE_MS = 10_000;

/** Igual que `esquemaYHost` en resumen-ice.ts: solo esquema y host. */
function esquemaYHost(url) {
    const m = /^(stun|stuns|turn|turns):([^?#/]+)/i.exec(url.trim());
    if (!m) return null;
    const corchete = /^\[([^\]]+)\]/.exec(m[2]);
    const host = corchete ? corchete[1] : m[2].split(":")[0] || "";
    return host ? `${m[1].toLowerCase()}:${host}` : null;
}

/** Igual que `resumenIce` en resumen-ice.ts (versión compacta para Node sin TS). */
function resumenIce(crudo) {
    let d = crudo && typeof crudo === "object" && !Array.isArray(crudo) && "iceServers" in crudo ? crudo.iceServers : crudo;
    if (d && typeof d === "object" && !Array.isArray(d)) d = [d];
    if (!Array.isArray(d)) d = [];
    const urls = [];
    for (const it of d) {
        if (!it || typeof it !== "object") continue;
        const brutas = Array.isArray(it.urls) ? it.urls : typeof it.urls === "string" ? [it.urls] : typeof it.url === "string" ? [it.url] : [];
        const tieneCred = typeof it.username === "string" && it.username.length > 0 && typeof it.credential === "string" && it.credential.length > 0;
        for (const u of brutas) {
            if (typeof u !== "string") continue;
            const esTurn = /^turns?:/i.test(u.trim());
            if (esTurn && !tieneCred) continue;
            urls.push(u);
        }
    }
    const hosts = [];
    const vistas = new Set();
    let turnUrls = 0;
    for (const u of urls) {
        if (!/^turns?:/i.test(u)) continue;
        turnUrls++;
        const h = esquemaYHost(u);
        // Deduplica por HOST, no por esquema: turn: y turns: del mismo servidor salen una vez.
        const clave = h ? h.split(":").slice(1).join(":") : null;
        if (h && clave && !vistas.has(clave)) {
            vistas.add(clave);
            hosts.push(h);
        }
    }
    return { turn: turnUrls > 0, urls: urls.length, turnUrls, hosts };
}

function imprimir(r) {
    console.log(`turn=${r.turn ? "si" : "no"} urls=${r.urls} turns=${r.turnUrls}`);
    for (const h of r.hosts) console.log(`  ${h}`);
}

async function pedir(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TOPE_MS);
    try {
        const r = await fetch(url, { method: "GET", cache: "no-store", headers: { accept: "application/json" }, signal: ctrl.signal });
        if (!r.ok) {
            console.error(`La ruta respondió ${r.status}.`);
            return null;
        }
        return await r.json();
    } catch (e) {
        const nombre = e && typeof e === "object" && "name" in e ? String(e.name) : "error";
        console.error(nombre === "AbortError" ? `Sin respuesta a tiempo (${TOPE_MS / 1000} s).` : `No se pudo contactar: ${nombre}.`);
        return null;
    } finally {
        clearTimeout(t);
    }
}

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const crudo = await pedir(`${base}${RUTA}`);
imprimir(resumenIce(crudo));
process.exit(resumenIce(crudo).turn ? 0 : 2);
