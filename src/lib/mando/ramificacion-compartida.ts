/**
 * La ramificación de Genesis, calculada una vez y compartida (2026-10-13).
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ: `construirRamificacion(n)` lee todas las colas, los pasos de cada tarea (800 archivos),
 * revisiones, progreso y el bus. La pedían a la vez `/api/mando/estado` (con 4 olas) y
 * `/api/mando/ramificacion`, cada una por su lado y en cada petición.
 *
 * POR QUÉ: con la Mac sin memoria (presión en aviso, 108 MB libres) las dos tardaban más de
 * 50 s y MetaGenesis se quedaba en «Midiendo el pulso del trabajo…». Ahora hay UN cálculo por
 * número de olas, vale 10 s, y si el nuevo tarda más de 6 s se responde con el anterior.
 *
 * Solo de servidor (lo usan dos rutas).
 */

import { compartirCalculo, type CalculoCompartido } from "@/lib/mando/calculo-compartido";
import { construirRamificacion } from "@/lib/mando/ramificacion";

const VIGENCIA_MS = 10_000;
/** (2026-10-13, medido: 6 s por lectura con la Mac en presión de memoria) Con una anterior, ≤ 1,5 s. */
const ESPERA_MS = 1_500;

type Ramificacion = Awaited<ReturnType<typeof construirRamificacion>>;
const porCuantas = new Map<number, CalculoCompartido<Ramificacion>>();

export function ramificacionCompartida(cuantas: number): Promise<Ramificacion> {
    const n = Math.min(30, Math.max(1, Math.trunc(cuantas) || 4));
    let calculo = porCuantas.get(n);
    if (!calculo) {
        calculo = compartirCalculo(() => construirRamificacion(n), VIGENCIA_MS, undefined, ESPERA_MS, 600_000);
        porCuantas.set(n, calculo);
    }
    return calculo();
}
