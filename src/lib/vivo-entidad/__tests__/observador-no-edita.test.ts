/**
 * Prueba de integración pura: un observador no puede editar (RST1116A · P1-D).
 * Recorre la tabla de traducción de roles, permisos y el motor crearMotorPizarra
 * con un servidor falso, sin red.
 */
import { describe, expect, test } from "vitest";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CambioRemoto, EspacioLeido, MotorColab, RelojMotor, ResultadoGuardar } from "@/lib/vivo/tabla/motor-colab";
import { MotorColab as Motor } from "@/lib/vivo/tabla/motor-colab";
import { normalizarPizarra, type DocPizarra } from "@/lib/vivo/pizarra";
import { desdeLienzo, haciaLienzo } from "@/lib/vivo/pizarra-lienzo";
import { depsPizarra } from "@/lib/vivo/pizarra-motor";
import { rangoDeSesion, puedeEditarSesion } from "@/lib/vivo-entidad/traduccion-roles";

const vaciar = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

class Reloj implements RelojMotor {
    t = Date.now();
    private n = 0;
    private l: { id: number; en: number; f: () => void }[] = [];
    ahora = () => this.t;
    poner = (f: () => void, ms: number) => (this.l.push({ id: ++this.n, en: this.t + ms, f }), this.n);
    quitar = (id: unknown) => void (this.l = this.l.filter((x) => x.id !== id));
    async avanzar(ms: number) {
        const fin = this.t + ms;
        for (;;) {
            this.l.sort((a, b) => a.en - b.en || a.id - b.id);
            const s = this.l[0];
            if (!s || s.en > fin) break;
            this.l.shift(); this.t = Math.max(this.t, s.en); s.f(); await vaciar();
        }
        this.t = fin; await vaciar();
    }
}

const bl = (id: string, x = 0): CanvasBlock => ({ id, kind: "text", x, y: 0, w: 5, h: 5, data: { id } });

class Servidor {
    rev = 1;
    subs = new Set<(c: CambioRemoto) => void>();
    guardados = 0;
    constructor(public doc: Record<string, unknown>, public avisar = true) {}
    esp = (): EspacioLeido => ({ id: "e1", titulo: "P", doc: this.doc, rev: this.rev, propietario: "dueno", acceso: "invite" });
    motor(reloj: Reloj, uid: string, puede = true, rechazo = false): MotorColab<DocPizarra> {
        return new Motor<DocPizarra>({
            ...depsPizarra("e1", uid),
            reloj,
            borrador: undefined,
            puedeEditar: async () => puede,
            cargar: async () => ({ ok: true, espacio: this.esp() }),
            guardar: async (doc, rev): Promise<ResultadoGuardar> => {
                if (rechazo) return { ok: false, motivo: "sin-permiso" };
                if (rev !== this.rev) return { ok: false, motivo: "conflicto" };
                this.rev += 1; this.doc = doc; this.guardados += 1;
                const c = { rev: this.rev, doc };
                if (this.avisar) void Promise.resolve().then(() => this.subs.forEach((s) => s(c)));
                return { ok: true, espacio: this.esp() };
            },
            suscribir: (cb) => (this.subs.add(cb), () => void this.subs.delete(cb)),
        });
    }
}

const editar = (m: MotorColab<DocPizarra>, f: (b: CanvasBlock[]) => CanvasBlock[]) =>
    m.aplicar((d, c) => { const l = haciaLienzo(d); return desdeLienzo(f(l.blocks), l.edges, d, { ahora: c.t, autor: c.a }); });

const delServidor = (s: Servidor) => haciaLienzo(normalizarPizarra(s.doc)).blocks;

const inicial = { sharing: "ajeno", blocks: [bl("b1"), bl("b2")], edges: [] };

async function abrir(srv: Servidor, ...cfg: [string, boolean?, boolean?][]) {
    const reloj = new Reloj();
    const ms = cfg.map(([u, p, r]) => srv.motor(reloj, u, p, r));
    for (const m of ms) await m.iniciar();
    await vaciar();
    return { reloj, ms };
}

