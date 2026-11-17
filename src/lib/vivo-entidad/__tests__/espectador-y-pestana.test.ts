import { describe, it, expect } from "vitest";
import { contarEspectadores, filaEstacionDeSesion, type PresenciaEnSesion } from "../estacion-de-sesion";
import { rangoDeSesion, puedeEditarSesion } from "../traduccion-roles";
import { aPestanasDePagina } from "@/lib/entidad-espacio/pestanas-pagina";
import type { Pestana } from "@/lib/entidad-espacio/modelo";

const SESION_ID = "9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d";
const TOKEN = "abcdefghij0123456789ABCDEFGHIJ0123456789abc";
const DUENO = "11111111-2222-4333-8444-555555555555";
const UID_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UID_B = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const UID_C = "cccccccc-dddd-4eee-8fff-000000000000";
const UID_D = "dddddddd-eeee-4fff-8000-111111111111";
const UID_E = "eeeeeeee-ffff-4000-8111-222222222222";

function pestana(id: string, titulo: string, sesionId: string): Pestana {
    return {
        id,
        titulo,
        tipo: "pizarra",
        sesionId,
        visibilidad: "publica",
        accesoPublico: "ver",
    };
}

function render(p: Pestana): string {
    return `nodo:${p.id}`;
}

describe("espectador y pestaña en vivo (SVF1D3b)", () => {
    describe("contarEspectadores y rangoDeSesion", () => {
        it("un espectador por enlace público cuenta 1 y no edita", () => {
            const ctx = { rolEntidad: null, esDuenoSesion: false, esComentarista: false, conEnlacePublico: true } as const;
            const rango = rangoDeSesion(ctx);
            expect(rango).toBe("ver");
            expect(puedeEditarSesion(rango)).toBe(false);

            const presencias: PresenciaEnSesion[] = [{ uid: UID_A, rango }];
            expect(contarEspectadores(presencias)).toBe(1);
        });

        it("3 espectadores + 2 editores dan 3 espectadores", () => {
            const presencias: PresenciaEnSesion[] = [
                { uid: UID_A, rango: "ver" },
                { uid: UID_B, rango: "ver" },
                { uid: UID_C, rango: "ver" },
                { uid: UID_D, rango: "editar" },
                { uid: UID_E, rango: "editar" },
            ];
            expect(contarEspectadores(presencias)).toBe(3);
        });

        it("la misma persona con dos pestañas de ver cuenta una vez", () => {
            const presencias: PresenciaEnSesion[] = [
                { uid: UID_A, rango: "ver" },
                { uid: UID_A, rango: "ver" },
            ];
            expect(contarEspectadores(presencias)).toBe(1);
        });

        it("rango comentar no cuenta como espectador", () => {
            const presencias: PresenciaEnSesion[] = [
                { uid: UID_A, rango: "ver" },
                { uid: UID_B, rango: "comentar" },
            ];
            expect(contarEspectadores(presencias)).toBe(1);
        });
    });

    describe("filaEstacionDeSesion", () => {
        it("pestaña tipo pizarra lleva enlace /vivo/<id>?t=<token>", () => {
            const r = filaEstacionDeSesion({
                sesionId: SESION_ID,
                tipo: "pizarra",
                titulo: "Pizarra de estudio",
                token: TOKEN,
                propietario: DUENO,
            });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.fila.tipo).toBe("pizarra");
            expect(r.fila.enlace).toBe(`/vivo/${SESION_ID}?t=${TOKEN}`);
            expect(r.fila.fuente).toBe("starseed");
            expect(r.fila.visibilidad).toBe("publica");
        });

        it("pestaña tipo dashboard lleva enlace /vivo/<id>?t=<token>", () => {
            const r = filaEstacionDeSesion({
                sesionId: SESION_ID,
                tipo: "dashboard",
                titulo: "Dashboard de métricas",
                token: TOKEN,
                propietario: DUENO,
            });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.fila.tipo).toBe("dashboard");
            expect(r.fila.enlace).toBe(`/vivo/${SESION_ID}?t=${TOKEN}`);
        });

        it("con entidadRef lleva ambito_tipo entidad", () => {
            const ENTIDAD = "ent_abc123";
            const r = filaEstacionDeSesion({
                sesionId: SESION_ID,
                tipo: "pizarra",
                titulo: "Pizarra del grupo",
                token: TOKEN,
                propietario: DUENO,
                entidadRef: ENTIDAD,
            });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.fila.ambito_tipo).toBe("entidad");
            expect(r.fila.entidad_ref).toBe(ENTIDAD);
        });

        it("sin entidadRef lleva ambito_tipo persona", () => {
            const r = filaEstacionDeSesion({
                sesionId: SESION_ID,
                tipo: "pizarra",
                titulo: "Pizarra personal",
                token: TOKEN,
                propietario: DUENO,
            });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.fila.ambito_tipo).toBe("persona");
            expect(r.fila.entidad_ref).toBeNull();
        });
    });

    describe("aPestanasDePagina", () => {
        it("una sesión en directo con 2 personas sale como pestaña con punto y contador 2", () => {
            const lista = [pestana("e1", "Pizarra", SESION_ID)];
            const res = aPestanasDePagina(lista, { [SESION_ID]: { directo: true, personas: 2 } }, render);
            expect(res).toHaveLength(1);
            expect(res[0].label).toBe("Pizarra ● EN VIVO · 2");
            expect(res[0].node).toBe("nodo:e1");
        });

        it("al quedar a 0 personas pierde el contador y la marca de directo", () => {
            const lista = [pestana("e1", "Dashboard", SESION_ID)];
            const res = aPestanasDePagina(lista, { [SESION_ID]: { directo: true, personas: 0 } }, render);
            expect(res[0].label).toBe("Dashboard");
        });

        it("sin dato de directo sale sin marca", () => {
            const lista = [pestana("e1", "Tabla", SESION_ID)];
            const res = aPestanasDePagina(lista, {}, render);
            expect(res[0].label).toBe("Tabla");
        });

        it("directo false sale sin marca aunque haya personas en el mapa", () => {
            const lista = [pestana("e1", "Pizarra", SESION_ID)];
            const res = aPestanasDePagina(lista, { [SESION_ID]: { directo: false, personas: 5 } }, render);
            expect(res[0].label).toBe("Pizarra");
        });
    });
});