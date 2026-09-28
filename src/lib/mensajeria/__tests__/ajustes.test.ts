import { describe, expect, test } from "vitest";
import { AJUSTES_DEFECTO, type AjustesMensajeria } from "@/lib/mensajeria/ajustes-tipos";
import {
    ajustesEfectivos,
    estaSilenciado,
    fondoCss,
    fusionarConDefecto,
    fusionarDocsAjustes,
    OPCIONES_SILENCIO,
    tamanoLetraPx,
} from "@/lib/mensajeria/ajustes";

function docBase(actualizado = "2026-01-01T00:00:00.000Z"): AjustesMensajeria {
    return { ...AJUSTES_DEFECTO, hilos: {}, actualizado };
}

describe("fusionarConDefecto", () => {
    test("valores desconocidos/vacíos devuelven el default", () => {
        expect(fusionarConDefecto(undefined)).toEqual(AJUSTES_DEFECTO);
        expect(fusionarConDefecto(null)).toEqual(AJUSTES_DEFECTO);
        expect(fusionarConDefecto("no soy un objeto")).toEqual(AJUSTES_DEFECTO);
    });

    test("fusiona campos válidos e ignora los de tipo incorrecto", () => {
        const out = fusionarConDefecto({
            chats: { enviarConEnter: false, ordenLista: 42, apariencia: { tamanoLetra: "xl", colorBurbuja: 7 } },
            privacidad: { mostrarEnLinea: "nadie" },
        });
        expect(out.chats.enviarConEnter).toBe(false);
        // "ordenLista: 42" no es válido → se conserva el default.
        expect(out.chats.ordenLista).toBe(AJUSTES_DEFECTO.chats.ordenLista);
        expect(out.chats.apariencia.tamanoLetra).toBe("xl");
        // "colorBurbuja: 7" no es string → default.
        expect(out.chats.apariencia.colorBurbuja).toBe(AJUSTES_DEFECTO.chats.apariencia.colorBurbuja);
        expect(out.privacidad.mostrarEnLinea).toBe("nadie");
        // El resto de privacidad sigue siendo el default (fusión profunda, no reemplazo del bloque).
        expect(out.privacidad.escribirme).toBe(AJUSTES_DEFECTO.privacidad.escribirme);
    });

    test("fondo con tipo inválido cae al default; con tipo válido se respeta", () => {
        const out1 = fusionarConDefecto({ chats: { apariencia: { fondo: { tipo: "marciano" } } } });
        expect(out1.chats.apariencia.fondo).toEqual(AJUSTES_DEFECTO.chats.apariencia.fondo);

        const out2 = fusionarConDefecto({ chats: { apariencia: { fondo: { tipo: "color", color: "#112233" } } } });
        expect(out2.chats.apariencia.fondo).toEqual({ tipo: "color", color: "#112233" });
    });

    test("hilos: conserva overrides parciales válidos y descarta campos corruptos", () => {
        const out = fusionarConDefecto({
            hilos: {
                h1: { fijado: true, apodo: 123, notificaciones: { silencioHasta: "siempre" }, actualizado: "2026-02-01T00:00:00.000Z" },
                h2: "esto no es un objeto",
            },
        });
        expect(out.hilos.h1).toEqual({
            fijado: true,
            notificaciones: { silencioHasta: "siempre" },
            actualizado: "2026-02-01T00:00:00.000Z",
        });
        expect(out.hilos.h2).toBeUndefined();
    });
});

