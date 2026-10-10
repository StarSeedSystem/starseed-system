# Actualizaciones por capas y por nivel de Genesis · SOP de lo construido (2026-10-10)

> Contrato (qué se quiere): `architecture/actualizaciones-por-capas-y-niveles.md`. Este documento
> dice **qué existe ya, dónde vive, qué es real y qué falta**. Léelo antes de tocar
> `src/lib/actualizaciones/`, `src/components/actualizaciones/`, `RegisterSW` o la presencia.

## 1. Mapa

| Pieza | Archivo | Tipo |
|---|---|---|
| Manifiesto único, niveles, capas, validación, comparar versiones | `src/lib/actualizaciones/manifiesto.ts` | puro |
| Lógica por capa (gesto mínimo, capas pendientes, coste) | `src/lib/actualizaciones/capas.ts` | puro |
| Política por sistema/capa y por tipo de entidad | `src/lib/actualizaciones/politica.ts` | puro |
| Momento seguro (llamada, directo, escritura, batería, Wi-Fi) | `src/lib/actualizaciones/momento.ts` | puro |
| Planificador: canaria, humo, máquina de estados, vuelta atrás, fuente malla/servidor | `src/lib/actualizaciones/planificador.ts` | puro |
| Neuronas atrasadas y por qué | `src/lib/actualizaciones/atrasadas.ts` | puro |
| Versiones por capa: sanear, fusionar medios, texto, firma | `src/lib/actualizaciones/versiones-capa.ts` | puro |
| Versiones medidas en ESTE medio | `src/lib/actualizaciones/versiones-locales.ts` | navegador |
| Momento medido en el navegador | `src/lib/actualizaciones/momento-navegador.ts` | navegador |
| Almacén de políticas y neurona canaria | `src/lib/actualizaciones/almacen-politicas.ts` | navegador |
| Decisión local (política + momento) | `src/lib/actualizaciones/decision-local.ts` | navegador |
| Aplicadores reales por capa + prueba de humo | `src/lib/actualizaciones/aplicadores.ts` | navegador |
| Panel (3 variantes), bloque de sistema, selector, tabla de neuronas, hook de estado | `src/components/actualizaciones/*` | UI |
| Paso «Actualizaciones» al crear | `src/components/actualizaciones/paso-actualizaciones.tsx` | UI |
| Migración (SIN APLICAR) | `supabase/migrations/20261010140000_os_versiones.sql` | SQL |

Ediciones mínimas ancladas en archivos compartidos: `src/components/pwa/register-sw.tsx` (consulta la
política antes de recargar y anota `STARSEED_BUILD_INICIAL`), `src/lib/neurons/presencia.ts` (campo
`v` con las versiones), `src/lib/settings-sync.ts` (dos claves sincronizadas),
`src/components/mando/centro-mando.tsx` (pestaña «Actualizaciones», diferida) y
`src/components/social/create-entity-dialog.tsx` (paso al crear).

## 2. Reglas duras

1. **Niveles**: MetaGenesis publica cualquier capa; PoliGenesis y Genesis solo `datos` e `interfaz`
   (`capaPermitidaParaNivel`, `validarManifiesto` y el CHECK `os_versiones_capas_por_nivel`).
2. **Gesto mínimo por capa** (`COMO_SE_APLICA`): solo la capa `nativa` reinstala; `datos` es en caliente.
3. **Momento**: nunca en llamada, directo o escritura (salvo `datos`), nunca con batería < 20 % sin
   cargar, descargas > 50 MB solo con Wi-Fi o con permiso de datos (`CLAVE_DATOS_PERMITIDOS`, por aparato).
4. **Canaria y vuelta atrás**: antes de que la canaria pase el humo, las demás neuronas esperan; si
   falla, nadie aplica y se vuelve a `anterior` (solo una anterior declarada y menor).
5. **Honestidad**: lo que no se mide es «sin dato» (hoy: `datos`, `servicios` y `modelos` desde el
   navegador). Ningún aplicador finge: sin aplicador, lo dice.
6. **Ante la duda, avisar**: `decidirCapaLocal` devuelve «avisar» si algo falla; nunca recarga por sorpresa.
7. Puros sin React/red/`node:*`; los de navegador SSR-safe y sin `node:*`; el panel se carga diferido.

## 3. Qué es REAL hoy

- **La interfaz del OS obedece la política**: `RegisterSW`, al detectar un build nuevo, pregunta a
  `decidirCapaLocal("interfaz")`. Por defecto (OS: interfaz automática) se comporta igual que antes;
  si la persona pone «Manual» o «Programada», o hay una llamada marcada, sale el banner «Nueva versión».
- **Aplicadores**: interfaz (recarga suave con el mismo freno de escritura), sw (`update` +
  `SKIP_WAITING`, que `public/sw-v7.js` atiende), servicios (`POST /api/mando/servidor` con lista blanca;
  404 fuera de la Mac y se dice), nativa (`check_update` / `reiniciar_para_actualizar` de Tauri), datos
  (registro por sistema). Prueba de humo: `/` y `/version.json`.
- **Presencia**: cada medio anuncia `v` (interfaz = `OS_VERSION`, sw = caché `starseed-precache-*`,
  nativa = `getVersion()` de Tauri); el panel fusiona por neurona y calcula atrasadas con motivo.
- **Panel**: MetaGenesis › Publicación › Actualizaciones (servidor frente a esta neurona por capa,
  aplicar aquí, prueba de humo, política del OS, neuronas, canaria). Variantes exportadas
  `ActualizacionesGenesis` y `ActualizacionesPoliGenesis` (sin montar aún en Mi Genesis/PoliGenesis).
- **Al crear** página/grupo/comunidad/estudio/evento: paso plegado con la política de su tipo; se
  guarda al crear (`idSistema(tipo, slug)`).
- **Políticas y canaria viajan con la cuenta** (`starseed.actualizaciones.politicas.v1`,
  `…neurona-elegida.v1` en `SYNCED_KEYS`).

## 4. Qué falta (y por qué no se finge)

- **Coordinación entre neuronas** (estado del despliegue compartido, canaria remota, descarga por la
  malla): el planificador lo calcula, pero el estado necesita `os_versiones_neurona` (migración sin
  aplicar). Hasta entonces cada neurona decide sola con su política.
- **Publicar manifiestos** en `os_versiones` desde «Publicar» (MetaGenesis) y desde PoliGenesis/Genesis.
- **Marca de directo**: la llamada activa ya se lee del almacén de llamadas; los directos aún no ponen
  `data-en-directo` ni llaman a `marcarOcupado(id, "directo")`.
- **Aplicador de modelos** (AlmacenCapas) y de **datos** (UiSpec/operaciones de Genesis).
- **`/version.json` sin `OS_VERSION`**: la interfaz se compara por build id (servidor frente a la pestaña).
- Montar las variantes en `mi-genesis.tsx` y `poligenesis.tsx` (de otro agente: no se tocaron).
Todas están troceadas como tareas del enjambre en el informe de la ola.

## 5. Verificación

`npx vitest run src/lib/actualizaciones src/components/actualizaciones` (62 pruebas). En la Mac:
`/genesis?pestana=actualizaciones` (o `/metagenesis`) — ver «Interfaz: Servidor/Aquí», pulsar
«Prueba de humo», poner Interfaz en «Manual», publicar un build y comprobar que sale el banner en vez
de recargar; en la tablet Android con StarSeed, comprobar que aparece en «Tus neuronas» con su versión.
