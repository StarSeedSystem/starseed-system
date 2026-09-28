/**
 * Llamadas — lógica pura: negociación (roles, glare, plazas, ICE), disposición de mosaicos,
 * hablante activo, calidad desde getStats, formatos, presencia saneada, adjuntos y timbres,
 * servidores ICE y mensajes de error.
 */
import { describe, expect, it } from "vitest";
import { admision, evaluarDescripcion, reaccionIce, sanearSenal, soyCortes, MAX_REINICIOS_ICE } from "@/lib/llamadas/negociacion";
import { disposicionLlamada, esquinaMasCercana, posicionEsquina, rejillaOptima } from "@/lib/llamadas/disposicion";
import { elegirHablante, nivelRms, suavizarNivel } from "@/lib/llamadas/hablante";
import { calidadDesde, extraerMetricas, peorCalidad, perdidaEntre } from "@/lib/llamadas/calidad";
import { colorDePersona, describirDuracion, esTipoLlamada, formatearDuracion, iniciales, textoPersonas } from "@/lib/llamadas/formato";
import { participantesDePresencia, sanearMeta, sanearNombre, uidDeClave, urlAvatarSegura } from "@/lib/llamadas/presencia";
import {
    adjuntoLlamadaDe,
    crearAdjuntoLlamada,
    esTimbreEntrante,
    estadoTarjetaLlamada,
    rutaLlamada,
    VENTANA_TIMBRE_MS,
} from "@/lib/llamadas/adjunto";
import { hayTurn, servidoresIce, STUN_POR_DEFECTO } from "@/lib/llamadas/ice";
import { clasificarErrorSesion, mensajeErrorMedios } from "@/lib/llamadas/errores";
import { MAX_PARTICIPANTES } from "@/lib/llamadas/tipos";

const ID = "3f1c2a9e-7b1d-4c3e-9f00-1234567890ab";

describe("negociación", () => {
    it("el par de id mayor es el cortés, y solo uno de los dos lo es", () => {
        expect(soyCortes("b", "a")).toBe(true);
        expect(soyCortes("a", "b")).toBe(false);
        expect(soyCortes("uid-9:x", "uid-1:y")).not.toBe(soyCortes("uid-1:y", "uid-9:x"));
    });

    it("una oferta en estado estable se acepta sin colisión", () => {
        const d = evaluarDescripcion("offer", { cortes: false, haciendoOferta: false, aplicandoRespuesta: false }, "stable");
        expect(d).toEqual({ colision: false, ignorar: false });
    });

    it("glare: el descortés ignora la oferta cruzada y el cortés la acepta", () => {
        const descortes = evaluarDescripcion("offer", { cortes: false, haciendoOferta: true, aplicandoRespuesta: false }, "have-local-offer");
        const cortes = evaluarDescripcion("offer", { cortes: true, haciendoOferta: true, aplicandoRespuesta: false }, "have-local-offer");
        expect(descortes).toEqual({ colision: true, ignorar: true });
        expect(cortes).toEqual({ colision: true, ignorar: false });
    });

    it("una respuesta nunca es colisión", () => {
        expect(evaluarDescripcion("answer", { cortes: false, haciendoOferta: true, aplicandoRespuesta: false }, "have-local-offer").colision).toBe(false);
    });

    it("mientras se aplica una respuesta, una oferta nueva no cuenta como colisión", () => {
        const d = evaluarDescripcion("offer", { cortes: false, haciendoOferta: false, aplicandoRespuesta: true }, "have-local-offer");
        expect(d.colision).toBe(false);
    });

    it("plazas por orden de llegada hasta el máximo", () => {
        const presentes = Array.from({ length: MAX_PARTICIPANTES }, (_, i) => ({ id: `p${i}`, unido: 100 + i }));
        expect(admision(presentes, "p0").admitido).toBe(true);
        expect(admision(presentes, "p7").admitido).toBe(true);
        const noveno = admision([...presentes, { id: "p8", unido: 999 }], "p8");
        expect(noveno.admitido).toBe(false);
        expect(noveno.conPlaza).toHaveLength(MAX_PARTICIPANTES);
        expect(noveno.conPlaza).not.toContain("p8");
        // Aún no estoy en la presencia: entro si hay sitio.
        expect(admision(presentes.slice(0, 3), "nuevo").admitido).toBe(true);
        expect(admision(presentes, "nuevo").admitido).toBe(false);
    });

    it("empates de hora de llegada se resuelven por id", () => {
        const r = admision([{ id: "b", unido: 1 }, { id: "a", unido: 1 }], "a", 1);
        expect(r.conPlaza).toEqual(["a"]);
    });

    it("ICE: espera al desconectar, reinicia al fallar y se rinde con honestidad", () => {
        expect(reaccionIce("connected", 2)).toBe("conectado");
        expect(reaccionIce("completed", 0)).toBe("conectado");
        expect(reaccionIce("disconnected", 0)).toBe("esperar");
        expect(reaccionIce("failed", 0)).toBe("reiniciar");
        expect(reaccionIce("failed", MAX_REINICIOS_ICE)).toBe("fallida");
        expect(reaccionIce("checking", 0)).toBe("nada");
    });

    it("sanea las señales recibidas por el canal", () => {
        expect(sanearSenal(null)).toBeNull();
        expect(sanearSenal({ tipo: "colgar", de: "a:1" })).toEqual({ tipo: "colgar", de: "a:1" });
        expect(sanearSenal({ tipo: "senal", de: "a", para: "b" })).toBeNull(); // sin contenido
        expect(sanearSenal({ tipo: "senal", de: "a", para: "b", desc: { type: "rollback", sdp: "" } })).toBeNull();
        const s = sanearSenal({
            tipo: "senal",
            de: "a",
            para: "b",
            desc: { type: "offer", sdp: "v=0", extra: "fuera" },
            ice: [{ candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 }, { candidate: 42 }, "basura"],
        });
        expect(s).toEqual({
            tipo: "senal",
            de: "a",
            para: "b",
            desc: { type: "offer", sdp: "v=0" },
            ice: [{ candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 }],
        });
        const r = sanearSenal({ tipo: "rechazo", de: "x", uid: "u1", nombre: "  Ana\n Ruiz " });
        expect(r).toEqual({ tipo: "rechazo", de: "x", uid: "u1", nombre: "Ana Ruiz" });
        expect(sanearSenal({ tipo: "otra", de: "x" })).toBeNull();
    });
});

