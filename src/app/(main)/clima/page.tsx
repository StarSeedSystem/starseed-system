"use client";

// ════════════════════════════════════════════════════════════════════════════
// /clima — "Tiempo de clima": clima terrestre + recordatorios / alarmas /
// temporizadores con notificaciones. Página cliente que compone los paneles.
// Ruta hermana NUEVA (no toca /atmosphere, que es clima espacial/solar).
// ════════════════════════════════════════════════════════════════════════════

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronLeft, CloudSun } from "lucide-react";
import { WeatherPanel } from "@/components/clima/weather-panel";
import { RemindersPanel } from "@/components/clima/reminders-panel";

export default function ClimaPage() {
    return (
        <div className="relative min-h-full w-full font-inter">
            <div className="mx-auto w-full max-w-[1100px] px-[clamp(0.75rem,3vw,2rem)] py-[clamp(1rem,3vw,2rem)]">
                {/* Cabecera de la sección */}
                <header className="mb-5 flex items-center gap-3">
                    <Link
                        href="/dashboard"
                        aria-label="Volver al dashboard"
                        className="group flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl transition-all hover:border-cyan-400/50 hover:bg-cyan-500/15 cursor-pointer"
                    >
                        <ChevronLeft className="size-5 text-white/70 transition-colors group-hover:text-cyan-300" />
                    </Link>
                    <div className="flex items-center gap-2.5">
                        <span className="grid size-11 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10">
                            <CloudSun className="size-6 text-cyan-300" />
                        </span>
                        <div>
                            <h1 className="font-display text-xl font-bold leading-tight tracking-wide text-white drop-shadow-md sm:text-2xl">
                                Tiempo de clima
                            </h1>
                            <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-cyan-300/90">
                                Clima · Recordatorios · Alarmas
                            </p>
                        </div>
                    </div>
                </header>

                {/* Paneles */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                    className="grid grid-cols-1 gap-5 lg:grid-cols-2"
                >
                    <WeatherPanel />
                    <RemindersPanel />
                </motion.div>
            </div>
        </div>
    );
}
