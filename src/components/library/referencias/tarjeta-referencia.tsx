import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';

export function ReferenciaTarjeta({ referencia }: { referencia: any }) {
  const isReutilizable =
    referencia.clase_uso === 'reutilizable' ||
    referencia.clase_uso === 'reutilizable-con-condiciones';

  // Map clase_uso to badge variant
  let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
  if (referencia.clase_uso === 'reutilizable') {
    badgeVariant = 'destructive';
  } else if (referencia.clase_uso === 'reutilizable-con-condiciones') {
    badgeVariant = 'default'; // warning not available, using default
  } else if (referencia.clase_uso === 'solo-referencia') {
    badgeVariant = 'secondary';
  } else if (referencia.clase_uso === 'solo-enlace') {
    badgeVariant = 'outline';
  }

  return (
    <div className="border rounded-lg p-4">
      {/* Cover image: use og_image if available, otherwise a placeholder */}
      {referencia.og_imagen ? (
        <img
          src={referencia.og_imagen}
          alt={referencia.nombre}
          className="w-full h-48 object-cover rounded-t-lg"
        />
      ) : (
        <div className="w-full h-48 bg-gradient-to-b from-trinity-zenith/20 to-trinity-horizon/20 rounded-t-lg flex items-center justify-center">
          <span className="text-trinity-zenith font-bold">{referencia.nombre}</span>
        </div>
      )}
      <div className="p-4">
        <h3 className="font-semibold">{referencia.nombre}</h3>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {referencia.que_es}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{referencia.acceso}</Badge>
          <Badge variant={badgeVariant}>
            {referencia.clase_uso}
          </Badge>
        </div>
        {referencia.condiciones && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-1">
            {referencia.condiciones}
          </p>
        )}
        {referencia.actualizacion && referencia.actualizacion.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Actualizaciones: {referencia.actualizacion.length}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="icon" asChild>
            <a href={referencia.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="outline" onClick={() => console.log('Usar como inspiración:', referencia.nombre)}>
            Usar como inspiración
          </Button>
          {isReutilizable && (
            <Button variant="outline" onClick={() => console.log('Instalar:', referencia.nombre)}>
              Instalar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}