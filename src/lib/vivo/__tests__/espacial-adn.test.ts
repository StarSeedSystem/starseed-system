import { describe, expect, it } from "vitest";
import { aplicarCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { refDeId } from "@/lib/avatares/adaptadores/sincronia-adn";
import { docVacio, sanearDoc } from "@/lib/vivo/espacial/modelo";
import type { ConexionEscena, EventoEscena } from "@/lib/vivo/espacial/canal";
import type { FilaEscena } from "@/lib/vivo/espacial/persistencia";
import { abrirSesionEscena, type DependenciasSesion, type SesionEscena } from "@/lib/vivo/espacial/sesion";

// ───────────────────────── Dobles de prueba ─────────────────────────

function reloj() {
    let t = 1_000_000;
    return {
        ahora: () => t,
        avanzar(ms: number) {
            t += ms;
        },
    };
}

function canalFalso() {
    const oyentes = {
        m: new Set<(e: EventoEscena, p: unknown) => void>(),
        p: new Set<(estado: Record<string, unknown>) => void>(),
    };
    const enviados: { evento: EventoEscena; payload: Record<string, unknown> }[] = [];
    const metas: Record<string, unknown>[] = [];
    const conexion: ConexionEscena = {
        tema: "t",
        suscrito: () => true,
        enviar: (evento, payload) => enviados.push({ evento, payload }),
        publicarPresencia: (m) => metas.push(m),
        onPresencia: (cb) => (oyentes.p.add(cb), () => oyentes.p.delete(cb)),
        onMensaje: (cb) => (oyentes.m.add(cb), () => oyentes.m.delete(cb)),
        onFila: () => () => {},
        onSuscrito: () => () => {},
        cerrar: () => {},
    };
    return {
        conexion,
        enviados,
        metas,
        mensaje: (e: EventoEscena, p: Record<string, unknown>) => oyentes.m.forEach((cb) => cb(e, p)),
        presencia: (e: Record<string, unknown>) => oyentes.p.forEach((cb) => cb(e)),
        de: (evento: EventoEscena) => enviados.filter((x) => x.evento === evento),
    };
}

interface Dobles {
    s: SesionEscena;
    c: ReturnType<typeof canalFalso>;
    r: ReturnType<typeof reloj>;
}

function abrir(leerAdn?: DependenciasSesion["leerAdn"]): Dobles {
    const c = canalFalso();
    const r = reloj();
    const deps: DependenciasSesion = {
        almacen: {
            leer: async (id) => {
                const f: FilaEscena = {
                    id,
                    titulo: "Mi escena",
                    dueno: "dueno",
                    acceso: "invite",
                    rev: 1,
                    doc: sanearDoc(JSON.parse(JSON.stringify(docVacio()))).doc,
                    descartados: 0,
                    actualizada: "",
                };
                return { fila: f };
            },
            guardar: async () => ({ ok: true, rev: 2 }),
            puedeEditar: async () => true,
        },
        abrirCanal: () => c.conexion,
        ...r,
        aleatorio: () => 0.5,
        ...(leerAdn ? { leerAdn } : {}),
    };
    const s = abrirSesionEscena({
        fuente: { tipo: "espacio", id: "11111111-2222-3333-4444-555555555555" },
        identidad: { clave: "yo:1", uid: null, nombre: "Yo" },
        deps,
    });
    return { s, c, r };
}

/** ADN válido de Ana (rev 1, altura 0,7). */
function adnDeAna(): AdnAvatar {
    return aplicarCambio(adnPorDefecto("adn-ana", "Ana", { tipo: "perfil", id: "u1" }), { op: "morfologia", clave: "altura", valor: 0.7 });
}
const presenciaDeAna = (rev: number): Record<string, unknown> => ({
    "k:ana": [{ uid: null, nombre: "Ana", color: "#10B981", modo: "3d", editor: true, desde: 1, adnRef: refDeId("adn-ana"), adnRev: rev }],
});
const ALTURA = (v: number): CambioAvatar => ({ op: "morfologia", clave: "altura", valor: v });

async function vaciar(n = 3): Promise<void> {
    for (let i = 0; i < n; i++) await Promise.resolve();
}

describe("ADN en la sesión de escena (AV1011E)", () => {
    it("cada presente se lee UNA vez por revisión y su ADN queda a la vista", async () => {
        const leidas: string[] = [];
        const { s, c } = abrir(async (ref, rev) => (leidas.push(`${ref}@${rev}`), adnDeAna()));
        c.presencia(presenciaDeAna(1));
        await vaciar();
        expect(leidas).toEqual([`${refDeId("adn-ana")}@1`]);
        expect(s.adnDe(refDeId("adn-ana"))?.morfologia.altura).toBe(0.7);
        expect(s.avatares.obtener().adnes[refDeId("adn-ana")]); // visible para la interfaz

        c.presencia(presenciaDeAna(1)); // misma revisión: UNA sola lectura
        await vaciar();
        expect(leidas).toHaveLength(1);

        c.presencia(presenciaDeAna(2)); // revisión más nueva: se lee otra vez
        await vaciar();
        expect(leidas).toEqual([`${refDeId("adn-ana")}@1`, `${refDeId("adn-ana")}@2`]);
    });

    it("sin leerAdn no se lee nadie y el evento `adn` que llega queda pendiente hasta la base", async () => {
        const { s, c } = abrir();
        // Lote de Ana (rev 3) llega SIN que tengamos su base: no se aplica, se espera.
        c.mensaje("adn", { de: "k:ana", ref: refDeId("adn-ana"), rev: 3, cambios: [ALTURA(0.1)] });
        expect(s.adnDe(refDeId("adn-ana"))).toBeNull();
        c.presencia(presenciaDeAna(1)); // sin leerAdn: nada que leer
        await vaciar();
        expect(s.adnDe(refDeId("adn-ana"))).toBeNull();

        // Con lector: la base llega rev 1 y el pendiente rev 3 se aplica encima.
        const { s: s2, c: c2 } = abrir(async () => adnDeAna());
        c2.mensaje("adn", { de: "k:ana", ref: refDeId("adn-ana"), rev: 3, cambios: [ALTURA(0.1)] });
        c2.presencia(presenciaDeAna(1));
        await vaciar();
        expect(s2.adnDe(refDeId("adn-ana"))?.morfologia.altura).toBe(0.1); // rev 3 gana a la base rev 1
        expect(s2.avatares.obtener().adnes[refDeId("adn-ana")]);
    });

    it("lo corrupto del canal no entra y una revisión vieja no pisa a la más nueva", async () => {
        const { s, c } = abrir(async () => adnDeAna());
        c.presencia(presenciaDeAna(2));
        await vaciar();
        const base = s.adnDe(refDeId("adn-ana"))!.morfologia.altura;

        c.mensaje("adn", { de: "k:ana", ref: "https://fuera.example/a", rev: 9, cambios: [ALTURA(0)] }); // ref externa
        c.mensaje("adn", { de: "k:ana", ref: refDeId("adn-ana"), rev: "3", cambios: [ALTURA(0)] }); // rev sin número
        c.mensaje("adn", { de: "k:ana", ref: refDeId("adn-ana"), rev: 9, cambios: [{ op: "no-existe" }] }); // sin cambios válidos
        c.mensaje("adn", { de: "k:ana", ref: refDeId("adn-ana"), rev: 1, cambios: [ALTURA(0)] }); // rev más vieja
        expect(s.adnDe(refDeId("adn-ana"))!.morfologia.altura).toBe(base);
        // Un lote bueno y más nuevo sí pasa.
        c.mensaje("adn", { de: "k:ana", ref: refDeId("adn-ana"), rev: 3, cambios: [ALTURA(0.2)] });
        expect(s.adnDe(refDeId("adn-ana"))!.morfologia.altura).toBe(0.2);
    });

    it("mi ADN se anuncia en la presencia por su ref y revisión; invalido no entra", async () => {
        const { s, c } = abrir();
        expect(s.fijarAdnPropio({ ...adnDeAna(), id: "" })).toBe(false);
        expect(s.fijarAdnPropio(adnDeAna())).toBe(true);
        const ultima = c.metas[c.metas.length - 1];
        expect(ultima.adnRef).toBe(refDeId("adn-ana"));
        expect(ultima.adnRev).toBe(1);
        expect(s.avatares.obtener().yo?.adnRef).toBe(refDeId("adn-ana"));
    });

    it("los lotes de `lote()` salen por el MISMO canal como evento `adn`, a ≤ 10 Hz y solo con alguien mirando", () => {
        const { s, c, r } = abrir();
        const ana = presenciaDeAna(1); // hay alguien dentro
        c.presencia(ana);
        expect(s.fijarAdnPropio(adnDeAna())).toBe(true);
        expect(s.encolarCambiosAdn([ALTURA(0.5)], 2)).toBe(true);
        s.fluirAdn();
        let adnes = c.de("adn");
        expect(adnes).toHaveLength(1);
        expect(adnes[0].payload).toEqual({ de: "yo:1", ref: refDeId("adn-ana"), rev: 2, cambios: [ALTURA(0.5)] });
        expect(c.metas[c.metas.length - 1].adnRev).toBe(2); // la presencia se pone al día con el envío

        // El estrangulador: un segundo lote inmediato no sale (10 Hz)
        expect(s.encolarCambiosAdn([ALTURA(0.6)], 3)).toBe(true);
        s.emitirPose({ p: [0, 0, 0], q: [0, 0, 0, 1] });
        expect(c.de("adn")).toHaveLength(1);
        r.avanzar(150);
        s.emitirPose({ p: [0, 0, 0], q: [0, 0, 0, 1] });
        adnes = c.de("adn");
        expect(adnes).toHaveLength(2);
        expect(adnes[1].payload).toEqual({ de: "yo:1", ref: refDeId("adn-ana"), rev: 3, cambios: [ALTURA(0.6)] });
    });

    it("sin nadie dentro no se emite nada del ADN (presupuesto §3)", () => {
        const { s, c } = abrir();
        expect(s.fijarAdnPropio(adnDeAna())).toBe(true);
        expect(s.encolarCambiosAdn([ALTURA(0.4)], 2)).toBe(true);
        s.fluirAdn();
        expect(c.de("adn")).toHaveLength(0);
    });

    it("una revisión no más nueva que la mía no se encola", () => {
        const { s, c } = abrir();
        expect(s.fijarAdnPropio(adnDeAna())).toBe(true); // rev 1
        expect(s.encolarCambiosAdn([ALTURA(0.5)], 1)).toBe(false);
        s.fluirAdn();
        expect(c.de("adn")).toHaveLength(0);
    });
});