describe("disposición de mosaicos", () => {
    it("rejilla óptima para 1–8 personas en un hueco apaisado", () => {
        const esperadas: Record<number, [number, number]> = { 1: [1, 1], 2: [2, 1], 3: [2, 2], 4: [2, 2], 5: [3, 2], 6: [3, 2], 7: [3, 3], 8: [3, 3] };
        for (let n = 1; n <= 8; n++) {
            const r = rejillaOptima(n, 1600, 900, { hueco: 8 });
            expect([r.columnas, r.filas], `n=${n}`).toEqual(esperadas[n]);
            expect(r.columnas * r.filas).toBeGreaterThanOrEqual(n);
            // Cabe en el hueco.
            expect(r.columnas * r.ancho + (r.columnas - 1) * 8).toBeLessThanOrEqual(1600);
            expect(r.filas * r.alto + (r.filas - 1) * 8).toBeLessThanOrEqual(900);
            expect(Math.abs(r.ancho / r.alto - 16 / 9)).toBeLessThan(0.05);
        }
    });

    it("en un móvil en vertical apila en una columna", () => {
        const r = rejillaOptima(3, 360, 700);
        expect(r.columnas).toBe(1);
        expect(r.filas).toBe(3);
    });

    it("hueco vacío o nadie: rejilla vacía", () => {
        expect(rejillaOptima(0, 800, 600)).toEqual({ columnas: 0, filas: 0, ancho: 0, alto: 0 });
        expect(rejillaOptima(3, 0, 600).columnas).toBe(0);
    });

    it("modos: solo, dúo tipo FaceTime, rejilla y foco", () => {
        const base = { yo: "yo", ancho: 1200, alto: 800 };
        expect(disposicionLlamada(["yo"], base).modo).toBe("solo");
        const duo = disposicionLlamada(["yo", "ana"], base);
        expect(duo).toMatchObject({ modo: "duo", principal: "ana", miniaturas: ["yo"] });
        expect(disposicionLlamada(["yo", "ana", "luis"], base).modo).toBe("rejilla");
        const foco = disposicionLlamada(["yo", "ana", "luis", "eva"], { ...base, pantallaDe: "luis", hablante: "eva" });
        expect(foco.modo).toBe("foco");
        expect(foco.principal).toBe("luis");
        expect(foco.miniaturas[0]).toBe("eva"); // el hablante sube al principio de la tira
        expect(foco.tira).toBe("lateral");
        expect(disposicionLlamada(["yo", "ana", "luis"], { ...base, ancho: 400, alto: 800, fijado: "ana" }).tira).toBe("inferior");
    });

    it("lo fijado manda sobre la pantalla compartida y un id desconocido se ignora", () => {
        const d = disposicionLlamada(["yo", "ana", "luis"], { yo: "yo", ancho: 1000, alto: 700, pantallaDe: "luis", fijado: "ana" });
        expect(d.principal).toBe("ana");
        expect(disposicionLlamada(["yo", "ana", "luis"], { yo: "yo", ancho: 1000, alto: 700, fijado: "nadie" }).modo).toBe("rejilla");
    });

    it("la ventanita se imanta a la esquina más cercana", () => {
        expect(esquinaMasCercana(10, 10, 1000, 800)).toBe("arriba-izquierda");
        expect(esquinaMasCercana(900, 700, 1000, 800)).toBe("abajo-derecha");
        expect(esquinaMasCercana(900, 100, 1000, 800)).toBe("arriba-derecha");
        expect(esquinaMasCercana(100, 700, 1000, 800)).toBe("abajo-izquierda");
        const m = { anchoVentana: 1000, altoVentana: 800, anchoPip: 200, altoPip: 120, margen: 16, margenInferior: 100 };
        expect(posicionEsquina("abajo-derecha", m)).toEqual({ x: 784, y: 580 });
        expect(posicionEsquina("arriba-izquierda", m)).toEqual({ x: 16, y: 16 });
    });
});

