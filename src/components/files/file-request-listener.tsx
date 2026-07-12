"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * FileRequestListener — RECEPTOR global de "Solicitar archivo a esta neurona"
 * ---------------------------------------------------------------------------
 * Provider ligero SIN UI hasta que llega una solicitud: escucha el evento
 * custom 'file-request' en el canal de cuenta `acct:<uid>` (multiplexado vía
 * `onAccountBroadcast` de realtime-sync.ts, sin abrir un canal nuevo).
 *
 * Cuando la solicitud va dirigida a ESTE dispositivo (`toDevice === deviceId()`),
 * muestra un diálogo con el selector universal de archivo (pestaña Dispositivo)
 * para elegir/subir; al completarse, el archivo queda indexado en `os_files`
 * y visible AL INSTANTE para quien lo pidió vía el realtime ya existente de
 * `subscribeMyFiles`/postgres_changes sobre esa tabla — no hace falta ningún
 * paso adicional de entrega aquí.
 *
 * Montado en src/app/layout.tsx (inserción mínima, un único componente global).
 * SOP: architecture/libreria-biblioteca-sync.md §9.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Cpu, Upload, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { onAccountBroadcast } from "@/lib/sync/realtime-sync";
import { deviceId } from "@/lib/sync/entity-state";
import { uploadFile } from "@/lib/files/os-files";
// Ajustes por neurona ('starseed.neurons.prefs.v1'): si esta neurona tiene
// desactivado "recibir solicitudes de archivos", el receptor las ignora.
// thisDeviceId(): el panel de Neuronas del Cerebro también puede dirigir la
// solicitud al id de neurona (además del deviceId de sync).
import { allowsFileRequests, thisDeviceId } from "@/lib/neurons/neurons";

interface FileRequestPayload {
    toDevice?: string;
    fromDevice?: string;
    note?: string;
    at?: number;
}

interface PendingRequest {
    fromDevice: string;
    note?: string;
    receivedAt: number;
}

export function FileRequestListener() {
    const [pending, setPending] = useState<PendingRequest | null>(null);
    const [uploading, setUploading] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        const unsub = onAccountBroadcast("file-request", (raw) => {
            const payload = raw as FileRequestPayload | undefined;
            const target = payload?.toDevice;
            // Dirigida a ESTE dispositivo: por deviceId de sync (entity-state)
            // o por id de neurona (panel Neuronas del Cerebro).
            if (!payload || !target || (target !== deviceId() && target !== thisDeviceId())) return;
            // Flag por neurona (Cerebro → Neuronas → "Solicitudes de archivos").
            if (!allowsFileRequests()) return;
            setPending({
                fromDevice: payload.fromDevice || "otra neurona",
                note: payload.note,
                receivedAt: Date.now(),
            });
            setDone(false);
            toast.message("Otra neurona te pide un archivo", {
                description: payload.note || "Elige o sube el archivo que necesita.",
            });
        });
        return unsub;
    }, []);

    const close = () => {
        setPending(null);
        setUploading(false);
        setDone(false);
    };

    const handleFile = async (file: File | null) => {
        if (!file) return;
        setUploading(true);
        try {
            const res = await uploadFile(file, { folder: "solicitudes" });
            if (res.ok) {
                setDone(true);
                toast.success("Archivo subido y compartido con quien lo pidió.");
                setTimeout(close, 1400);
            } else {
                toast.error(res.error || "No se pudo subir el archivo.");
            }
        } finally {
            setUploading(false);
        }
    };

    if (!pending) return null;

    return (
        <Dialog open onOpenChange={(o) => !o && close()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Cpu className="size-4 text-cyan-300" /> Solicitud de archivo
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Una neurona de tu cuenta te pide un archivo
                        {pending.note ? `: “${pending.note}”` : "."}
                    </DialogDescription>
                </DialogHeader>

                <label
                    className={cn(
                        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-200",
                        done
                            ? "border-emerald-400/50 bg-emerald-500/10"
                            : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]",
                    )}
                >
                    {done ? (
                        <Check className="size-7 text-emerald-300" />
                    ) : uploading ? (
                        <Loader2 className="size-7 animate-spin text-cyan-300" />
                    ) : (
                        <Upload className="size-7 text-white/40" />
                    )}
                    <p className="text-sm font-medium text-white/80">
                        {done ? "Compartido" : uploading ? "Subiendo…" : "Elige el archivo a compartir"}
                    </p>
                    <input
                        type="file"
                        className="hidden"
                        disabled={uploading || done}
                        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                    />
                </label>
            </DialogContent>
        </Dialog>
    );
}

export default FileRequestListener;
