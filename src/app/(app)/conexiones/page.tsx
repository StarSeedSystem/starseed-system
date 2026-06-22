"use client";
import ConnectionsHub from "@/components/storage/connections-hub";

export default function ConexionesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-cyan-50">Conexiones</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Conecta tus servicios, cuentas, agentes, APIs y almacenes — guiado por Astraura.
        </p>
        <ConnectionsHub />
      </div>
    </main>
  );
}