describe("hablante activo", () => {
    it("RMS del silencio es 0 y de una señal llena es alto", () => {
        expect(nivelRms(new Uint8Array(64).fill(128))).toBe(0);
        const fuerte = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0));
        expect(nivelRms(fuerte)).toBeGreaterThan(0.95);
        expect(nivelRms([])).toBe(0);
    });

    it("el suavizado sube rápido y baja despacio", () => {
        expect(suavizarNivel(0, 1)).toBeCloseTo(0.6);
        expect(suavizarNivel(1, 0)).toBeCloseTo(0.8);
        expect(suavizarNivel(0.0005, 0)).toBe(0);
    });

    it("elige al más alto y mantiene el foco con histéresis", () => {
        let v = elegirHablante({ a: 0.3, b: 0.1 }, null, 0);
        expect(v?.id).toBe("a");
        // b sube algo, pero no lo bastante: a sigue.
        v = elegirHablante({ a: 0.3, b: 0.35 }, v, 2000);
        expect(v?.id).toBe("a");
        // b le supera con margen y ya pasó la permanencia: cambia.
        v = elegirHablante({ a: 0.2, b: 0.5 }, v, 3000);
        expect(v).toEqual({ id: "b", desde: 3000 });
        // Dentro de la permanencia no se cambia aunque otro grite.
        expect(elegirHablante({ a: 0.9, b: 0.1 }, v, 3200)?.id).toBe("b");
    });

    it("las pausas no apagan el foco enseguida, el silencio largo sí", () => {
        const v = { id: "a", desde: 0 };
        expect(elegirHablante({ a: 0, b: 0 }, v, 500)?.id).toBe("a");
        expect(elegirHablante({ a: 0, b: 0 }, v, 2000)).toBeNull();
        // Si el vigente se fue de la llamada, deja de serlo.
        expect(elegirHablante({ b: 0 }, v, 100)).toBeNull();
    });
});

