"use client";

import { Minus, Plus, ThumbsUp } from "lucide-react";
import { aporteDe, comprobarPasoContador, datosDeTipo, totalContador } from "@/lib/vivo/programas/derivados";
import { K, type BloqueContador } from "@/lib/vivo/programas/tipos";
import { Boton, estilos as s } from "../juegos/comun";
import { usePrograma } from "./contexto";
import { MarcoBloque } from "./marco-bloque";
import p from "./programas.module.css";

/** Contador compartido: libre (cualquiera sube y baja) o «un voto por persona». */
export function BloqueContadorVista({ bloque }: { bloque: BloqueContador }) {
    const { estado, yoUid, puedeParticipar, enviar } = usePrograma();
    const aportes = datosDeTipo(estado.datos[bloque.id], "contador")?.aportes ?? {};
    const total = totalContador(bloque, aportes);
    const personas = Object.keys(aportes).length;
    const mio = aporteDe(aportes, yoUid);
    const sube = yoUid ? comprobarPasoContador(bloque, aportes, yoUid, 1) : ({ ok: false, motivo: "Inicia sesión para participar." } as const);
    const baja = yoUid ? comprobarPasoContador(bloque, aportes, yoUid, -1) : ({ ok: false, motivo: "Inicia sesión para participar." } as const);
    const voto = bloque.porPersona === 1;
    const paso = (d: 1 | -1) => enviar(K.contar, { b: bloque.id, d });

    return (
        <MarcoBloque
            bloque={bloque}
            titulo={bloque.titulo}
            subtitulo={personas === 0 ? "Nadie ha aportado todavía" : `${personas} ${personas === 1 ? "persona ha aportado" : "personas han aportado"}`}
        >
            <div className={p.contador}>
                {!voto && (
                    <Boton
                        redondo
                        className={p.botonContador}
                        disabled={!puedeParticipar || !baja.ok}
                        onClick={() => paso(-1)}
                        aria-label={`Restar uno a «${bloque.titulo}»`}
                        title={baja.ok ? "Restar" : baja.motivo}
                    >
                        <Minus size={26} aria-hidden="true" />
                    </Boton>
                )}
                <div role="status" aria-live="polite" aria-atomic="true">
                    <div className={p.numero} key={total}>
                        {total}
                    </div>
                    {bloque.unidad && <span className={p.unidad}>{bloque.unidad}</span>}
                </div>
                {voto ? (
                    <Boton
                        variante={mio === 0 ? "primario" : "normal"}
                        disabled={!puedeParticipar || (mio === 0 ? !sube.ok : !baja.ok)}
                        onClick={() => paso(mio === 0 ? 1 : -1)}
                        icono={<ThumbsUp size={18} aria-hidden="true" />}
                        title={mio === 0 ? (sube.ok ? undefined : sube.motivo) : undefined}
                    >
                        {mio === 0 ? "Sumar mi voto" : "Retirar mi voto"}
                    </Boton>
                ) : (
                    <Boton
                        redondo
                        variante="primario"
                        className={p.botonContador}
                        disabled={!puedeParticipar || !sube.ok}
                        onClick={() => paso(1)}
                        aria-label={`Sumar uno a «${bloque.titulo}»`}
                        title={sube.ok ? "Sumar" : sube.motivo}
                    >
                        <Plus size={26} aria-hidden="true" />
                    </Boton>
                )}
            </div>
            {!voto && bloque.porPersona !== null && mio !== 0 && <p className={s.nota}>Tu aportación: {mio}.</p>}
            {(bloque.min !== null || bloque.max !== null) && (
                <p className={s.nota}>
                    {bloque.min !== null && bloque.max !== null
                        ? `Entre ${bloque.min} y ${bloque.max}.`
                        : bloque.min !== null
                          ? `Mínimo ${bloque.min}.`
                          : `Máximo ${bloque.max}.`}
                </p>
            )}
            {!puedeParticipar && <p className={s.nota}>Puedes mirar el contador, pero no cambiarlo.</p>}
        </MarcoBloque>
    );
}
