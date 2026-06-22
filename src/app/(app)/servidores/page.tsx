"use client";
import ServersPanel from "@/components/brains/servers-panel";

export default function ServidoresPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-50">Servidores de cerebros</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Registro de servidores y enlaces muchos-a-muchos entre cerebros y servidores. Open-source primero: cerebro
          local, Hostinger (VPS/nube), servidor StarSeed, servidor propio configurado o cualquier servicio conectado
          integrado. Un servidor puede dar servicio a varios cerebros, y un cerebro usar varios servidores.
        </p>
        <ServersPanel />
      </div>
    </main>
  );
}
