/**
 * Convergencia de dos editores de la pizarra (SVF1D2f): el caso que hoy pierde datos.
 * A dibuja 5 bloques; B mueve uno y borra otro; guardan con la MISMA rev (conflicto forzado) y con relojes
 * intercalados. Al final ambos y el servidor tienen el mismo estado. El contraste reimplementa el modo
 * ANTIGUO (documento entero, el último gana) con el mismo guion y demuestra que ahí SÍ se pierde trabajo.
 */
import { describe, expect, test } from "vitest";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import { MotorColab, type CambioRemoto, type EspacioLeido, type RelojMotor } from "@/lib/vivo/tabla/motor-colab";
import { normalizarPizarra, pizarraVacia, type DocPizarra } from "@/lib/vivo/pizarra";
import { fusionarPizarras } from "@/lib/vivo/pizarra-fusion";
import { desdeLienzo, haciaLienzo } from "@/lib/vivo/pizarra-lienzo";
import { depsPizarra } from "@/lib/vivo/pizarra-motor";

const vaciar = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
class Reloj implements RelojMotor {
    t = Date.now(); private n = 0; private l: { id: number; en: number; f: () => void }[] = [];
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
const base = [bl("b1"), bl("b2"), bl("b3")];
const ids = (bs: CanvasBlock[]) => bs.map((b) => b.id).sort();
const dibujaA = (bs: CanvasBlock[], k: number) => [...bs, ...[1, 2, 3, 4, 5].slice(0, k).map((i) => bl(`a${i}`, i))].filter((b, i, l) => l.findIndex((o) => o.id === b.id) === i);
const haceB = (bs: CanvasBlock[]) => bs.filter((b) => b.id !== "b2").map((b) => (b.id === "b1" ? { ...b, x: 99 } : b));

function servidor(avisar = false) {
    const S = { rev: 1, doc: { sharing: "ajeno", blocks: base, edges: [] } as Record<string, unknown>, subs: new Set<(c: CambioRemoto) => void>() };
    const esp = (): EspacioLeido => ({ id: "e1", titulo: "P", doc: S.doc, rev: S.rev, propietario: "d", acceso: "invite" });
    const motor = (reloj: Reloj, uid: string) => new MotorColab<DocPizarra>({
        ...depsPizarra("e1", uid), reloj, borrador: undefined, puedeEditar: async () => true,
        cargar: async () => ({ ok: true, espacio: esp() }),
        suscribir: (cb) => (S.subs.add(cb), () => void S.subs.delete(cb)),
        guardar: async (doc, rev) => {
            if (rev !== S.rev) return { ok: false, motivo: "conflicto" };
            S.rev += 1; S.doc = doc;
            if (avisar) S.subs.forEach((s) => s({ rev: S.rev, doc }));
            return { ok: true, espacio: esp() };
        },
    });
    return { S, motor };
}
const editar = (m: MotorColab<DocPizarra>, f: (b: CanvasBlock[]) => CanvasBlock[]) =>
    m.aplicar((d, c) => { const l = haciaLienzo(d); return desdeLienzo(f(l.blocks), l.edges, d, { ahora: c.t, autor: c.a }); });
const vista = (m: MotorColab<DocPizarra>) => haciaLienzo(m.getSnapshot().doc as DocPizarra).blocks;

describe("dos editores convergen", () => {
  for (const avisar of [false, true]) {
    test(`A dibuja 5, B mueve uno y borra otro, con relojes intercalados (aviso en vivo: ${avisar})`, async () => {
        const { S, motor } = servidor(avisar);
        const reloj = new Reloj();
        const [a, b] = [motor(reloj, "ana"), motor(reloj, "beto")];
        await a.iniciar(); await b.iniciar(); await vaciar();
        for (let k = 1; k <= 5; k++) {
            editar(a, (bs) => dibujaA(bs, k));
            if (k === 2) editar(b, (bs) => bs.map((x) => (x.id === "b1" ? { ...x, x: 99 } : x))); // B mueve a mitad del dibujo de A
            if (k === 4) editar(b, (bs) => bs.filter((x) => x.id !== "b2")); // y borra más tarde
            await reloj.avanzar(130);
        }
        await reloj.avanzar(6000);
        await Promise.all([a.refrescar(), b.refrescar()]);
        const final = normalizarPizarra(S.doc);
        expect(vista(a)).toEqual(vista(b));
        expect(vista(a)).toEqual(haciaLienzo(final).blocks);
        expect(ids(vista(a))).toEqual(["a1", "a2", "a3", "a4", "a5", "b1", "b3"]);
        expect(vista(a).find((x) => x.id === "b1")?.x).toBe(99);
        expect(S.doc.sharing).toBe("ajeno");
    });
  }

  test("CONTRASTE: el modo antiguo (documento entero, el último gana) con el mismo guion PIERDE trabajo", () => {
        let servidorViejo = { blocks: base }; // 6 líneas: leer, editar en local y escribir el doc ENTERO
        const leer = () => servidorViejo.blocks;
        const escribir = (bs: CanvasBlock[]) => void (servidorViejo = { blocks: bs });
        const [deA, deB] = [dibujaA(leer(), 5), haceB(leer())]; // los dos parten de la misma rev
        escribir(deA); escribir(deB); // B escribe último
        expect(ids(servidorViejo.blocks)).toEqual(["b1", "b3"]); // las 5 piezas de A desaparecieron
        expect(ids(servidorViejo.blocks)).not.toEqual(["a1", "a2", "a3", "a4", "a5", "b1", "b3"]);
  });

  test("cambios duplicados y desordenados: 25 repartos con semilla fija acaban en el mismo tablero", () => {
        const ctx = (ahora: number, autor: string) => ({ ahora, autor });
        let s = normalizarPizarra({ blocks: base, edges: [] });
        const pasos: DocPizarra[] = [];
        let da = s, db = s;
        for (let k = 1; k <= 5; k++) pasos.push((da = desdeLienzo(dibujaA(haciaLienzo(da).blocks, k), [], da, ctx(1000 + k * 10, "ana"))));
        pasos.push((db = desdeLienzo(haceB(haciaLienzo(db).blocks), [], db, ctx(1025, "beto"))));
        const canon = pasos.reduce(fusionarPizarras, pizarraVacia());
        s = fusionarPizarras(s, canon);
        expect(ids(haciaLienzo(canon).blocks)).toEqual(["a1", "a2", "a3", "a4", "a5", "b1", "b3"]);
        let sem = 20261116;
        const azar = (n: number) => ((sem = (sem * 1103515245 + 12345) % 2147483648), sem % n);
        for (let i = 0; i < 25; i++) {
            const envio = [...pasos, ...pasos.filter(() => azar(2) === 0)].sort(() => azar(3) - 1); // con repetidos y mezclados
            const r1 = envio.reduce(fusionarPizarras, pizarraVacia());
            const r2 = [...envio].reverse().reduce(fusionarPizarras, pizarraVacia());
            expect(r1).toEqual(canon);
            expect(r2).toEqual(canon);
        }
  });
});
