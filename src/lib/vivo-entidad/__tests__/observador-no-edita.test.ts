import { describe, it, expect } from "vitest";
import { MotorColab } from "@/lib/vivo/tabla/motor-colab";
import { pizarraVacia, type DocPizarra } from "@/lib/vivo/pizarra";
import { rangoDeSesion, puedeEditarSesion } from "@/lib/vivo-entidad/traduccion-roles";
import { depsPizarra } from "@/lib/vivo/pizarra-motor";

// Simple in-memory clock that executes scheduled callbacks immediately.
class ImmediateReloj {
    t = 0;
    id = 0;
    queue: (() => void)[] = [];
    ahora = () => this.t;
    poner = (_: () => void, __: number) => {
        this.id += 1;
        this.queue.push(_);
        return this.id;
    };
    quitar = (_: unknown) => {};
}

async function runAll(reloj: ImmediateReloj) {
    while (reloj.queue.length) {
        const f = reloj.queue.shift()!;
        f();
    }
}

function blockRecord(uid: string, time = Date.now()): any {
    return {
        id: "b1",
        v: {
            id: "b1",
            kind: "text",
            x: 0,
            y: 0,
            w: 5,
            h: 5,
            data: { id: "b1" },
        },
        t: time,
        a: uid,
    };
}

function makeDeps(
    uid: string,
    server: Partial<{ rev: number; doc: DocPizarra; subs: Set<(c: any) => void> }>,
    roles: Record<string, string | null>,
    reloj: ImmediateReloj
) {
    const base = depsPizarra("space-id", uid);
    return {
        ...base,
        cargar: async () => {
            const rev = server.rev ?? 1;
            const doc: DocPizarra = server.doc ?? pizarraVacia();
            return {
                ok: true,
                espacio: {
                    id: "space-id",
                    titulo: "Test",
                    doc,
                    rev,
                    propietario: "dueno-uid",
                    acceso: "invite",
                },
            };
        },
        guardar: async (doc: DocPizarra, rev: number) => {
            const currentRev = server.rev ?? 1;
            if (rev !== currentRev) return { ok: false, motivo: "conflicto" } as any;
            // permission check based on current role mapping
            const role = roles[uid] ?? null;
            const rango = rangoDeSesion({
                rolEntidad: role,
                esDuenoSesion: false,
                esComentarista: false,
                conEnlacePublico: false,
            });
            const canEdit = puedeEditarSesion(rango);
            if (!canEdit) return { ok: false, motivo: "sin-permiso" } as any;
            server.rev = (currentRev ?? 1) + 1;
            server.doc = doc;
            if (!server.subs) server.subs = new Set();
            server.subs.forEach((cb) => cb({ rev: server.rev, doc }));
            return {
                ok: true,
                espacio: {
                    id: "space-id",
                    titulo: "Test",
                    doc,
                    rev: server.rev,
                    propietario: "dueno-uid",
                    acceso: "invite",
                },
            } as any;
        },
        suscribir: (cb: (c: any) => void) => {
            if (!server.subs) server.subs = new Set();
            server.subs.add(cb);
            return () => server.subs!.delete(cb);
        },
        autor: uid.substr(0, 3),
        validar: (_: any) => null,
        puedeEditar: async (esp: any) => {
            const role = roles[uid] ?? null;
            const rango = rangoDeSesion({
                rolEntidad: role,
                esDuenoSesion: false,
                esComentarista: false,
                conEnlacePublico: false,
            });
            return puedeEditarSesion(rango);
        },
        borrador: undefined,
    };
}

describe("Observador no edita", () => {
    it("un observador (ver) no puede escribir", async () => {
        const server = { rev: 1, doc: pizarraVacia() } as any;
        const reloj = new ImmediateReloj();
        const roles = { u1: "observador" };
        const deps = makeDeps("u1", server, roles, reloj);
        const motor = new MotorColab<DocPizarra>(deps);
        await motor.iniciar();
        expect(motor.getSnapshot().puedeEditar).toBe(false);
        const aplicado = motor.aplicar((d, c) => d);
        expect(aplicado).toBe(false);
        await runAll(reloj);
        // server must be unchanged
        expect(server.rev).toBe(1);
        expect(Object.keys(server.doc.bloques).length).toBe(0);
    });

    it("un colaborador (editar) puede escribir", async () => {
        const server = { rev: 1, doc: pizarraVacia() } as any;
        const reloj = new ImmediateReloj();
        const roles = { u2: "colaborador" };
        const deps = makeDeps("u2", server, roles, reloj);
        const motor = new MotorColab<DocPizarra>(deps);
        await motor.iniciar();
        expect(motor.getSnapshot().puedeEditar).toBe(true);
        motor.aplicar((d, c) => ({ ...d, bloques: { ...d.bloques, b1: blockRecord("u2", c.t) } }));
        await runAll(reloj);
        expect(server.rev).toBe(2);
        expect(server.doc.bloques).toHaveProperty("b1");
    });

    it("cuando se baja el rol de colaborador a observador, la siguiente escritura se rechaza", async () => {
        const server = { rev: 1, doc: pizarraVacia() } as any;
        const reloj = new ImmediateReloj();
        const roles = { u3: "colaborador" };
        const deps = makeDeps("u3", server, roles, reloj);
        const motor = new MotorColab<DocPizarra>(deps);
        await motor.iniciar();
        expect(motor.getSnapshot().puedeEditar).toBe(true);
        // first edit should succeed
        motor.aplicar((d, c) => ({ ...d, bloques: { ...d.bloques, b1: blockRecord("u3", c.t) } }));
        await runAll(reloj);
        expect(server.rev).toBe(2);
        // demote role to observador
        roles.u3 = "observador";
        // second edit should be rejected and not change rev
        motor.aplicar((d, c) => ({ ...d, bloques: { ...d.bloques, b2: blockRecord("u3", c.t) } }));
        await runAll(reloj);
        expect(server.rev).toBe(2);
        expect(server.doc.bloques).toHaveProperty("b1");
        expect(server.doc.bloques).not.toHaveProperty("b2");
    });

    it("un rol inventado nunca escribe", async () => {
        const server = { rev: 1, doc: pizarraVacia() } as any;
        const reloj = new ImmediateReloj();
        const roles = { u4: "inventado" };
        const deps = makeDeps("u4", server, roles, reloj);
        const motor = new MotorColab<DocPizarra>(deps);
        await motor.iniciar();
        expect(motor.getSnapshot().puedeEditar).toBe(false);
        motor.aplicar((d, c) => ({ ...d, bloques: { ...d.bloques, b1: blockRecord("u4", c.t) } }));
        await runAll(reloj);
        expect(server.rev).toBe(1);
        expect(Object.keys(server.doc.bloques).length).toBe(0);
    });
});
