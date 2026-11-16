"use client";

/**
 * PedirEditar — «Pedir editar» para quien sólo mira (SES1116B, §3.4 y §10 P1-C).
 *
 * Visible únicamente con rango `ver` o `comentar` (rangoDeSesion). El botón llama
 * a `pedir` (inyectada) y nunca lanza dos peticiones seguidas. Estados en palabras:
 * «Pedida: quien gestiona la verá», «Ya puedes editar» y el motivo del fallo tal cual.
 * Con rango `editar` o superior no se renderiza nada.
 *
 * Integración: `pedirEdicionDeSpaces(espacioId)` da la `pedir` ya cableada a
 * `requestSpaceAccess` de spaces.ts (§3.4: entra como `pending` en `os_space_editors`,
 * quien gestiona la aprueba); si la fila ya era `member`, se dice «Ya puedes editar».
 *
 * Contrato: architecture/sesiones-en-vivo-entidades-y-transmisiones.md §3.4.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RangoSesion } from "@/lib/vivo-entidad/traduccion-roles";
import { requestSpaceAccess } from "@/lib/spaces/spaces";

export type ResultadoPedir =
    | { estado: "pedida" }
    | { estado: "puede-editar" }
    | { estado: "error"; motivo: string };

export type EstadoBoton = "inicial" | "pedida" | "puede-editar" | "error";

export interface PropsPedirEditar {
    rango: RangoSesion | null;
    pedir: () => Promise<ResultadoPedir>;
}

export function textoDeEstado(e: EstadoBoton, motivo: string | null): string {
    if (e === "pedida") return "Pedida: quien gestiona la verá";
    if (e === "puede-editar") return "Ya puedes editar";
    if (e === "error") return motivo ?? "No se pudo enviar la petición";
    return "";
}

export function sePuedePedir(rango: RangoSesion | null): boolean {
    return rango === "ver" || rango === "comentar";
}

/** Respuesta de `requestSpaceAccess` (spaces.ts): `ok` y, si la fila ya era `member`, `alreadyMember`. */
export type RespuestaAcceso = { ok: boolean; alreadyMember?: boolean };

/**
 * La `pedir` de la integración: envuelve `requestSpaceAccess` de `src/lib/spaces/spaces.ts`
 * y la traduce a los estados del botón. Uso:
 * `<PedirEditar rango={rangoDeSesion(ctx)} pedir={pedirEdicionDeSpaces(espacioId)} />`.
 * `pedirAcceso` solo existe para las pruebas: en la integración no se pasa.
 */
export function pedirEdicionDeSpaces(
    espacioId: string,
    pedirAcceso: (espacioId: string) => Promise<RespuestaAcceso> = requestSpaceAccess,
): () => Promise<ResultadoPedir> {
    return async () => {
        try {
            const r = await pedirAcceso(espacioId);
            if (!r.ok) return { estado: "error", motivo: "No se pudo enviar la petición" };
            return r.alreadyMember ? { estado: "puede-editar" } : { estado: "pedida" };
        } catch (err) {
            return { estado: "error", motivo: err instanceof Error ? err.message : "No se pudo enviar la petición" };
        }
    };
}

export function PedirEditar({ rango, pedir }: PropsPedirEditar) {
    const [estado, setEstado] = useState<EstadoBoton>("inicial");
    const [motivo, setMotivo] = useState<string | null>(null);
    const enviando = useRef(false);

    if (!sePuedePedir(rango)) return null;

    const pedirUnaVez = async () => {
        if (enviando.current || estado !== "inicial") return;
        enviando.current = true;
        try {
            const r = await pedir();
            if (r.estado === "pedida") setEstado("pedida");
            else if (r.estado === "puede-editar") setEstado("puede-editar");
            else {
                setEstado("error");
                setMotivo(r.motivo);
            }
        } catch (err) {
            setEstado("error");
            setMotivo(err instanceof Error ? err.message : "No se pudo enviar la petición");
        } finally {
            enviando.current = false;
        }
    };

    return (
        <div data-testid="pedir-editar" className="flex flex-col gap-1">
            {estado === "inicial" ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="boton-pedir-editar"
                    disabled={enviando.current}
                    onClick={pedirUnaVez}
                >
                    Pedir editar
                </Button>
            ) : (
                <p
                    data-testid="estado-peticion"
                    className={estado === "error" ? "text-sm text-red-300" : "text-sm text-white/70"}
                    role={estado === "error" ? "alert" : undefined}
                >
                    {textoDeEstado(estado, motivo)}
                </p>
            )}
        </div>
    );
}