describe("calidad de conexión", () => {
    const informe = [
        { type: "transport", id: "T1", selectedCandidatePairId: "CP1" },
        { type: "candidate-pair", id: "CP0", nominated: true, state: "succeeded", currentRoundTripTime: 0.9 },
        { type: "candidate-pair", id: "CP1", currentRoundTripTime: 0.08 },
        { type: "inbound-rtp", kind: "audio", packetsLost: 2, packetsReceived: 998, jitter: 0.012 },
        { type: "inbound-rtp", kind: "video", packetsLost: 0, packetsReceived: 1000 },
    ];

    it("extrae RTT del par elegido, pérdidas y jitter", () => {
        expect(extraerMetricas(informe)).toEqual({ rttMs: 80, perdidos: 2, recibidos: 1998, jitterMs: 12 });
        // Igual desde un Map (así llega RTCStatsReport).
        const mapa = new Map(informe.map((s) => [s.id ?? Math.random().toString(), s]));
        expect(extraerMetricas(mapa).rttMs).toBe(80);
    });

    it("sin transporte usa el par nominado; sin pares, el RTT remoto", () => {
        expect(extraerMetricas(informe.slice(1)).rttMs).toBe(900);
        expect(extraerMetricas([{ type: "remote-inbound-rtp", roundTripTime: 0.2 }]).rttMs).toBe(200);
        expect(extraerMetricas([])).toEqual({ rttMs: null, perdidos: 0, recibidos: 0, jitterMs: null });
    });

    it("pérdida reciente entre muestras", () => {
        const a = { rttMs: 50, perdidos: 10, recibidos: 990, jitterMs: 5 };
        const b = { rttMs: 50, perdidos: 20, recibidos: 1080, jitterMs: 5 };
        expect(perdidaEntre(a, b)).toBeCloseTo(10);
        expect(perdidaEntre(null, { ...a, perdidos: 0, recibidos: 0 })).toBeNull();
        expect(perdidaEntre(a, a)).toBe(0);
    });

    it("clasifica buena, regular, mala y desconocida", () => {
        expect(calidadDesde({ rttMs: 60, perdidaPct: 0.5, jitterMs: 8 })).toBe("buena");
        expect(calidadDesde({ rttMs: 320, perdidaPct: 1, jitterMs: 10 })).toBe("regular");
        expect(calidadDesde({ rttMs: 100, perdidaPct: 12, jitterMs: 10 })).toBe("mala");
        expect(calidadDesde({ rttMs: null, perdidaPct: null, jitterMs: null })).toBe("desconocida");
        expect(peorCalidad(["buena", "mala", "regular"])).toBe("mala");
        expect(peorCalidad([])).toBe("desconocida");
    });
});

describe("formatos", () => {
    it("cronómetro", () => {
        expect(formatearDuracion(0)).toBe("0:00");
        expect(formatearDuracion(5_000)).toBe("0:05");
        expect(formatearDuracion(754_000)).toBe("12:34");
        expect(formatearDuracion(3_723_000)).toBe("1:02:03");
        expect(formatearDuracion(-5)).toBe("0:00");
        expect(formatearDuracion(Number.NaN)).toBe("0:00");
    });

    it("duración en palabras", () => {
        expect(describirDuracion(40_000)).toBe("40 s");
        expect(describirDuracion(12 * 60_000)).toBe("12 min");
        expect(describirDuracion(65 * 60_000)).toBe("1 h 5 min");
        expect(describirDuracion(120 * 60_000)).toBe("2 h");
    });

    it("textos y colores", () => {
        expect(textoPersonas(1)).toBe("1 persona");
        expect(textoPersonas(3)).toBe("3 personas");
        expect(iniciales("Ana María Ruiz")).toBe("AR");
        expect(iniciales("")).toBe("·");
        expect(colorDePersona("abc")).toBe(colorDePersona("abc"));
        expect(esTipoLlamada("video")).toBe(true);
        expect(esTipoLlamada("fax")).toBe(false);
    });
});

