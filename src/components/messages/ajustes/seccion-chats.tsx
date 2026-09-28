"use client";

/**
 * Ajustes › Chats (2026-09-28): apariencia por defecto con vista previa en vivo (dos burbujas
 * sobre el fondo elegido), envío, multimedia y orden de la lista.
 */

import { useState } from "react";
import { CheckCheck, ImagePlus, Palette } from "lucide-react";
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import { cn } from "@/lib/utils";
import { fondoCss, tamanoLetraPx } from "@/lib/mensajeria/ajustes";
import {
    COLORES_BURBUJA, FONDOS_PRESET,
    type AjustesApariencia, type AjustesMensajeriaApi, type FondoChat,
} from "@/lib/mensajeria/ajustes-tipos";
import { horaCorta } from "@/components/messages/marco/formato-tiempo";
import { Bloque, Fila, FilaInterruptor, FilaOpciones, GrupoOpciones } from "./controles";

/** Solo https:// o rutas internas: una imagen de fondo nunca puede ser otra cosa. */
export function urlFondoValida(url: string): boolean {
    const u = url.trim();
    if (!u) return false;
    if (u.startsWith("/") && !u.startsWith("//")) return true;
    try {
        return new URL(u).protocol === "https:";
    } catch {
        return false;
    }
}

