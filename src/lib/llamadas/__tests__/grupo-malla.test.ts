/**
 * GRP1107A · llamadas de grupo sin internet (puro): a quién suena, tope, vídeo o solo voz,
 * protocolo del timbre por el enlace y parejas que no se verán.
 */
import { describe, expect, it } from "vitest";
import {
    admitirInvitacion,
    avisoParesSinEnlace,
    decidirMediosGrupo,
    esSalaGrupoMalla,
    FRESCURA_INVITACION_MS,
    KBPS_VIDEO_POR_PAR,
    leerMensajeGrupo,
    MAX_GRUPO_MALLA,
    MAX_VIDEO_GRUPO_MALLA,
    paresSinEnlace,
    planGrupoMalla,
    salaGrupoMalla,
    textoViaGrupo,
    type EnlaceGrupo,
    type InvitacionGrupo,
} from "@/lib/llamadas/grupo-malla";

const YO = "u-yo";
const ANA = "u-ana";
const LUIS = "u-luis";
const EVA = "u-eva";
const AHORA = 1_800_000_000_000;
const enl = (id: string, uid?: string, extra: Partial<EnlaceGrupo> = {}): EnlaceGrupo => ({ id: `local:${id}`, nombre: `Aparato ${id}`, abierto: true, ...(uid ? { uid } : {}), ...extra });

describe("planGrupoMalla", () => {
    it("suena en cada enlace abierto con un aparato de un miembro (también mis otros aparatos); el resto, fuera con motivo", () => {
        const p = planGrupoMalla({
            miembros: [YO, ANA, LUIS, EVA],
            miUid: YO,
            enlaces: [enl("a", ANA), enl("t", YO), enl("x"), enl("o", "u-otro"), enl("c", LUIS, { abierto: false }), enl("a", ANA)],
            pedido: "audio",
        });
        expect(p.ok).toBe(true);
        expect(p.invitados).toEqual([
            { enlaceId: "local:a", uid: ANA, nombre: "Aparato a" },
            { enlaceId: "local:t", uid: YO, nombre: "Aparato t" },
        ]);
        expect(p.fuera).toEqual([
            { enlaceId: "local:x", nombre: "Aparato x", motivo: "ese aparato no dice de quién es: no se le invita a un grupo" },
            { enlaceId: "local:o", nombre: "Aparato o", uid: "u-otro", motivo: "ese aparato es de alguien que no está en este chat" },
            { enlaceId: "local:c", nombre: "Aparato c", uid: LUIS, motivo: "el enlace ya no está abierto" },
            { uid: EVA, motivo: "no hay enlace sin internet con su aparato (vinculadlos con «Vincular sin internet»)" },
            { uid: LUIS, motivo: "no hay enlace sin internet con su aparato (vinculadlos con «Vincular sin internet»)" },
        ]);
        expect(p.texto).toBe("Mesh · Sin internet · malla completa · 3 aparatos · solo voz");
    });

    it(`como mucho ${MAX_GRUPO_MALLA} aparatos (contándome): los de menor latencia medida primero`, () => {
        const enlaces = Array.from({ length: 8 }, (_, i) => enl(`m${i}`, `u-${i}`, { rttMs: i === 7 ? 1 : 10 + i }));
        const p = planGrupoMalla({ miembros: [YO, ...enlaces.map((e) => e.uid as string)], miUid: YO, enlaces, pedido: "audio" });
        expect(p.invitados).toHaveLength(MAX_GRUPO_MALLA - 1);
        expect(p.invitados[0].enlaceId).toBe("local:m7");
        expect(p.fuera.filter((f) => /admite 6 aparatos/.test(f.motivo)).map((f) => f.enlaceId)).toEqual(["local:m4", "local:m5", "local:m6"]);
    });

    it("sin ningún enlace con los miembros: no suena y dice cómo vincularlos", () => {
        const p = planGrupoMalla({ miembros: [YO, ANA, LUIS], miUid: YO, enlaces: [], pedido: "video" });
        expect(p.ok).toBe(false);
        expect(p.invitados).toEqual([]);
        expect(p.aviso).toMatch(/Vincular sin internet/);
    });

    it("determinista: mismas entradas, mismo plan", () => {
        const e = { miembros: [YO, ANA, LUIS], miUid: YO, enlaces: [enl("l", LUIS), enl("a", ANA)], pedido: "video" as const };
        expect(planGrupoMalla(e)).toEqual(planGrupoMalla(e));
    });
});

