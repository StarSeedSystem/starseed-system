"use client";
import ServersPanel from "@/components/brains/servers-panel";
import { AccountSyncPanel } from "@/components/aurora/account-sync-panel";

export default function ServidoresPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-amber-50">Servidores</h1>
          <p className="text-sm text-white/50 mt-1 mb-6">
            Dos registros distintos: (1) dónde sincroniza tu CUENTA sus preferencias entre dispositivos, y (2) el
            registro de servidores de tus CEREBROS (Ollama/VPS/Hostinger/servicios). Open-source primero.
          </p>
        </div>

        {/* (1) Servidor de sincronización de la cuenta — elegible por cuenta. */}
        <AccountSyncPanel />

        {/* (2) Registro de servidores de cerebros y enlaces muchos-a-muchos. */}
        <div>
          <h2 className="text-lg font-semibold text-amber-50/90 mb-1">Servidores de cerebros</h2>
          <p className="text-sm text-white/50 mt-1 mb-6">
            Registro de servidores y enlaces muchos-a-muchos entre cerebros y servidores. Open-source primero: cerebro
            local, Hostinger (VPS/nube), servidor StarSeed, servidor propio configurado o cualquier servicio conectado
            integrado. Un servidor puede dar servicio a varios cerebros, y un cerebro usar varios servidores.
          </p>
          <ServersPanel />
        </div>
      </div>
    </main>
  );
}
