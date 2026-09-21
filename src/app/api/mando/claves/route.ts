/**
 * /api/mando/claves (Ola 286 · 2026-09-08 · F1) — SOLO local
 * ─────────────────────────────────────────────────────────────────────────────
 * POST {accion}: "guardar" (proveedor, variable, valor → prueba la clave ANTES
 * de guardarla), "probar" (proveedor, valor) y "olvidar" (variable). La puerta
 * es el guardián común de `/api/mando/*`: 404 fuera de local. La respuesta —
 * y por tanto el cliente — NUNCA recibe el valor de la clave, solo su huella y
 * el resultado de la prueba. El cuerpo de la petición no se registra en ningún
 * log.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { identificarClaveEntrante, variablePermitida } from "@/lib/mando/claves-agregador";
import { guardarClave, olvidarClave, probarClave, validarClaveDeProveedor } from "@/lib/mando/claves-servidor";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PeticionClave {
    accion?: unknown;
    proveedor?: unknown;
    variable?: unknown;
    valor?: unknown;
    clave?: unknown;
    forzar?: unknown;
}

async function baseDe(proveedor: string): Promise<string | null> {
    const info = PROVEEDORES_CATALOGO.find((p) => p.id === proveedor);
    if (info) return info.base;
    const m = /^STARSEED_PASARELA_([A-Z0-9]+)$/.exec(proveedor);
    return m ? process.env[`STARSEED_PASARELA_${m[1]}_URL`] ?? null : null;
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    let cuerpo: PeticionClave;
    try {
        cuerpo = (await request.json()) as PeticionClave;
    } catch {
        return Response.json({ error: "Cuerpo JSON no válido." }, { status: 400 });
    }

    const proveedor = typeof cuerpo.proveedor === "string" ? cuerpo.proveedor : "";
    const valor = typeof cuerpo.valor === "string" ? cuerpo.valor : "";
    const variable = typeof cuerpo.variable === "string" ? cuerpo.variable : "";

    switch (cuerpo.accion) {
        case "identificar": {
            const clave = (typeof cuerpo.clave === "string" && cuerpo.clave) || valor;
            if (!clave) return Response.json({ error: "Falta la clave a identificar." }, { status: 400 });
            return Response.json({ ok: true, ...identificarClaveEntrante(clave, variable || undefined) });
        }
        case "probar": {
            if (!proveedor || !valor) return Response.json({ error: "Faltan «proveedor» o «valor»." }, { status: 400 });
            const base = await baseDe(proveedor);
            if (!base) return Response.json({ error: `Proveedor desconocido: ${proveedor}.` }, { status: 400 });
            const valido = validarClaveDeProveedor(proveedor, valor);
            if (!valido.ok) return Response.json({ ok: false, error: valido.error });
            return Response.json(await probarClave(base, valor));
        }
        case "guardar": {
            if (!proveedor || !variable || !valor) return Response.json({ error: "Faltan datos." }, { status: 400 });
            if (!variablePermitida(variable)) return Response.json({ ok: false, error: "variable no reconocida" }, { status: 400 });
            const valido = validarClaveDeProveedor(proveedor, valor);
            if (!valido.ok) return Response.json({ ok: false, error: valido.error });
            const base = await baseDe(proveedor);
            if (base && cuerpo.forzar !== true) {
                const prueba = await probarClave(base, valor);
                if (!prueba.ok) return Response.json({ ok: false, error: prueba.error, prueba });
            }
            const g = await guardarClave(proveedor, variable, valor);
            return g.ok ? Response.json({ ok: true, huella: g.huella }) : Response.json({ ok: false, error: g.error });
        }
        case "olvidar": {
            if (!variable) return Response.json({ error: "Falta «variable»." }, { status: 400 });
            if (!variablePermitida(variable)) return Response.json({ ok: false, error: "variable no reconocida" }, { status: 400 });
            return Response.json(await olvidarClave(variable));
        }
        default:
            return Response.json({ error: "Acción desconocida." }, { status: 400 });
    }
}

export async function DELETE(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    let variable = new URL(request.url).searchParams.get("variable") ?? "";
    if (!variable) {
        try {
            const body = (await request.json()) as { variable?: unknown };
            if (typeof body.variable === "string") variable = body.variable;
        } catch {}
    }
    if (!variable) return Response.json({ error: "Falta «variable»." }, { status: 400 });
    if (!variablePermitida(variable)) return Response.json({ ok: false, error: "variable no reconocida" }, { status: 400 });
    return Response.json(await olvidarClave(variable));
}