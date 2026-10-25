"use client";

/**
 * TarjetaBienvenida — «Te damos la bienvenida a StarSeed OS» con sus tres acciones.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025B) Era el aviso discreto del primer arranque (`AvisoBienvenidaWeb`, abajo de la
 * pantalla). Ahora es UNA pieza que se pinta en dos sitios:
 *
 *   · `variante="aviso"`  — abajo, discreta, en una web normal sin sesión (el aviso de siempre);
 *   · `variante="puerta"` — en el CENTRO, delante de la vista previa difuminada, cuando una página
 *     pide sesión y no la hay (`puerta-sesion.tsx`).
 *
 * Las tres acciones son las de siempre y las resuelve quien la monta: «Entrar o crear cuenta» abre la
 * ventana de acceso en la cuenta, «Ver la introducción» la abre desde el principio y «Explorar sin cuenta»
 * la salta. Aquí no hay lógica de sesión: solo la tarjeta, bien hecha (dianas de 44 px, cursor pointer,
 * foco visible, nada se mueve con movimiento reducido).
 */

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { IconoStarSeed } from "./icono-starseed";

export interface TarjetaBienvenidaProps {
    /** «aviso»: discreta, abajo. «puerta»: grande y centrada, delante de la vista previa. */
    variante?: "aviso" | "puerta";
    onEntrar: () => void;
    onIntroduccion: () => void;
    onExplorar: () => void;
    /** Esquina superior derecha (el botón de cerrar del aviso). */
    esquina?: ReactNode;
    /** id del título, si quien la monta lo necesita para `aria-labelledby`. */
    idTitulo?: string;
    className?: string;
}

export const TITULO_BIENVENIDA = "Te damos la bienvenida a StarSeed OS";
export const TEXTO_BIENVENIDA =
    "Crea tu cuenta o entra para tener tus escritorios, tu biblioteca y a Aurora en todos tus dispositivos.";

export function TarjetaBienvenida({
    variante = "aviso",
    onEntrar,
    onIntroduccion,
    onExplorar,
    esquina,
    idTitulo,
    className,
}: TarjetaBienvenidaProps) {
    const idPropio = useId();
    const id = idTitulo ?? `${idPropio}-titulo`;
    const puerta = variante === "puerta";

    return (
        <div
            data-testid="tarjeta-bienvenida"
            data-variante={variante}
            className={cn(
                "relative border border-white/12 bg-[#0c0e18]/90 text-white shadow-2xl shadow-black/50 backdrop-blur-xl",
                puerta ? "w-full max-w-md rounded-3xl p-6 sm:p-7" : "rounded-2xl p-4",
                className,
            )}
        >
            {esquina}
            <div className={cn(puerta ? "flex flex-col items-center gap-3 text-center" : "flex items-start gap-3 pr-8")}>
                <IconoStarSeed size={puerta ? 48 : 36} className="shrink-0" />
                <div className="min-w-0">
                    <h2 id={id} className={cn("font-semibold text-white", puerta ? "text-lg" : "text-sm")}>
                        {TITULO_BIENVENIDA}
                    </h2>
                    <p className={cn("leading-snug text-white/65", puerta ? "mt-1.5 text-sm" : "mt-0.5 text-xs")}>
                        {TEXTO_BIENVENIDA}
                    </p>
                </div>
            </div>
            <div className={cn("mt-4 flex flex-wrap items-center gap-2", puerta && "flex-col sm:flex-row sm:justify-center")}>
                <Button className={cn("h-11 cursor-pointer", puerta && "w-full sm:w-auto")} onClick={onEntrar}>
                    Entrar o crear cuenta
                </Button>
                <Button
                    variant="outline"
                    className={cn("h-11 cursor-pointer border-white/15", puerta && "w-full sm:w-auto")}
                    onClick={onIntroduccion}
                >
                    Ver la introducción
                </Button>
                <button
                    type="button"
                    onClick={onExplorar}
                    className={cn(
                        "inline-flex min-h-[44px] cursor-pointer items-center rounded-md px-2 text-xs text-white/60 underline-offset-2 hover:text-white/90 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300",
                        puerta ? "justify-center sm:ml-1" : "ml-auto",
                    )}
                >
                    Explorar sin cuenta
                </button>
            </div>
        </div>
    );
}

export default TarjetaBienvenida;