describe("decidirMediosGrupo (degradación honesta)", () => {
    it("pocos aparatos y enlaces que dan para vídeo: con vídeo", () => {
        expect(decidirMediosGrupo("video", 3, [{ nombre: "A", capacidadKbps: 4000 }, { nombre: "B", capacidadKbps: 900 }])).toEqual({ video: true, avisos: [] });
    });

    it(`más de ${MAX_VIDEO_GRUPO_MALLA} aparatos: solo voz, y dice por qué`, () => {
        const d = decidirMediosGrupo("video", MAX_VIDEO_GRUPO_MALLA + 1, []);
        expect(d.video).toBe(false);
        expect(d.motivo).toMatch(/Sois 5 aparatos/);
        expect(d.motivo).toMatch(/solo voz/);
    });

    it("un enlace que mide menos de lo que pide el vídeo: solo voz con la medida", () => {
        const d = decidirMediosGrupo("video", 3, [{ nombre: "A", capacidadKbps: 5000 }, { nombre: "Tablet", capacidadKbps: KBPS_VIDEO_POR_PAR - 1 }]);
        expect(d.video).toBe(false);
        expect(d.motivo).toBe(`El enlace con Tablet mide ${KBPS_VIDEO_POR_PAR - 1} kbps y el vídeo pide unos ${KBPS_VIDEO_POR_PAR} por persona: solo voz.`);
    });

    it("sin medir no baja a voz, pero se dice; la voz justa avisa", () => {
        expect(decidirMediosGrupo("video", 2, [{ nombre: "A", capacidadKbps: null }]).avisos).toEqual(["Capacidad sin medir con A: si el vídeo se congela, apágalo."]);
        expect(decidirMediosGrupo("audio", 2, [{ nombre: "A", capacidadKbps: 30 }])).toEqual({ video: false, avisos: ["El enlace con A mide 30 kbps: la voz puede cortarse."] });
    });

    it("textoViaGrupo", () => {
        expect(textoViaGrupo(2, true)).toBe("Mesh · Sin internet · malla completa · 2 aparatos · voz y vídeo");
    });
});

