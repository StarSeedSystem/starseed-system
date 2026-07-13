"use client";
import StoragePanel from "@/components/storage/storage-panel";
import BackendsNetworkPanel from "@/components/storage/backends-network-panel";
import { TriSourceConfig } from "@/components/services/tri-source-config";

export default function AlmacenesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-violet-50">Almacenes de datos</h1>
          <p className="text-sm text-white/50 mt-1 mb-6">
            Memoria multi-fuente con enrutado inteligente: el servidor StarSeed (limitado) para contexto y memorias
            fundamentales, tu Google Drive para ficheros grandes, almacenamiento local por dispositivo y fuentes ilimitadas
            (GitHub, WebDAV, S3…) como overflow.
          </p>
          <StoragePanel />
        </div>

        {/* Red descentralizada de servidores y almacenamiento (Adenda 66 §13):
            registra backends y elige primario + réplicas por tipo de recurso. */}
        <div>
          <h2 className="text-xl font-bold text-cyan-50">Servidores y almacenamiento</h2>
          <p className="text-sm text-white/50 mt-1 mb-4">
            Red descentralizada de backends: el servidor oficial StarSeed por defecto, más Supabase propio, Google
            Cloud, GitHub, Vercel Blob, S3, CasaOS/neurona, WebDAV o IPFS. Elige el primario y las réplicas por tipo de
            recurso (cuenta, perfil, página, folder, archivo, biblioteca, cerebro, publicación).
          </p>
          <BackendsNetworkPanel />
        </div>

        {/* Modelo tri-fuente para el dominio de almacenamiento */}
        <TriSourceConfig
          domain="storage"
          title="Fuentes de almacenamiento (propio · StarSeed · externo)"
          description="Elige y modula las fuentes de almacenamiento de alto nivel: tu servidor, StarSeed o un proveedor externo, a la vez si quieres."
          endpointPlaceholder="https://mi-almacen.ejemplo"
          paramHints={[
            { key: "bucket", label: "Bucket / folder", placeholder: "starseed-data" },
            { key: "region", label: "Región", placeholder: "us-east-1" },
          ]}
        />
      </div>
    </main>
  );
}
