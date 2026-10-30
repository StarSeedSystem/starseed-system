/**
 * Pruebas del ejecutor de compartir (XR1010S): node, sin red, dependencias falsas.
 * `import { describe, it, expect } from "vitest"` — aquí `globals` está en false.
 */
import { describe, it, expect } from "vitest";
import { ejecutarCompartir, type DepsCompartir } from "../ejecutor-compartir";
import { consentimiento, type Consentimiento } from "@/lib/xr/privacidad";
import type { PasoVoz, RefResuelta } from "@/lib/xr/intenciones-tipos";
import type { Sala } from "@/lib/salas/sala";

const AHORA = 1_800_000_000_000;

const escena = (rol: "dueno" | "editor" | "observador"): Sala => ({
    id: "s1", tipo: "escena3d", titulo: "Bosque nocturno", visibilidad: "privada",
    transporte: "local", miembros: { yo: rol }, creadaEn: AHORA,
});

const SEIS = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, nombre: `Persona ${i + 1}` }));
const grupo = (id = "g-banda", nombre = "Banda"): RefResuelta => ({ tipo: "grupo", id, nombre });
const persona = (id: string, nombre: string): RefResuelta => ({ tipo: "persona", id, nombre });

interface Registro { acceso?: string; idsAcceso?: string[]; publicado?: { visibilidad: string; grupoId: string | null }; mensajeIds?: string[]; estacion?: boolean }

const base = (registro: Registro = {}): DepsCompartir => ({
    sala: escena("dueno"),
    miembrosDeGrupo: async () => SEIS,
    concederAcceso: async (_refId, ids, permiso) => { registro.acceso = permiso; registro.idsAcceso = ids; return ids.length; },
    enviarMensaje: async (ids) => { registro.mensajeIds = ids; return ids.length; },
    guardarBiblioteca: async () => ({ ok: true, id: "item-1" }),
    subirEstacion: async (d) => { registro.estacion = d.nueva; return { ok: true, id: d.nueva ? "est-nueva" : "cumbre" }; },
    publicar: async (d) => { registro.publicado = { visibilidad: d.visibilidad, grupoId: d.grupoId }; return { ok: true }; },
});

const puesta = (deps: DepsCompartir, extra: Partial<Parameters<typeof ejecutarCompartir>[1]> = {}) =>
    ({ refId: "sc1", usuario: "yo", ahora: AHORA, consentimientos: [] as Consentimiento[], confirmado: true, deps, ...extra });

const pasoDe = (intencion: PasoVoz["intencion"]): PasoVoz => ({ intencion, capa: "reflejo" });

describe("ejecutarCompartir · invitar", () => {
    it("invitar a 6 miembros logra 6 de 6, con permiso de editar y un mensaje a cada uno", async () => {
        const reg: Registro = {};
        const r = await ejecutarCompartir(pasoDe({ tipo: "invitar", a: [grupo()], sobre: "lo-creado" }), puesta(base(reg)));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.logradas).toBe(6);
        expect(r.total).toBe(6);
        expect(r.resumen).toContain("6 de 6");
        expect(reg.acceso).toBe("editar");
        expect(reg.idsAcceso).toHaveLength(6);
        expect(reg.mensajeIds).toHaveLength(6);
    });

    it("un observador no puede invitar", async () => {
        const deps = { ...base(), sala: escena("observador") };
        const r = await ejecutarCompartir(pasoDe({ tipo: "invitar", a: [grupo()], sobre: "lo-creado" }), puesta(deps));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.motivo).toContain("dueño o un editor");
    });

    it("grupo cuya lectura de miembros falla dice la verdad y no invita a nadie", async () => {
        const reg: Registro = {};
        const deps = { ...base(reg), miembrosDeGrupo: async () => [] };
        const r = await ejecutarCompartir(pasoDe({ tipo: "invitar", a: [grupo("g-x", "Banda")], sobre: "lo-creado" }), puesta(deps));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.motivo).toBe("No puedo leer los miembros de «Banda» desde aquí todavía");
        expect(reg.acceso).toBeUndefined();
    });

    it("invitar sin confirmar se niega (sale de la cuenta)", async () => {
        const r = await ejecutarCompartir(pasoDe({ tipo: "invitar", a: [grupo()], sobre: "lo-creado" }), puesta(base(), { confirmado: undefined }));
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.motivo).toBe("Falta tu confirmación");
    });

    it("la frase que pidió lector concede permiso «ver»", async () => {
        const reg: Registro = {};
        await ejecutarCompartir(pasoDe({ tipo: "invitar", a: [grupo()], sobre: "lo-creado" }), puesta(base(reg), { soloLectura: true }));
        expect(reg.acceso).toBe("ver");
    });
});

