"use client";
/**
 * StarSeed XR · MONTAJE DE LA COMODIDAD (XR1010F · contrato §3 j): conecta `<Comodidad>`
 * (viñeta, giros por saltos y subtítulos) con lo que YA existía, sin nada nuevo: el texto que
 * Astraura sale de la MISMA conversación del orbe (bus `aurora:conversation`, `role: "aurora"`).
 * Es puente fino, sin lógica: todo el trabajo vive en `comodidad.tsx` y en el núcleo puro.
 */
import { useEffect, useState } from "react";
import { subscribeAuroraConversation, type AuroraConversationDetail } from "@/lib/aurora/aurora-orb-bus";
import type { ModoXR } from "@/lib/xr/tipos";
import { Comodidad } from "./comodidad";

export interface PropsComodidadMontada {
    modo: ModoXR;
    /** Altura de ojos medida por el visor (XR1010G). */
    alturaOjosMedida?: number | null;
    /** Lo que suena en una transmisión en directo; hoy sin fuente, queda para su cableado. */
    transmision?: string | null;
}

export function ComodidadMontada({ modo, alturaOjosMedida = null, transmision = null }: PropsComodidadMontada) {
    const [vozAstraura, setVozAstraura] = useState<string | null>(null);
    useEffect(() => subscribeAuroraConversation((d: AuroraConversationDetail) => {
        if (d.role === "aurora") setVozAstraura(d.text);
    }), []);
    return <Comodidad modo={modo} vozAstraura={vozAstraura} transmision={transmision} alturaOjosMedida={alturaOjosMedida} />;
}