describe("presencia saneada", () => {
    it("solo acepta avatares seguros", () => {
        expect(urlAvatarSegura("https://x.org/a.png")).toBe("https://x.org/a.png");
        expect(urlAvatarSegura("/avatares/1.png")).toBe("/avatares/1.png");
        expect(urlAvatarSegura("//evil.com/x")).toBeNull();
        expect(urlAvatarSegura("javascript:alert(1)")).toBeNull();
        expect(urlAvatarSegura("data:image/svg+xml;base64,AAAA")).toBeNull();
        expect(urlAvatarSegura("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    });

    it("nombres sin controles, recortados y con respaldo", () => {
        expect(sanearNombre("  Ana \u0007 Ruiz ")).toBe("Ana Ruiz");
        expect(sanearNombre("", "Invitado")).toBe("Invitado");
        expect(sanearNombre("x".repeat(80))).toHaveLength(40);
    });

    it("la clave de presencia manda sobre lo que diga la meta", () => {
        const m = sanearMeta({ id: "otro", uid: "u1", nombre: "Ana", micro: true, camara: "sí", unido: 5 }, "u1:tab");
        expect(m).toMatchObject({ id: "u1:tab", uid: "u1", micro: true, camara: false, invitado: false, unido: 5 });
        const inv = sanearMeta({ invitado: true, uid: "u9", nombre: "" }, "inv-abc:t");
        expect(inv).toMatchObject({ uid: null, invitado: true, nombre: "Invitado" });
    });

    it("lista de participantes desde presenceState, ordenada por llegada", () => {
        const lista = participantesDePresencia({
            "b:1": [{ uid: "b", nombre: "Bea", unido: 20 }],
            "a:1": [{ uid: "a", nombre: "Viejo", unido: 1 }, { uid: "a", nombre: "Ana", unido: 10 }],
            vacio: [],
        });
        expect(lista.map((p) => [p.id, p.nombre])).toEqual([
            ["a:1", "Ana"],
            ["b:1", "Bea"],
        ]);
        expect(participantesDePresencia(null)).toEqual([]);
        expect(uidDeClave("u1:tab")).toBe("u1");
        expect(uidDeClave("inv-xyz:tab")).toBeNull();
    });
});

describe("adjunto y timbre", () => {
    it("crea el adjunto con ruta calculada y lo valida al leerlo", () => {
        const a = crearAdjuntoLlamada("video", ID, new Date("2026-09-28T10:00:00Z"));
        expect(a).toMatchObject({ kind: "llamada", tipoLlamada: "video", sesionId: ID, route: `/llamada/${ID}`, name: "Llamada de vídeo", iniciada: "2026-09-28T10:00:00.000Z" });
        expect(adjuntoLlamadaDe(a)).toEqual(a);
        expect(rutaLlamada(ID, "tok en")).toBe(`/llamada/${ID}?t=tok%20en`);
    });

    it("no se fía de la ruta ni del tipo que vengan escritos", () => {
        const a = adjuntoLlamadaDe({ kind: "llamada", tipoLlamada: "hackeo", sesionId: ID, route: "javascript:alert(1)", duracionMs: -4, contestada: "sí", fin: "no-es-fecha" });
        expect(a).toMatchObject({ tipoLlamada: "audio", route: `/llamada/${ID}` });
        expect(a?.duracionMs).toBeUndefined();
        expect(a?.contestada).toBeUndefined();
        expect(a?.fin).toBeUndefined();
        expect(adjuntoLlamadaDe({ kind: "llamada", sesionId: "../../x" })).toBeNull();
        expect(adjuntoLlamadaDe({ kind: "image", sesionId: ID })).toBeNull();
    });

    it("suena solo si es de otra persona, reciente, sin borrar y sin terminar", () => {
        const ahora = Date.parse("2026-09-28T10:00:30Z");
        const msg = { sender: "otro", createdAt: "2026-09-28T10:00:00Z", deleted: false, attachments: [crearAdjuntoLlamada("audio", ID)] };
        expect(esTimbreEntrante(msg, "yo", ahora)?.sesionId).toBe(ID);
        expect(esTimbreEntrante(msg, "otro", ahora)).toBeNull();
        expect(esTimbreEntrante(msg, null, ahora)).toBeNull();
        expect(esTimbreEntrante({ ...msg, deleted: true }, "yo", ahora)).toBeNull();
        expect(esTimbreEntrante(msg, "yo", ahora + VENTANA_TIMBRE_MS)).toBeNull();
        expect(esTimbreEntrante({ ...msg, attachments: [{ kind: "image" }] }, "yo", ahora)).toBeNull();
        const terminada = { ...msg, attachments: [{ ...crearAdjuntoLlamada("audio", ID), fin: "2026-09-28T10:00:20Z" }] };
        expect(esTimbreEntrante(terminada, "yo", ahora)).toBeNull();
    });

    it("estado de la tarjeta: sonando, en curso, terminada, perdida, sin respuesta, finalizada", () => {
        const t0 = Date.parse("2026-09-28T10:00:00Z");
        const adj = crearAdjuntoLlamada("audio", ID, new Date(t0));
        expect(estadoTarjetaLlamada({ adjunto: adj, mio: false, presentes: null, ahora: t0 + 5_000 })).toMatchObject({ estado: "sonando", etiqueta: "Sonando…", puedeUnirse: true });
        expect(estadoTarjetaLlamada({ adjunto: adj, mio: true, presentes: 0, ahora: t0 + 5_000 }).etiqueta).toBe("Llamando…");
        expect(estadoTarjetaLlamada({ adjunto: adj, mio: false, presentes: 3, ahora: t0 + 600_000 })).toMatchObject({ estado: "en-curso", etiqueta: "En curso · 3 personas", puedeUnirse: true });
        const fin = { ...adj, fin: new Date(t0 + 700_000).toISOString(), duracionMs: 12 * 60_000, contestada: true };
        expect(estadoTarjetaLlamada({ adjunto: fin, mio: true, presentes: 0, ahora: t0 + 800_000 })).toMatchObject({ estado: "terminada", etiqueta: "Terminada · 12 min", puedeUnirse: false });
        // Quien creó se fue, pero siguen dentro: en curso.
        expect(estadoTarjetaLlamada({ adjunto: fin, mio: false, presentes: 2, ahora: t0 + 800_000 }).estado).toBe("en-curso");
        const perdida = { ...adj, fin: new Date(t0 + 50_000).toISOString(), contestada: false };
        expect(estadoTarjetaLlamada({ adjunto: perdida, mio: false, presentes: 0, ahora: t0 + 60_000 }).estado).toBe("perdida");
        expect(estadoTarjetaLlamada({ adjunto: perdida, mio: true, presentes: 0, ahora: t0 + 60_000 }).estado).toBe("sin-respuesta");
        expect(estadoTarjetaLlamada({ adjunto: adj, mio: false, presentes: 0, ahora: t0 + 120_000 }).estado).toBe("finalizada");
        expect(estadoTarjetaLlamada({ adjunto: adj, mio: false, presentes: 2, ahora: t0 + 1000, sesionEstado: "terminada" }).estado).toBe("finalizada");
    });
});

describe("servidores ICE", () => {
    it("STUN siempre; TURN solo si está configurado", () => {
        expect(servidoresIce({})).toEqual(STUN_POR_DEFECTO);
        expect(hayTurn({})).toBe(false);
        const con = servidoresIce({ url: "turn:turn.example.org:3478, turns:turn.example.org:5349, http://malo", user: "u", cred: "c" });
        expect(con).toHaveLength(STUN_POR_DEFECTO.length + 1);
        expect(con.at(-1)).toEqual({ urls: ["turn:turn.example.org:3478", "turns:turn.example.org:5349"], username: "u", credential: "c" });
        expect(servidoresIce({ url: "turn:t.org:3478" }).at(-1)).toEqual({ urls: "turn:t.org:3478" });
        expect(servidoresIce({ url: "stun:no-cuenta" })).toHaveLength(STUN_POR_DEFECTO.length);
    });
});

describe("mensajes de error", () => {
    it("medios: permiso, sin dispositivo, ocupado y sin soporte", () => {
        expect(mensajeErrorMedios({ name: "NotAllowedError" }, { audio: true, video: false })).toMatch(/permiso para usar el micrófono/);
        expect(mensajeErrorMedios({ name: "NotFoundError" }, { audio: false, video: true })).toMatch(/ninguna cámara/);
        expect(mensajeErrorMedios({ name: "NotReadableError" }, { audio: true, video: true })).toMatch(/Otra aplicación/);
        expect(mensajeErrorMedios({ name: "TypeError" }, { audio: true, video: false })).toMatch(/https/);
        expect(mensajeErrorMedios({ name: "NotAllowedError" }, { audio: false, video: true, pantalla: true })).toMatch(/compartir la pantalla/);
        expect(mensajeErrorMedios(new Error("x"), { audio: true, video: false })).toMatch(/Vuelve a probar/);
    });

    it("sesión: sin desplegar, prohibida, no encontrada, terminada", () => {
        const ahora = new Date("2026-09-28T10:00:00Z");
        expect(clasificarErrorSesion("Las sesiones en vivo aún no están activadas en este servidor", null)).toBe("no-desplegada");
        expect(clasificarErrorSesion('relation "public.os_sesiones_vivas" does not exist', null)).toBe("no-desplegada");
        expect(clasificarErrorSesion("permission denied for table os_sesiones_vivas", null)).toBe("prohibida");
        expect(clasificarErrorSesion("Este enlace no es válido.", null)).toBe("no-encontrada");
        expect(clasificarErrorSesion(null, null)).toBe("no-encontrada");
        expect(clasificarErrorSesion(null, { estado: "terminada", caduca: null })).toBe("terminada");
        expect(clasificarErrorSesion(null, { estado: "activa", caduca: "2026-09-28T09:00:00Z" }, ahora)).toBe("terminada");
        expect(clasificarErrorSesion(null, { estado: "activa", caduca: null }, ahora)).toBe("ok");
        expect(clasificarErrorSesion("fallo raro", null)).toBe("otro");
    });
});
