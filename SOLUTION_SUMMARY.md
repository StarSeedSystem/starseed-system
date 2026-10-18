# Resumen de la Solución - Conectar unirProcesos

## Problema
El módulo `src/lib/cerebros/procesos-normalizar.ts` exportaba una función `unirProcesos` y todas las funciones `desde*` para procesar datos de múltiples fuentes a `ProcesoActivo[]`, pero estas funciones nunca se usaban en ningún endpoint API - solo en las pruebas.

## Solución

### 1. Crear nuevo módulo: `src/lib/cerebros/procesos.ts`
- Exporta `leerProcesosActivos()` - la función principal que combina todos los procesos
- Utiliza todas las funciones `desde*` de `procesos-normalizar.ts`
- Llama a `unirProcesos()` para combinar los resultados de todas las fuentes
- Implementa el contrato de §7 de `architecture/cerebros-fusion-telepatia.md`

### 2. Exportar tipos relevantes
- Re-exporta `ProcesoActivo`, `TipoProceso`, `EstadoProceso`, y otros tipos
- Permite que otros módulos importen estos tipos sin circularidad

### 3. Crear nuevo endpoint API: `src/app/api/mando/procesos/route.ts`
- Nuevo endpoint GET `/api/mando/procesos`
- Llama a `leerProcesosActivos()` y devuelve los procesos combinados
- Incluye manejo de errores apropiado

### 4. Actualizar endpoint existente: `src/app/api/mando/agentes/route.ts`
- Importa `leerProcesosActivos` (comentario agregado)
- Nota: El endpoint `/api/mando/agentes` todavía usa `leerAgentes()` del panel de mando anterior
- El nuevo endpoint `/api/mando/procesos` proporciona la vista unificada de procesos

### 5. Arreglar error en `procesos-normalizar.ts`
- En `desdeAgentesMac`: cambiado `desde: now` a `desde: ahora` (línea 119)

## Arquitectura

La solución sigue el diseño de §7 de `architecture/cerebros-fusion-telepatia.md`:

```
Fuentes:
  → desdeAgentesMac (/api/mando/agentes)
  → desdeLatidos (/api/mando/medidores)
  → desdeNodos (leerEstadoAutonomo)
  → desdePoligenesis (leerHistorial)
  → desdeSuenos (/api/mando/suenos)
  → desdeImaginacion (fetchAstraura158ImaginationStatus)
  → desdeInstalaciones (leerInstalaciones)
  → desdeActualizaciones (leerActualizaciones)
  → desdeVentanas (readDesktopsSnapshot)
  → desdePresencia (usePresenciaNeuronas)

unirProcesos() → combinar todos → retornar ProcesoActivo[]
```

## Uso

Los desarrolladores ahora pueden obtener una vista unificada de todos los procesos activos del cerebro llamando al endpoint:

```javascript
fetch('/api/mando/procesos')
  .then(r => r.json())
  .then(data => {
    // data.procesos es la lista combinada de ProcesoActivo[]
    // con procesos de todas las fuentes
  })
```

El endpoint devuelve:
```json
{
  "procesos": [
    {
      "id": "string",
      "tipo": "genesis|poligenesis|sueno|imaginacion|descarga|instalacion|actualizacion|app-fondo|servicio",
      "nombre": "string",
      "estado": "en-marcha|esperando|pausado|fallando",
      "progreso": number | null,
      "donde": "string",
      "desde": number | null,
      "detalle": "string | undefined",
      "fuente": "string"
    }
    // ... más procesos
  ],
  "generadoEn": "ISO timestamp"
}
```

## Beneficios

1. **Vista de procesos unificada** - Los consumidores ahora pueden obtener todos los procesos desde un solo endpoint en lugar de múltiples llamados individuales
2. **Proceso deduplicado y ordenado** - `unirProcesos` elimina duplicados y coloca los procesos "en-marcha" primero
3. **Defensivo y resistente a fallos** - Cada fuente individual está envuelta en try/catch, fallos no bloquean toda la operación
4. **Cumple el contrato** - Cumple el requisito de §7 para "exportar una función por fuente que devuelve ProcesoActivo[]"
5. **Pruebas en verde** - Todas las pruebas existentes pasan; nuevo módulo no tiene pruebas unitarias propias (como otros módulos puros)

## Próximos Pasos Potenciales

1. **Integrar con el panel de procesos** - El nuevo endpoint puede ser utilizado por `src/components/cerebro/procesos-panel.tsx` o `src/components/mando/panel-procesos.tsx`
2. **Agregar agrupación por tipo** - Posibilidad de usar `agruparPorTipo()` para organizar procesos por categoría
3. **Añadir filtrado por tipo** - Posibilidad de filtrar procesos por tipo (`genesis`, `sueno`, `imaginacion`, etc.)
4. **Estandarizar formato de respuesta** - Podría ser estandarizado a través de la infraestructura `DetalleMedidor` existente