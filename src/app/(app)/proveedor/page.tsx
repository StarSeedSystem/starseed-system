"use client";
import ProviderPanel from "@/components/exocortex/provider-panel";

export default function ProveedorPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-cyan-50">StarSeed como proveedor</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">Genera tokens por cuenta y conecta herramientas externas (Claude Desktop, Codex, clientes MCP/HTTP) para leer y escribir tus memorias y los chats de Astraura.</p>
        <ProviderPanel />
      </div>
    </main>
  );
}
