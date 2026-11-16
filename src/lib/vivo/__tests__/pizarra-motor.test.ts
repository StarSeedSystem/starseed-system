/** Motor de la pizarra (SVF1A4f): dos editores con la MISMA rev convergen por compare-and-swap + fusión. */
import { describe, expect, test } from "vitest";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CambioRemoto, EspacioLeido, MotorColab, RelojMotor, ResultadoGuardar } from "@/lib/vivo/tabla/motor-colab";
import { MotorColab as Motor } from "@/lib/vivo/tabla/motor-colab";
import { normalizarPizarra, type DocPizarra } from "../pizarra";
import { desdeLienzo, haciaLienzo } from "../pizarra-lienzo";
import { depsPizarra } from "../pizarra-motor";

const vaciar = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
class Reloj implements RelojMotor {
    t = Date.now(); // la poda de lápidas usa la hora real
    private n = 0; private l: { id: number; en: number; f: () => void }[] = [];
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

/** Servidor con `rev` y compare-and-swap; `avisar=false` simula que Realtime aún no llegó. */
class Servidor {
    rev = 1; subs = new Set<(c: CambioRemoto) => void>(); guardados = 0;
    constructor(public doc: Record<string, unknown>, public avisar = true) {}
    esp = (): EspacioLeido => ({ id: "e1", titulo: "P", doc: this.doc, rev: this.rev, propietario: "dueno", acceso: "invite" });
    motor(reloj: Reloj, uid: string, puede = true, rechazo = false): MotorColab<DocPizarra> {
        return new Motor<DocPizarra>({
            ...depsPizarra("e1", uid), reloj, borrador: undefined, puedeEditar: async () => puede,
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
const lienzo = (m: MotorColab<DocPizarra>) => haciaLienzo(m.getSnapshot().doc as DocPizarra).blocks;
const delServidor = (s: Servidor) => haciaLienzo(normalizarPizarra(s.doc)).blocks;
const inicial = { sharing: "ajeno", blocks: [bl("b1"), bl("b2")], edges: [] };

async function abrir(srv: Servidor, ...cfg: [string, boolean?, boolean?][]) {
    const reloj = new Reloj();
    const ms = cfg.map(([u, p, r]) => srv.motor(reloj, u, p, r));
    for (const m of ms) await m.iniciar();
    await vaciar();
    return { reloj, ms };
}

describe("motor de la pizarra", () => {
  for (const avisar of [false, true]) {
    test(`(1) dos motores editan bloques distintos con la misma rev y convergen (aviso en vivo: ${avisar})`, async () => {
        const srv = new Servidor(inicial, avisar);
        const { reloj, ms: [a, b] } = await abrir(srv, ["ana"], ["beto"]);
        editar(a, (bs) => bs.map((x) => (x.id === "b1" ? { ...x, x: 11 } : x)));
        editar(b, (bs) => [...bs.filter((x) => x.id !== "b2"), bl("b3", 33)]);
        await reloj.avanzar(4000);
        await Promise.all([a.refrescar(), b.refrescar()]); // «sincronizar»: sin aviso en vivo, cada uno vuelve a leer
        const esperado = [bl("b1", 11), bl("b3", 33)];
        expect(delServidor(srv)).toEqual(esperado);
        expect(lienzo(a)).toEqual(esperado);
        expect(lienzo(b)).toEqual(esperado);
        expect(srv.doc.sharing).toBe("ajeno");
        expect(srv.guardados).toBe(2);
    });
  }

  test("(2) mismo bloque: gana el de mayor reloj en los dos", async () => {
        const srv = new Servidor(inicial, false);
        const { reloj, ms: [a, b] } = await abrir(srv, ["ana"], ["beto"]);
        editar(a, (bs) => bs.map((x) => (x.id === "b1" ? { ...x, x: 1 } : x)));
        await reloj.avanzar(10);
        editar(b, (bs) => bs.map((x) => (x.id === "b1" ? { ...x, x: 2 } : x)));
        await reloj.avanzar(4000);
        await Promise.all([a.refrescar(), b.refrescar()]);
        for (const l of [lienzo(a), lienzo(b), delServidor(srv)]) expect(l.find((x) => x.id === "b1")?.x).toBe(2);
  });

  test("(3) sin permiso: no escribe, el servidor queda intacto y el estado lo dice", async () => {
        const srv = new Servidor(inicial);
        const { reloj, ms: [c, d] } = await abrir(srv, ["cora", false], ["dani", true, true]);
        expect(editar(c, (bs) => [...bs, bl("zz")])).toBe(false);
        expect(c.getSnapshot().puedeEditar).toBe(false);
        editar(d, (bs) => [...bs, bl("zz")]);
        await reloj.avanzar(4000);
        expect(srv.guardados).toBe(0);
        expect(d.getSnapshot().guardado).toBe("sin-permiso");
        expect(d.getSnapshot().motivo).toMatch(/permiso/);
  });

  test("(4) un doc viejo {blocks, edges} se abre y se guarda ya migrado sin perder bloques", async () => {
        const srv = new Servidor(inicial);
        const { reloj, ms: [a] } = await abrir(srv, ["ana"]);
        expect(lienzo(a)).toEqual(inicial.blocks);
        editar(a, (bs) => [...bs, bl("b9", 9)]);
        await reloj.avanzar(2000);
        expect(srv.doc.formato).toBe(1);
        expect(Object.keys(srv.doc.bloques as object).sort()).toEqual(["b1", "b2", "b9"]);
        expect(delServidor(srv)).toEqual([...inicial.blocks, bl("b9", 9)]);
        expect((srv.doc.blocks as CanvasBlock[]).map((x) => x.id)).toEqual(["b1", "b2", "b9"]);
  });
});
