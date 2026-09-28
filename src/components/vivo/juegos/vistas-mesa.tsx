"use client";

import type { TableroAjedrez as EstadoTableroAjedrez } from "@/lib/vivo/juegos/ajedrez-juego";
import type { TableroConecta4 } from "@/lib/vivo/juegos/conecta4";
import type { TableroTresEnRaya } from "@/lib/vivo/juegos/tres-en-raya";
import { estilos as s } from "./comun";
import { EscenarioAjedrez, LateralAjedrez } from "./escenario-ajedrez";
import { IndicadorTurno } from "./indicadores";
import { TableroC4 } from "./tablero-c4";
import { TableroTres } from "./tablero-tres";
import type { PropsVista } from "./vista";

function activoAhora(p: PropsVista): boolean {
    return p.puedeActuar && p.estado.iniciada && !p.estado.fin && p.estado.turno !== null && p.misAsientos.includes(p.estado.turno);
}

export function VistaTres(p: PropsVista) {
    const tablero = p.estado.tablero as TableroTresEnRaya;
    return (
        <>
            <section className={`${s.vidrio} ${s.escenario}`} aria-label="Tres en raya">
                {p.resultado}
                <IndicadorTurno estado={p.estado} misAsientos={p.misAsientos} />
                <TableroTres tablero={tablero} activo={activoAhora(p)} alJugar={(c) => p.enviar("jugar", { c })} />
            </section>
            <aside className={s.lateral}>{p.panelMesa}</aside>
        </>
    );
}

export function VistaC4(p: PropsVista) {
    const tablero = p.estado.tablero as TableroConecta4;
    return (
        <>
            <section className={`${s.vidrio} ${s.escenario}`} aria-label="Conecta 4">
                {p.resultado}
                <IndicadorTurno estado={p.estado} misAsientos={p.misAsientos} />
                <TableroC4 tablero={tablero} activo={activoAhora(p)} alJugar={(c) => p.enviar("jugar", { c })} />
            </section>
            <aside className={s.lateral}>{p.panelMesa}</aside>
        </>
    );
}

export function VistaAjedrez(p: PropsVista) {
    const tablero = p.estado.tablero as EstadoTableroAjedrez;
    const enCurso = p.estado.iniciada && !p.estado.fin;
    return (
        <>
            <section className={`${s.vidrio} ${s.escenario}`} aria-label="Ajedrez">
                {p.resultado}
                <IndicadorTurno estado={p.estado} misAsientos={p.misAsientos} />
                {tablero.jaque && enCurso && (
                    <span className={s.pildora} style={{ background: "rgba(220,20,60,.2)", boxShadow: "inset 0 0 0 1px rgba(220,20,60,.7)" }} role="status">
                        Jaque
                    </span>
                )}
                <EscenarioAjedrez tablero={tablero} activo={activoAhora(p)} misAsientos={p.misAsientos} alJugar={(m) => p.enviar("jugar", { m })} />
            </section>
            <aside className={s.lateral}>
                {p.panelMesa}
                <LateralAjedrez
                    tablero={tablero}
                    misAsientos={p.misAsientos}
                    enCurso={enCurso}
                    puedeActuar={p.puedeActuar}
                    enviar={(k, d) => p.enviar(k, d)}
                    rendirse={p.rendirse}
                />
            </aside>
        </>
    );
}
