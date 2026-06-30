"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Terminal (página)
// ----------------------------------------------------------------
// Compone la TERMINAL integrada (consola sandbox sobre los datos/acciones
// del propio OS) y el panel de DISPOSITIVOS como servidores (presencia,
// capacidades, memorias, archivos) vía Supabase Realtime Presence.
//
// Todo cliente ("use client"), UI en español y defensivo: cada bloque
// degrada con elegancia si falta sesión / red / realtime.
// ════════════════════════════════════════════════════════════════

import { TerminalSquare } from "lucide-react";
import TerminalConsole from "@/components/terminal/terminal-console";
import DevicesPanel from "@/components/terminal/devices-panel";

export default function TerminalPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500">
            <TerminalSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-emerald-50">Terminal</h1>
            <p className="mt-1 text-sm text-white/50">
              Consola integrada del OS (sandbox: opera sobre tus memorias, cerebros y dispositivos, no sobre el sistema)
              y tus dispositivos online mostrados como servidores con su presencia y capacidades.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Terminal integrada */}
          <TerminalConsole />

          {/* Dispositivos como servidores (presencia en vivo) */}
          <DevicesPanel />
        </div>
      </div>
    </main>
  );
}
