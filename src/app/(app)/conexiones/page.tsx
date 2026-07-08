"use client";
import ConnectionsHub from "@/components/storage/connections-hub";
import { UserConnectorsHub } from "@/components/connectors";

export default function ConexionesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-cyan-50">Conexiones</h1>
          <p className="text-sm text-white/50 mt-1 mb-6">
            Conecta tus servicios, cuentas, agentes, APIs y almacenes — guiado por Astraura.
          </p>
          <ConnectionsHub />
        </div>

        {/* ── Hub de Conectores por usuario: por categoría, con modo de selección
            (automático/preferir mi cuenta/solo gratis-OSS) y cuentas opcionales.
            Aditivo: no toca lo de arriba (almacenes, Drive, bóveda, agentes…). */}
        <div>
          <h2 className="text-xl font-bold text-cyan-50">Conectores por categoría</h2>
          <p className="text-sm text-white/50 mt-1 mb-6">
            IA, búsqueda, notas, chat, correo y más — cada categoría funciona gratis por defecto; conectar
            tu propia cuenta es siempre opcional.
          </p>
          <UserConnectorsHub />
        </div>
      </div>
    </main>
  );
}
