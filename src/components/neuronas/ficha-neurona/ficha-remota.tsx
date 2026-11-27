"use client";

/**
 * FichaRemota — «Ajustes de esta neurona» en modo remoto (REM1126A). Se monta como sección `extras` de la
 * ficha de NEU1126B cuando la neurona es OTRA vinculada. Enseña y cambia sus ajustes reales con las órdenes
 * «leer-ajustes», «poner-ajuste» y «deshacer-ajuste»; el envío lo hace quien la monta (canal sellado).
 * Los ajustes de seguridad se ven, pero sin interruptor: no se cambian a distancia.
 */

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  CLAVES_SEGURIDAD,
  type AmbitoAjuste,
  type EntradaRegistroAjuste,
  type EstadoAjustesAparato,
  type ResultadoAjuste,
  type ValorAjuste,
} from "@/lib/control-remoto/ajustes-remotos";

type Motivo = Extract<ResultadoAjuste, { ok: false }>["motivo"];

/** Texto llano del motivo por el que el aparato dijo que no. Pura. */
export function textoMotivoAjuste(m: Motivo): string {
  switch (m) {
    case "permiso-apagado":
      return "Esta neurona no deja configurarla a distancia. Quien la tiene debe encender «Configurar a distancia» en ese aparato.";
    case "seguridad":
      return "Este ajuste protege la seguridad del aparato: solo se cambia en el propio aparato.";
    case "no-existe":
      return "Ese cambio ya no está en el registro.";
    case "ya-deshecho":
      return "Ese cambio ya estaba deshecho.";
    default:
      return "El ajuste no tiene una forma válida.";
  }
}

interface Props {
  nombre: string;
  /** Lo último que leyó la orden «leer-ajustes»; null si aún no se ha leído. */
  estado: EstadoAjustesAparato | null;
  ocupado?: boolean;
  /** Motivo de la última respuesta negativa del aparato. */
  fallo?: Motivo | null;
  onLeer: () => void;
  onPoner: (clave: string, valor: ValorAjuste, ambito: AmbitoAjuste) => void;
  onDeshacer: (id: string) => void;
}

function FilaRegistro({ e, onDeshacer, ocupado }: { e: EntradaRegistroAjuste; onDeshacer: (id: string) => void; ocupado?: boolean }) {
  return (
    <li className="flex min-w-0 items-center justify-between gap-2 text-xs">
      <span className="min-w-0 break-words">
        {e.clave}: {String(e.anterior ?? "—")} → {String(e.nuevo)}
        {e.deshecho && " (deshecho)"}
      </span>
      {!e.deshecho && (
        <Button size="sm" variant="ghost" className="h-6 cursor-pointer px-2" disabled={ocupado} onClick={() => onDeshacer(e.id)}>
          Deshacer
        </Button>
      )}
    </li>
  );
}

export function FichaRemota({ nombre, estado, ocupado, fallo, onLeer, onPoner, onDeshacer }: Props) {
  const claves = estado ? Object.keys(estado.valores).sort() : [];
  return (
    <div className="min-w-0 space-y-3" data-testid="ficha-remota">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Ajustes de «{nombre}»</p>
        <Button size="sm" variant="outline" className="cursor-pointer" disabled={ocupado} onClick={onLeer}>
          {estado ? "Volver a leer" : "Leer ajustes"}
        </Button>
      </div>
      {fallo && <p role="alert" className="text-xs text-amber-500">{textoMotivoAjuste(fallo)}</p>}
      {estado && claves.length === 0 && <p role="status" className="text-xs text-muted-foreground">Esta neurona no tiene ajustes guardados.</p>}
      <ul className="space-y-2">
        {claves.map((k) => {
          const v = estado!.valores[k];
          const bloqueado = CLAVES_SEGURIDAD.includes(k);
          return (
            <li key={k} className="flex min-w-0 items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-words">{k}</span>
              {typeof v === "boolean" ? (
                <Switch checked={v} disabled={ocupado || bloqueado} aria-label={k} className="cursor-pointer" onCheckedChange={(n) => onPoner(k, n, "ajuste")} />
              ) : (
                <span className="text-xs text-muted-foreground">{String(v)}</span>
              )}
              {bloqueado && <span className="text-xs text-muted-foreground">solo en el aparato</span>}
            </li>
          );
        })}
      </ul>
      {estado && estado.registro.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium">Cambios hechos a distancia</p>
          <ul className="space-y-1">
            {estado.registro.slice(0, 10).map((e) => (
              <FilaRegistro key={e.id} e={e} onDeshacer={onDeshacer} ocupado={ocupado} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
