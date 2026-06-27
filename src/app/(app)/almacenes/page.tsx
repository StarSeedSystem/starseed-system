"use client";
import StoragePanel from "@/components/storage/storage-panel";
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

        {/* Modelo tri-fuente para el dominio de almacenamiento */}
        <TriSourceConfig
          domain="storage"
          title="Fuentes de almacenamiento (propio · StarSeed · externo)"
          description="Elige y modula las fuentes de almacenamiento de alto nivel: tu servidor, StarSeed o un proveedor externo, a la vez si quieres."
          endpointPlaceholder="https://mi-almacen.ejemplo"
          paramHints={[
            { key: "bucket", label: "Bucket / carpeta", placeholder: "starseed-data" },
            { key: "region", label: "Región", placeholder: "us-east-1" },
          ]}
        />
      </div>
    </main>
  );
}
