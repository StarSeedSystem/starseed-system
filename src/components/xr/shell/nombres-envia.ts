/**
 * StarSeed XR · NOMBRES «ESTO SE ENVIARÁ A» (cableado XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 *
 * Lógica PURA que rellena el puente que `tarjeta-voz.tsx` dejó a la espera (`enviaA`): a partir de los
 * pasos que `entenderVoz` entendió, lista los nombres a los que lo confirmado se enviará según
 * `saleDeLaCuenta` (invitar, subir a estación/publicación/mensaje). Guardar en la Biblioteca propia no
 * sale de la cuenta y no aparece. Módulo puro: nada de red, disco ni React.
 */
import { saleDeLaCuenta } from "../../../lib/xr/intenciones-voz";
import type { PasoVoz } from "../../../lib/xr/intenciones-tipos";

export function nombresEnviaA(pasos: PasoVoz[]): string[] {
    const nombres: string[] = [];
    for (const p of pasos) {
        if (!saleDeLaCuenta(p.intencion)) continue;
        const i = p.intencion;
        if (i.tipo === "invitar") nombres.push(...i.a.map((r) => r.nombre));
        else if (i.tipo === "subir") {
            const d = i.destino;
            if (d.donde === "estacion" && d.ref) nombres.push(d.ref.nombre);
            else if (d.donde === "estacion" && d.nueva) nombres.push("una estación nueva");
            else if (d.donde === "publicacion")
                nombres.push(d.visibilidad === "publica" ? "todo el mundo" : d.ref ? d.ref.nombre : "tu grupo");
            else if (d.donde === "mensaje") nombres.push(...d.para.map((r) => r.nombre));
        }
    }
    return [...new Set(nombres)];
}
