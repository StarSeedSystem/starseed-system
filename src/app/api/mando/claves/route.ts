/**
 * /api/mando/claves (AGR2c · 2026-09-20) — SOLO local / Mando
 * TODO: Integrar permisos.ts cuando existan permisos sobre el Mando. Por ahora guardianMando exige maquina local.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { identificarClaveEntrante, obtenerResumenClavesConfiguradas, proveedorPermitido, variablePermitida } from "@/lib/mando/claves-agregador";
import { guardarClave, olvidarClave, probarClave, validarClaveDeProveedor } from "@/lib/mando/claves-servidor";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RE_VAR = /^[A-Z][A-Z0-9_]{1,60}$/;

interface BodyClave {
    accion?: string; proveedor?: string; variable?: string; valor?: string; clave?: string; forzar?: boolean;
}

async function baseDe(proveedor: string): Promise<string | null> {
    const info = PROVEEDORES_CATALOGO.find((p) => p.id === proveedor);
    if (info) return info.base;
    const m = /^STARSEED_PASARELA_([A-Z0-9]+)$/.exec(proveedor);
    return m ? process.env[`STARSEED_PASARELA_${m[1]}_URL`] ?? null : null;
}

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    return Response.json({ ok: true, claves: obtenerResumenClavesConfiguradas(process.env, PROVEEDORES_CATALOGO) });
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    let body: BodyClave;
    try { body = (await request.json()) as BodyClave; } catch { return Response.json({ error: "Cuerpo JSON no válido." }, { status: 400 }); }

    const valClave = typeof body.clave === "string" ? body.clave : typeof body.valor === "string" ? body.valor : "";
    const accion = typeof body.accion === "string" ? body.accion : valClave ? "guardar" : "";
    const varManual = typeof body.variable === "string" ? body.variable : "";
    const provManual = typeof body.proveedor === "string" ? body.proveedor : "";

    if (accion === "identificar") {
        if (!valClave) return Response.json({ error: "Falta la clave a identificar." }, { status: 400 });
        return Response.json({ ok: true, ...identificarClaveEntrante(valClave, varManual || undefined) });
    }

    if (accion === "probar") {
        if (!provManual || !valClave) return Response.json({ error: "Faltan datos para probar." }, { status: 400 });
        if (!proveedorPermitido(provManual)) return Response.json({ error: "Proveedor no permitido." }, { status: 400 });
        const base = await baseDe(provManual);
        if (!base) return Response.json({ error: `Proveedor desconocido: ${provManual}.` }, { status: 400 });
        const valRes = validarClaveDeProveedor(provManual, valClave);
        if (!valRes.ok) return Response.json({ ok: false, error: valRes.error });
        return Response.json(await probarClave(base, valClave));
    }

    if (accion === "olvidar") {
        if (!varManual || !variablePermitida(varManual) || !RE_VAR.test(varManual)) {
            return Response.json({ error: "Variable no permitida o no válida." }, { status: 400 });
        }
        return Response.json(await olvidarClave(varManual));
    }

    if (accion === "guardar") {
        if (!valClave) return Response.json({ error: "Falta la clave o valor." }, { status: 400 });
        const ident = identificarClaveEntrante(valClave, varManual || undefined);
        const proveedor = provManual || ident.proveedor;
        const variable = varManual || ident.variable;

        if (!variablePermitida(variable) || !RE_VAR.test(variable)) {
            return Response.json({ ok: false, error: "variable no reconocida o no permitida" }, { status: 400 });
        }
        if (!proveedorPermitido(proveedor)) {
            return Response.json({ ok: false, error: "proveedor no reconocido o no permitido" }, { status: 400 });
        }

        const valRes = validarClaveDeProveedor(proveedor, valClave);
        if (!valRes.ok) return Response.json({ ok: false, error: valRes.error });

        const base = await baseDe(proveedor);
        if (base && body.forzar !== true) {
            const prueba = await probarClave(base, valClave);
            if (!prueba.ok) return Response.json({ ok: false, error: prueba.error, prueba });
        }

        const g = await guardarClave(proveedor, variable, valClave);
        return g.ok
            ? Response.json({ ok: true, proveedor, variable, huella: g.huella, guardada: true })
            : Response.json({ ok: false, error: g.error }, { status: 500 });
    }

    return Response.json({ error: "Acción desconocida." }, { status: 400 });
}

export async function DELETE(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    let variable = new URL(request.url).searchParams.get("variable") ?? "";
    if (!variable) {
        try {
            const body = (await request.json()) as { variable?: string };
            if (typeof body.variable === "string") variable = body.variable;
        } catch {}
    }
    if (!variable || !variablePermitida(variable) || !RE_VAR.test(variable)) {
        return Response.json({ error: "Variable no permitida o no válida." }, { status: 400 });
    }
    const r = await olvidarClave(variable);
    return r.ok ? Response.json({ ok: true, variable, borrada: true }) : Response.json({ ok: false, error: r.error }, { status: 500 });
}
