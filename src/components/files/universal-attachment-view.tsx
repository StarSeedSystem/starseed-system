"use client";

/*
 * UniversalAttachmentView — render compartido para los DOS tipos de adjunto
 * nuevos (jul-2026 · Mensajes/Correos/Comentarios ampliados):
 *
 *   · kind "invite" → InvitationCard (Aceptar/Rechazar; ver
 *     @/lib/invitations/invitations.ts).
 *   · kind "ref"    → referencia de "Contenido de la red" (página/grupo/
 *     evento/publicación, ver @/lib/files/network-content-ref.ts): se embebe
 *     con `EmbeddedContentWindow` — si la ruta interna referenciada es un
 *     espacio/servidor vivo, se ve EN TIEMPO REAL dentro del propio embed
 *     (es la misma página, con sus propias suscripciones realtime).
 *
 * El resto de formatos (imagen/audio/vídeo/archivo genérico) NO pasan por
 * aquí: cada superficie (message-bubble/correos-panel/comment-thread) sigue
 * resolviéndolos exactamente como hoy; este componente sólo cubre los dos
 * casos añadidos, para no tocar el render que ya funciona.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { EmbeddedContentWindow, type EmbeddedItem } from "@/components/posts/embedded-content-window";
import { InvitationCard } from "@/components/invitations/invitation-card";
import type { InviteTargetKind } from "@/lib/invitations/invitations";
import { networkRefLabel } from "@/lib/files/network-content-ref";

/** Forma mínima común a DmAttachment/CommentAttachment/UniversalAttachment. */
export interface RefAttachmentLike {
    kind: string;
    name?: string | null;
    refKind?: string | null;
    refId?: string | null;
    route?: string | null;
    url?: string | null;
}

const REF_TO_EMBED_KIND: Record<string, string> = {
    page: "pagina",
    group: "grupo",
    event: "evento",
    post: "publicacion",
};

/** ¿Adjunto de invitación válido (kind "invite" + refKind invitable + refId)? */
export function isInviteLike(
    a: RefAttachmentLike | null | undefined,
): a is RefAttachmentLike & { refKind: InviteTargetKind; refId: string } {
    return !!a && a.kind === "invite" && !!a.refId && (a.refKind === "group" || a.refKind === "page" || a.refKind === "event");
}

/** ¿Adjunto de referencia embebible de "Contenido de la red" (kind "ref")? */
export function isNetworkRefLike(
    a: RefAttachmentLike | null | undefined,
): a is RefAttachmentLike & { refKind: string; refId: string } {
    return !!a && a.kind === "ref" && !!a.refKind && !!a.refId;
}

export interface UniversalAttachmentViewProps {
    attachment: RefAttachmentLike;
    className?: string;
}

export function UniversalAttachmentView({ attachment, className }: UniversalAttachmentViewProps) {
    if (isInviteLike(attachment)) {
        return (
            <InvitationCard
                targetKind={attachment.refKind}
                refId={attachment.refId}
                route={attachment.route || "/"}
                fallbackName={attachment.name}
                className={className}
            />
        );
    }

    if (isNetworkRefLike(attachment)) {
        const item: EmbeddedItem = {
            kind: REF_TO_EMBED_KIND[attachment.refKind] || "pagina",
            url: attachment.route || attachment.url || undefined,
            name: attachment.name || undefined,
            title: attachment.name || networkRefLabel(attachment.refKind),
        };
        return <EmbeddedContentWindow item={item} context="feed" className={className} />;
    }

    return null;
}

export default UniversalAttachmentView;
