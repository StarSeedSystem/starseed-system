/**
 * GRP1107A · motor de la llamada de grupo sin internet, con enlaces en memoria: el timbre suena
 * por el enlace de quien llama (y no por uno ajeno), se para con su `llg.fin`, el «no» vuelve por
 * el mismo enlace, y quien llama invita por cada enlace, abre un canal directo por cada uno (sin
 * servidor ni TURN) y cuelga si nadie puede atender.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";

interface OpcionesFalsas {
    sesionId: string;
    iceServers?: unknown[];
    hayTurn?: boolean;
    tema?: string | null;
    canalesDirectos?: () => unknown[];
}
type EstadoFalso = { fase: string; contestada: boolean };

// Lo que leen las fábricas de `vi.mock` (que suben arriba del todo) va en `vi.hoisted`.
const h = vi.hoisted(() => {
    const motores: Array<{ opc: OpcionesFalsas; avisos: string[]; colgado: string | null }> = [];
    class MotorFalso {
        opc: OpcionesFalsas;
        avisos: string[] = [];
        colgado: string | null = null;
        oyentes = new Set<(e: EstadoFalso) => void>();
        constructor(o: OpcionesFalsas) {
            this.opc = o;
            motores.push(this);
        }
        async prepararMedios() {
            return { audio: true, error: null };
        }
        avisar(t: string | null) {
            if (t) this.avisos.push(t);
        }
        entrar() {
            this.opc.canalesDirectos?.();
            return true;
        }
        estado() {
            return { fase: this.colgado ? "terminada" : "esperando", contestada: false };
        }
        suscribir(cb: (e: EstadoFalso) => void) {
            this.oyentes.add(cb);
            return () => this.oyentes.delete(cb);
        }
        colgar(m: string) {
            this.colgado = m;
            for (const cb of Array.from(this.oyentes)) cb({ fase: "terminada", contestada: false });
            return { duracionMs: 0, contestada: false, otrosDentro: 0 };
        }
        get cerrada() {
            return !!this.colgado;
        }
    }
    return {
        yo: { base: "u-yo", uid: "u-yo", nombre: "Yo", avatar: null, invitado: false },
        activadas: [] as Array<Record<string, unknown>>,
        canales: [] as Array<{ enlace: string; sala: string; clave: string }>,
        motores,
        MotorFalso,
    };
});
const { activadas, canales, motores } = h;

vi.mock("@/lib/llamadas/identidad", () => ({
    miIdentidad: async () => h.yo,
    clavePestana: (b: string) => `${b}:tab`,
}));
vi.mock("@/lib/llamadas/acciones", () => ({
    hayLlamadaEnCurso: () => false,
    activarLlamada: (a: Record<string, unknown>) => h.activadas.push(a),
}));
vi.mock("@/lib/llamadas/medios", () => ({
    soportaLlamadas: () => true,
    obtenerMedios: async () => ({ stream: { id: "s" }, aviso: null, error: null }),
    pararStream: () => undefined,
}));
vi.mock("@/lib/llamadas/canal-enlace-local", () => ({
    abrirCanalLlamadaPorEnlace: (e: EnlaceLocalVivo, sala: string, clave: string) => {
        h.canales.push({ enlace: e.id, sala, clave });
        return { sesionId: sala, soltar: () => undefined };
    },
}));
vi.mock("@/lib/llamadas/motor", () => ({ MotorLlamada: h.MotorFalso }));

import { registrarEnlaceLocal, __vaciarRegistroEnlacesLocales } from "@/lib/malla/registro-enlaces-locales";
import { __reiniciarLlamadas, leerLlamadas } from "@/lib/llamadas/store";
import { empezarLlamadaGrupoMalla, iniciarGrupoMalla, rechazarGrupoMalla } from "@/lib/llamadas/grupo-malla-motor";
import { salaGrupoMalla } from "@/lib/llamadas/grupo-malla";

function enlaceFalso(id: string, uid: string | undefined, nombre: string) {
    const oyentes = new Set<(d: string | ArrayBuffer) => void>();
    const enviados: Array<Record<string, unknown>> = [];
    const e: EnlaceLocalVivo = {
        id,
        par: { nombre, ...(uid ? { uid } : {}) },
        desde: 0,
        abierto: () => true,
        rttMs: () => null,
        ruta: () => null,
        capacidadKbps: () => null,
        enviar: (t: string) => {
            enviados.push(JSON.parse(t) as Record<string, unknown>);
            return true;
        },
        enviarBinario: () => true,
        bufferedAmount: () => 0,
        alMensaje: (cb) => {
            oyentes.add(cb);
            return () => {
                oyentes.delete(cb);
            };
        },
        ponerPistas: async () => true,
        alFlujoRemoto: () => () => undefined,
        cerrar: () => undefined,
    };
    return { e, enviados, llega: (m: unknown) => oyentes.forEach((cb) => cb(JSON.stringify(m))) };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));
let parar: (() => void) | null = null;

beforeEach(() => {
    __vaciarRegistroEnlacesLocales();
    __reiniciarLlamadas();
    activadas.length = 0;
    canales.length = 0;
    motores.length = 0;
    parar = iniciarGrupoMalla();
});

afterEach(() => {
    parar?.();
    parar = null;
});

describe("timbre por el enlace", () => {
    const sala = salaGrupoMalla("hilo-9", "x1");
    const inv = (ts = Date.now()) => ({ t: "llg.inv", v: 1, s: sala, h: "hilo-9", tc: "grupo", tipo: "audio", video: false, de: { uid: "u-ana", nombre: "Ana" }, miembros: ["u-ana", "u-yo", "u-luis"], titulo: "Equipo", ts });

    it("suena con la tarjeta global (vía malla) y se para con el fin de quien llama", async () => {
        const ana = enlaceFalso("local:ana", "u-ana", "Móvil de Ana");
        registrarEnlaceLocal(ana.e);
        ana.llega(inv());
        await esperar();
        const t = leerLlamadas().timbres[0];
        expect(t).toMatchObject({ sesionId: sala, hiloId: "hilo-9", tipoHilo: "grupo", tituloHilo: "Equipo", llamante: { uid: "u-ana", nombre: "Ana" }, malla: { enlaceId: "local:ana", video: false } });
        // Un «fin» por otro enlace no lo para; por el de quien llama, sí.
        const luis = enlaceFalso("local:luis", "u-luis", "Luis");
        registrarEnlaceLocal(luis.e);
        luis.llega({ t: "llg.fin", v: 1, s: sala, de: { uid: "u-ana" } });
        await esperar();
        expect(leerLlamadas().timbres).toHaveLength(1);
        ana.llega({ t: "llg.fin", v: 1, s: sala, de: { uid: "u-ana" } });
        await esperar();
        expect(leerLlamadas().timbres).toHaveLength(0);
    });

    it("una invitación por un enlace que no es de quien llama no suena (ni se contesta)", async () => {
        const otro = enlaceFalso("local:otro", "u-luis", "Luis");
        registrarEnlaceLocal(otro.e);
        otro.llega(inv());
        await esperar();
        expect(leerLlamadas().timbres).toHaveLength(0);
        expect(otro.enviados).toEqual([]);
    });

    it("rechazar: el «no» vuelve por el mismo enlace", async () => {
        const ana = enlaceFalso("local:ana", "u-ana", "Ana");
        registrarEnlaceLocal(ana.e);
        ana.llega(inv());
        await esperar();
        await rechazarGrupoMalla(leerLlamadas().timbres[0]);
        expect(ana.enviados).toEqual([{ t: "llg.res", v: 1, s: sala, si: false, de: { uid: "u-yo", nombre: "Yo" }, alcanza: [] }]);
    });
});

describe("llamar a un grupo", () => {
    it("invita por cada enlace, abre un canal directo por cada uno sin servidor ni TURN, y dice la vía", async () => {
        const ana = enlaceFalso("local:ana", "u-ana", "Ana");
        const luis = enlaceFalso("local:luis", "u-luis", "Luis");
        const ajeno = enlaceFalso("local:ajeno", "u-otro", "Otro");
        [ana, luis, ajeno].forEach((x) => registrarEnlaceLocal(x.e));
        const r = await empezarLlamadaGrupoMalla({ hiloId: "hilo-9", tipoChat: "grupo", tipo: "audio", titulo: "Equipo", miembros: ["u-ana", "u-luis"] });
        expect(r.ok).toBe(true);
        expect(r.sala).toMatch(/^malla-grupo:hilo-9:/);
        const m = motores[0];
        expect(m.opc).toMatchObject({ sesionId: r.sala, iceServers: [], hayTurn: false, tema: null });
        expect(canales.map((c) => c.enlace).sort()).toEqual(["local:ana", "local:luis"]);
        expect(canales.every((c) => c.sala === r.sala && c.clave === "u-yo:tab")).toBe(true);
        expect(ana.enviados[0]).toMatchObject({ t: "llg.inv", s: r.sala, h: "hilo-9", tc: "grupo", tipo: "audio", video: false, de: { uid: "u-yo", nombre: "Yo" } });
        expect((ana.enviados[0].miembros as string[]).sort()).toEqual(["u-ana", "u-luis", "u-yo"]);
        expect(luis.enviados).toHaveLength(1);
        expect(ajeno.enviados).toEqual([]);
        expect(activadas[0]).toMatchObject({ sesionId: r.sala, esCreador: true, unoAUno: false, via: "Mesh · Sin internet · malla completa · 3 aparatos · solo voz" });
    });

    it("si contestan, dice qué parejas no tienen enlace entre sí; si todos dicen que no, cuelga solo", async () => {
        const ana = enlaceFalso("local:ana", "u-ana", "Ana");
        const luis = enlaceFalso("local:luis", "u-luis", "Luis");
        const eva = enlaceFalso("local:eva", "u-eva", "Eva");
        [ana, luis, eva].forEach((x) => registrarEnlaceLocal(x.e));
        const r = await empezarLlamadaGrupoMalla({ hiloId: "h", tipoChat: "grupo", tipo: "audio", titulo: "T", miembros: ["u-ana", "u-luis", "u-eva"] });
        const m = motores[0];
        // Ana y Luis contestan, pero ninguno de los dos tiene enlace con el otro.
        ana.llega({ t: "llg.res", v: 1, s: r.sala, si: true, de: { uid: "u-ana", nombre: "Ana" }, alcanza: ["u-yo"] });
        await esperar();
        expect(m.avisos.some((a) => /no tienen enlace/.test(a))).toBe(false);
        luis.llega({ t: "llg.res", v: 1, s: r.sala, si: true, de: { uid: "u-luis", nombre: "Luis" }, alcanza: ["u-yo"] });
        await esperar();
        expect(m.avisos.at(-1)).toBe("Ana y Luis no tienen enlace sin internet entre sí: no se oirán entre ellos (vinculadlos con «Vincular sin internet»).");
        eva.llega({ t: "llg.res", v: 1, s: r.sala, si: false, de: { uid: "u-eva", nombre: "Eva" }, alcanza: [], motivo: "está en otra llamada" });
        await esperar();
        expect(m.avisos.at(-1)).toBe("Eva no puede atender ahora (está en otra llamada).");
        expect(m.colgado).toBeNull();

        // Otra llamada en la que todos dicen que no: cuelga sola y avisa a los que quedaban.
        motores.length = 0;
        const r2 = await empezarLlamadaGrupoMalla({ hiloId: "h2", tipoChat: "grupo", tipo: "audio", titulo: "T", miembros: ["u-ana", "u-luis"] });
        const m2 = motores[0];
        ana.llega({ t: "llg.res", v: 1, s: r2.sala, si: false, de: { uid: "u-ana", nombre: "Ana" }, alcanza: [] });
        await esperar();
        expect(m2.colgado).toBeNull();
        luis.llega({ t: "llg.res", v: 1, s: r2.sala, si: false, de: { uid: "u-luis", nombre: "Luis" }, alcanza: [] });
        await esperar();
        expect(m2.colgado).toBe("Nadie del grupo puede atender ahora.");
    });

    it("una respuesta por un enlace al que no sonó no cuenta", async () => {
        const ana = enlaceFalso("local:ana", "u-ana", "Ana");
        const intruso = enlaceFalso("local:intruso", "u-x", "X");
        [ana, intruso].forEach((x) => registrarEnlaceLocal(x.e));
        const r = await empezarLlamadaGrupoMalla({ hiloId: "h", tipoChat: "grupo", tipo: "audio", titulo: "T", miembros: ["u-ana", "u-luis"] });
        intruso.llega({ t: "llg.res", v: 1, s: r.sala, si: false, de: { uid: "u-ana", nombre: "Ana" }, alcanza: [] });
        await esperar();
        expect(motores[0].avisos.some((a) => /no puede atender/.test(a))).toBe(false);
        expect(motores[0].colgado).toBeNull();
    });

    it("desde la pestaña «Neuronas»: suena en mis otras neuronas y la llamada no cuelga de ningún chat", async () => {
        const tablet = enlaceFalso("local:nativo-tab", "u-yo", "Tablet");
        const ana = enlaceFalso("local:ana", "u-ana", "Ana");
        [tablet, ana].forEach((x) => registrarEnlaceLocal(x.e));
        const r = await empezarLlamadaGrupoMalla({ hiloId: "cerebro-propias", tipoChat: "grupo", tipo: "audio", titulo: "Mis neuronas", miembros: ["u-ana"] });
        expect(r.ok).toBe(true);
        expect(tablet.enviados[0]).toMatchObject({ t: "llg.inv", h: "cerebro-propias" });
        expect(ana.enviados).toHaveLength(1);
        expect(activadas[0]).toMatchObject({ hiloId: null, titulo: "Mis neuronas" });
    });

    it("sin enlaces con el grupo: no llama y dice cómo vincularlos", async () => {
        const r = await empezarLlamadaGrupoMalla({ hiloId: "h", tipoChat: "grupo", tipo: "video", titulo: "T", miembros: ["u-ana", "u-luis"] });
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/^Una llamada de grupo sin servidor/);
        expect(motores).toHaveLength(0);
    });
});
