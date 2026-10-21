// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * Los botones «Desconectar» y «Usar como contenedor» de la tarjeta de cada neurona (COL1012I).
 *
 * Tres capas: la ficha pura de `botonesNeurona` (rescatada de una rama nube), el traductor puro latido → tarjeta
 * (`colmena-tarjeta.ts`) y el componente de verdad (`MetaGenesisAutonoma`) con el cliente simulado.
 * Los casos de la rama nube se adaptaron al contrato de hoy: el destino es el id del nodo (nunca «lider»),
 * `punto.t` va en segundos y ningún texto promete un traspaso que aún no existe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { botonesNeurona, type NeuronaColmena } from "@/lib/metagenesis/colmena";
import {
    avisoDeOrdenANodo,
    botonesDeNodo,
    lineaDeNodo,
    neuronaDeNodo,
    ordenDeBoton,
    porQueNoSePuedeMandar,
    soDeMedio,
    ultimoPunto,
} from "@/lib/metagenesis/colmena-tarjeta";
import type { EstadoAutonomo, NodoVista, OrdenVista } from "@/lib/metagenesis/remoto-nodos";

const estado = { miembro: true, lectura: null as unknown };
const enviarOrden = vi.fn(async (..._a: unknown[]) => ({ ok: true, clave: "nonce-1", modo: "bus" }) as { ok: true; clave: string; modo: string } | { ok: false; motivo: string });

vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => ({ miembro: estado.miembro, dueno: false }) }));
vi.mock("@/lib/metagenesis/remoto-nodos-cliente", () => ({
    leerEstadoAutonomo: async () => estado.lectura,
    enviarOrden: (...a: unknown[]) => enviarOrden(...a),
}));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));

import { AppearanceProvider } from "@/context/appearance-context";
import { MetaGenesisAutonoma } from "../metagenesis-autonoma";

<<<<<<< HEAD
describe("colmena-botones · botones de una neurona (rescatado de rama nube)", () => {
    // Los textos del contrato (traspaso a otro contenedor) solo son verdad con el relevo cableado: estas pruebas
    // lo declaran. Sin la bandera se asume que NO está activo (ver el bloque «sin traspaso» más abajo).
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 });
=======
describe("colmena-botones · botones de una neurona", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 } as NeuronaColmena);
>>>>>>> 0ebdf8b1 (salvavidas · RTRTCOL1012Bdsbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBeFalsy();
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
<<<<<<< HEAD
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" }, relevoActivo: true });
=======
<<<<<<< HEAD
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
=======
        const b = botonesNeurona({
            nodo: "mac-a1b2c3",
            vivo: true,
            so: "macos",
            enCurso: 0,
            contenedor: { activo: true, agentes: 3, apto: true, motivo: "" },
        } as NeuronaColmena);
>>>>>>> 0ebdf8b1 (salvavidas · RTRTCOL1012Bdsbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
>>>>>>> e2124c016 (salvavidas · RTRTCOL1012Bdsbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });

    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
<<<<<<< HEAD
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1, relevoActivo: true });
=======
<<<<<<< HEAD
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1 });
=======
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1 } as NeuronaColmena);
>>>>>>> 0ebdf8b1 (salvavidas · RTRTCOL1012Bdsbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
>>>>>>> e2124c016 (salvavidas · RTRTCOL1012Bdsbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });
<<<<<<< HEAD

    it("contenedor activo: explica «Termina lo que lleva y no coge más.» y pide confirmar si hay trabajo", () => {
        const sin = botonesNeurona({
            nodo: "oracle-a1-bbbbbb",
            vivo: true,
            so: "linux",
            enCurso: 0,
            contenedor: { activo: true, agentes: 2, apto: true, motivo: "Listo para trabajar" },
            relevoActivo: true,
        });
        expect(sin.contenedor).toMatchObject({
            visible: true,
            habilitado: true,
            etiqueta: "Dejar de usar como contenedor",
            explica: "Termina lo que lleva y no coge más.",
        });
        expect(sin.contenedor.confirmar).toBe(false);
        const con = botonesNeurona({
            nodo: "oracle-a1-bbbbbb",
            vivo: true,
            so: "linux",
            enCurso: 1,
            contenedor: { activo: true, agentes: 2, apto: true, motivo: "Listo para trabajar" },
            relevoActivo: true,
        });
        expect(con.contenedor.confirmar).toBe(true);
    });

    it("sin trabajador: «Instalar el trabajador» visible y habilitado (explica Terminal / Termux)", () => {
        const linux = botonesNeurona({ nodo: null, vivo: true, so: "linux", enCurso: 0 });
        expect(linux.instalar).toMatchObject({
            visible: true,
            habilitado: true,
            etiqueta: "Instalar el trabajador",
            explica: "Un comando en la terminal de este aparato.",
        });
        const android = botonesNeurona({ nodo: null, vivo: true, so: "android", enCurso: 0 });
        expect(android.instalar.explica).toBe("En Android, dentro de Termux (experimental, 1 agente).");
    });

    it("con trabajo en curso y contenedor activo, ambos botones requieren confirmación", () => {
        const b = botonesNeurona({ 
            nodo: "mac-a1b2c3", 
            vivo: true, 
            so: "macos", 
            enCurso: 1, 
            contenedor: { activo: true, agentes: 2, apto: true, motivo: "" },
            relevoActivo: true,
        });
        // Desconectar button: enabled, requires confirmation because of work in course
        expect(b.desconectar).toMatchObject({ 
            visible: true, 
            habilitado: true, 
            etiqueta: "Desconectar", 
            confirmar: true 
        });
        expect(b.desconectar.explica).toBe(
            "Guarda el trabajo a medias de sus 1 agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet."
        );
        // Contenedor button: enabled to stop being a container, and requires confirmation because of work in course
        expect(b.contenedor).toMatchObject({ 
            visible: true, 
            habilitado: true, 
            etiqueta: "Dejar de usar como contenedor", 
            confirmar: true 
        });
    });
