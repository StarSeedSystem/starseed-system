"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { TarjetaNeurona, ModoCuenta, TipoTransporte } from "@/lib/nfc/tarjeta";
import type { VerificadorFirma } from "@/lib/nfc/tarjeta";

const MODOS: readonly string[] = ["hash", "alias", "nada"];
const TIPOS_TRANSPORTE: readonly string[] = ["ble", "wifi-direct", "lan", "malla"];

interface Props {
  onGuardar: (tarjeta: TarjetaNeurona) => void;
  onEliminar: () => void;
  tarjetaInicial?: TarjetaNeurona;
}

export function EditorTarjeta({
  onGuardar,
  onEliminar,
  tarjetaInicial = {
    version: 1,
    neuronaId: "",
    clavePublica: "",
    cuenta: { modo: "nada" },
    claveEfimera: "",
    nonce: "",
    emitidaEn: Date.now(),
    ofertas: [],
    transportes: [],
    firma: "",
  },
}: Props) {
  const [tarjeta, setTarjeta] = useState<TarjetaNeurona>(tarjetaInicial);
  const [nonce, setNonce] = useState("");
  const [firma, setFirma] = useState("");

  const guardar = () => {
    onGuardar(tarjeta);
  };

  const eliminar = () => {
    onEliminar();
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4 border rounded-lg">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{tarjetaInicial.neuronaId || "Nueva Tarjeta"}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">{/* Neurona ID */""}</label>
            <input
              type="text"
              value={tarjeta.neuronaId}
              onChange={(e) => setTarjeta({ ...tarjeta, neuronaId: e.target.value })}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">{/* Clave Pública */""}</label>
            <input
              type="text"
              value={tarjeta.clavePublica}
              onChange={(e) => setTarjeta({ ...tarjeta, clavePublica: e.target.value })}
              className="mt-1 w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">{/* Cuenta */""}</label>
            <Select
              value={tarjeta.cuenta.modo}
              onChange={(e) => {
                const modo = e.target.value as ModoCuenta;
                setTarjeta({
                  ...tarjeta,
                  cuenta: { ...tarjeta.cuenta, modo },
                });
              }}
              className="mt-1 w-full"
            >
              {MODOS.map((modo) => (
                <SelectItem key={modo} value={modo}>
                  {modo}
                </SelectItem>
              ))}
            </Select>
            {tarjeta.cuenta.modo === "nada" && (
              <input
                type="text"
                value={tarjeta.cuenta.valor ?? ""}
                onChange={(e) => setTarjeta({ ...tarjeta, "cuenta.valor": e.target.value })}
                className="mt-1 w-full"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">{/* Clave Efímera */""}</label>
            <input
              type="text"
              value={tarjeta.claveEfimera}
              onChange={(e) => setTarjeta({ ...tarjeta, claveEfimera: e.target.value })}
              className="mt-1 w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">{/* Nonce */""}</label>
            <input
              type="text"
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
              className="mt-1 w-full"
            />
            <button
              type="button"
              onClick={() => setNonce(generateNonce())}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              Generar
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium">{/* Firma */""}</label>
            <input
              type="text"
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              className="mt-1 w-full"
            />
            <button
              type="button"
              onClick={() => setFirma(generateFirmada(tarjeta))}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              Generar Firma
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">{/* Emitida En */""}</label>
            <input
              type="number"
              value={tarjeta.emitidaEn}
              onChange={(e) => setTarjeta({ ...tarjeta, emitidaEn: Number(e.target.value) })}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">{/* Ofertas */""}</label>
            <input
              type="text"
              value={tarjeta.ofertas.join(", ")}
              onChange={(e) => setTarjeta({
                ...tarjeta,
                ofertas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">{/* Transportes */""}</label>
            <Select
              value={tarjeta.transportes[0]?.tipo ?? "ble"}
              onChange={(e) => {
                const tipo = e.target.value as TipoTransporte;
                setTarjeta({
                  ...tarjeta,
                  transportes: tarjeta.transportes.map((t) => ({
                    ...t,
                    tipo: tipo,
                  })),
                });
              }}
              className="mt-1 w-full"
            >
              {TIPOS_TRANSPORTE.map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {tipo}
                </SelectItem>
              ))}
            </Select>
            <Button
              type="button"
              onClick={() => setTarjeta({
                ...tarjeta,
                transportes: tarjeta.transportes.map((t) => ({
                  ...t,
                  direccion: t.direccion ? t.direccion : "nueva-direccion",
                })),
              })}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              Cambiar Dirección
            </Button>
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button variant="secondary" onClick={eliminar}>
            Eliminar
          </Button>
          <Button variant="primary" onClick={guardar}>
            Guardar
          </Button>
        </div>
      </CardContent>
    </div>
  );
}

// Helper functions
function generateNonce(): string {
  return Array.from({ length: 32 }, () => Math.random().toString(16).substring(2, 8)).join("");
}

function generateFirmada(t: TarjetaNeurona): string {
  const bytes = (t as any).bytesAFirmar();
  // In a real implementation, this would use the actual verification function
  return "SIMULADO:" + bytes.length.toString();
}