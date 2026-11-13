/**
 * (AST1113A) La tira de presencia de `/agent` dice las MISMAS cifras que las pastillas «En curso» y «Agentes» del
 * pulso de MetaGenesis, y cuando no puede leerlas lo dice en vez de pintar un número. Una cifra vieja lleva su edad.
 */
import { describe, expect, it } from "vitest";

import { cifraDePastilla, detalleDeMedidor, type DatosMedidores } from "../medidores";
import { agentesDeDireccion, leerEstadoDireccion } from "../procesos-direccion";
import {
    CIFRA_VACIA,
    cifraDeAprobaciones,
    cifraDeMedidor,
    EN_VIVO_MS,
    haceTexto,
    motivoSinCifra,
    totalDePresencia,
    vistaPresencia,
    type EstadoPresencia,
    type Lectura,
    type RespuestaMedidor,
} from "../presencia-real";

const AHORA = Date.parse("2026-11-13T19:00:00Z");
const hace = (min: number) => AHORA - min * 60_000;

const DIRECCION = leerEstadoDireccion({
    generadoMs: AHORA,
    procesos: [
        { id: "AST1113A", titulo: "Tira de presencia", modelo: "claude-opus-5-5", tipo: "agente", donde: "~/x", estado: "activo", senal: "cambios en su árbol", ultimaSenalMs: hace(2), desdeMs: hace(20) },
        { id: "GEN1114INT", titulo: "Publicación", modelo: "claude-opus-5-5", tipo: "agente", donde: "~/y", estado: "activo", senal: "latido", ultimaSenalMs: hace(1), desdeMs: hace(40) },
        { id: "VIEJO1", titulo: "Callado", modelo: "claude-opus-5-5", tipo: "agente", donde: "~/z", estado: "activo", senal: "latido", ultimaSenalMs: hace(90), desdeMs: hace(200) },
    ],
});

const DATOS: Partial<DatosMedidores> = {
    progreso: { RANCIA1: { estado: "en_curso", t: "2026-11-13 10:00" } } as DatosMedidores["progreso"],
    titulos: {},
    latidos: [
        { tarea: "PET1", fase: "escribiendo", modelo: "nvidia/glm", minutos: 4, donde: "mac", quietoSegundos: 5, cola: "cola-auto-1" },
        ...agentesDeDireccion(DIRECCION, AHORA),
    ],
    escritores: { PET1: { pid: 123 } } as unknown as DatosMedidores["escritores"],
    enMarcha: { generadoMs: AHORA, carril: null, puerta: null, publicacion: null, direccion: DIRECCION },
};

/** Lo que devolvería `GET /api/mando/medidores?clave=…` con esos datos. */
function respuesta(clave: "agentes" | "en-curso", extra: Partial<RespuestaMedidor> = {}): Lectura<RespuestaMedidor> {
    return { ok: true, cuerpo: { detalle: detalleDeMedidor(clave, DATOS, AHORA), datosDe: new Date(hace(0.2)).toISOString(), obsoleto: false, ...extra }, leidoMs: AHORA };
}

describe("las cifras son las de las pastillas, no otra cuenta", () => {
    it("«agentes vivos» = pastilla «Agentes» (con los agentes de la dirección medidos, sin el callado)", () => {
        const pastilla = cifraDePastilla(detalleDeMedidor("agentes", DATOS, AHORA));
        expect(pastilla).toBe(3);
        expect(cifraDeMedidor(respuesta("agentes")).valor).toBe(pastilla);
    });

    it("«procesos activos» = pastilla «En curso»: la rancia está en la ventana pero no en la cifra", () => {
        const d = detalleDeMedidor("en-curso", DATOS, AHORA);
        expect(d.filas.length).toBe(4);
        expect(cifraDeMedidor(respuesta("en-curso")).valor).toBe(cifraDePastilla(d));
        expect(cifraDeMedidor(respuesta("en-curso")).valor).toBe(3);
    });

    it("el aviso del medidor viaja con la cifra (la dirección en silencio se nombra)", () => {
        expect(cifraDeMedidor(respuesta("agentes")).aviso).toContain("VIEJO1");
    });

    it("«aprobaciones pendientes» = cuántas fichas de visto bueno hay", () => {
        expect(cifraDeAprobaciones({ ok: true, cuerpo: { aprobaciones: [{}, {}] }, leidoMs: AHORA }).valor).toBe(2);
        expect(cifraDeAprobaciones({ ok: true, cuerpo: { aprobaciones: [] }, leidoMs: AHORA }).valor).toBe(0);
    });
});

