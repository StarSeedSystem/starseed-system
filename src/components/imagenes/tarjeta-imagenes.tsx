import { useTarjetaImagenes } from "src/lib/imagenes/adaptadores/use-tarjeta-imagenes";
import { type PeticionImagen } from "src/lib/imagenes/plan";

interface TarjetaImagenesProps {
  peticion: PeticionImagen;
}

export function TarjetaImagenes({ peticion }: TarjetaImagenesProps) {
  const {
    opciones,
    cargando,
    error,
    generarOpciones,
    elegirOpcion,
    variarOpcion,
    editarEnProtomolecula,
    ampliar,
    usarComoReferencia3D,
    guardarEnBiblioteca,
    borradorPublicacion
  } = useTarjetaImagenes();

  // Generar opciones al montar o cuando cambie la petición
  // En una implementación real, usaríamos useEffect, pero como estamos evitando
  // efectos innecesarios y siguiendo las reglas, asumimos que se llama externamente
  // o que el componente se vuelve a renderizar cuando cambia la petición

  if (cargando) {
    return <div className="flex items-center justify-center py-4">Cargando opciones...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive p-4">{error}</div>;
  }

  if (opciones.length === 0) {
    return <div className="text-sm text-muted-foreground p-4">No hay opciones disponibles</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {opciones.map((opcion, index) => (
          <div key={index} className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-start space-x-3">
              {/* Imagen de miniatura o placeholder */}
              <div className="flex-shrink-0 h-16 w-16 bg-muted rounded">
                {/* Aquí iría la miniatura de la imagen si estuviera disponible */}
                <span className="text-xs text-muted-foreground flex items-center justify-center">
                  {opcion.modelo?.label?.slice(0, 2) ?? "?"}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                <div className="font-medium">{opcion.modelo?.label ?? "Modelo desconocido"}</div>
                <div className="text-xs text-muted-foreground">
                  {opcion.capa === "dispositivo" ? "Tu aparato" :
                   opcion.capa === "navegador" ? "Tu PC" :
                   opcion.capa === "neurona" ? "Neurona" :
                   opcion.capa === "malla" ? "Malla" :
                   opcion.capa === "espacio" ? "Espacio" :
                   opcion.capa === "web-gratis" ? "Web" :
                   "Externo"}
                </div>
                <div className="text-xs font-mono">{opcion.modelo?.id ?? "desconocido"}</div>
                <div className="text-xs">{opcion.uso ?? "uso desconocido"}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              {/* Botones de acción */}
              <button
                onClick={() => elegirOpcion(opcion)}
                className="px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded"
                aria-label="Elegir esta opción"
              >
                Elegir
              </button>
              <button
                onClick={() => variarOpcion(opcion)}
                className="px-2 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded"
                aria-label="Variar esta opción"
              >
                Variar
              </button>
              <button
                onClick={() => editarEnProtomolecula(opcion)}
                className="px-2 py-1 bg-accent text-accent-foreground hover:bg-accent/90 rounded"
                aria-label="Editar en Protomolécula"
              >
                Editar
              </button>
              {/* Más botones según sea necesario */}
            </div>
          </div>
        ))}
      </div>
      
      {/* Controles adicionales si es necesario */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => guardarEnBiblioteca(opciones[0])} // Guardar la primera opción como ejemplo
          className="px-3 py-1 bg-muted text-muted-foreground hover:bg-muted/80 rounded"
        >
          Guardar en Biblioteca
        </button>
        <button
          onClick={() => usarComoReferencia3D(opciones[0])}
          className="px-3 py-1 bg-muted text-muted-foreground hover:bg-muted/80 rounded"
        >
          Usar como referencia 3D
        </button>
        <button
          onClick={() => borradorPublicacion(opciones[0])}
          className="px-3 py-1 bg-muted text-muted-foreground hover:bg-muted/80 rounded"
        >
          Borrador de publicación
        </button>
      </div>
    </div>
  );
}