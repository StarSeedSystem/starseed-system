// Voz del trabajo y acuse (VZF1015O · `voz-fusionada-astraura.md` §4): textos,
// prioridad, ritmo de 8 s, silencio y persona hablando. Reloj virtual, sin audio.
import { describe, expect, it } from "vitest";
import { ACUSES, acusesDe, crearVozDelTrabajo, elegirAcuse, escucharTareas, fraseDePaso, fraseDeTarea, frasesDeCambio, puedeNarrar } from "@/lib/aurora/voz-del-trabajo";
import type { BgTask } from "@/lib/aurora/background/task-manager";
const tarea = (p: Partial<BgTask> & { id: string; title: string }): BgTask => ({ status: "running", createdAt: 0, updatedAt: 0, ...p });
function banco(estado: { hablando?: boolean; silencio?: boolean } = {}) {
    const ev: string[] = [], registros: string[] = [];
    const s = { t: 1_000, hablando: estado.hablando ?? false, silencio: estado.silencio ?? false };
    const voz = crearVozDelTrabajo({
        hablar: async (texto, o) => { ev.push(`${o.contexto}:${texto}`); return true; },
        ahora: () => s.t,
        personaHablando: () => s.hablando,
        enSilencio: () => s.silencio,
        registrar: (m) => registros.push(m),
    });
    return { ev, s, registros, voz };
}
describe("voz del trabajo · acuse", () => {
    it("cada persona tiene su lista, el turno rota y quien no tiene lista cae a los de Aurora", () => {
        expect(acusesDe("Aurora")).toEqual(ACUSES.aurora);
        expect(elegirAcuse("aurora", 0)).toBe("Voy.");
        expect(elegirAcuse("aurora", 1)).toBe("Lo miro.");
        expect(elegirAcuse("aurora", 3)).toBe("Voy.");
        expect(elegirAcuse("desconocida", 1)).toBe("Lo miro.");
        expect(elegirAcuse(undefined, 2)).toBe("Dame un segundo.");
    });
    it("el acuse suena al momento por la puerta de voz, en contexto aviso y con su persona", async () => {
        const { ev, s, voz } = banco();
        expect(await voz.acusar("hermes")).toBe(true);
        expect(ev).toEqual(["aviso:Enseguida."]);
        expect(s.t).toBe(1_000);
        expect(await voz.acusar("hermes")).toBe(true);
        expect(ev.at(-1)).toBe("aviso:Me pongo.");
    });
});
describe("voz del trabajo · textos", () => {
    it("cada estado de una tarea tiene su frase corta, y lo que no cambia no habla", () => {
        expect(fraseDeTarea(tarea({ id: "a", title: "la web" }))).toMatchObject({ tipo: "empiezo", texto: "Empiezo la web" });
        expect(fraseDeTarea(tarea({ id: "a", title: "la web", progress: 60 }))).toMatchObject({ tipo: "progreso", texto: "Llevo el 60 % de la web" });
        expect(fraseDeTarea(tarea({ id: "a", title: "la web", status: "done" }))).toMatchObject({ tipo: "listo", texto: "Listo: la web" });
        expect(fraseDeTarea(tarea({ id: "a", title: "la web", status: "error" }))).toMatchObject({ tipo: "error", texto: "No pude con la web" });
        expect(fraseDeTarea(tarea({ id: "a", title: "la web", detail: "necesita tu aprobación" }))).toMatchObject({ tipo: "visto-bueno", texto: "Necesito tu visto bueno para la web" });
        expect(fraseDeTarea(tarea({ id: "a", title: "la web", status: "pending" }))).toBeNull();
        expect(fraseDeTarea(tarea({ id: "a", title: "   " }))).toBeNull();
    });
    it("solo cuenta los cambios reales entre dos fotos de las tareas", () => {
        const antes = [tarea({ id: "a", title: "la web", progress: 20 })];
        const despues = [tarea({ id: "a", title: "la web", progress: 60 }), tarea({ id: "b", title: "el informe", status: "done" })];
        expect(frasesDeCambio(antes, antes)).toEqual([]);
        expect(frasesDeCambio(antes, despues).map((f) => f.tipo)).toEqual(["progreso", "listo"]);
    });
    it("los pasos de un agente se cuentan como «3 de 5», sin inventar nombres", () => {
        expect(fraseDePaso({ tarea: "la web", paso: 3, total: 5 })).toMatchObject({ tipo: "progreso", texto: "Llevo 3 de 5 de la web" });
        expect(fraseDePaso({ tarea: "la web", paso: 0, total: 5 })).toMatchObject({ tipo: "empiezo", texto: "Empiezo la web" });
        expect(fraseDePaso({ tarea: "la web", paso: 5, total: 5 })).toMatchObject({ tipo: "listo", texto: "Listo: la web" });
        expect(fraseDePaso({ tarea: "  ", paso: 1, total: 2 })).toBeNull();
    });
});
describe("voz del trabajo · ritmo y frenos", () => {
    it("puede narrar la primera frase, luego espera 8 s, y nunca en silencio ni encima de la persona", () => {
        const base = { ahora: 10_000, ultimaEn: 0, personaHablando: false, enSilencio: false };
        expect(puedeNarrar(base)).toBe(true);
        expect(puedeNarrar({ ...base, ultimaEn: 5_000 })).toBe(false);
        expect(puedeNarrar({ ...base, ultimaEn: 2_000 })).toBe(true);
        expect(puedeNarrar({ ...base, personaHablando: true })).toBe(false);
        expect(puedeNarrar({ ...base, enSilencio: true })).toBe(false);
    });
    it("narra una frase, calla las siguientes 8 s (con registro) y vuelve a hablar pasado el tope", async () => {
        const { ev, s, registros, voz } = banco();
        expect((await voz.narrarCambios([], [tarea({ id: "a", title: "la web" })]))?.texto).toBe("Empiezo la web");
        s.t += 3_000;
        expect(await voz.narrarCambios([], [tarea({ id: "b", title: "otra", status: "done" })])).toBeNull();
        expect(registros).toHaveLength(1);
        expect(registros[0]).toMatch(/«Listo: otra» callado/);
        s.t += 5_000;
        expect((await voz.narrarCambios([], [tarea({ id: "b", title: "otra", status: "done" })]))?.texto).toBe("Listo: otra");
        expect(ev).toEqual(["aviso:Empiezo la web", "aviso:Listo: otra"]);
    });
    it("si coinciden varios cambios, dice el que más importa (el fin antes que el avance)", async () => {
        const { ev, voz } = banco();
        const despues = [tarea({ id: "a", title: "la web", progress: 60 }), tarea({ id: "b", title: "el informe", status: "done" })];
        expect((await voz.narrarCambios([], despues))?.id).toBe("b");
        expect(ev).toEqual(["aviso:Listo: el informe"]);
    });
    it("en modo silencio o mientras habla la persona no dice nada, y luego retoma", async () => {
        const { ev, s, voz } = banco({ hablando: true });
        const despues = [tarea({ id: "a", title: "la web", status: "done" })];
        expect(await voz.narrarCambios([], despues)).toBeNull();
        s.hablando = false;
        s.silencio = true;
        expect(await voz.narrarCambios([], despues)).toBeNull();
        s.silencio = false;
        expect((await voz.narrarCambios([], despues))?.tipo).toBe("listo");
        expect(ev).toEqual(["aviso:Listo: la web"]);
    });
    it("escucha los cambios de `aurora:bg-tasks` y narra solo el delta de cada foto", async () => {
        const { ev, s, voz } = banco();
        let emitir: ((t: BgTask[]) => void) | undefined;
        const baja = escucharTareas(voz, (cb) => { emitir = cb; return () => { emitir = undefined; }; });
        emitir?.([tarea({ id: "a", title: "la web" })]);
        await new Promise((ok) => setTimeout(ok, 0));
        s.t += 8_000;
        emitir?.([tarea({ id: "a", title: "la web" })]);
        await new Promise((ok) => setTimeout(ok, 0));
        s.t += 8_000;
        emitir?.([tarea({ id: "a", title: "la web", status: "done" })]);
        await new Promise((ok) => setTimeout(ok, 0));
        expect(ev).toEqual(["aviso:Empiezo la web", "aviso:Listo: la web"]);
        baja();
        expect(emitir).toBeUndefined();
    });
    it("nunca lanza: un motor roto deja mudo el aviso, no tumba a quien trabaja", async () => {
        const roto = (): never => { throw new Error("roto"); };
        const voz = crearVozDelTrabajo({ hablar: roto, ahora: () => 0, personaHablando: () => false, enSilencio: () => false });
        expect(await voz.acusar("aurora")).toBe(false);
        expect(await voz.narrarPaso({ tarea: "la web", paso: 1, total: 2 })).not.toBeNull();
    });
});
