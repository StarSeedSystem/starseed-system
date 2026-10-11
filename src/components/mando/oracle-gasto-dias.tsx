"use client";

export function OracleGastoDias({ dias, moneda }: { dias: { dia: string; coste: number }[]; moneda: string }) {
    if (!dias.length) return null;

    const fmt = (v: number) =>
        v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const max = Math.max(0, ...dias.map((d) => d.coste));
    const hoy = dias[dias.length - 1];
    const pico = dias.reduce<{ dia: string; coste: number } | null>(
        (a, d) => (!a || d.coste > a.coste ? d : a),
        null,
    );
    const etiqueta = `Gasto de Oracle por día: máximo ${fmt(pico?.coste ?? 0)} ${moneda}; hoy ${fmt(hoy?.coste ?? 0)} ${moneda}`;

    const ancho = 14;
    const alto = 34;

    return (
        <figure className="m-0">
            <svg
                role="img"
                aria-label={etiqueta}
                viewBox={`0 0 ${dias.length * ancho} ${alto}`}
                preserveAspectRatio="none"
                className="block h-9 w-full"
            >
                {dias.map((d, i) => {
                    if (d.coste === 0) {
                        return (
                            <line
                                key={d.dia}
                                x1={i * ancho + 2}
                                x2={i * ancho + ancho - 2}
                                y1={alto - 1}
                                y2={alto - 1}
                                stroke="rgba(251,191,36,.5)"
                                strokeWidth={1}
                            />
                        );
                    }
                    const h = Math.max(1.5, (d.coste / max) * (alto - 3));
                    const esHoy = i === dias.length - 1;
                    return (
                        <rect
                            key={d.dia}
                            x={i * ancho + 2}
                            y={alto - h}
                            width={ancho - 4}
                            height={h}
                            rx={2}
                            fill={esHoy ? "rgba(251,191,36,.85)" : "rgba(251,191,36,.4)"}
                        >
                            <title>{`${d.dia}: ${fmt(d.coste)} ${moneda}`}</title>
                        </rect>
                    );
                })}
            </svg>
            <figcaption className="mt-0.5 text-[10px] text-white/40">
                gasto por día ({moneda})
            </figcaption>
        </figure>
    );
}

</content>