describe("ejecutarCompartir · subir", () => {
    it("súbelo a la Biblioteca SIN confirmar funciona (es tuyo)", async () => {
        const deps = { ...base(), guardarBiblioteca: async () => ({ ok: true, id: "item-9" }) };
        const r = await ejecutarCompartir(pasoDe({ tipo: "subir", destino: { donde: "biblioteca" }, sobre: "lo-creado" }), puesta(deps, { confirmado: undefined }));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.resumen).toContain("Bosque nocturno");
    });

    it("publicar para todo el mundo sin consentimiento queda bloqueado", async () => {
        const reg: Registro = {};
        const r = await ejecutarCompartir(pasoDe({ tipo: "subir", destino: { donde: "publicacion", visibilidad: "publica", ref: null }, sobre: "lo-creado" }), puesta(base(reg)));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.requiere).toBe("consentimiento");
        expect(reg.publicado).toBeUndefined();
    });

    it("publicar para todo el mundo CON consentimiento vigente publica", async () => {
        const reg: Registro = {};
        const consentimientos: Consentimiento[] = [consentimiento("mundo-spec", "sala-publica", AHORA - 1000)];
        const r = await ejecutarCompartir(pasoDe({ tipo: "subir", destino: { donde: "publicacion", visibilidad: "publica", ref: null }, sobre: "lo-creado" }), puesta(base(reg), { consentimientos }));
        expect(r.ok).toBe(true);
        expect(reg.publicado).toEqual({ visibilidad: "publica", grupoId: null });
    });

    it("publicar para mi grupo lleva el grupo al servicio de publicaciones", async () => {
        const reg: Registro = {};
        const r = await ejecutarCompartir(pasoDe({ tipo: "subir", destino: { donde: "publicacion", visibilidad: "grupo", ref: grupo() }, sobre: "lo-creado" }), puesta(base(reg)));
        expect(r.ok).toBe(true);
        expect(reg.publicado).toEqual({ visibilidad: "grupo", grupoId: "g-banda" });
    });

    it("una estación nueva se crea (no pregunta, ya se confirmó)", async () => {
        const reg: Registro = {};
        const r = await ejecutarCompartir(pasoDe({ tipo: "subir", destino: { donde: "estacion", ref: null, nueva: true }, sobre: "lo-creado" }), puesta(base(reg)));
        expect(r.ok).toBe(true);
        expect(reg.estacion).toBe(true);
    });

    it("«mándalo a Ana y a Luis» manda el mensaje a dos personas", async () => {
        const reg: Registro = {};
        const r = await ejecutarCompartir(pasoDe({ tipo: "subir", destino: { donde: "mensaje", para: [persona("ana", "Ana"), persona("luis", "Luis")] }, sobre: "lo-creado" }), puesta(base(reg)));
        expect(r.ok).toBe(true);
        expect(reg.mensajeIds).toEqual(["ana", "luis"]);
    });

    it("una orden que no es de compartir no se ejecuta", async () => {
        const r = await ejecutarCompartir(pasoDe({ tipo: "sistema", orden: "recentrar" }), puesta(base()));
        expect(r.ok).toBe(false);
    });
});