describe("estaSilenciado", () => {
    const notifActiva = { activas: true, sonido: true, vistaPrevia: true, silencioHasta: null };

    test("sin silencioHasta ni horas: no silenciado", () => {
        expect(estaSilenciado(notifActiva, new Date("2026-06-01T12:00:00.000Z"))).toBe(false);
    });

    test('silencioHasta: "siempre" siempre silencia', () => {
        expect(estaSilenciado({ ...notifActiva, silencioHasta: "siempre" })).toBe(true);
    });

    test("silencioHasta futura silencia; pasada no", () => {
        const ahora = new Date("2026-06-01T12:00:00.000Z");
        expect(estaSilenciado({ ...notifActiva, silencioHasta: "2026-06-01T13:00:00.000Z" }, ahora)).toBe(true);
        expect(estaSilenciado({ ...notifActiva, silencioHasta: "2026-06-01T11:00:00.000Z" }, ahora)).toBe(false);
    });

    test("horasSilencio dentro del mismo día (09:00–17:00)", () => {
        const horas = { activo: true, desde: "09:00", hasta: "17:00" };
        expect(estaSilenciado(notifActiva, new Date(2026, 5, 1, 10, 0), horas)).toBe(true);
        expect(estaSilenciado(notifActiva, new Date(2026, 5, 1, 20, 0), horas)).toBe(false);
    });

    test("horasSilencio cruzando medianoche (23:00–07:00)", () => {
        const horas = { activo: true, desde: "23:00", hasta: "07:00" };
        // 23:30 → dentro (tramo nocturno tras las 23:00)
        expect(estaSilenciado(notifActiva, new Date(2026, 5, 1, 23, 30), horas)).toBe(true);
        // 03:00 → dentro (tramo de madrugada antes de las 07:00)
        expect(estaSilenciado(notifActiva, new Date(2026, 5, 2, 3, 0), horas)).toBe(true);
        // 12:00 → fuera de la ventana
        expect(estaSilenciado(notifActiva, new Date(2026, 5, 1, 12, 0), horas)).toBe(false);
    });

    test("horasSilencio inactivo no silencia aunque la hora caiga dentro", () => {
        const horas = { activo: false, desde: "23:00", hasta: "07:00" };
        expect(estaSilenciado(notifActiva, new Date(2026, 5, 1, 23, 30), horas)).toBe(false);
    });
});

describe("OPCIONES_SILENCIO", () => {
    test("las 4 opciones calculan `hasta` de forma coherente", () => {
        const ahora = new Date("2026-06-01T00:00:00.000Z");
        const porId = Object.fromEntries(OPCIONES_SILENCIO.map((o) => [o.id, o]));
        expect(porId["1h"].hasta(ahora)).toBe("2026-06-01T01:00:00.000Z");
        expect(porId["8h"].hasta(ahora)).toBe("2026-06-01T08:00:00.000Z");
        expect(porId["1sem"].hasta(ahora)).toBe("2026-06-08T00:00:00.000Z");
        expect(porId["siempre"].hasta(ahora)).toBe("siempre");
    });
});

describe("fondoCss / tamanoLetraPx", () => {
    test("fondoCss por tipo", () => {
        expect(fondoCss({ tipo: "ninguno" })).toBe("transparent");
        expect(fondoCss({ tipo: "color", color: "#ff0000" })).toBe("#ff0000");
        expect(fondoCss({ tipo: "preset", id: "nebulosa" })).toContain("radial-gradient");
        expect(fondoCss({ tipo: "preset", id: "no-existe" })).toBe("transparent");
        expect(fondoCss({ tipo: "imagen", url: "https://cdn.example.com/x.jpg" })).toBe('url("https://cdn.example.com/x.jpg") center/cover');
        expect(fondoCss({ tipo: "imagen", url: "/local/x.jpg" })).toBe('url("/local/x.jpg") center/cover');
        expect(fondoCss({ tipo: "imagen", url: "http://inseguro.com/x.jpg" })).toBe("transparent");
    });

    test("tamanoLetraPx", () => {
        expect(tamanoLetraPx("s")).toBe(13);
        expect(tamanoLetraPx("m")).toBe(15);
        expect(tamanoLetraPx("l")).toBe(17);
        expect(tamanoLetraPx("xl")).toBe(20);
    });
});

