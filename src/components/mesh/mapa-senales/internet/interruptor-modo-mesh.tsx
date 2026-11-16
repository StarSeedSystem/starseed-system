import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type Audiencia = "cuenta" | "entidad" | "publico";

export interface AjustesAudiencia {
  habilitado: boolean;
  topeMb: number;
}

export interface TextosInternet {
  meshTitulo: string;
  meshAyuda: string;
  meshSinLimite: string;
  meshConLimite: (mb: number) => string;
  audMiCuenta: string;
  audEntidad: string;
  audPublico: string;
  mb: string;
  gb: string;
}

export function InterruptorModoMesh({
  audiencia,
  valor,
  onCambiar,
  textos,
}: {
  audiencia: Audiencia;
  valor: AjustesAudiencia;
  onCambiar: (v: AjustesAudiencia) => void;
  textos: TextosInternet;
}) {
  const getAudTexto = () => {
    switch (audiencia) {
      case "cuenta": return textos.audMiCuenta;
      case "entidad": return textos.audEntidad;
      case "publico": return textos.audPublico;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="modo-mesh">{textos.meshTitulo} ({getAudTexto()})</Label>
        <Switch
          id="modo-mesh"
          checked={valor.habilitado}
          onCheckedChange={(checked) => onCambiar({ ...valor, habilitado: checked })}
        />
      </div>
      {valor.habilitado && (
        <RadioGroup
          value={valor.topeMb === 0 ? "sin" : "con"}
          onValueChange={(val) => onCambiar({ ...valor, topeMb: val === "sin" ? 0 : valor.topeMb || 1024 })}
        >
          <div className="flex items-center space-x-2 cursor-pointer">
            <RadioGroupItem value="sin" id="mesh-sin" />
            <Label htmlFor="mesh-sin">{textos.meshSinLimite}</Label>
          </div>
          <div className="flex items-center space-x-2 cursor-pointer">
            <RadioGroupItem value="con" id="mesh-con" />
            <Label htmlFor="mesh-con">{textos.meshConLimite(valor.topeMb || 1024)}</Label>
          </div>
        </RadioGroup>
      )}
    </div>
  );
}
