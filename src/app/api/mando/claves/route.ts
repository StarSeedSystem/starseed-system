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
import {
    guardarClave,
    huellaClave,
    olvidarClave,
    probarClave,
    validarClaveDeProveedor,
} from "@/lib/mando/claves-servidor";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PeticionClave {
    accion?: unknown;
    proveedor?: unknown;
    variable?: unknown;
    valor?: unknown;
    forzar?: unknown;
}

/** Base de API de un proveedor del catálogo, o la URL de una pasarela ya declarada. */
async function baseDe(proveedor: string): Promise<string | null> {
    const info = PROVEEDORES_CATALOGO.find((p) => p.id === proveedor);
    if (info) return info.base;
    // Pasarelas declaradas por entorno: su id es «STARSEED_PASARELA_<NOMBRE>».
    const m = /^STARSEED_PASARELA_([A-Z0-9]+)$/.exec(proveedor);
    if (m) {
        return process.env[`STARSEED_PASARELA_${m[1]}_URL`] ?? null;
    }
    return null;
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
        case "probar": {
            if (!proveedor || !valor) {
                return Response.json({ error: "Faltan «proveedor» o «valor»." }, { status: 400 });
            }
            const base = await baseDe(proveedor);
            if (!base) return Response.json({ error: `Proveedor desconocido: ${proveedor}.` }, { status: 400 });
            const valido = validarClaveDeProveedor(proveedor, valor);
            if (!valido.ok) return Response.json({ ok: false, error: valido.error });
            return Response.json(await probarClave(base, valor));
        }
        case "guardar": {
            if (!proveedor || !variable || !valor) {
                return Response.json({ error: "Faltan «proveedor», «variable» o «valor»." }, { status: 400 });
            }
            const valido = validarClaveDeProveedor(proveedor, valor);
            if (!valido.ok) return Response.json({ ok: false, error: valido.error });
            const forzar = cuerpo.forzar === true;
            let prueba: { ok: boolean; modelos?: number; error?: string } = { ok: true };
            const base = await baseDe(proveedor);
            if (base && !forzar) {
                prueba = await probarClave(base, valor);
                if (!prueba.ok) {
                    return Response.json({ ok: false, error: prueba.error, prueba });
                }
            }
            const guardado = await guardarClave(proveedor, variable, valor);
            if (!guardado.ok) return Response.json({ ok: false, error: guardado.error });
            return Response.json({ ok: true, huella: guardado.huella, prueba });
        }
        case "olvidar": {
            if (!variable) return Response.json({ error: "Falta «variable»." }, { status: 400 });
            return Response.json(await olvidarClave(variable));
        }
        default:
            return Response.json({ error: "Acción desconocida: usa guardar, probar u olvidar." }, { status: 400 });
    }
}