describe("ajustesEfectivos", () => {
    test("enruta el tipo de hilo a la sección de notificaciones correcta", () => {
        const doc = docBase();
        const efDm = ajustesEfectivos(doc, null, "dm");
        expect(efDm.notificaciones).toEqual(AJUSTES_DEFECTO.notificaciones.mensajes);
        const efGrupo = ajustesEfectivos(doc, null, "grupo");
        expect(efGrupo.notificaciones).toEqual(AJUSTES_DEFECTO.notificaciones.grupos);
        const efCorreo = ajustesEfectivos(doc, null, "correo");
        expect(efCorreo.notificaciones).toEqual(AJUSTES_DEFECTO.notificaciones.correos);
    });

    test("un override de hilo se funde por encima de la sección, sin tocar el resto", () => {
        const doc: AjustesMensajeria = {
            ...docBase(),
            hilos: {
                h1: {
                    apodo: "Mi gente",
                    fijado: true,
                    notificaciones: { silencioHasta: "siempre" },
                    apariencia: { tamanoLetra: "xl" },
                    actualizado: "2026-01-02T00:00:00.000Z",
                },
            },
        };
        const ef = ajustesEfectivos(doc, "h1", "dm");
        expect(ef.apodo).toBe("Mi gente");
        expect(ef.fijado).toBe(true);
        expect(ef.silenciado).toBe(true);
        expect(ef.notificaciones.activas).toBe(AJUSTES_DEFECTO.notificaciones.mensajes.activas);
        expect(ef.apariencia.tamanoLetra).toBe("xl");
        expect(ef.apariencia.colorBurbuja).toBe(AJUSTES_DEFECTO.chats.apariencia.colorBurbuja);
    });

    test("sin override de hilo, hereda todo de la sección", () => {
        const ef = ajustesEfectivos(docBase(), "sin-datos", "dm");
        expect(ef.apodo).toBeNull();
        expect(ef.fijado).toBe(false);
        expect(ef.archivado).toBe(false);
        expect(ef.vaciadoEn).toBeNull();
        expect(ef.silenciado).toBe(false);
    });

    test("las horasSilencio globales también silencian un hilo concreto", () => {
        const doc: AjustesMensajeria = {
            ...docBase(),
            notificaciones: {
                ...AJUSTES_DEFECTO.notificaciones,
                horasSilencio: { activo: true, desde: "23:00", hasta: "07:00" },
            },
        };
        const ef = ajustesEfectivos(doc, null, "dm", new Date(2026, 5, 1, 23, 30));
        expect(ef.silenciado).toBe(true);
    });
});

describe("fusionarDocsAjustes", () => {
    test("las secciones se toman en bloque del documento más reciente", () => {
        const a: AjustesMensajeria = { ...docBase("2026-01-01T00:00:00.000Z"), chats: { ...AJUSTES_DEFECTO.chats, enviarConEnter: false } };
        const b: AjustesMensajeria = { ...docBase("2026-02-01T00:00:00.000Z"), chats: { ...AJUSTES_DEFECTO.chats, enviarConEnter: true } };
        const fundidoAB = fusionarDocsAjustes(a, b);
        const fundidoBA = fusionarDocsAjustes(b, a);
        expect(fundidoAB.chats.enviarConEnter).toBe(true); // b es más reciente
        expect(fundidoAB.actualizado).toBe(b.actualizado);
        expect(fundidoBA).toEqual(fundidoAB); // conmutativo
    });

    test("los hilos se fusionan uno a uno por su propio `actualizado`, no en bloque", () => {
        const a: AjustesMensajeria = {
            ...docBase("2026-01-01T00:00:00.000Z"),
            hilos: {
                h1: { apodo: "Viejo", actualizado: "2026-01-01T00:00:00.000Z" },
                h2: { fijado: true, actualizado: "2026-03-01T00:00:00.000Z" },
            },
        };
        const b: AjustesMensajeria = {
            ...docBase("2026-01-05T00:00:00.000Z"), // documento "b" es más reciente en bloque…
            hilos: {
                h1: { apodo: "Nuevo", actualizado: "2026-02-01T00:00:00.000Z" }, // …y h1 de b también es más nuevo
            },
        };
        const fundido = fusionarDocsAjustes(a, b);
        expect(fundido.hilos.h1.apodo).toBe("Nuevo");
        // h2 solo existe en "a" pero es MÁS NUEVO que el bloque de "b": se conserva igualmente.
        expect(fundido.hilos.h2).toEqual(a.hilos.h2);
    });
});
