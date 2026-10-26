/**
 * Pruebas del núcleo puro de la API de conectores (Ola 1019G · GCA1019Lb).
 * Se prueban las funciones PURE de `src/lib/genesis/conectores/sugerir-conector.ts` con puertos
 * FALSOS (sesión, bóveda y asignaciones inyectados): sin red, sin disco y SIN importar el
 * `route.ts` (reglas de test del repo: nada de mockear módulos de Node ni cargar rutas de API).
 * Contracto: architecture/genesis-conectores-abiertos.md §3–§4 y §10-L.
 */

import { describe, expect, it } from "vitest";
import {
    asignacionesSugeridas,
    atenderGet,
    atenderPost,
    huellaValor,
    leerAmbito,
    leerCuerpo,
    type EstadoConectores,
    type PuertosConectores,
} from "@/lib/genesis/conectores/sugerir-conector";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";

const LIMITE = { rpm: 30, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30 peticiones/min" };
const opcion = (id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo => ({
    id, nombre: id, tipo: "proveedor", papeles: ["escritor"], gratis: LIMITE, requiereCuenta: true,
    enlaceAlta: `https://alta.example/${id}`, enlaceClave: `https://claves.example/${id}`,
    variables: ["PRUEBA_API_KEY"], privacidad: "nube-sin-retencion", licencia: null,
    verificado: "2026-10-19", fuente: "prueba", ...extra });

const estado = (extra: Partial<EstadoConectores> = {}): EstadoConectores => ({
    cuenta: "u-1", ambito: "amb-1", catalogo: [opcion("g1"), opcion("l1", { privacidad: "local" })], contenedores: [], ...extra });

const puertos = (extra: Partial<PuertosConectores> = {}): PuertosConectores => ({
    permiso: async () => true,
    asignaciones: async () => [],
    vinculados: async () => new Set<string>(),
    vincular: async () => ({ ok: true, huella: "hh" }),
    asignar: async () => ({ ok: true }),
    ...extra,
});

const cadenasDe = (asignaciones: { clave: Papel; cadena: string[] }[]) =>
    Object.fromEntries(asignaciones.map((a) => [a.clave, a.cadena]));

describe("leerAmbito y leerCuerpo", () => {
    it("leerAmbito: acepta texto acotado y rechaza vacío, no-texto y desbordado", () => {
        expect(leerAmbito("amb-1")).toEqual({ ok: true, ambito: "amb-1" });
        expect(leerAmbito("")).toMatchObject({ ok: false });
        expect(leerAmbito(null)).toMatchObject({ ok: false });
        expect(leerAmbito("x".repeat(121))).toMatchObject({ ok: false });
    });

    it("leerCuerpo: vincular y asignar válidos pasan con sus campos saneados", () => {
        expect(leerCuerpo({ accion: "vincular", proveedor: "p-1", valor: "ssm_clave" }))
            .toEqual({ ok: true, cuerpo: { accion: "vincular", proveedor: "p-1", valor: "ssm_clave" } });
        expect(leerCuerpo({ accion: "asignar", clave: "escritor", cadena: ["g1", " g1 "] }))
            .toEqual({ ok: true, cuerpo: { accion: "asignar", clave: "escritor", cadena: ["g1", "g1"] } });
    });

    it("leerCuerpo: rechaza cuerpo inválido, campos que faltan, cadena sin ids y acción desconocida", () => {
        expect(leerCuerpo("no").ok).toBe(false);
        expect(leerCuerpo({ accion: "vincular", proveedor: "p-1" })).toMatchObject({ ok: false });
        expect(leerCuerpo({ accion: "vincular", proveedor: "p-1", valor: "" })).toMatchObject({ ok: false });
        expect(leerCuerpo({ accion: "asignar", clave: "escritor", cadena: [] })).toMatchObject({ ok: false });
        expect(leerCuerpo({ accion: "asignar", clave: "escritor", cadena: [42] })).toMatchObject({ ok: false });
        expect(leerCuerpo({ accion: "borrar" })).toMatchObject({ ok: false });
    });

    it("huellaValor: huella hexagonal estable que nunca revela el valor", () => {
        expect(huellaValor("ssm_clave")).toMatch(/^[0-9a-f]{64}$/);
        expect(huellaValor("ssm_clave")).toBe(huellaValor("ssm_clave"));
        expect(huellaValor("ssm_clave")).not.toContain("ssm");
    });
});

describe("asignacionesSugeridas", () => {
    it("una cadena por papel base, con las opciones gratis que lo cubren y sin tocar el catálogo", () => {
        const catalogo = [opcion("g1", { papeles: ["escritor", "chat"] }), opcion("de-pago", { gratis: null, papeles: ["escritor"] })];
        const s = asignacionesSugeridas(catalogo);
        expect(s.map((a) => a.clave)).toEqual(["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"]);
        expect(s.find((a) => a.clave === "escritor")!.cadena).toEqual(["g1"]); // el de pago fuera: sin presupuesto
        expect(s.find((a) => a.clave === "chat")!.cadena).toEqual(["g1"]);
        expect(s.every((a) => a.respaldo.length === 0 && a.preferencias.presupuesto === null)).toBe(true);
    });
});

describe("atenderGet", () => {
    it("sin permiso del ámbito responde 403 y no consulta nada", async () => {
        let preguntes = 0;
        const r = await atenderGet(estado(), puertos({ permiso: async () => false, asignaciones: async () => { preguntes += 1; return []; } }));
        expect(r.estado).toBe(403);
        expect(preguntes).toBe(0);
    });

    it("con permiso: catálogo sin lo local, sugerencias de sugerir.ts y asignaciones del ámbito", async () => {
        const r = await atenderGet(estado(), puertos());
        expect(r.estado).toBe(200);
        expect((r.cuerpo.catalogo as OpcionCatalogo[]).map((o) => o.id)).toEqual(["g1"]);
        expect((r.cuerpo.sugerencias as { clave: string }[]).map((g) => g.clave)).toEqual(["local-por-activar", "gratis-por-vincular", "sin-opcion"]);
        expect(cadenasDe(r.cuerpo.asignaciones as { clave: Papel; cadena: string[] }[])["escritor"]).toEqual(["g1"]);
    });

    it("si el ámbito tiene asignaciones guardadas, se usan esas y no las sugeridas", async () => {
        const guardadas: { clave: Papel; cadena: string[]; respaldo: string[]; preferencias: { localPrimero: boolean; privacidad: "desconocida"; presupuesto: null } }[] = [{ clave: "chat", cadena: ["g1"], respaldo: [], preferencias: { localPrimero: true, privacidad: "desconocida", presupuesto: null } }];
        const r = await atenderGet(estado(), puertos({ asignaciones: async () => guardadas }));
        expect(r.cuerpo.asignaciones).toEqual(guardadas);
    });
});

describe("atenderPost · vincular", () => {
    it("sin permiso responde 403 y no toca la bóveda", async () => {
        let toques = 0;
        const r = await atenderPost({ accion: "vincular", proveedor: "p-1", valor: "secreto" },
            estado(), puertos({ permiso: async () => false, vincular: async () => { toques += 1; return { ok: true, huella: "h" }; } }));
        expect(r.estado).toBe(403);
        expect(toques).toBe(0);
    });

    it("vincula con la bóveda y responde SOLO la huella: el valor jamás sale", async () => {
        let guardado: { proveedor: string | null; valor: string | null } = { proveedor: null, valor: null };
        const r = await atenderPost({ accion: "vincular", proveedor: "p-1", valor: "ssm_secreto" },
            estado(), puertos({ vincular: async (p, v) => { guardado = { proveedor: p, valor: v }; return { ok: true, huella: huellaValor(v) }; } }));
        expect(r.estado).toBe(201);
        expect(guardado).toEqual({ proveedor: "p-1", valor: "ssm_secreto" });
        expect(r.cuerpo).toEqual({ accion: "vincular", proveedor: "p-1", huella: huellaValor("ssm_secreto"), ambito: "amb-1" });
        expect(JSON.stringify(r.cuerpo)).not.toContain("ssm_secreto");
        expect(Object.keys(r.cuerpo)).not.toContain("valor");
    });

    it("un fallo de la bóveda responde su error; un fallo del medio (sin bóveda) es 503", async () => {
        const fallo = await atenderPost({ accion: "vincular", proveedor: "p-1", valor: "x" },
            estado(), puertos({ vincular: async () => ({ ok: false, error: "No se pudo guardar en la bóveda." }) }));
        expect(fallo).toEqual({ estado: 400, cuerpo: { error: "No se pudo guardar en la bóveda." } });
        const medio = await atenderPost({ accion: "vincular", proveedor: "p-1", valor: "x" },
            estado(), puertos({ vincular: async () => ({ ok: false, error: "Bóveda no configurada" }) }));
        expect(medio.estado).toBe(503);
    });
});

describe("atenderPost · asignar", () => {
    it("una cadena de ids ajenos al catálogo se rechaza con 400 y sin guardar", async () => {
        let guardados: string[] | null = null;
        const r = await atenderPost({ accion: "asignar", clave: "escritor", cadena: ["falta", "otro"] },
            estado(), puertos({ asignar: async (_c, cadena) => { guardados = cadena; return { ok: true }; } }));
        expect(r.estado).toBe(400);
        expect(guardados).toBeNull();
    });

    it("guarda la cadena con los ids válidos y sin repetidos, y responde la cadena limpia", async () => {
        let llamada: { clave: string | null; cadena: string[] | null } = { clave: null, cadena: null };
        const r = await atenderPost({ accion: "asignar", clave: "escritor", cadena: ["g1", "g1"] },
            estado(), puertos({ asignar: async (c, cadena) => { llamada = { clave: c, cadena }; return { ok: true }; } }));
        expect(r.estado).toBe(200);
        expect(llamada).toEqual({ clave: "escritor", cadena: ["g1"] });
        expect(r.cuerpo).toEqual({ accion: "asignar", clave: "escritor", cadena: ["g1"], ambito: "amb-1", ok: true });
    });

    it("un fallo al guardar responde 400 con el motivo legible", async () => {
        const r = await atenderPost({ accion: "asignar", clave: "escritor", cadena: ["g1"] },
            estado(), puertos({ asignar: async () => ({ ok: false, error: "El permiso del ámbito impidió la fila." }) }));
        expect(r).toEqual({ estado: 400, cuerpo: { error: "El permiso del ámbito impidió la fila." } });
    });
});
