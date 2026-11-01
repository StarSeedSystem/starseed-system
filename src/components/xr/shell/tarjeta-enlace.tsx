"use client";

/**
 * StarSeed XR · ENLACE de la tarjeta de confirmación con la voz (XR1010Q · §3 f). Une lo que ya
 * existía: `TarjetaVoz` + el modelo puro de `estado-tarjeta.ts` + la sesión de `use-voz-xr` y el
 * ejecutor de compartir inyectado con deps reales (`deps-compartir.ts`). Mientras la tarjeta
 * espera, TODA frase dictada es suya y la resuelve `resolverRespuesta`; nada de lo que sale de la
 * cuenta se aplica sin su «confirmar», y el destino del mundo se abre DESPUÉS de la decisión.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { ContextoVoz, PasoVoz, TipoRef } from "@/lib/xr/intenciones-tipos";
import { aplicarConfirmadas } from "./deps-compartir";
import { modeloTarjeta, type ModeloTarjeta, type Resolucion } from "./estado-tarjeta";
import type { EventoOrbe } from "./estado-orbe";
import { repartirFrase, type Reparto } from "./voz-xr";
import { saleDeLaCuenta } from "@/lib/xr/intenciones-voz";

export interface OpcionesEnlace {
    resultado: Reparto | null;
    avisar: (e: EventoOrbe) => void;
    /** La sala desde la que lo confirmado se aplica: la abierta o la recién creada. */
    escena: () => string | null;
    cancelar: () => void;
    elegirEnfoque: (ref: { tipo: TipoRef; id: string }) => void;
}

export interface EnlaceTarjeta {
    modelo: ModeloTarjeta | null;
    frase: string | null;
    reparto: (frase: string, ctx: ContextoVoz, molecula: boolean) => Reparto | null;
    resolver: (r: Resolucion) => void;
    /** Ruta del mundo ya ejecutado: si la orden trae salida pendiente se espera a la decisión; si no, se abre. */
    siHayDestino: (destino: string | null, sale: boolean) => void;
}

/** ¿La orden pendiente lleva pasos que salen de la cuenta? `saleDeLaCuenta` del núcleo puro lo dice. */
export function conSalidaPendiente(pasos: readonly PasoVoz[]): boolean {
    return pasos.some((p) => saleDeLaCuenta(p.intencion));
}

export function usarTarjeta(o: OpcionesEnlace): EnlaceTarjeta {
    const modelo = useMemo(() => (o.resultado?.via === "intencion" ? modeloTarjeta(o.resultado.resultado) : null), [o.resultado]);
    const [frase, setFrase] = useState<string | null>(null);
    const vivo = useRef(o); vivo.current = o;
    const modeloRef = useRef<ModeloTarjeta | null>(null);
    modeloRef.current = modelo;
    const destino = useRef<string | null>(null);

    // Con tarjeta abierta, la frase dictada NO la reparte la máquina: la arbitra la tarjeta (voz §3 f).
    const reparto = useCallback((text: string, ctx: ContextoVoz, molecula: boolean): Reparto | null => {
        if (!modeloRef.current) return repartirFrase(text, ctx, molecula);
        setFrase(text);
        return null;
    }, []);

    // Única salida de la tarjeta (botón, opción o voz): confirmar, cambiar, cancelar o «¿cuál?».
    const resolver = useCallback((r: Resolucion) => {
        setFrase(null);
        const en = vivo.current.resultado;
        const pasos = en?.via === "intencion" && en.resultado.ok ? en.resultado : null;
        if (r === "cambiar" || r === "cancelar") { vivo.current.cancelar(); destino.current = null; return; }
        if (r === "confirmar") {
            if (!pasos) { vivo.current.cancelar(); return; }
            vivo.current.cancelar();
            void aplicarConfirmadas(pasos.pasos, vivo.current.escena()).then(({ logros, avisos }) => {
                const av = vivo.current.avisar;
                if (avisos.length) av({ tipo: "error", texto: avisos.join(" · ") });
                for (const texto of logros) { av({ tipo: "habla-inicio", texto }); av({ tipo: "habla-fin" }); }
                const d = destino.current;
                destino.current = null;
                if (d) window.location.assign(d);
            });
            return;
        }
        // «¿Cuál?» por botón o voz: el candidato elegido vuelve al entendimiento como enfoque.
        const dudo = en?.via === "intencion" && !en.resultado.ok && en.resultado.candidatos ? en.resultado : null;
        const candidato = dudo ? dudo.candidatos?.find((c) => c.id === r.elegir) : undefined;
        if (candidato) vivo.current.elegirEnfoque({ tipo: candidato.tipo, id: candidato.id });
        else vivo.current.cancelar();
    }, []);

    const siHayDestino = useCallback((d: string | null, sale: boolean) => {
        if (d === null) return;
        if (sale) destino.current = d;
        else window.location.assign(d);
    }, []);

    return { modelo, frase, reparto, resolver, siHayDestino };
}
