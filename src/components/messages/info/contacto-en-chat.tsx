"use client";

/**
 * Sección «Contacto» del panel de un chat de dos: si la persona está en tu libreta, quién es
 * para ti (nombre, apodo, relación, descripción, teléfonos y correos a un toque, notas) con
 * «Editar contacto» y «Ver ficha»; si no, la invitación a guardarla (BotonAnadirContacto).
 */

import { useState } from "react";
import Link from "next/link";
import { Contact, IdCard, Mail, Pencil, Phone } from "lucide-react";
import { RELACIONES, type Contacto } from "@/lib/contactos/tipos";
import type { OsProfile } from "@/lib/social/os-profiles";
// Contratos C8 y C9.
import { EditorContacto } from "@/components/contactos/editor-contacto";
import { LineaTiempoNotas } from "@/components/contactos/linea-tiempo-notas";
import { BotonAnadirContacto } from "@/components/contactos/boton-anadir-contacto";
import { RotuloSeccion, Tarjeta } from "@/components/messages/info/piezas";

export function ChipRelacion({ contacto }: { contacto: Pick<Contacto, "relacion" | "relacionDetalle"> }) {
    const r = RELACIONES.find((x) => x.id === contacto.relacion);
    if (!r) return null;
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium text-white"
            style={{ background: `${r.color}1f`, boxShadow: `inset 0 0 0 1px ${r.color}66` }}
        >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} aria-hidden />
            {r.etiqueta}
            {contacto.relacionDetalle ? <span className="text-white/65"> · {contacto.relacionDetalle}</span> : null}
        </span>
    );
}

export function ContactoEnChat({
    userId, perfil, contacto,
}: { userId: string; perfil?: OsProfile; contacto?: Contacto }) {
    const [editando, setEditando] = useState(false);

    if (!contacto) {
        return (
            <Tarjeta>
                <RotuloSeccion className="mb-2">Contacto</RotuloSeccion>
                <div className="flex items-start gap-3 px-1">
                    <Contact className="mt-0.5 h-5 w-5 shrink-0 text-[#14B8A6]" />
                    <p className="text-[13px] leading-snug text-white/70">
                        Guárdala en tus contactos para recordar quién es para ti, sus datos y vuestra historia. Solo lo ves tú.
                    </p>
                </div>
                <div className="mt-3">
                    <BotonAnadirContacto
                        userId={userId}
                        username={perfil?.username ?? null}
                        nombre={perfil?.displayName || perfil?.username || "Contacto"}
                        avatarUrl={perfil?.avatarUrl ?? null}
                        bio={perfil?.bio ?? null}
                        variante="completo"
                    />
                </div>
            </Tarjeta>
        );
    }

    const telefonos = contacto.telefonos ?? [];
    const correos = contacto.correos ?? [];

    return (
        <Tarjeta>
            <RotuloSeccion className="mb-2">Contacto</RotuloSeccion>
            <div className="space-y-2 px-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-white">{contacto.nombre}</span>
                    {contacto.apodo && <span className="text-[13px] text-white/60">«{contacto.apodo}»</span>}
                    <ChipRelacion contacto={contacto} />
                </div>
                {contacto.descripcion && <p className="whitespace-pre-wrap text-[13px] leading-snug text-white/70">{contacto.descripcion}</p>}
                {(telefonos.length > 0 || correos.length > 0) && (
                    <div className="flex flex-col gap-1 pt-1">
                        {telefonos.map((t) => (
                            <a key={t.id} href={`tel:${t.valor.replace(/\s+/g, "")}`} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13.5px] text-white/85 transition-colors hover:bg-white/[0.05]">
                                <Phone className="h-4 w-4 text-[#14B8A6]" />
                                <span className="min-w-0 flex-1 truncate">{t.valor}</span>
                                {t.etiqueta && <span className="text-[11.5px] text-white/45">{t.etiqueta}</span>}
                            </a>
                        ))}
                        {correos.map((c) => (
                            <a key={c.id} href={`mailto:${c.valor}`} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13.5px] text-white/85 transition-colors hover:bg-white/[0.05]">
                                <Mail className="h-4 w-4 text-[#007FFF]" />
                                <span className="min-w-0 flex-1 truncate">{c.valor}</span>
                                {c.etiqueta && <span className="text-[11.5px] text-white/45">{c.etiqueta}</span>}
                            </a>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-3 border-t border-white/[0.06] pt-3">
                <LineaTiempoNotas contactoId={contacto.id} compacta />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-white transition-colors"
                    style={{ background: "#14B8A62e", boxShadow: "inset 0 0 0 1px #14B8A699" }}
                >
                    <Pencil className="h-4 w-4" /> Editar contacto
                </button>
                <Link
                    href={`/contactos?c=${encodeURIComponent(contacto.id)}`}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white"
                    style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }}
                >
                    <IdCard className="h-4 w-4" /> Ver ficha
                </Link>
            </div>

            <EditorContacto open={editando} onOpenChange={setEditando} contactoId={contacto.id} />
        </Tarjeta>
    );
}

export default ContactoEnChat;