<<<<<<< HEAD
});
// ─── el traductor latido → tarjeta (puro) ──────────────────────────────────────────────────────────────

const A1 = "oracle-a1-bbbbbb";
const AHORA = Date.now();
const SIN_TRASPASO = "traspaso del trabajo a otro contenedor aún no está activo";

function nodo(extra: Partial<NodoVista> = {}): NodoVista {
    return {
        nodo: A1,
        medio: "oracle-a1",
        etiqueta: "Oracle A1 (24/7)",
        modo: "real",
        vivo: true,
        lider: true,
        hace_ms: 40_000,
        puntos: 1250,
        orquestadores: [],
        caidos: [],
        disco_gb: 80,
        ram_libre_mb: 9000,
        trabajo: {},
        enCurso: [],
        contenedor: { activo: false, agentes: 2, apto: true, motivo: "2 agente(s) por la memoria y los núcleos." },
        informaTrabajo: true,
        relevo: false,
        desconectando: false,
        ...extra,
    };
}

/** Una tarea con agente escribiendo; `t` en SEGUNDOS, como lo publica el nodo (`time.time()`). */
function tarea(id: string, haceMs: number | null, fase = "escribiendo"): NodoVista["enCurso"][number] {
    return { id, fase, punto: haceMs === null ? null : { rama: `ola/${id}`, sha: "abc123", t: (AHORA - haceMs) / 1000 } };
}