describe("sin lectura no hay número", () => {
    it("la web publicada (404): ninguna cifra y se dice qué falta", () => {
        const no = { ok: false as const, estado: 404, leidoMs: AHORA };
        const e: EstadoPresencia = { procesos: cifraDeMedidor(no), agentes: cifraDeMedidor(no), aprobaciones: cifraDeAprobaciones(no) };
        const v = vistaPresencia(e, AHORA);
        expect(v.estado).toBe("sin-cifras");
        expect(Object.values(v.figuras).map((f) => f.valor)).toEqual([null, null, null]);
        expect(v.faltaCorto).toBe("no disponible aquí");
        expect(v.faltaLargo).toMatch(/^Sin cifras reales: esta copia de StarSeed no sirve los medidores de MetaGenesis/);
        expect(v.resumen).not.toMatch(/\d+ (procesos|agentes|aprobaci)/);
        expect(totalDePresencia(v)).toBeNull();
    });

    it("sin sesión (401) y sin acceso (403) se distinguen", () => {
        expect(motivoSinCifra(401).corto).toBe("sin sesión");
        expect(motivoSinCifra(403).corto).toBe("sin acceso");
        expect(motivoSinCifra(null).corto).toBe("sin conexión");
        expect(motivoSinCifra(401).definitivo && motivoSinCifra(403).definitivo && motivoSinCifra(404).definitivo).toBe(true);
        expect(motivoSinCifra(503).definitivo || motivoSinCifra(429).definitivo || motivoSinCifra(null).definitivo).toBe(false);
    });

    it("una lectura parcial pinta lo que hay y nombra lo que falta", () => {
        const e: EstadoPresencia = {
            procesos: cifraDeMedidor(respuesta("en-curso")),
            agentes: cifraDeMedidor(respuesta("agentes")),
            aprobaciones: cifraDeAprobaciones({ ok: false, estado: 500, leidoMs: AHORA }),
        };
        const v = vistaPresencia(e, AHORA);
        expect(v.estado).toBe("con-cifras");
        expect(v.figuras.aprobaciones.valor).toBeNull();
        expect(v.faltaLargo).toMatch(/^Sin aprobaciones pendientes: el servidor de Genesis falló al medir \(error 500\)/);
        expect(totalDePresencia(v)).toBeNull(); // la orbe no suma a medias
    });

    it("una respuesta sin `detalle.filas` no se convierte en 0", () => {
        expect(cifraDeMedidor({ ok: true, cuerpo: {}, leidoMs: AHORA }).valor).toBeNull();
        expect(cifraDeAprobaciones({ ok: true, cuerpo: {}, leidoMs: AHORA }).valor).toBeNull();
    });
});

describe("edad de las cifras", () => {
    it("en vivo: sin edad", () => {
        const e: EstadoPresencia = {
            procesos: cifraDeMedidor(respuesta("en-curso")),
            agentes: cifraDeMedidor(respuesta("agentes")),
            aprobaciones: cifraDeAprobaciones({ ok: true, cuerpo: { aprobaciones: [] }, leidoMs: AHORA }),
        };
        const v = vistaPresencia(e, AHORA + 10_000);
        expect(v.edad).toBeNull();
        expect(totalDePresencia(v)).toBe(6);
        expect(v.resumen).toMatch(/^3 procesos activos .* · 3 agentes vivos .* · 0 aprobaciones pendientes .*, en vivo\./);
    });

    it("datos de hace 7 min (reunión vieja) llevan su edad, y la más vieja manda", () => {
        const viejo = respuesta("agentes", { datosDe: new Date(hace(7)).toISOString(), obsoleto: true });
        const e: EstadoPresencia = {
            procesos: cifraDeMedidor(respuesta("en-curso")),
            agentes: cifraDeMedidor(viejo),
            aprobaciones: cifraDeAprobaciones({ ok: true, cuerpo: { aprobaciones: [] }, leidoMs: AHORA }),
        };
        const v = vistaPresencia(e, AHORA);
        expect(v.figuras.agentes.edad).toBe("hace 7 min");
        expect(v.figuras.procesos.edad).toBeNull();
        expect(v.edad).toBe("hace 7 min");
        expect(v.resumen).toContain("medido hace 7 min");
    });

    it("un fallo pasajero conserva la última cifra CON su edad; uno definitivo la borra", () => {
        const buena = cifraDeMedidor(respuesta("agentes"));
        const tras503 = cifraDeMedidor({ ok: false, estado: 503, leidoMs: AHORA + 5 * 60_000 }, buena);
        expect(tras503.valor).toBe(3);
        expect(tras503.motivo).toMatch(/^última lectura fallida/);
        const v = vistaPresencia({ procesos: tras503, agentes: tras503, aprobaciones: { ...CIFRA_VACIA, valor: 0, medidoMs: AHORA } }, AHORA + 5 * 60_000);
        expect(v.figuras.agentes.edad).toBe("hace 5 min");
        expect(v.avisos.join(" ")).toMatch(/última lectura fallida/);
        const tras403 = cifraDeMedidor({ ok: false, estado: 403, leidoMs: AHORA }, buena);
        expect(tras403.valor).toBeNull();
    });

    it("la frontera de «en vivo» y los textos de edad", () => {
        expect(EN_VIVO_MS).toBe(60_000);
        expect(haceTexto(30_000)).toBe("hace menos de 1 min");
        expect(haceTexto(125 * 60_000)).toBe("hace 2 h 5 min");
    });

    it("antes de la primera lectura: «Midiendo…», sin números", () => {
        const v = vistaPresencia(null, AHORA);
        expect(v.estado).toBe("cargando");
        expect(v.resumen).toMatch(/^Midiendo/);
    });
});