export function VistaPreviaChat({ apariencia, confirmaciones }: { apariencia: AjustesApariencia; confirmaciones: boolean }) {
    const px = tamanoLetraPx(apariencia.tamanoLetra);
    const compacta = apariencia.densidad === "compacta";
    const hora = (h: number, m: number) => {
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return horaCorta(d, apariencia.formato24h);
    };
    const burbuja = cn("max-w-[78%] rounded-2xl shadow-[0_8px_24px_-16px_rgba(0,0,0,0.8)]", compacta ? "px-3 py-1.5" : "px-3.5 py-2.5");
    return (
        <div
            data-testid="vista-previa-chat"
            aria-label="Vista previa de la apariencia"
            role="img"
            className={cn("relative overflow-hidden rounded-2xl border border-white/[0.08]", compacta ? "space-y-1.5 p-3" : "space-y-2.5 p-4")}
            style={{ background: fondoCss(apariencia.fondo), backgroundSize: "cover", backgroundPosition: "center" }}
        >
            <div className="flex justify-start">
                <div className={burbuja} style={{ background: "rgba(255,255,255,0.09)", backdropFilter: "blur(10px)", fontSize: px }}>
                    <p className="text-white/90">¿Nos vemos en el huerto al atardecer?</p>
                    {apariencia.mostrarHora && <p className="mt-0.5 text-right text-[10px] text-white/50">{hora(18, 42)}</p>}
                </div>
            </div>
            <div className="flex justify-end">
                <div className={burbuja} style={{ background: apariencia.colorBurbuja, fontSize: px }}>
                    <p className="text-white">Claro, llevo semillas y té.</p>
                    {apariencia.mostrarHora && (
                        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-white/75">
                            {hora(18, 44)}
                            {confirmaciones && <CheckCheck className="h-3 w-3" aria-hidden />}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function Muestra({ activa, etiqueta, fondo, onClick }: { activa: boolean; etiqueta: string; fondo: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={activa}
            aria-label={`Fondo ${etiqueta}`}
            className="group flex cursor-pointer flex-col items-center gap-1.5 focus-visible:outline-none"
        >
            <span
                className={cn(
                    "block h-14 w-14 rounded-xl border transition-all duration-150 group-focus-visible:ring-2 group-focus-visible:ring-[#7C5CFF]",
                    activa ? "border-[#7C5CFF] shadow-[0_0_0_2px_rgba(124,92,255,0.45)]" : "border-white/10 group-hover:border-white/30",
                )}
                style={{ background: fondo }}
            />
            <span className={cn("text-[11px]", activa ? "text-white" : "text-white/60")}>{etiqueta}</span>
        </button>
    );
}

export function SeccionChats({ api }: { api: AjustesMensajeriaApi }) {
    const { chats, privacidad } = api.ajustes;
    const ap = chats.apariencia;
    const [urlImagen, setUrlImagen] = useState(ap.fondo.tipo === "imagen" ? ap.fondo.url : "");
    const [errorUrl, setErrorUrl] = useState<string | null>(null);

    const cambiarApariencia = (cambios: Partial<AjustesApariencia>) =>
        api.cambiar("chats", { apariencia: { ...ap, ...cambios } });
    const cambiarFondo = (fondo: FondoChat) => cambiarApariencia({ fondo });

    const aplicarImagen = (url: string) => {
        if (!urlFondoValida(url)) {
            setErrorUrl("Usa una dirección que empiece por https://");
            return;
        }
        setErrorUrl(null);
        const limpia = url.trim().startsWith("/") ? url.trim() : new URL(url.trim()).href;
        setUrlImagen(limpia);
        cambiarFondo({ tipo: "imagen", url: limpia });
    };

    const colorFondo = ap.fondo.tipo === "color" ? ap.fondo.color : "#12132a";

    return (
        <div className="space-y-6">
            <Bloque titulo="Apariencia por defecto" descripcion="Así se ven todos tus chats, salvo los que personalices uno a uno.">
                <div className="px-4 py-4">
                    <VistaPreviaChat apariencia={ap} confirmaciones={privacidad.confirmacionesLectura} />
                </div>
                <Fila etiqueta="Fondo" apilada>
                    <div className="flex flex-wrap gap-3">
                        <Muestra activa={ap.fondo.tipo === "ninguno"} etiqueta="Ninguno" fondo="repeating-linear-gradient(45deg,#0c0d1c 0 6px,#111327 6px 12px)" onClick={() => cambiarFondo({ tipo: "ninguno" })} />
                        {FONDOS_PRESET.map((f) => (
                            <Muestra
                                key={f.id}
                                activa={ap.fondo.tipo === "preset" && ap.fondo.id === f.id}
                                etiqueta={f.nombre}
                                fondo={f.css}
                                onClick={() => cambiarFondo({ tipo: "preset", id: f.id })}
                            />
                        ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label
                            className={cn(
                                "ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                                ap.fondo.tipo === "color" ? "bg-[#7C5CFF1f] text-white shadow-[inset_0_0_0_1px_#7C5CFF66]" : "bg-white/[0.04] text-white/70 hover:text-white",
                            )}
                        >
                            <Palette className="h-3.5 w-3.5" />
                            Color liso
                            <input
                                type="color"
                                value={colorFondo}
                                onChange={(e) => cambiarFondo({ tipo: "color", color: e.target.value })}
                                aria-label="Elegir color de fondo"
                                className="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                            />
                        </label>
                        <AttachFilePickerButton
                            onPick={(elegidos) => {
                                const img = elegidos.find((a) => a.url && (a.kind === "image" || (a.mime ?? "").startsWith("image/")));
                                if (img?.url) aplicarImagen(img.url);
                            }}
                            accept="image/*"
                            folder="mensajeria"
                            title="Imagen de fondo para tus chats"
                            className="ss-redondo inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-[13px] font-medium text-white/70 hover:text-white"
                        >
                            <ImagePlus className="h-3.5 w-3.5" /> Subir imagen
                        </AttachFilePickerButton>
                    </div>
                    <form
                        className="mt-2 flex flex-col gap-2 sm:flex-row"
                        onSubmit={(e) => {
                            e.preventDefault();
                            aplicarImagen(urlImagen);
                        }}
                    >
                        <input
                            value={urlImagen}
                            onChange={(e) => setUrlImagen(e.target.value)}
                            placeholder="…o pega la dirección de una imagen (https://)"
                            aria-label="Dirección de la imagen de fondo"
                            className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[13px] text-white placeholder:text-white/40 focus:border-[#7C5CFF]/60 focus:outline-none"
                        />
                        <button type="submit" className="h-9 cursor-pointer rounded-xl bg-white/[0.08] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.14]">
                            Usar imagen
                        </button>
                    </form>
                    {errorUrl && <p role="alert" className="mt-1 text-[12px] text-rose-300">{errorUrl}</p>}
                </Fila>
                <FilaOpciones
                    etiqueta="Tamaño de letra"
                    valor={ap.tamanoLetra}
                    opciones={[
                        { id: "s", etiqueta: "Pequeña" },
                        { id: "m", etiqueta: "Mediana" },
                        { id: "l", etiqueta: "Grande" },
                        { id: "xl", etiqueta: "Muy grande" },
                    ]}
                    onChange={(tamanoLetra) => cambiarApariencia({ tamanoLetra })}
                />
                <Fila etiqueta="Color de tus burbujas" apilada>
                    <div role="radiogroup" aria-label="Color de tus burbujas" className="flex flex-wrap gap-2.5">
                        {COLORES_BURBUJA.map((c) => {
                            const activo = ap.colorBurbuja.toLowerCase() === c.toLowerCase();
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    role="radio"
                                    aria-checked={activo}
                                    aria-label={`Color ${c}`}
                                    onClick={() => cambiarApariencia({ colorBurbuja: c })}
                                    className={cn(
                                        "ss-redondo h-8 w-8 cursor-pointer rounded-full transition-transform duration-150 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                                        activo && "scale-110",
                                    )}
                                    style={{ background: c, boxShadow: activo ? `0 0 0 2px #0b0c1c, 0 0 0 4px ${c}` : "inset 0 0 0 1px rgba(255,255,255,.15)" }}
                                />
                            );
                        })}
                    </div>
                </Fila>
                <FilaOpciones
                    etiqueta="Densidad"
                    valor={ap.densidad}
                    opciones={[
                        { id: "comoda", etiqueta: "Cómoda" },
                        { id: "compacta", etiqueta: "Compacta" },
                    ]}
                    onChange={(densidad) => cambiarApariencia({ densidad })}
                />
                <FilaInterruptor etiqueta="Mostrar la hora de cada mensaje" checked={ap.mostrarHora} onChange={(mostrarHora) => cambiarApariencia({ mostrarHora })} />
                <FilaInterruptor etiqueta="Formato de 24 horas" checked={ap.formato24h} onChange={(formato24h) => cambiarApariencia({ formato24h })} />
            </Bloque>

            <Bloque titulo="Escribir y enviar">
                <FilaInterruptor
                    etiqueta="Enviar con Enter"
                    detalle={chats.enviarConEnter ? "Mayús + Enter hace un salto de línea." : "Enter hace un salto de línea; envía con el botón."}
                    checked={chats.enviarConEnter}
                    onChange={(enviarConEnter) => api.cambiar("chats", { enviarConEnter })}
                />
                <FilaInterruptor
                    etiqueta="Vista previa de enlaces"
                    detalle="Muestra título e imagen de las páginas que se comparten."
                    checked={chats.vistaPreviaEnlaces}
                    onChange={(vistaPreviaEnlaces) => api.cambiar("chats", { vistaPreviaEnlaces })}
                />
                <FilaOpciones
                    etiqueta="Cargar fotos y vídeos"
                    valor={chats.cargarMultimedia}
                    opciones={[
                        { id: "siempre", etiqueta: "Siempre" },
                        { id: "wifi", etiqueta: "Solo con wifi" },
                        { id: "nunca", etiqueta: "Al tocarlos" },
                    ]}
                    onChange={(cargarMultimedia) => api.cambiar("chats", { cargarMultimedia })}
                />
                <FilaOpciones
                    etiqueta="Calidad al subir"
                    detalle="Optimizada ahorra datos y espacio; Original conserva cada píxel."
                    valor={chats.calidadSubida}
                    opciones={[
                        { id: "optimizada", etiqueta: "Optimizada" },
                        { id: "original", etiqueta: "Original" },
                    ]}
                    onChange={(calidadSubida) => api.cambiar("chats", { calidadSubida })}
                />
            </Bloque>

            <Bloque titulo="Lista de chats">
                <Fila etiqueta="Ordenar por" apilada>
                    <GrupoOpciones
                        etiqueta="Ordenar la lista por"
                        valor={chats.ordenLista}
                        opciones={[
                            { id: "reciente", etiqueta: "Más recientes" },
                            { id: "no-leidos", etiqueta: "No leídos primero" },
                            { id: "nombre", etiqueta: "Nombre" },
                        ]}
                        onChange={(ordenLista) => api.cambiar("chats", { ordenLista })}
                    />
                </Fila>
                <FilaInterruptor
                    etiqueta="Fijados arriba"
                    detalle="Los chats fijados van en su propia sección, antes que el resto."
                    checked={chats.fijadosArriba}
                    onChange={(fijadosArriba) => api.cambiar("chats", { fijadosArriba })}
                />
            </Bloque>
        </div>
    );
}

export default SeccionChats;
