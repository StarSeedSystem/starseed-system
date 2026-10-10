/**
 * /api/metagenesis/orden (OPA1011): solo miembros, lista blanca, tope por hora, firma en el servidor
 * y nada del usuario en claro en el bus (que lo puede leer cualquiera).
 */
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { procesarOrden, tokenDeCabecera, _reiniciarLimites, ORDENES_POR_HORA, type DepsOrden } from "../remoto-orden-servidor";
import { textoAFirmar } from "../remoto-nodos";

const SECRETO = "secreto-de-prueba-del-servidor";
const TOKEN = "token.de.prueba.largo.0123456789";
const AHORA = Date.parse("2026-10-10T12:00:00.456Z");

function deps(extra: Partial<DepsOrden> = {}) {
    const insertadas: Array<Parameters<DepsOrden["insertarBus"]>[0]> = [];
    const d: DepsOrden = {
        verificarUsuario: async (t) => (t === TOKEN ? { id: "11111111-2222-3333-4444-555555555555" } : null),
        esMiembro: async () => true,
        insertarBus: async (f) => {
            insertadas.push(f);
            return true;
        },
        secreto: SECRETO,
        ahora: () => AHORA,
        nonce: () => "nonce-de-prueba-01",
        ...extra,
    };
    return { d, insertadas };
}

describe("procesarOrden", () => {
    beforeEach(() => _reiniciarLimites());

    it("firma, publica en el bus y no deja el id de la cuenta en claro", async () => {
        const { d, insertadas } = deps();
        const r = await procesarOrden({ accion: "revisar_bloqueadas" }, TOKEN, d);
        expect(r).toEqual({ status: 200, body: { ok: true, nonce: "nonce-de-prueba-01" } });
        expect(insertadas).toHaveLength(1);
        const o = insertadas[0].datos;
        expect(insertadas[0].tipo).toBe("mg_orden");
        expect(o).toMatchObject({ v: "1", accion: "revisar_bloqueadas", para: "lider", t: "2026-10-10T12:00:00Z", args: {} });
        expect(o.firma).toBe(createHmac("sha256", SECRETO).update(textoAFirmar(o)).digest("hex"));
        expect(JSON.stringify(insertadas)).not.toContain("11111111-2222");
        expect(o.por).toMatch(/^cuenta:[0-9a-f]{10}$/);
    });

    it("sin sesión 401, sesión falsa 401, no miembro 403, acceso sin comprobar 503", async () => {
        expect((await procesarOrden({ accion: "continuar" }, null, deps().d)).status).toBe(401);
        expect((await procesarOrden({ accion: "continuar" }, "otro.token.cualquiera.0000000", deps().d)).status).toBe(401);
        expect((await procesarOrden({ accion: "continuar" }, TOKEN, deps({ esMiembro: async () => false }).d)).status).toBe(403);
        expect((await procesarOrden({ accion: "continuar" }, TOKEN, deps({ esMiembro: async () => null }).d)).status).toBe(503);
    });

    it("lista blanca: acción, destino y argumentos", async () => {
        const { d, insertadas } = deps();
        expect((await procesarOrden({ accion: "borrar_todo" }, TOKEN, d)).status).toBe(400);
        expect((await procesarOrden({ accion: "continuar", para: "../../" }, TOKEN, d)).status).toBe(400);
        expect((await procesarOrden({ accion: "lanzar_cola", args: { cola: "cola-x; rm -rf /" } }, TOKEN, d)).body.error).toMatch(/valor no admitido|cola no válido/);
        expect(insertadas).toHaveLength(0);
    });

    it("sin el secreto en este servidor lo dice (y no publica nada sin firma)", async () => {
        const { d, insertadas } = deps({ secreto: "" });
        const r = await procesarOrden({ accion: "continuar" }, TOKEN, d);
        expect(r.status).toBe(503);
        expect(r.body.sinSecreto).toBe(true);
        expect(insertadas).toHaveLength(0);
    });

    it(`como mucho ${ORDENES_POR_HORA} por hora y cuenta; un fallo del bus es 502`, async () => {
        const { d } = deps();
        for (let i = 0; i < ORDENES_POR_HORA; i++) expect((await procesarOrden({ accion: "continuar" }, TOKEN, d)).status).toBe(200);
        expect((await procesarOrden({ accion: "continuar" }, TOKEN, d)).status).toBe(429);
        _reiniciarLimites();
        expect((await procesarOrden({ accion: "continuar" }, TOKEN, deps({ insertarBus: async () => false }).d)).status).toBe(502);
    });

    it("token solo de la cabecera Bearer", () => {
        expect(tokenDeCabecera(`Bearer ${TOKEN}`)).toBe(TOKEN);
        expect(tokenDeCabecera("Basic abc")).toBeNull();
        expect(tokenDeCabecera(null)).toBeNull();
    });
});
