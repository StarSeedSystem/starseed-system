import { describe, it, expect } from "vitest";
import { contarEspectadores, filaEstacionDeSesion, type PresenciaEnSesion } from "../estacion-de-sesion";
import { rangoDeSesion, puedeEditarSesion } from "../traduccion-roles";
import { aPestanasDePagina } from "@/lib/entidad-espacio/pestanas-pagina";
import type { Pestana } from "@/lib/entidad-espacio/modelo";

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";
const SESION_ID = "9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d";
const TOKEN = "abcdefghij0123456789ABCDEFGHIJ0123456789abc";
const DUENO = "11111111-2222-4333-8444-555555555555";

function pestana(id: string, titulo: string, sesionId: string): Pestana {
    return { id, titulo, tipo: "pizarra", sesionId, visibilidad: "publica", accesoPublico: "ver" };
}
function render(p: Pestana): string { return `nodo:${p.id}`; }

describe("espectador y pestaña en vivo (P1-D)", () => {
    describe("contarEspectadores + rangoDeSesion", () => {
        it("espectador por enlace público: cuenta 1, no edita", () => {
            expect(contarEspectadores([{ uid: "a", rango: "ver" }])).toBe(1);
            const r = rangoDeSesion({ rolEntidad: null, esDuenoSesion: false, esComentarista: false, conEnlacePublico: true });
            expect(r).toBe("ver"); expect(puedeEditarSesion(r)).toBe(false);
        });
        it("3 espectadores + 2 editores = 3 espectadores", () => {
            expect(contarEspectadores([
                { uid: "v1", rango: "ver" }, { uid: "v2", rango: "ver" }, { uid: "v3", rango: "ver" },
                { uid: "e1", rango: "editar" }, { uid: "e2", rango: "editar" },
            ])).toBe(3);
        });
        it("misma persona con dos pestañas ver cuenta una vez", () => {
            expect(contarEspectadores([{ uid: "x", rango: "ver" }, { uid: "x", rango: "ver" }])).toBe(1);
        });
        it("comentar, moderar, gestionar, dueno, null no cuentan", () => {
            expect(contarEspectadores([
                { uid: "c", rango: "comentar" }, { uid: "m", rango: "moderar" },
                { uid: "g", rango: "gestionar" }, { uid: "d", rango: "dueno" }, { uid: "n", rango: null },
            ])).toBe(0);
        });
    });

    describe("filaEstacionDeSesion", () => {
        it("tipo pizarra → enlace /vivo/<id>?t=<token>", () => {
            const r = filaEstacionDeSesion({ sesionId: SESION_ID, tipo: "pizarra", titulo: "P", token: TOKEN, propietario: DUENO });
            expect(r.ok).toBe(true); if (!r.ok) return;
            expect(r.fila.tipo).toBe("pizarra");
            expect(r.fila.enlace).toBe(`/vivo/${SESION_ID}?t=${TOKEN}`);
        });
        it("tipo dashboard → enlace /vivo/<id>?t=<token>", () => {
            const r = filaEstacionDeSesion({ sesionId: SESION_ID, tipo: "dashboard", titulo: "D", token: TOKEN, propietario: DUENO });
            expect(r.ok).toBe(true); if (!r.ok) return;
            expect(r.fila.tipo).toBe("dashboard");
            expect(r.fila.enlace).toBe(`/vivo/${SESION_ID}?t=${TOKEN}`);
        });
        it("con entidadRef → ambito_tipo entidad y entidad_ref", () => {
            const r = filaEstacionDeSesion({ sesionId: SESION_ID, tipo: "pizarra", titulo: "P", token: TOKEN, propietario: DUENO, entidadRef: "g-1" });
            expect(r.ok).toBe(true); if (!r.ok) return;
            expect(r.fila.ambito_tipo).toBe("entidad"); expect(r.fila.entidad_ref).toBe("g-1");
        });
        it("sin entidadRef → ambito_tipo persona y entidad_ref null", () => {
            const r = filaEstacionDeSesion({ sesionId: SESION_ID, tipo: "pizarra", titulo: "P", token: TOKEN, propietario: DUENO });
            expect(r.ok).toBe(true); if (!r.ok) return;
            expect(r.fila.ambito_tipo).toBe("persona"); expect(r.fila.entidad_ref).toBeNull();
        });
        it("rechaza id, token o propietario inválidos", () => {
            expect(filaEstacionDeSesion({ sesionId: "x", tipo: "pizarra", titulo: "P", token: TOKEN, propietario: DUENO }).ok).toBe(false);
            expect(filaEstacionDeSesion({ sesionId: SESION_ID, tipo: "pizarra", titulo: "P", token: "x", propietario: DUENO }).ok).toBe(false);
            expect(filaEstacionDeSesion({ sesionId: SESION_ID, tipo: "pizarra", titulo: "P", token: TOKEN, propietario: " " }).ok).toBe(false);
        });
    });

    describe("aPestanasDePagina", () => {
        it("directo con 2 personas → marca y contador 2", () => {
            const res = aPestanasDePagina([pestana("e1", "Pizarra", UUID_A)], { [UUID_A]: { directo: true, personas: 2 } }, render);
            expect(res[0].label).toBe("Pizarra ● EN VIVO · 2");
        });
        it("0 personas → pierde contador y marca EN VIVO", () => {
            const res = aPestanasDePagina([pestana("e1", "Pizarra", UUID_A)], { [UUID_A]: { directo: false, personas: 0 } }, render);
            expect(res[0].label).toBe("Pizarra");
        });
        it("directo=false aunque haya personas → sin marca", () => {
            const res = aPestanasDePagina([pestana("e1", "Pizarra", UUID_A)], { [UUID_A]: { directo: false, personas: 5 } }, render);
            expect(res[0].label).toBe("Pizarra");
        });
        it("sesión ausente del mapa → sin marca", () => {
            const res = aPestanasDePagina([pestana("e1", "Pizarra", UUID_A)], {}, render);
            expect(res[0].label).toBe("Pizarra");
        });
        it("solo pestañas con sesión en directo muestran marca", () => {
            const res = aPestanasDePagina(
                [pestana("e1", "Pizarra", UUID_A), pestana("e2", "Dashboard", UUID_B)],
                { [UUID_A]: { directo: true, personas: 3 } }, render);
            expect(res[0].label).toBe("Pizarra ● EN VIVO · 3");
            expect(res[1].label).toBe("Dashboard");
        });
        it("personas NaN o negativas → 0", () => {
            expect(aPestanasDePagina([pestana("e1", "P", UUID_A)], { [UUID_A]: { directo: true, personas: NaN } }, render)[0].label).toContain("· 0");
            expect(aPestanasDePagina([pestana("e1", "P", UUID_A)], { [UUID_A]: { directo: true, personas: -5 } }, render)[0].label).toContain("· 0");
        });
    });
});