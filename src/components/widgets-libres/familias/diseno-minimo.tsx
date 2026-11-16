import { type PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { AstrauraForma } from "./astraura-forma";

export const DisenoMinimo = ({ estado, tam, preguntar }: PropsDiseno) => {
  const textoEstado = estado === "calma" ? "En calma" : "Activo";

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4 w-full">
      <AstrauraForma tam={tam} estado={estado} />
      <div className="flex flex-col items-center gap-1 w-full overflow-hidden">
        <span className="text-sm font-medium text-foreground">
          {textoEstado}
        </span>
        <span className="text-xs text-muted-foreground truncate w-full text-center">
          {preguntar}
        </span>
      </div>
    </div>
  );
};