describe("observador no edita (P1-D · RST1116A)", () => {
    test("(1) observador (rango 1) → ver, puedeEditarSesion false, motor no cambia servidor y queda en sin-permiso", async () => {
        // Traducción de rol
        const ctx = { rolEntidad: "observador", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false };
        const rango = rangoDeSesion(ctx);
        expect(rango).toBe("ver");
        expect(puedeEditarSesion(rango)).toBe(false);

        // Motor con servidor falso
        const srv = new Servidor(inicial);
        const { reloj, ms: [obs] } = await abrir(srv, ["obs", false, true]); // puede=false, rechazo=true

        // Intentar editar
        const escribio = editar(obs, (bs) => [...bs, bl("zz", 99)]);
        expect(escribio).toBe(false);
        expect(obs.getSnapshot().puedeEditar).toBe(false);

        // Avanzar tiempo para permitir guardado si hubiera intentado
        await reloj.avanzar(4000);

        // Servidor intacto (no intentó guardar)
        expect(srv.guardados).toBe(0);
        expect(delServidor(srv)).toEqual(inicial.blocks);

        // Estado del motor: limpio (no intentó guardar porque sabe que no puede)
        expect(obs.getSnapshot().guardado).toBe("limpio");
        expect(obs.getSnapshot().puedeEditar).toBe(false);
    });

    test("(2) colaborador (rango 2) → editar, puedeEditarSesion true, motor sí escribe", async () => {
        const ctx = { rolEntidad: "colaborador", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false };
        const rango = rangoDeSesion(ctx);
        expect(rango).toBe("editar");
        expect(puedeEditarSesion(rango)).toBe(true);

        const srv = new Servidor(inicial);
        const { reloj, ms: [col] } = await abrir(srv, ["col", true]);

        const escribio = editar(col, (bs) => [...bs, bl("nuevo", 5)]);
        expect(escribio).toBe(true);
        expect(col.getSnapshot().puedeEditar).toBe(true);

        await reloj.avanzar(4000);

        expect(srv.guardados).toBe(1);
        expect(delServidor(srv)).toEqual([...inicial.blocks, bl("nuevo", 5)]);
    });

    test("(3) bajar de colaborador a observador a mitad de sesión: siguiente escritura se rechaza, anterior queda guardada", async () => {
        const srv = new Servidor(inicial);
        const { reloj, ms: [m] } = await abrir(srv, ["user", true]); // empieza con permiso

        // Primera escritura como colaborador
        editar(m, (bs) => [...bs, bl("antes", 1)]);
        await reloj.avanzar(4000);
        expect(srv.guardados).toBe(1);
        expect(delServidor(srv).some((b) => b.id === "antes")).toBe(true);

        // Ahora simulamos que le bajan el rol: el motor debe rechazar la siguiente escritura
        // Creamos un motor nuevo con el mismo servidor pero sin permiso
        const { ms: [m2] } = await abrir(srv, ["user", false, true]);

        const escribio = editar(m2, (bs) => [...bs, bl("despues", 2)]);
        expect(escribio).toBe(false);
        expect(m2.getSnapshot().puedeEditar).toBe(false);

        await reloj.avanzar(4000);

        // Servidor no cambió (la escritura anterior sigue, la nueva no)
        expect(srv.guardados).toBe(1);
        expect(delServidor(srv).some((b) => b.id === "antes")).toBe(true);
        expect(delServidor(srv).some((b) => b.id === "despues")).toBe(false);

        // El motor sabe que no puede editar, no intentó guardar
        expect(m2.getSnapshot().guardado).toBe("limpio");
        expect(m2.getSnapshot().puedeEditar).toBe(false);
    });

    test("(4) rol inventado nunca escribe: rango null, puedeEditarSesion false, motor no escribe", async () => {
        const ctx = { rolEntidad: "inventado", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false };
        const rango = rangoDeSesion(ctx);
        expect(rango).toBeNull();
        expect(puedeEditarSesion(rango)).toBe(false);

        const srv = new Servidor(inicial);
        const { reloj, ms: [inv] } = await abrir(srv, ["inv", false, true]);

        const escribio = editar(inv, (bs) => [...bs, bl("hack", 999)]);
        expect(escribio).toBe(false);
        expect(inv.getSnapshot().puedeEditar).toBe(false);

        await reloj.avanzar(4000);

        expect(srv.guardados).toBe(0);
        expect(delServidor(srv)).toEqual(inicial.blocks);
        // El motor sabe que no puede editar, no intentó guardar
        expect(inv.getSnapshot().guardado).toBe("limpio");
        expect(inv.getSnapshot().puedeEditar).toBe(false);
    });
});