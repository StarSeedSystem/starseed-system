# Almacen Capas de Astraura 1.58

## Descripción
Este módulo proporciona almacenamiento inyectable para capas de Astraura 1.58, implementando el contrato definido en `architecture/capas-autoadaptables.md §6`.

## Características

### Almacenamiento Inyectable
- **memoria**: En memoria (para pruebas)
- **opfs**: System File System (navegador, PWA, Tauri)
- **cache**: Cache API (respaldo)

### Funciones Principales

#### `guardarCapa(entrada, trozos)`
- Verifica SHA-256 de cada trozo y del archivo entero contra el catálogo
- Rechaza discrepancias en la verificación
- Valida el presupuesto de disco

#### `abrirCapa(id)`
- Devuelve ArrayBuffer o ReadableStream
- Actualiza el último uso para LRU

#### `hacerSitio(presupuesto)`
- Expulsa capas por uso más antiguo (LRU)
- Protege capas fijadas (fijar/id, true/false)

#### `fijar(id, si)`
- Fija (protege) o des fija una capa

#### `estado()`
- Devuelve capas con tamaño, último uso y estado fijado

#### `descargarResume(id, fuente)`
- Descarga capas de forma resumible
- Guarda progreso por trozo y retoma

## Uso

```typescript
import { AlmacenCapas } from "./almacen";

// Para pruebas
const memoria = { tipo: "memoria", capas: new Map() };
const almacen = new AlmacenCapas(memoria);

// Guardar una capa
await almacen.guardarCapa(entrada, trozos);

// Abrir una capa
const datos = await almacen.abrirCapa("id-capa");

// Hacer sitio con presupuesto
almacen.hacerSitio({ maxBytes: 5_000_000, maxMemoriaBytes: 5_000_000, presupuestoDiscoBytes: 50_000_000 });

// Fijar una capa
almacen.fijar("id-capa", true);

// Estado
const estado = almacen.estado();
```

## Pruebas

Las pruebas se encuentran en `src/lib/astraura/capas/__tests__/almacen.test.ts` y cubren:

- Verificación de SHA-256
- Almacenamiento en memoria
- Guardado y recuperación de capas
- Lógica de expulsión LRU
- Funcionalidad fijada
- Descargas resumibles
