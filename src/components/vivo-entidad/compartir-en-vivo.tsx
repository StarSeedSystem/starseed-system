"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { MarcaDirecto } from "./marca-directo";

export interface CompartirEnVivoProps {
    boardSpaceId?: string | null;
    onClose: () => void;
}

export function CompartirEnVivo({ boardSpaceId, onClose }: CompartirEnVivoProps) {
    const [compartida, setCompartida] = useState(false);
    const [personas, setPersonas] = useState<number | null>(null);
    const [modalOpen, setModalOpen] = useState(true);

    useEffect(() => {
        if (boardSpaceId) {
            setCompartida(true);
        }
    }, [boardSpaceId]);

    if (!modalOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-zinc-950/90 rounded-xl p-8 max-w-sm w-full border border-white/10">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-white">Compartir en vivo</h2>
                    <button onClick={onClose} className="text-white/60 hover:text-white" aria-label="Cerrar">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path className="stroke-white/60" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {compartida ? (
                    <div className="mb-6">
                        <MarcaDirecto directo={true} personas={personas ?? 0} compacto />
                        <p className="text-sm text-white/60 mt-2">La pizarra ya está compartida. 1 persona dentro.</p>
                        <button className="mt-3 w-full text-sm text-amber-400 hover:text-amber-300">
                            Ver estado · 
                            <svg className="inline-block w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path className="stroke-white/60" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-white/60">¿Con quién quieres compartir?</p>
                        <div className="flex gap-2 mb-3">
                            <button className="flex-1 py-2 px-3 rounded-md bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
                                Mis neuronas
                            </button>
                            <button className="flex-1 py-2 px-3 rounded-md bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
                                <span className="text-xs">Una página o grupo</span>
                            </button>
                        </div>
                        <div className="flex gap-2 mb-3">
                            <button className="flex-1 py-2 px-3 rounded-md bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
                                Cualquiera con enlace
                            </button>
                        </div>
                        <p className="text-white/60">¿Pueden editar o sólo mirar?</p>
                        <div className="flex gap-3">
                            <button className="py-1.5 px-3 rounded-md bg-white/5 text-white/60 hover:bg-white/10 transition-colors">Editar</button>
                            <button className="py-1.5 px-3 rounded-md bg-white/5 text-white/60 hover:bg-white/10 transition-colors">Mirar</button>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button onClick={() => { setCompartida(true); setPersonas(1); }} className="py-2 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white">
                                <Share2 className="mr-2 w-4 h-4" /> Compartir
                            </button>
                            <button onClick={onClose} className="ml-2 py-2 px-3 rounded-md border border-white/20 text-white/60 hover:bg-white/10 transition-colors">Cancelar</button>
                        </div>
                    </div>
                )
            </div>
        </div>
    );
}