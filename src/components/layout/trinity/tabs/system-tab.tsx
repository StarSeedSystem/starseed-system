"use client";

/**
 * Sección «Sistema» del Centro de Control: la cuenta y este aparato, cada entrada con su destino REAL
 * (ver `logic/datos-sistema.ts`). Al pulsar, el panel se cierra con su animación y se abre la página.
 */
import { GRUPOS_SISTEMA } from "../logic/datos-sistema";
import { useIrCerrando } from "../logic/use-ir-cerrando";

export function SystemTab() {
    const ir = useIrCerrando();

    return (
        <div className="space-y-5 pt-1" data-testid="seccion-sistema">
            {GRUPOS_SISTEMA.map((grupo) => (
                <section key={grupo.id} aria-labelledby={`sistema-${grupo.id}`}>
                    <h3 id={`sistema-${grupo.id}`} className="m-0 border-b border-amber-300/15 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
                        {grupo.titulo}
                    </h3>
                    <ul className="mt-3 grid grid-cols-2 gap-2">
                        {grupo.entradas.map((e) => {
                            const Icono = e.icono;
                            return (
                                <li key={e.id} className="min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => ir(e.href)}
                                        data-testid={`sistema-${e.id}`}
                                        data-href={e.href}
                                        className="group flex min-h-[92px] w-full min-w-0 cursor-pointer flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left outline-none transition-[border-color,background-color,transform] duration-200 hover:border-amber-300/40 hover:bg-amber-400/[0.08] focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-safe:active:scale-[0.97]"
                                    >
                                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-amber-100/80 transition-colors duration-200 group-hover:text-amber-100">
                                            <Icono className="h-[18px] w-[18px]" aria-hidden="true" />
                                        </span>
                                        <span className="block min-w-0 max-w-full">
                                            <span className="block truncate text-[13px] font-medium leading-tight text-amber-50">{e.rotulo}</span>
                                            <span className="mt-0.5 block text-[11px] leading-snug text-amber-100/60">{e.sub}</span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
}
