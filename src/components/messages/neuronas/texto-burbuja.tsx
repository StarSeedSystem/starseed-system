"use client";

/**
 * TextoBurbuja — texto de una burbuja del hilo de neuronas (LLA1108C).
 * Antes se pintaba como texto plano y `**negrita**` / `_cursiva_` salían tal cual. Ahora usa el MISMO
 * renderizador que los mensajes directos de cuenta (`MessageRenderer`, ver `message-bubble.tsx`),
 * sin vista previa de enlaces (`media={false}`: un hilo por la malla no sale a internet a por miniaturas).
 */

import { MessageRenderer } from "@/components/aurora/message-renderer";

export function TextoBurbuja({ texto }: { texto: string }) {
    return <MessageRenderer text={texto} media={false} compact className="break-words text-[14px] leading-relaxed text-white" />;
}