describe("sala y protocolo del timbre", () => {
    const sala = salaGrupoMalla("hilo-1", "abc123");
    const inv: InvitacionGrupo = { t: "llg.inv", v: 1, s: sala, h: "hilo-1", tc: "grupo", tipo: "video", video: true, de: { uid: ANA, nombre: "Ana" }, miembros: [ANA, YO, LUIS], titulo: "Equipo", ts: AHORA };

    it("la sala nunca es un uuid de sesión y se reconoce", () => {
        expect(sala).toBe("malla-grupo:hilo-1:abc123");
        expect(esSalaGrupoMalla(sala)).toBe(true);
        expect(esSalaGrupoMalla("1b4e28ba-2fa1-11d2-883f-0016d3cca427")).toBe(false);
        expect(salaGrupoMalla("h/../x<y>", "a b")).toBe("malla-grupo:hxy:ab");
    });

    it("lee una invitación (ida y vuelta) y descarta la vieja, la del futuro lejano y la mal formada", () => {
        expect(leerMensajeGrupo(JSON.stringify(inv), AHORA + 1000)).toEqual(inv);
        expect(leerMensajeGrupo(JSON.stringify(inv), AHORA + FRESCURA_INVITACION_MS + 1)).toBeNull();
        expect(leerMensajeGrupo(JSON.stringify({ ...inv, ts: AHORA + 60_000 }), AHORA)).toBeNull();
        expect(leerMensajeGrupo(JSON.stringify({ ...inv, s: "llamada:otra" }), AHORA)).toBeNull();
        expect(leerMensajeGrupo(JSON.stringify({ ...inv, miembros: "todos" }), AHORA)).toBeNull();
        expect(leerMensajeGrupo('{"t":"tu.msg"}', AHORA)).toBeNull();
        expect(leerMensajeGrupo("{no es json", AHORA)).toBeNull();
    });

    it("una invitación de voz no puede pedir vídeo; nombres sin caracteres de control", () => {
        const m = leerMensajeGrupo({ ...inv, tipo: "audio", video: true, de: { uid: ANA, nombre: "A\u0007na" } }, AHORA);
        expect(m && m.t === "llg.inv" && m.video).toBe(false);
        expect(m && m.t === "llg.inv" && m.de.nombre).toBe("Ana");
    });

    it("lee respuestas y el fin", () => {
        expect(leerMensajeGrupo({ t: "llg.res", v: 1, s: sala, si: true, de: { uid: LUIS, nombre: "Luis" }, alcanza: [ANA, ANA] }, AHORA)).toEqual({ t: "llg.res", v: 1, s: sala, si: true, de: { uid: LUIS, nombre: "Luis" }, alcanza: [ANA] });
        expect(leerMensajeGrupo({ t: "llg.res", v: 1, s: sala, de: { uid: LUIS } }, AHORA)).toBeNull();
        expect(leerMensajeGrupo({ t: "llg.fin", v: 1, s: sala, de: { uid: ANA } }, AHORA)).toEqual({ t: "llg.fin", v: 1, s: sala, de: { uid: ANA } });
    });

    it("admitirInvitacion: solo si soy miembro, quien llama es miembro y el enlace es de quien llama", () => {
        expect(admitirInvitacion(inv, { miUid: YO, uidEnlace: ANA, enLlamada: false })).toEqual({ ok: true });
        expect(admitirInvitacion(inv, { miUid: "u-fuera", uidEnlace: ANA, enLlamada: false })).toEqual({ ok: false, motivo: "no estás entre los miembros de esa llamada" });
        expect(admitirInvitacion(inv, { miUid: YO, uidEnlace: LUIS, enLlamada: false })).toEqual({ ok: false, motivo: "el enlace no es del aparato de quien llama" });
        expect(admitirInvitacion(inv, { miUid: YO, enLlamada: false }).ok).toBe(false);
        expect(admitirInvitacion({ ...inv, de: { uid: "u-x", nombre: "X" } }, { miUid: YO, uidEnlace: "u-x", enLlamada: false })).toEqual({ ok: false, motivo: "quien llama no está entre los miembros" });
        expect(admitirInvitacion(inv, { miUid: YO, uidEnlace: ANA, enLlamada: true })).toEqual({ ok: false, motivo: "ya estás en otra llamada" });
        expect(admitirInvitacion(inv, { miUid: null, uidEnlace: ANA, enLlamada: false }).ok).toBe(false);
    });
});

describe("paresSinEnlace", () => {
    it("dice qué parejas no se verán (basta con que uno de los dos alcance al otro)", () => {
        const pares = paresSinEnlace([
            { uid: ANA, nombre: "Ana", alcanza: [YO, LUIS] },
            { uid: LUIS, nombre: "Luis", alcanza: [YO] },
            { uid: EVA, nombre: "Eva", alcanza: [YO] },
        ]);
        expect(pares).toEqual([
            ["Ana", "Eva"],
            ["Eva", "Luis"],
        ]);
        expect(avisoParesSinEnlace(pares)).toBe("Ana y Eva, Eva y Luis no tienen enlace sin internet entre sí: no se oirán entre ellos (vinculadlos con «Vincular sin internet»).");
        expect(avisoParesSinEnlace([])).toBeNull();
    });
});