describe("colmena-tarjeta · del latido a la tarjeta", () => {
    it("el sistema sale del medio del nodo", () => {
        expect(soDeMedio("mac")).toBe("macos");
        expect(soDeMedio("oracle-a1")).toBe("linux");
        expect(soDeMedio("neurona")).toBe("otro");
    });

    it("último punto: el latido va en segundos (no ms) y sin sha o t=0 no hay punto", () => {
        const hace5 = AHORA - 5 * 60_000;
        expect(ultimoPunto([tarea("a", 5 * 60_000)]).t).toBeCloseTo(hace5, -2);
        // Un nodo que mandara ms se entiende igual.
        expect(ultimoPunto([{ id: "a", fase: "escribiendo", punto: { rama: "r", sha: "s", t: hace5 } }]).t).toBe(hace5);
        const sinPunto = ultimoPunto([
            { id: "a", fase: "escribiendo", punto: null },
            { id: "b", fase: "escribiendo", punto: { rama: "r", sha: "", t: 99 } },
            { id: "c", fase: "escribiendo", punto: { rama: "r", sha: "s", t: 0 } },
        ]);
        expect(sinPunto).toEqual({ t: null, sinPunto: 3 });
        const mezcla = ultimoPunto([tarea("a", 10 * 60_000), tarea("b", 2 * 60_000), tarea("c", null)]);
        expect(mezcla.sinPunto).toBe(1);
        expect(mezcla.t).toBeCloseTo(AHORA - 2 * 60_000, -2);
    });

    it("línea de información: singular y plural, contenedor activo, y nunca ids ni ramas", () => {
        const activo = nodo({ relevo: true, contenedor: { activo: true, agentes: 2, apto: true, motivo: "" }, enCurso: [tarea("secreta-1", 5 * 60_000)] });
        const l = lineaDeNodo(activo, AHORA);
        expect(l[0]).toBe("2 agentes · contenedor activo");
        expect(l[1]).toBe("1 tarea en curso · Último punto de control hace 5 min");
        expect(l.join(" ")).not.toMatch(/secreta-1|ola\/|abc123/);
        expect(lineaDeNodo(nodo({ contenedor: { activo: false, agentes: 1, apto: true, motivo: "" } }), AHORA)[0]).toBe("1 agente · puede ser contenedor");
        expect(lineaDeNodo(nodo({ enCurso: [tarea("a", null), tarea("b", null)] }), AHORA)[1]).toBe("2 tareas en curso · Sin punto de control todavía");
        expect(lineaDeNodo(nodo({ enCurso: [tarea("a", 60_000), tarea("b", null)] }), AHORA)[1]).toContain("1 tarea sin punto");
        expect(lineaDeNodo(nodo(), AHORA)[1]).toBe("Sin tareas en curso");
    });

    it("un nodo que aún no ha latido no dice «según su último latido (nunca)»: dice que no ha latido", () => {
        const l = lineaDeNodo(nodo({ vivo: false, lider: false, hace_ms: null }), AHORA);
        expect(l[0]).toBe("Este nodo no ha latido todavía");
        expect(l.join(" ")).not.toMatch(/último latido|nunca/);
    });

    it("una tarea pasando una puerta (tsc, integrando, esperando proveedor) cuenta como trabajo en la tarjeta", () => {
        const fases = ["tsc", "integrando", "esperando proveedor"];
        const n = nodo({ orquestadores: ["cola-x"], enCurso: fases.map((f, i) => tarea(`t${i}`, null, f)) });
        expect(lineaDeNodo(n, AHORA)[1]).toBe("3 tareas en curso · Sin punto de control todavía");
        const b = botonesDeNodo(n);
        expect(b.desconectar.explica).toContain("Puedes apagar este aparato cuando acaben sus 3 tarea(s)");
        expect(b.desconectar.explica).not.toContain("puedes apagarlo sin más");
    });

    it("un orquestador vivo sin tareas publicadas no se da por «sin trabajo»: puede estar entre dos tareas", () => {
        const n = nodo({ orquestadores: ["cola-x"], enCurso: [] });
        expect(neuronaDeNodo(n).orquestadorVivo).toBe(true);
        expect(lineaDeNodo(n, AHORA)[1]).toBe("Orquestador en marcha · ninguna tarea publicada ahora");
        const b = botonesDeNodo(n);
        expect(b.desconectar.habilitado).toBe(false);
        expect(b.desconectar.explica).toContain("Tiene un orquestador en marcha");
        expect(b.desconectar.explica).not.toContain("puedes apagarlo sin más");
        // Con el traspaso activo, hay algo que pasar a otro contenedor: el botón se puede pulsar y no habla de «0 agentes».
        const conRelevo = botonesDeNodo({ ...n, relevo: true }).desconectar;
        expect(conRelevo.habilitado).toBe(true);
        expect(conRelevo.explica).not.toContain("0 agente");
        // Sin orquestador ni contenedor activo sí es un aparato libre.
        expect(botonesDeNodo(nodo()).desconectar.explica).toContain("puedes apagarlo sin más");
        expect(lineaDeNodo(nodo(), AHORA)[1]).toBe("Sin tareas en curso");
    });

    it("la defensa del clic: si el latido cambió y el botón ya no se puede pulsar, se dice por qué y no se manda", () => {
        const hoy = nodo({ enCurso: [tarea("a", 60_000)] });
        // El botón de Desconectar no está disponible sin traspaso (relevo falso): el clic rezagado se rechaza con su razón.
        const sin = porQueNoSePuedeMandar("desconectar", hoy, [], AHORA);
        expect(sin).toContain("«Desconectar» ya no se puede mandar a este nodo");
        expect(sin).toContain(SIN_TRASPASO);
        // El contenedor sin reparto tampoco.
        expect(porQueNoSePuedeMandar("contenedor", hoy, [], AHORA)).toContain("El reparto de tareas a contenedores aún no está activo");
        // Un nodo que pasó a modo de prueba, aunque el traspaso esté activo.
        expect(porQueNoSePuedeMandar("desconectar", nodo({ modo: "seco", relevo: true, enCurso: [tarea("a", 60_000)] }), [], AHORA)).toContain("modo de prueba");
        // Una orden que ya va hacia el nodo: «Desconectando…» no se vuelve a mandar.
        const enCamino: OrdenVista = { clave: "n1", accion: "desconectar", para: A1, t: AHORA - 10_000, estado: "pendiente", resultado: "", nodo: null };
        expect(porQueNoSePuedeMandar("desconectar", nodo({ relevo: true, enCurso: [tarea("a", 60_000)] }), [enCamino], AHORA)).toContain("Desconectando");
        // Un nodo caído no tiene botón de desconectar.
        expect(porQueNoSePuedeMandar("desconectar", nodo({ vivo: false, relevo: true, enCurso: [tarea("a", 60_000)] }), [], AHORA)).toContain("su estado cambió");
        // Si se puede, no hay razón.
        expect(porQueNoSePuedeMandar("desconectar", nodo({ relevo: true, enCurso: [tarea("a", 60_000)] }), [], AHORA)).toBeNull();
        expect(porQueNoSePuedeMandar("contenedor", nodo({ relevo: true }), [], AHORA)).toBeNull();
    });

    it("apuntado como contenedor pero sin reparto: no se escribe «contenedor activo», que daría a entender agentes trabajando", () => {
        const apuntado = nodo({ contenedor: { activo: true, agentes: 2, apto: true, motivo: "" } });
        expect(lineaDeNodo(apuntado, AHORA)[0]).toBe("Apuntado como contenedor (hasta 2 agentes) · el reparto de tareas aún no está activo");
        expect(lineaDeNodo(apuntado, AHORA).join(" ")).not.toContain("contenedor activo");
        // Apuntado y luego ya no apto (falta una herramienta…): la línea lo cuenta.
        const roto = nodo({ contenedor: { activo: true, agentes: 0, apto: false, motivo: "Faltan herramientas: node." } });
        expect(lineaDeNodo(roto, AHORA)[0]).toBe("Apuntado como contenedor, pero ahora no puede: Faltan herramientas: node.");
    });

    it("un nodo caído dice que lo que enseña es su último latido, no lo de ahora", () => {
        const l = lineaDeNodo(nodo({ vivo: false, lider: false, hace_ms: 3_600_000 }), AHORA);
        expect(l[0]).toBe("Según su último latido (hace 1 h)");
        expect(l[1]).toContain("puede ser contenedor");
        expect(lineaDeNodo(nodo(), AHORA)[0]).not.toContain("Según su último latido");
    });

    it("no apto: la línea dice por qué; sin datos, que no informa", () => {
        const noApto = nodo({ contenedor: { activo: false, agentes: 0, apto: false, motivo: "Con menos de 6 GB de RAM no cabe la comprobación de tipos." } });
        expect(lineaDeNodo(noApto, AHORA)[0]).toBe("No puede ser contenedor: Con menos de 6 GB de RAM no cabe la comprobación de tipos.");
        const sin = lineaDeNodo(nodo({ contenedor: null, informaTrabajo: false }), AHORA);
        expect(sin[0]).toContain("aún no informa de lo que puede aportar");
        expect(sin[1]).toBe("Este nodo aún no informa de su trabajo.");
    });

    it("un latido viejo (no apto, sin motivo) no se toma por verdad: ni «sin trabajo» ni «no apto»", () => {
        const viejo = nodo({ contenedor: { activo: false, agentes: 0, apto: false, motivo: "" } });
        const n = neuronaDeNodo(viejo);
        expect(n).toMatchObject({ contenedor: null, sinDatosTrabajo: true, sinDatosCapacidad: true });
        const b = botonesDeNodo(viejo);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false });
        expect(b.desconectar.explica).toContain("aún no informa de su trabajo");
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: false });
        expect(b.contenedor.explica).toContain("aún no informa de lo que puede aportar");
    });

    it("el traspaso no está activo mientras el nodo no lo declare: los textos no lo prometen", () => {
        const con = nodo({ enCurso: [tarea("a", 60_000)] });
        expect(neuronaDeNodo(con).relevoActivo).toBe(false);
        expect(botonesDeNodo(con).desconectar.explica).toContain(SIN_TRASPASO);
        expect(botonesDeNodo(con).desconectar.explica).not.toContain("lo pasa a otro contenedor");
        expect(botonesDeNodo(con).contenedor.explica).toContain("no está activo");
        // Y por eso ninguno de los dos se ofrece pulsable: no cambiarían nada.
        expect(botonesDeNodo(con).desconectar.habilitado).toBe(false);
        expect(botonesDeNodo(con).contenedor.habilitado).toBe(false);
        // Si algún día un nodo lo declara, vuelve el texto del contrato.
        const activo = nodo({ enCurso: [tarea("a", 60_000)], relevo: true });
        expect(botonesDeNodo(activo).desconectar.explica).toContain("y lo pasa a otro contenedor");
    });

    it("un nodo sin destino válido se ve desactivado, diciéndolo: no se descubre al pulsar", () => {
        const sinId = nodo({ nodo: "mac", medio: "mac", relevo: true, enCurso: [tarea("a", 60_000)], contenedor: { activo: false, agentes: 2, apto: true, motivo: "" } });
        const b = botonesDeNodo(sinId);
        for (const x of [b.desconectar, b.contenedor]) {
            expect(x).toMatchObject({ visible: true, habilitado: false });
            expect(x.confirmar).toBeFalsy();
            expect(x.explica).toContain("identificador de destino válido");
        }
        // Con id válido, los mismos botones se pueden pulsar.
        const bien = botonesDeNodo({ ...sinId, nodo: A1 });
        expect(bien.desconectar.habilitado).toBe(true);
        expect(bien.contenedor.habilitado).toBe(true);
    });

    it("«Desconectando…» sale del latido o de una orden recién mandada, y las viejas no cuentan", () => {
        const orden = (extra: Partial<OrdenVista> = {}): OrdenVista => ({ clave: "n1", accion: "desconectar", para: A1, t: AHORA - 30_000, estado: "pendiente", resultado: "", nodo: null, ...extra });
        const con = nodo({ enCurso: [tarea("a", 60_000)] });
        expect(botonesDeNodo(con, [orden()], AHORA).desconectar).toMatchObject({ etiqueta: "Desconectando…", habilitado: false });
        expect(botonesDeNodo(con, [orden({ estado: "hecha" })], AHORA).desconectar.etiqueta).toBe("Desconectar");
        expect(botonesDeNodo(con, [orden({ t: AHORA - 20 * 60_000 })], AHORA).desconectar.etiqueta).toBe("Desconectar");
        expect(botonesDeNodo(con, [orden({ para: "otro-nodo-1" })], AHORA).desconectar.etiqueta).toBe("Desconectar");
        expect(botonesDeNodo(nodo({ desconectando: true }), [], AHORA).desconectar.etiqueta).toBe("Desconectando…");
    });

    it("un nodo en modo de prueba solo simularía: los botones se ven, desactivados, con esa razón", () => {
        const b = botonesDeNodo(nodo({ modo: "seco", enCurso: [tarea("a", 60_000)] }));
        for (const x of [b.desconectar, b.contenedor]) {
            expect(x.visible).toBe(true);
            expect(x.habilitado).toBe(false);
            expect(x.confirmar).toBeFalsy();
            expect(x.explica).toContain("modo de prueba");
        }
    });

    it("la orden sale del id del nodo, nunca «lider», y con los argumentos de la lista blanca", () => {
        expect(ordenDeBoton("desconectar", nodo())).toEqual({ accion: "desconectar", para: A1, args: {} });
        expect(ordenDeBoton("contenedor", nodo())).toEqual({ accion: "contenedor", para: A1, args: { activo: true, trabajadores: 2 } });
        const activo = nodo({ contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(ordenDeBoton("contenedor", activo)).toEqual({ accion: "contenedor", para: A1, args: { activo: false } });
        // Sin destino válido o sin agentes que ofrecer, no hay orden.
        expect(ordenDeBoton("desconectar", nodo({ nodo: "mac" }))).toBeNull();
        expect(ordenDeBoton("desconectar", nodo({ nodo: "lider" }))).toBeNull();
        expect(ordenDeBoton("contenedor", nodo({ contenedor: { activo: false, agentes: 0, apto: false, motivo: "x" } }))).toBeNull();
        expect(ordenDeBoton("contenedor", nodo({ contenedor: null }))).toBeNull();
    });

    it("el aviso dice cuándo la recoge el nodo y no promete el resultado", () => {
        const t = avisoDeOrdenANodo("Desconectar", "Oracle A1 (24/7)");
        expect(t).toContain("la recoge ese nodo en cuanto lata");
        // Sin el relevo activo, el aviso lo dice en vez de dejar creer que se reparte o se traspasa algo.
        expect(t).toContain("Hoy solo cambia lo que ese nodo ofrece");
        expect(t).toContain("aún no están activos");
        const conRelevo = avisoDeOrdenANodo("Desconectar", "Oracle A1 (24/7)", true);
        expect(conRelevo).toContain("la recoge ese nodo en cuanto lata");
        expect(conRelevo).not.toContain("traspas");
    });
});

