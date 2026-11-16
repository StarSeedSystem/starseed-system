import { describe, expect, it } from "vitest";
import {
    contarEspectadores, compartirEnVivo, filaEstacionDeSesion,
    type DependenciasCompartir, type OpcionesCompartirEnVivo, type PresenciaEnSesion,
} from "../estacion-de-sesion";
import { MENSAJE_SIN_DESPLEGAR } from "@/lib/mensajeria/sesiones-vivas";
import { puedeEditarSesion } from "@/lib/vivo-entidad/traduccion-roles";
import { validarEstacion, type Estacion } from "@/lib/estaciones/tipos";

const SESION_ID = "9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d";
const TOKEN = "abcdefghij0123456789ABCDEFGHIJ0123456789abc"; // base64url, 43 caracteres
const DUENO = "11111111-2222-4333-8444-555555555555";
const UID_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UID_B = "99999999-8888-4777-8666-555555555555";

interface Grabacion { pases: { modo: string; permiso: string }[]; estaciones: unknown[]; }

function depsFalsas(grabacion: Grabacion, opciones?: { errorPase?: string | null; errorEstacion?: string }) {
    const deps: DependenciasCompartir = {
        crearPase: async (entrada) => {
            grabacion.pases.push({ modo: entrada.modo, permiso: entrada.permiso });
            if (opciones?.errorPase) return { sesion: null, error: opciones.errorPase };
            const tokenPublico = entrada.modo === "publico" ? TOKEN : null;
            return { sesion: { id: SESION_ID, tipo: entrada.tipo, tokenPublico, creador: DUENO }, error: null };
        },
        crearEstacion: async (borrador) => {
            grabacion.estaciones.push(borrador);
            if (opciones?.errorEstacion) return { ok: false, error: opciones.errorEstacion };
            return { ok: true, estacion: borrador as unknown as Estacion };
        },
    };
    return deps;
}

function opcionesBase(extra: Partial<OpcionesCompartirEnVivo> = {}): OpcionesCompartirEnVivo {
    return { tipo: "pizarra", titulo: "Plan del huerto", ...extra };
}

describe("filaEstacionDeSesion", () => {
    it("construye la fila con la forma exacta del enlace de espectadores", () => {
        const r = filaEstacionDeSesion({
            sesionId: SESION_ID, tipo: "pizarra", titulo: "Plan del huerto",
            token: TOKEN, propietario: DUENO,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.fila.enlace).toBe(`/vivo/${SESION_ID}?t=${TOKEN}`);
        expect(r.fila.tipo).toBe("pizarra");
        expect(r.fila.fuente).toBe("starseed");
        expect(validarEstacion(r.fila).ok).toBe(true);
    });
    it("rechaza id de sesión o token que no valen, con motivo", () => {
        const sinId = filaEstacionDeSesion({
            sesionId: "no-es-un-uuid", tipo: "dashboard", titulo: "X", token: TOKEN, propietario: DUENO,
        });
        const sinToken = filaEstacionDeSesion({
            sesionId: SESION_ID, tipo: "pizarra", titulo: "X", token: "corto", propietario: DUENO,
        });
        expect(sinId.ok).toBe(false); if (!sinId.ok) expect(sinId.motivo.length).toBeGreaterThan(0);
        expect(sinToken.ok).toBe(false); if (!sinToken.ok) expect(sinToken.motivo.length).toBeGreaterThan(0);    });});

describe("compartirEnVivo", () => {
    it("por defecto: mis neuronas editando, sin estación", async () => {
        const g: Grabacion = { pases: [], estaciones: [] };
        const r = await compartirEnVivo(depsFalsas(g), opcionesBase());
        expect(g.pases[0]?.modo).toBe("chat"); expect(g.pases[0]?.permiso).toBe("editar");
        expect(g.estaciones).toHaveLength(0);
        if (!r.ok) throw new Error("debió compartir");
        expect(r.enlace).toBe(`/vivo/${SESION_ID}`);
    });
    it("con enlace: pase público, estación con el mismo enlace y permiso de ver", async () => {
        const g: Grabacion = { pases: [], estaciones: [] };
        const r = await compartirEnVivo(depsFalsas(g), opcionesBase({ con: "enlace", acceso: "mirar" }));
        expect(g.pases[0]?.modo).toBe("publico"); expect(g.pases[0]?.permiso).toBe("ver");
        expect(g.estaciones).toHaveLength(1);
        if (!r.ok) throw new Error("debió compartir");
        expect(r.enlace).toBe(`/vivo/${SESION_ID}?t=${TOKEN}`);
    });
    it("con acceso mirar crea la estación aunque el destino sean mis neuronas", async () => {
        const g: Grabacion = { pases: [], estaciones: [] };
        const r = await compartirEnVivo(depsFalsas(g), opcionesBase({ acceso: "mirar" }));
        expect(g.estaciones).toHaveLength(1); expect(g.pases[0]?.permiso).toBe("ver");
        if (!r.ok) throw new Error("debió compartir");
        expect(r.enlace).toBe(`/vivo/${SESION_ID}?t=${TOKEN}`);
    });
    it("esquema ausente: motivo honesto y ninguna estación creada", async () => {
        const g: Grabacion = { pases: [], estaciones: [] };
        const r = await compartirEnVivo(
            depsFalsas(g, { errorPase: MENSAJE_SIN_DESPLEGAR }), opcionesBase({ con: "enlace" }),
        );
        expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toBe(MENSAJE_SIN_DESPLEGAR);
        expect(g.estaciones).toHaveLength(0);
        const g2: Grabacion = { pases: [], estaciones: [] };
        const r2 = await compartirEnVivo(
            depsFalsas(g2, { errorEstacion: MENSAJE_SIN_DESPLEGAR }), opcionesBase({ con: "enlace" }),
        );
        expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.motivo).toBe(MENSAJE_SIN_DESPLEGAR);
        expect(g2.estaciones).toHaveLength(1);
    });
    it("persona invitada queda en la lista y el dueño no cuenta como persona", async () => {
        const g: Grabacion = { pases: [], estaciones: [] };
        const r = await compartirEnVivo(depsFalsas(g), opcionesBase({ invitados: [UID_A, UID_B, DUENO, "no-uuid"] }));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.personas).toEqual([UID_A, UID_B]);
    });
});

describe("contarEspectadores", () => {
    it("cuenta personas únicas con rango ver; los editores no cuentan", () => {
        const presencias: PresenciaEnSesion[] = [
            { uid: UID_A, rango: "ver" }, { uid: UID_A, rango: "ver" }, // dos pestañas, una persona
            { uid: UID_B, rango: "editar" }, { uid: DUENO, rango: "dueno" }, { uid: "otro", rango: null },
        ];
        expect(contarEspectadores(presencias)).toBe(1);
        expect(puedeEditarSesion("ver")).toBe(false); expect(puedeEditarSesion("editar")).toBe(true);    });
});
