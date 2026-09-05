# Estudio de Voces — Versiones, pruebas A/B, fusión, motores y vínculos

> Ola 240. El Estudio (`src/components/voces/estudio-voces.tsx`, montado en la
> sección VoiceStudio) tiene ocho pestañas: Motor · Ajustes · Ficha técnica
> (las originales de la Ola 228) y Versiones · Pruebas A/B · Fusión · Motores ·
> Vincular (añadidas en VZ6). Documento corto de referencia; la teoría del
> motor único está en `memory/voces-catalogo.md`.

## Qué es una versión

Una **versión** (`VersionVoz`, `src/lib/voces/versiones.ts`) es una receta de
voz completa y congelada: timbre base, nivel (`estudio/alta/ligera/minima`),
tamaño de modelo (`Q4_K_M`/`Q8_0`/`auto`), parámetros (`voz`, `speed`,
`instruct`, `ref`, `expr`) más notas, valoración (1–5), padres, fechas y
destinos a los que se promovió (`promovidaA`). Se crea desde un timbre con
`versionDesdeTimbre`, se fusiona con `fusionarVersiones(a, b, peso)` y se
importa con `importarVersiones(json)` (valida y nunca lanza).

## El flujo: probar → comparar → fusionar → valorar → promover

1. **Crear**: pestaña Versiones → «Crear desde el timbre seleccionado».
2. **Comparar**: pestaña Pruebas A/B (`BancoPruebasVoz`): la misma frase por
   hasta 4 versiones, con latencia medida por columna.
3. **Fusionar**: pestaña Fusión (`FusionVoz`): interpolación de números,
   `instruct` concatenado sin repetir, linaje de hasta 3 generaciones.
4. **Valorar**: estrellas 1–5 (se guardan al instante en la versión).
5. **Promover**: pestaña Vincular (`VincularVoz`).

El estado de las versiones vive en `EstudioVoces` y baja por props; cada
cambio se persiste con `guardarVersiones`.

## Dónde se guarda cada cosa (localStorage)

| Clave | Qué guarda | Módulo |
|---|---|---|
| `starseed.voces.v1` | Catálogo editable de voces (ediciones y clones) | `src/lib/aurora/voces-catalogo.ts` |
| `starseed.voces.versiones.v1` | Versiones de voz | `src/lib/voces/versiones.ts` |
| `starseed.voces.vinculos.v1` | Vínculos timbre/rito/configuración → versión | `src/lib/voces/vinculos.ts` |
| `starseed.voz.timbre.v1` | Timbre activo del sistema | `src/lib/aurora/timbres.ts` |
| `starseed.voz.timbres-propios.v1` | Timbres propios (creados o promovidos) | `src/lib/aurora/timbres.ts` |
| `starseed.voz.nivel` | Nivel preferido del motor único | `src/lib/aurora/voz-starseed/motor.ts` |

## Qué toca `promoverVersion(id, destino)`

En `src/lib/voces/vinculos.ts`, idempotente:

1. Convierte la versión en timbre (`aplicarVersionATimbre`).
2. Lo guarda como timbre propio (mismo id → se sustituye, no duplica).
3. Apunta el vínculo: si `destino` es `"rito"` o `"configuracion"` escribe
   ese campo; si no, `porTimbre[destino]`.
4. Rito y configuración **además** fijan el timbre activo del sistema.
5. Anota el destino en `promovidaA` de la versión (sin duplicar).

## Cambiar el tamaño del modelo del demonio

- `GET /api/voz/motores` → demonio (vivo, latencia, modelo cargado), tarjetas
  de modelos en disco (nombre, tamaño, bytes, tokenizer) y los cuatro niveles.
- `POST /api/voz/motores` con `{ tamano: "Q4_K_M" | "Q8_0" }` reinicia el
  demonio local (`reiniciarConModelo` en `src/lib/voces/motores.ts`): mata el
  proceso anterior, lanza `tts-server` con el modelo y su tokenizer, y espera
  a `/health` (hasta 40 s). Devuelve `{ ok, modelo, segundos }`.
- Seguridad: la ruta da **404 en producción** salvo `STARSEED_MANDO=1`
  (patrón de `/api/mando/estado`), valida el tamaño contra lista blanca y
  **nunca devuelve rutas absolutas** (solo nombres de archivo). Los modelos
  viven en la carpeta de instalación de voz de la neurona sin exponer su ruta.
- `estudio` = Q8_0 (~1000 MB), `alta` = Q4_K_M (~600 MB): misma voz, distinta
  precisión. El cambio lo hace la pestaña Motores con «Cargar este modelo».

## Componentes de la ola

`src/components/voces/`: `panel-versiones.tsx` (lista CRUD + JSON),
`banco-pruebas-voz.tsx`, `fusion-voz.tsx`, `panel-motores.tsx`,
`vincular-voz.tsx`. Tests: `src/lib/__tests__/voces-versiones.test.ts`.