describe("colmena · con el traspaso aún sin activar (relevoActivo = false o sin dato)", () => {
    const base: NeuronaColmena = { nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 2, contenedor: { activo: false, agentes: 3, apto: true, motivo: "" }, relevoActivo: false };
    it("Desconectar se ve pero no se pulsa: no traspasa nada, y dice qué hacer en su lugar", () => {
        const d = botonesNeurona(base).desconectar;
        expect(d).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(d.confirmar).toBeFalsy();
        expect(d.explica).toContain("desconectar no cambiaría nada");
        expect(d.explica).toContain("cuando acaben sus 2 tarea(s)");
        expect(d.explica).toContain(SIN_TRASPASO);
    });
    it("con el contenedor activo, Desconectar remite a «Dejar de usar como contenedor» (haría lo mismo)", () => {
        const b = botonesNeurona({ ...base, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(b.desconectar.habilitado).toBe(false);
        expect(b.desconectar.explica).toContain("Dejar de usar como contenedor");
        expect(b.contenedor).toMatchObject({ habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });
    it("«Usar» no se pulsa (el reparto no está activo); «Dejar de usar» sí y dice que no para lo que corre", () => {
        const usar = botonesNeurona(base).contenedor;
        expect(usar).toMatchObject({ visible: true, habilitado: false });
        expect(usar.explica).toContain("reparto de tareas a contenedores aún no está activo");
        const activo = botonesNeurona({ ...base, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } }).contenedor;
        expect(activo.habilitado).toBe(true);
        expect(activo.explica).toContain("No para lo que ya esté corriendo");
        expect(activo.confirmar).toBe(false);
    });
    it("sin la bandera pasa exactamente lo mismo que con false: nadie hereda una promesa falsa", () => {
        const { relevoActivo: _quitada, ...sinBandera } = base;
        expect(botonesNeurona(sinBandera)).toEqual(botonesNeurona(base));
    });
    it("apuntado como contenedor y luego no apto: se puede apagar, no queda atrapado", () => {
        const b = botonesNeurona({ ...base, contenedor: { activo: true, agentes: 0, apto: false, motivo: "Faltan herramientas: node." } });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
        expect(b.contenedor.explica).toContain("Faltan herramientas: node.");
        // Si nunca estuvo apuntado y no es apto, sigue sin poder.
        expect(botonesNeurona({ ...base, contenedor: { activo: false, agentes: 0, apto: false, motivo: "Poco disco." } }).contenedor.habilitado).toBe(false);
    });
    it("sin datos del nodo no se afirma nada: los dos botones se ven desactivados con el motivo", () => {
        const b = botonesNeurona({ ...base, enCurso: 0, sinDatosTrabajo: true, sinDatosCapacidad: true, contenedor: null });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: false });
    });
    it("con el relevo declarado vuelven los botones y los textos del contrato", () => {
        const b = botonesNeurona({ ...base, relevoActivo: true });
        expect(b.desconectar).toMatchObject({ habilitado: true, confirmar: true });
        expect(b.desconectar.explica).toContain("y lo pasa a otro contenedor");
        expect(b.contenedor).toMatchObject({ habilitado: true, explica: "Este aparato coge tareas de la cola como la Mac." });
    });
});

// ─── el componente de verdad ───────────────────────────────────────────────────────────────────────────

function lectura(nodos: NodoVista[], ordenes: OrdenVista[] = []): { ok: true; estado: EstadoAutonomo } {
    return {
        ok: true,
        estado: {
            modo: "bus",
            lider: A1,
            termino: 5,
            autonomia: true,
            nodos,
            medidores: {},
            decisiones: [],
            ordenes,
            fotoHaceMs: 30_000,
            liderSeco: false,
        },
    };
}

function pintar() {
    return render(
        <AppearanceProvider>
            <MetaGenesisAutonoma />
        </AppearanceProvider>,
    );
}

const id = (clave: string, nodoId = A1) => `mg-nodo-${nodoId}-${clave}`;

describe("TarjetaNodo · botones de la colmena (COL1012I)", () => {
    beforeEach(() => {
        estado.miembro = true;
        enviarOrden.mockClear();
        enviarOrden.mockResolvedValue({ ok: true, clave: "nonce-1", modo: "bus" });
    });
    afterEach(() => cleanup());

    // ── hoy: el traspaso y el reparto NO están cableados (relevo=false): ningún botón finge ───────────────
    it("sin traspaso: Desconectar se ve pero no se pulsa, y la razón está a la vista (no solo en el title)", async () => {
        estado.lectura = lectura([nodo({ enCurso: [tarea("task-1", 5 * 60_000)] })]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar"));
        expect(boton).toHaveTextContent("Desconectar");
        expect(boton).toBeDisabled();
        const razon = screen.getByTestId(id("desconectar-explica"));
        expect(razon).toHaveTextContent("desconectar no cambiaría nada");
        expect(razon).toHaveTextContent(SIN_TRASPASO);
        expect(boton).toHaveAttribute("aria-describedby", id("desconectar-explica"));
        fireEvent.click(boton);
        expect(enviarOrden).not.toHaveBeenCalled();
    });

    it("sin reparto: «Usar como contenedor» se ve con sus agentes, desactivado, y dice por qué (visible en el móvil)", async () => {
        estado.lectura = lectura([nodo()]);
        pintar();
        const boton = await screen.findByTestId(id("contenedor"));
        expect(boton).toHaveTextContent("Usar como contenedor (2 agentes)");
        expect(boton).toBeDisabled();
        expect(screen.getByTestId(id("contenedor-explica"))).toHaveTextContent("El reparto de tareas a contenedores aún no está activo");
        fireEvent.click(boton);
        expect(enviarOrden).not.toHaveBeenCalled();
    });

    it("la línea de información no escribe «contenedor activo» mientras no haya reparto", async () => {
        estado.lectura = lectura([nodo({ contenedor: { activo: true, agentes: 2, apto: true, motivo: "" }, enCurso: [tarea("task-1", 5 * 60_000)] })]);
        pintar();
        const info = await screen.findByTestId(id("info"));
        expect(info).toHaveTextContent("Apuntado como contenedor (hasta 2 agentes) · el reparto de tareas aún no está activo");
        expect(info).not.toHaveTextContent("contenedor activo");
        expect(info).toHaveTextContent("1 tarea en curso · Último punto de control hace 5 min");
        expect(info).not.toHaveTextContent("task-1");
    });

    it("«Dejar de usar» apaga (activo=false, sin trabajadores), sin pedir confirmar, y el aviso dice lo que hace de verdad", async () => {
        estado.lectura = lectura([nodo({ contenedor: { activo: true, agentes: 2, apto: true, motivo: "" }, enCurso: [tarea("t1", 60_000)] })]);
        pintar();
        const boton = await screen.findByTestId(id("contenedor"));
        expect(boton).toHaveTextContent("Dejar de usar como contenedor");
        expect(screen.getByTestId(id("contenedor-explica"))).toHaveTextContent("No para lo que ya esté corriendo");
        fireEvent.click(boton);
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("contenedor", A1, { activo: false }));
        expect(enviarOrden).toHaveBeenCalledTimes(1);
        const aviso = await screen.findByRole("status");
        expect(aviso).toHaveTextContent("la recoge ese nodo en cuanto lata");
        expect(aviso).toHaveTextContent("Hoy solo cambia lo que ese nodo ofrece");
    });

    it("con el contenedor activo y sin el traspaso, Desconectar remite a «Dejar de usar» en vez de fingir", async () => {
        estado.lectura = lectura([nodo({ contenedor: { activo: true, agentes: 2, apto: true, motivo: "" } })]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar"));
        expect(boton).toBeDisabled();
        expect(screen.getByTestId(id("desconectar-explica"))).toHaveTextContent("Dejar de usar como contenedor");
        expect(screen.getByTestId(id("contenedor"))).not.toBeDisabled();
    });

    it("sin trabajo y sin contenedor activo: Desconectar desactivado y la razón a la vista", async () => {
        estado.lectura = lectura([nodo()]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar"));
        expect(boton).toBeDisabled();
        expect(screen.getByTestId(id("desconectar-explica"))).toHaveTextContent("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(boton).toHaveAttribute("aria-describedby", id("desconectar-explica"));
        fireEvent.click(boton);
        expect(enviarOrden).not.toHaveBeenCalled();
    });

    it("con un orquestador en marcha y ninguna tarea publicada, Desconectar no dice «puedes apagarlo sin más»", async () => {
        estado.lectura = lectura([nodo({ orquestadores: ["cola-x"], enCurso: [] })]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar"));
        expect(boton).toBeDisabled();
        const razon = screen.getByTestId(id("desconectar-explica"));
        expect(razon).toHaveTextContent("Tiene un orquestador en marcha");
        expect(razon).not.toHaveTextContent("puedes apagarlo sin más");
        expect(screen.getByTestId(id("info"))).toHaveTextContent("Orquestador en marcha · ninguna tarea publicada ahora");
        expect(screen.getByTestId(id("info"))).not.toHaveTextContent("Sin tareas en curso");
    });

    it("una tarea en tsc o integrando se cuenta en la tarjeta: nada de «Sin tareas en curso»", async () => {
        estado.lectura = lectura([nodo({ orquestadores: ["cola-x"], enCurso: [tarea("a", null, "tsc"), tarea("b", null, "integrando")] })]);
        pintar();
        const info = await screen.findByTestId(id("info"));
        expect(info).toHaveTextContent("2 tareas en curso");
        expect(info).not.toHaveTextContent("Sin tareas en curso");
        expect(screen.getByTestId(id("desconectar-explica"))).toHaveTextContent("cuando acaben sus 2 tarea(s)");
    });

    // ── cuando un nodo declara el relevo activo (COL1012E/G/H cableadas): el camino del contrato ──────────
    it("con el relevo activo: Desconectar habilitado, con la explicación del contrato en title", async () => {
        estado.lectura = lectura([nodo({ relevo: true, enCurso: [tarea("task-1", 5 * 60_000)] })]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar"));
        expect(boton).not.toBeDisabled();
        expect(boton).toHaveAttribute("title", "Guarda el trabajo a medias de sus 1 agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet.");
    });

    it("con el relevo activo: «Usar como contenedor» con los agentes que el nodo puede aportar y la línea «contenedor activo»", async () => {
        estado.lectura = lectura([nodo({ relevo: true }), nodo({ nodo: "mac-aaaaaa", medio: "mac", etiqueta: "Mac de desarrollo", lider: false, relevo: true, contenedor: { activo: true, agentes: 2, apto: true, motivo: "" } })]);
        pintar();
        const boton = await screen.findByTestId(id("contenedor"));
        expect(boton).toHaveTextContent("Usar como contenedor (2 agentes)");
        expect(boton).not.toBeDisabled();
        expect(screen.getByTestId(id("info", "mac-aaaaaa"))).toHaveTextContent("2 agentes · contenedor activo");
    });

    it("con el relevo activo: Desconectar con trabajo pide confirmar y manda la orden AL NODO (no a «lider»)", async () => {
        estado.lectura = lectura([nodo({ relevo: true, enCurso: [tarea("task-1", 60_000)] })]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar"));
        fireEvent.click(boton);
        expect(enviarOrden).not.toHaveBeenCalled();
        expect(boton).toHaveTextContent("¿Seguro? Pulsa otra vez");
        fireEvent.click(boton);
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("desconectar", A1, {}));
        expect(enviarOrden).toHaveBeenCalledTimes(1);
        const aviso = await screen.findByRole("status");
        expect(aviso).toHaveTextContent("la recoge ese nodo en cuanto lata");
        expect(aviso).toHaveTextContent("enviada a Oracle A1 (24/7)");
        expect(aviso).not.toHaveTextContent("el medio que dirige");
        expect(aviso).not.toHaveTextContent("traspaso y el reparto");
    });

    it("la confirmación es de UN nodo: pulsar Desconectar en otro no manda el primero", async () => {
        const B = "mac-aaaaaa";
        estado.lectura = lectura([
            nodo({ relevo: true, enCurso: [tarea("t1", 60_000)] }),
            nodo({ nodo: B, medio: "mac", etiqueta: "Mac de desarrollo", lider: false, relevo: true, enCurso: [tarea("t2", 60_000)] }),
        ]);
        pintar();
        fireEvent.click(await screen.findByTestId(id("desconectar")));
        expect(screen.getByTestId(id("desconectar"))).toHaveTextContent("¿Seguro?");
        fireEvent.click(screen.getByTestId(id("desconectar", B)));
        expect(screen.getByTestId(id("desconectar", B))).toHaveTextContent("¿Seguro?");
        expect(screen.getByTestId(id("desconectar"))).not.toHaveTextContent("¿Seguro?");
        expect(enviarOrden).not.toHaveBeenCalled();
    });

    it("con el relevo activo: «Usar como contenedor» activa con sus agentes y sin pedir confirmación", async () => {
        estado.lectura = lectura([nodo({ relevo: true })]);
        pintar();
        fireEvent.click(await screen.findByTestId(id("contenedor")));
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("contenedor", A1, { activo: true, trabajadores: 2 }));
    });

    it("con el relevo activo y el contenedor activo, Desconectar sin trabajo sí se puede y no pide confirmar", async () => {
        estado.lectura = lectura([nodo({ relevo: true, contenedor: { activo: true, agentes: 2, apto: true, motivo: "" } })]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar"));
        expect(boton).not.toBeDisabled();
        fireEvent.click(boton);
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("desconectar", A1, {}));
    });

    it("si el servidor rechaza la orden, lo dice tal cual", async () => {
        enviarOrden.mockResolvedValueOnce({ ok: false, motivo: "Demasiadas órdenes en una hora: espera un poco." });
        estado.lectura = lectura([nodo({ relevo: true })]);
        pintar();
        fireEvent.click(await screen.findByTestId(id("contenedor")));
        expect(await screen.findByRole("status")).toHaveTextContent("Demasiadas órdenes en una hora: espera un poco.");
    });

    // ── casos que no dependen del relevo ──────────────────────────────────────────────────────────────────
    it("no apto: el botón de contenedor se ve desactivado con el motivo visible", async () => {
        estado.lectura = lectura([nodo({ contenedor: { activo: false, agentes: 0, apto: false, motivo: "Faltan herramientas: opencode." } })]);
        pintar();
        expect(await screen.findByTestId(id("contenedor"))).toBeDisabled();
        expect(screen.getByTestId(id("contenedor-explica"))).toHaveTextContent("Faltan herramientas: opencode.");
    });

    it("apuntado y luego no apto: la tarjeta lo cuenta y deja apagarlo", async () => {
        estado.lectura = lectura([nodo({ contenedor: { activo: true, agentes: 0, apto: false, motivo: "Faltan herramientas: node." } })]);
        pintar();
        const boton = await screen.findByTestId(id("contenedor"));
        expect(boton).toHaveTextContent("Dejar de usar como contenedor");
        expect(boton).not.toBeDisabled();
        expect(screen.getByTestId(id("info"))).toHaveTextContent("Apuntado como contenedor, pero ahora no puede: Faltan herramientas: node.");
    });

    it("un nodo caído no tiene botón de desconectar, su contenedor no se pulsa y la tarjeta dice que es su último latido", async () => {
        estado.lectura = lectura([nodo({ vivo: false, lider: false, hace_ms: 3_600_000, relevo: true, enCurso: [tarea("t1", 60_000)] })]);
        pintar();
        expect(await screen.findByTestId(id("contenedor"))).toBeDisabled();
        expect(screen.queryByTestId(id("desconectar"))).toBeNull();
        expect(screen.getByTestId(id("info"))).toHaveTextContent("Según su último latido (hace 1 h)");
    });

    it("un nodo en modo de prueba: nada habilitado y se explica", async () => {
        estado.lectura = lectura([nodo({ modo: "seco", relevo: true, enCurso: [tarea("t1", 60_000)] })]);
        pintar();
        expect(await screen.findByTestId(id("desconectar"))).toBeDisabled();
        expect(screen.getByTestId(id("contenedor"))).toBeDisabled();
        expect(screen.getByTestId(id("desconectar-explica"))).toHaveTextContent("modo de prueba");
    });

    it("un nodo con el latido viejo dice que no informa y no deja pulsar nada", async () => {
        estado.lectura = lectura([nodo({ relevo: true, contenedor: { activo: false, agentes: 0, apto: false, motivo: "" } })]);
        pintar();
        expect(await screen.findByTestId(id("desconectar"))).toBeDisabled();
        expect(screen.getByTestId(id("contenedor"))).toBeDisabled();
        expect(screen.getByTestId(id("desconectar-explica"))).toHaveTextContent("aún no informa de su trabajo");
        expect(screen.getByTestId(id("info"))).toHaveTextContent("aún no informa");
    });

    it("tras mandar Desconectar, la orden en camino deja el botón en «Desconectando…»", async () => {
        const orden: OrdenVista = { clave: "n1", accion: "desconectar", para: A1, t: Date.now() - 20_000, estado: "pendiente", resultado: "", nodo: null };
        estado.lectura = lectura([nodo({ relevo: true, enCurso: [tarea("t1", 60_000)] })], [orden]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar"));
        expect(boton).toHaveTextContent("Desconectando…");
        expect(boton).toBeDisabled();
    });

    it("si el nodo no tiene un id de destino válido, los dos botones salen desactivados con la razón a la vista y no se manda nada", async () => {
        estado.lectura = lectura([nodo({ nodo: "mac", medio: "mac", relevo: true, enCurso: [tarea("t1", 60_000)], contenedor: { activo: true, agentes: 2, apto: true, motivo: "" } })]);
        pintar();
        const boton = await screen.findByTestId(id("desconectar", "mac"));
        expect(boton).toBeDisabled();
        expect(screen.getByTestId(id("desconectar-explica", "mac"))).toHaveTextContent("identificador de destino válido");
        expect(screen.getByTestId(id("contenedor", "mac"))).toBeDisabled();
        expect(screen.getByTestId(id("contenedor-explica", "mac"))).toHaveTextContent("identificador de destino válido");
        fireEvent.click(boton);
        fireEvent.click(screen.getByTestId(id("contenedor", "mac")));
        expect(enviarOrden).not.toHaveBeenCalled();
    });

    it("los botones del líder siguen yendo al líder con la misma firma de siempre", async () => {
        estado.lectura = lectura([nodo()]);
        pintar();
        fireEvent.click(await screen.findByTestId("mg-orden-revisar_bloqueadas"));
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("revisar_bloqueadas", "lider"));
    });
});
=======
=======
>>>>>>> 0ebdf8b1 (salvavidas · RTRTCOL1012Bdsbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
});
>>>>>>> e2124c016 (salvavidas · RTRTCOL1012Bdsbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
