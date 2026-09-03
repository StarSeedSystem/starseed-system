"use client";

/**
 * FICHA TÉCNICA DE UNA VOZ (Ola 228 · Estudio de Voces)
 * ─────────────────────────────────────────────────────────────────────────────
 * Muestra de un vistazo cómo está construida una voz del catálogo editable
 * (`voces-catalogo.ts`): su motor, su receta interna, su expresividad y la
 * RUTA DEL CÓDIGO donde vive su definición original, con botón para copiarla.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import type { VozEditable } from "@/lib/aurora/voces-catalogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 last:border-b-0">
            <span className="text-xs text-muted-foreground">{etiqueta}</span>
            <span className="text-right text-sm font-medium">{valor}</span>
        </div>
    );
}

export function FichaVoz({ voz }: { voz: VozEditable }) {
    const [copiado, setCopiado] = useState(false);

    const copiarRuta = () => {
        try {
            void navigator.clipboard?.writeText(voz.archivoCodigo).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1600);
            });
        } catch { /* sin portapapeles */ }
    };

    const origenTexto =
        voz.origen === "clon"
            ? `Clon de «${voz.base ?? "?"}», creado por ti`
            : voz.origen === "editada"
                ? "Voz del sistema, con tus ajustes encima"
                : "Voz predeterminada del sistema, sin tocar";

    return (
        <div className="space-y-4">
            <div className="space-y-0.5" aria-label="Datos técnicos de la voz">
                <Fila etiqueta="Motor" valor={`Neuronal local (1.58-bit) · voz ${voz.local.voz}`} />
                <Fila etiqueta="Voz interna" valor={voz.local.voz} />
                <Fila etiqueta="Velocidad" valor={voz.local.speed.toFixed(2)} />
                <Fila
                    etiqueta="Instrucción"
                    valor={voz.local.instruct.trim() ? voz.local.instruct : "Sin instrucción de estilo"}
                />
                <Fila
                    etiqueta="Expresividad"
                    valor={`arco ${voz.expr.arco.toFixed(2)} · vivacidad ${voz.expr.vivacidad.toFixed(2)} · calidez ${voz.expr.calidez.toFixed(2)}`}
                />
                <Fila
                    etiqueta="Respaldo de sistema"
                    valor={`tono ${voz.sistema.pitch.toFixed(2)} · ritmo ${voz.sistema.rate.toFixed(2)}`}
                />
                <div className="flex items-baseline justify-between gap-4 py-1.5">
                    <span className="text-xs text-muted-foreground">Origen</span>
                    <Badge variant={voz.origen === "defecto" ? "secondary" : "default"}>
                        {voz.origen === "defecto" ? "Predeterminada" : voz.origen === "editada" ? "Editada" : "Clon"}
                    </Badge>
                </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <p className="mb-1 text-xs text-muted-foreground">Ruta del código fuente</p>
                <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-background/60 px-2 py-1 font-mono text-xs">
                        {voz.archivoCodigo}
                    </code>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={copiarRuta}
                        className="cursor-pointer"
                        aria-label="Copiar la ruta del código"
                    >
                        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                <p>
                    Esta voz se usa en todo el sistema donde habla Aurora: la bienvenida del
                    rito de entrada, las guías del Escritorio, los avisos hablados y la lectura
                    en voz alta. Cuando el motor neuronal local 1.58-bit está instalado, suena
                    por él con la receta «{voz.local.voz}» a velocidad{" "}
                    {voz.local.speed.toFixed(2)}; si aún no lo está, el respaldo del sistema
                    imita el mismo carácter con su tono y su ritmo.
                </p>
                <p>
                    Los tres números de expresividad son lo que separan una voz con carácter de
                    una lectura plana: el <strong className="text-foreground">arco</strong>{" "}
                    marca cuánto cae el tono al cerrar la frase, la{" "}
                    <strong className="text-foreground">vivacidad</strong> cuánto varía el ritmo
                    entre cláusulas y la <strong className="text-foreground">calidez</strong>{" "}
                    cuánto se abre la voz al saludar. {origenTexto}. Para mejorarla, prueba a
                    subir la calidez en una voz de bienvenida, bajar la vivacidad en una voz de
                    lectura larga, o ajustar la instrucción de estilo —que viaja tal cual al
                    motor neuronal— hasta que el carácter sea el que buscas.
                </p>
            </div>
        </div>
    );
}
