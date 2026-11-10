// ESC1110B — El símbolo del escritorio en la Protomolécula: abrir (molécula válida), transformar y volver.
import { describe, expect, it } from "vitest";
import { esMoleculaGuardable } from "@/lib/protomolecula/almacen-moleculas";
import { esMoleculaValidaNucleo } from "@/lib/protomolecula/bloque-protomolecula";
import { limpiarRegistro, registrarAtomo, obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import { claveDe } from "@/lib/protomolecula/parametros";
import { ATOMOS_PROPIOS, VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import {
    ID_HERRAMIENTA_SIMBOLO, ID_VISTA_SIMBOLO, SIMBOLO_ESCRITORIO, archivoDeValores, archivoDesdeMolecula, moleculaDesdeSimbolo,
} from "@/lib/protomolecula/atomos/simbolo-escritorio";
import { SIMBOLO_OFICIAL, archivoDesdeRecurso } from "@/components/brand/simbolo-archivo";

describe("átomo «Símbolo del escritorio»", () => {
    it("se registra como átomo propio con su vista", () => {
        limpiarRegistro();
        expect(registrarAtomo(SIMBOLO_ESCRITORIO)).toEqual({ ok: true });
        expect(obtenerAtomo(ID_HERRAMIENTA_SIMBOLO)?.nombre).toBe("Símbolo del escritorio");
        expect(ATOMOS_PROPIOS).toContain(SIMBOLO_ESCRITORIO);
        expect(typeof VISTAS_COMPONENTE[ID_VISTA_SIMBOLO]).toBe("function");
        limpiarRegistro();
    });

    it("la molécula es válida, cita el símbolo (no lo copia) y cabe en el almacén", () => {
        const propio = archivoDesdeRecurso("imagen", "data:image/png;base64," + "A".repeat(4000), "Mío").archivo;
        const m = moleculaDesdeSimbolo(propio, "grupo:tribu", 123, "grupo");
        expect(esMoleculaValidaNucleo(m)).toBe(true);
        expect(esMoleculaGuardable(m)).toBe(true);
        expect(m.capas[0].referencia).toEqual({ tipo: "simbolo-escritorio", id: "grupo:tribu", version: "1" });
        expect(JSON.stringify(m)).not.toContain("AAAA"); // los datos pesados se quedan en el archivo del dueño
    });

    it("ida y vuelta: lo que se cambia en la Protomolécula vuelve al archivo, acotado y validado", () => {
        const m = moleculaDesdeSimbolo(SIMBOLO_OFICIAL, "perfil:p1", 1);
        const atomo = m.atomos[0].id;
        const valores = { ...m.valores, [claveDe({ atomoId: atomo, parametroId: "guinada" })]: -20, [claveDe({ atomoId: atomo, parametroId: "parpadeo" })]: false, [claveDe({ atomoId: atomo, parametroId: "velocidad-flor" })]: 2 };
        const r = archivoDesdeMolecula({ ...m, valores }, SIMBOLO_OFICIAL);
        expect(r.ok).toBe(true);
        expect(r.archivo.pose.guinada).toBe(-20);
        expect(r.archivo.comportamientos.parpadeo).toBe(false);
        expect(r.archivo.comportamientos.velocidadFlor).toBe(2);
        // Sin cambios, vuelve exactamente el oficial.
        expect(archivoDesdeMolecula(m, SIMBOLO_OFICIAL).archivo).toEqual(SIMBOLO_OFICIAL);
    });

    it("la vuelta conserva la fuente de un símbolo propio y la marca oficial no se recolorea", () => {
        const propio = archivoDesdeRecurso("svg", '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', "Mío").archivo;
        const m = moleculaDesdeSimbolo(propio, "pagina:p", 1);
        const r = archivoDesdeMolecula({ ...m, valores: { ...m.valores, [claveDe({ atomoId: m.atomos[0].id, parametroId: "metalico" })]: 0.8 } }, propio);
        expect(r.archivo.fuente).toEqual(propio.fuente);
        expect(r.archivo.material.metalico).toBe(0.8);
        const o = archivoDesdeMolecula({ ...m, valores: { ...m.valores, [claveDe({ atomoId: m.atomos[0].id, parametroId: "metalico" })]: 0.8 } }, SIMBOLO_OFICIAL);
        expect(o.archivo.material).toEqual(SIMBOLO_OFICIAL.material);
    });

    it("una molécula ajena no se toma por un símbolo; la vista lee valores sin prefijo", () => {
        const r = archivoDesdeMolecula({ atomos: [], capas: [], valores: {} }, SIMBOLO_OFICIAL);
        expect(r.ok).toBe(false);
        expect(archivoDeValores({ guinada: 30 }, "a").pose.guinada).toBe(30);
    });
});
