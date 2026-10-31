import { describe, expect, it } from "vitest";
import { abrirSesionEscena, type AlmacenEscena } from "@/lib/vivo/espacial/sesion";
import type { ConexionEscena, EventoEscena, FilaCambiada } from "@/lib/vivo/espacial/canal";
import { sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { adnPorDefecto, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";

const REF = "biblioteca:adn-ana";
const adnDe = (rev = 3): AdnAvatar => sanearAdn({ ...adnPorDefecto("adn-ana", "Ana", { tipo: "perfil", id: "u1" }), rev })!;
const acento = (color: string): CambioAvatar => sanearCambio({ op: "material", slot: "acento", campo: "color", valor: color })!;

function reloj() {
    let t = 1_000_000;
    let sig = 0;
    const tareas = new Map<number, { en: number; fn: () => void }>();
    return {
        ahora: () => t,
        programar: (fn: () => void, ms: number) => {
            const id = ++sig;
            tareas.set(id, { en: t + ms, fn });
            return id;
        },
        cancelar: (id: unknown) => tareas.delete(id as number),
        async avanzar(ms: number) {
            const fin = t + ms;
            for (;;) {
                const proxima = [...tareas.values()].filter((v) => v.en <= fin).sort((a, b) => a.en - b.en)[0];
                if (!proxima) break;
                t = proxima.en;
                tareas.delete([...tareas.entries()].find(([, v]) => v === proxima)![0]);
                proxima.fn();
                await vaciar();
            }
            t = fin;
            await vaciar();
        },
    };
}

async function vaciar() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

function canalFalso() {
    const oy = {
        m: new Set<(e: EventoEscena, p: unknown) => void>(),
        p: new Set<(e: Record<string, unknown>) => void>(),
    };
    const enviados: { evento: EventoEscena; payload: Record<string, unknown> }[] = [];
    const meta: Record<string, unknown> = {};
    const conexion: ConexionEscena = {
        tema: "t",
        suscrito: () => true,
        enviar: (evento, payload) => enviados.push({ evento, payload }),
        publicarPresencia: (m) => Object.assign(meta, m),
        onPresencia: (cb) => (oy.p.add(cb), () => oy.p.delete(cb)),
        onMensaje: (cb) => (oy.m.add(cb), () => oy.m.delete(cb)),
        onFila: (_cb: (f: FilaCambiada) => void) => () => {},
        onSuscrito: (_cb: (ok: boolean) => void) => () => {},
        cerrar: () => {},
    };
    return {
        conexion,
        enviados,
        meta,
        mensaje: (e: EventoEscena, p: Record<string, unknown>) => oy.m.forEach((cb) => cb(e, p)),
        presencia: (p: Record<string, unknown>) => oy.p.forEach((cb) => cb(p)),
        adn: () => enviados.filter((x) => x.evento === "adn"),
    };
}

const PRESENCIA = {
    "ana:x": [{ uid: null, nombre: "Ana", color: "#ffffff", modo: "3d", editor: true, desde: 1, adnRef: REF, adnRev: 3 }],
};

function abrir(leerAdn: (ref: string, rev: number) => Promise<unknown>, c = canalFalso(), r = reloj()) {
    const almacen = {} as AlmacenEscena;
    const sesion = abrirSesionEscena({
        fuente: { tipo: "llamada", sesionId: "s1" },
        identidad: { clave: "yo:1", uid: null, nombre: "Yo" },
        deps: { almacen, abrirCanal: () => c.conexion, ...r, aleatorio: () => 0.5, leerAdn },
    });
    return { sesion, canal: c, reloj: r };
}

describe("sincronía del ADN cableada a la sesión", () => {
    it("el presente anunciado se lee UNA vez y su ADN queda en la sesión", async () => {
        let lecturas = 0;
        const { sesion, canal } = abrir(async () => {
            lecturas++;
            return adnDe();
        });
        await vaciar();
        canal.presencia(PRESENCIA);
        await vaciar();
        expect(lecturas).toBe(1);
        expect(sesion.adns.obtener()[REF]?.nombre).toBe("Ana");
        canal.presencia(PRESENCIA); // misma presencia: ni una petición más
        expect(lecturas).toBe(1);
        expect(Object.keys(sesion.adns.obtener()).length).toBe(1);
    });

    it("el evento «adn» aplica solo la revisión más nueva y descarta la vieja", async () => {
        const { sesion, canal } = abrir(async () => adnDe());
        await vaciar();
        canal.presencia(PRESENCIA);
        await vaciar();
        const base = sesion.adns.obtener()[REF];
        canal.mensaje("adn", { de: "ana:x", ref: REF, rev: 5, cambios: [acento("#ffbf00"), { op: "no-existe" }] });
        expect(sesion.adns.obtener()[REF]).not.toBe(base);
        expect(sesion.adns.obtener()[REF].materiales.acento?.color).toBe("#ffbf00");
        expect(sesion.adns.obtener()[REF].rev).toBe(5);
        const nueva = sesion.adns.obtener()[REF];
        canal.mensaje("adn", { de: "ana:x", ref: REF, rev: 4, cambios: [acento("#10b981")] });
        expect(sesion.adns.obtener()[REF]).toBe(nueva);
    });

    it("fijarMiAdn anuncia mi ADN en la presencia y rechaza lo inválido", async () => {
        const { sesion, canal } = abrir(async () => adnDe());
        await vaciar();
        expect(sesion.fijarMiAdn("https://fuera.com/a", 2)).toBe(false);
        expect(sesion.fijarMiAdn(REF, 2)).toBe(true);
        expect(canal.meta.adnRef).toBe(REF);
        expect(canal.meta.adnRev).toBe(2);
        expect(sesion.avatares.obtener().yo?.adnRef).toBe(REF);
    });

    it("emitirCambiosAdn saca lotes por el MISMO canal (10 Hz) y nada a solas", async () => {
        const { sesion, canal, reloj } = abrir(async () => adnDe());
        await vaciar();
        expect(sesion.emitirCambiosAdn([acento("#dc143c")])).toBe(false); // aún sin mi ADN
        expect(sesion.fijarMiAdn(REF, 3)).toBe(true);
        sesion.emitirCambiosAdn([acento("#dc143c")]);
        expect(canal.adn()).toEqual([]); // a solas no viaja nada
        canal.presencia({ ...PRESENCIA, "ana:y": PRESENCIA["ana:x"] });
        sesion.emitirCambiosAdn([acento("#dc143c")]);
        const enviados = canal.adn();
        expect(enviados).toHaveLength(1);
        expect(enviados[0].payload).toEqual({ de: "yo:1", ref: REF, rev: 3, cambios: [acento("#dc143c")] });
        sesion.emitirCambiosAdn([acento("#007fff")]); // dentro del intervalo: sale en cola
        expect(canal.adn()).toHaveLength(1);
        await reloj.avanzar(110);
        expect(canal.adn()).toHaveLength(2);
        expect(canal.adn()[1].payload.cambios).toEqual([acento("#007fff")]);
    });
});
