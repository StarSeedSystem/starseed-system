# Contrato · Vincular apps con StarSeed OS («StarSeed Link») (2026-10-10)

Petición de Alex del 2026-10-10. Omnifrecuencias y Audiomorphic deben quedar vinculadas por completo
con StarSeed OS, en cada formato (web, Android, macOS, Windows, Linux): cuenta, transmisiones en
directo, actualizaciones y sincronización P2P automática, respetando lo que cada app ya hace. Y el
mismo mecanismo sirve para integrar CUALQUIER programa nuevo, de cualquier medio y entidad (pública o
privada), sin obligarle a cambiar de formato.

## Lo que pasó y la regla que sale de ahí

El 2026-10-10 el login de Omnifrecuencias daba «exceed_egress_quota». La app tenía fijado en su
código el proyecto viejo del OS (pqzdpmedcsgcedkvndzl, restringido por tráfico), y el OS ya vivía en
jhgvhkypqadfdkkqoxta. Arreglado en el repo `alexbordongarrigos/omnifrecuencias` (commit a6bdd53,
desplegado en Vercel). **Regla: ninguna app vinculada fija la base de datos del OS.** La pide a:

- `GET https://starseed-os.vercel.app/api/vinculo/config`: pública, con CORS abierto. Devuelve la
  URL y la clave anon del proyecto activo (las dos son públicas por diseño) y las URLs de los
  servicios (login, estaciones). Nunca una clave de servicio.
- Si no responde, usa lo último que guardó, y si no, el proyecto activo conocido. Los proyectos
  retirados se ignoran aunque vengan del entorno de compilación.

## Las capas del vínculo (las mismas para toda app)

| Capa | Qué da | Cómo |
|---|---|---|
| Cuenta | La misma cuenta StarSeed OS (correo o @usuario) | Supabase Auth del proyecto activo, según `/api/vinculo/config` |
| Neurona | La app aparece como un MEDIO del aparato en el panel de Neuronas | Presencia en vivo (`src/lib/neurons/presencia.ts`): el mismo tema de cuenta y la misma carga |
| Sincronización | Ajustes y datos de la app en todas sus neuronas | Tablas propias de la app con RLS por cuenta (p. ej. `omni_presets`), y P2P local cuando hay enlace |
| Directo | Transmitir y seguir sesiones en vivo al milisegundo | Estaciones paramétricas + reloj común (`src/lib/estaciones/`), mismo protocolo en la app y en el OS |
| Transporte | Lo más directo disponible, también sin internet | Transporte universal (`src/lib/malla/`), emparejado por código o QR |
| Actualizaciones | Versiones por capas, con autoactualización según sus ajustes | Manifiesto único de `architecture/actualizaciones-por-capas-y-niveles.md`; la app publica su canal |
| Dentro del OS | La app se abre en el OS sin perder nada | Puente postMessage con origen verificado (iframe de la web oficial) o vista integrada |

## Kit para apps nuevas

Un paquete pequeño y sin dependencias raras (`integraciones-de-codigo/starseed-link/`). Se puede
copiar a cualquier app web o Capacitor/Electron/Tauri e incluye:
- `config()`;
- `entrar()`;
- `presencia()`;
- `estacion.publicar/seguir()`;
- `relojComun()`;
- `transporte.enviar()`;
- `puenteOS()`, el lado de la app del postMessage.

Cada app declara en un manifiesto qué capas usa, sus tablas y su canal de actualizaciones. Las
entidades (públicas o privadas) registran su app desde PoliGenesis/Genesis y la Biblioteca la lista.

## Marco para apps nuevas (de cualquier formato y entidad, pública o privada)

El mecanismo sirve para cualquier programa, no solo para estas dos apps:

1. **La app** copia el kit con `integraciones-de-codigo/starseed-link/copiar-a-app.sh` (lleva sus
   huellas sha256). Crea su cliente de Supabase con `config()` y escribe un adaptador propio que
   pasa su estado a una estación y de vuelta (en las dos apps se llama `vinculoStarSeed.ts`). La
   guía paso a paso está en `integraciones-de-codigo/starseed-link/README.md`.
2. **Publica su manifiesto** en `<web>/starseed-link.json` (los de las dos apps están en
   `integraciones-de-codigo/starseed-link/apps/`). Es un dato, sin código ni claves, y
   `validarManifiesto` rechaza todo lo que tenga forma de clave. Declara:
   - quién la publica: `entidad` (persona, o entidad pública o privada del OS con su `ref`);
   - sus `capas`, sus `formatos` y sus `tablas` (con RLS por cuenta);
   - su canal de `actualizaciones` (`web`, `github-releases`, `tienda` o `propio`);
   - los `permisos` de su marco.
3. **Se registra desde PoliGenesis o Genesis** (lado del OS, pendiente):
   - se pega la URL web de la app;
   - el OS lee `<web>/starseed-link.json` y lo valida con el mismo `validarManifiesto`;
   - guarda la ficha a nombre de la persona o la entidad (`entidad.ref`);
   - añade el origen web a los orígenes del puente;
   - la Biblioteca la lista como `kind: "app"`, con sus formatos y su canal de actualizaciones.
   Una entidad privada la ve solo en su ámbito; una pública, en la Biblioteca de todos.
4. **Estaciones de una app nueva**: hoy el protocolo de estaciones del OS solo acepta las fuentes
   `omnifrecuencias` y `audiomorphic` (`FUENTES_TRANSMISION`). Para que otra app tenga estaciones
   propias, el OS debe aceptar `fuente: "app:<id>"` con `params: "visual"` (valores sueltos, como
   Audiomorphic) cuando su manifiesto esté registrado. Ese cambio va en el OS y en el kit a la vez,
   y la prueba de compatibilidad lo vigila. Mientras tanto, la app nueva ya puede usar estas capas:
   - cuenta;
   - neurona;
   - transporte;
   - emparejado sin internet;
   - el puente con el OS.

## Publicar las apps nativas con el login y el vínculo nuevos

Las dos ramas `vinculo-starseed-1010` ya suben la versión: Omnifrecuencias pasa a **2.0.1** y
Audiomorphic a **1.2.2**. Las versiones aparecen en `package.json`, en el comprobador de
actualizaciones de la app y en el adaptador. Ninguno de los dos repos tiene CI: las versiones
anteriores (2.0.0 del 2026-09-22 y 1.2.1 del 2026-10-09) se compilaron en la Mac y se subieron a
GitHub Releases. Cuando Alex diga «publicar», se hace en la Mac:

```bash
# Omnifrecuencias 2.0.1 (web en Vercel desde main; nativas en GitHub Releases)
cd ~/Documents/omni-frecuencias-holográficas
git checkout main && git merge --ff-only vinculo-starseed-1010 && git push origin main
npm test && npm run build
npx electron-builder --mac --win --linux --publish never          # como la 2.0.0: dmg, zip, exe, AppImage
sed -i '' 's/versionCode 1$/versionCode 2/; s/versionName "1.0"/versionName "2.0.1"/' android/app/build.gradle
npx cap sync android && (cd android && ./gradlew assembleDebug)   # misma llave de depuración que la 2.0.0
cp android/app/build/outputs/apk/debug/app-debug.apk dist_electron/OmniFrequency.apk
gh release create v2.0.1 --repo alexbordongarrigos/omnifrecuencias --title "Omnifrecuencias 2.0.1" \
  --notes "Login con la base activa de StarSeed OS, estaciones en directo, enlace local sin internet." \
  dist_electron/*.dmg dist_electron/*.zip dist_electron/*.exe dist_electron/*.AppImage dist_electron/OmniFrequency.apk

# Audiomorphic 1.2.2 (sus enlaces de descarga esperan los nombres Audiomorphic_v1.2.2_*)
cd ~/Documents/audiomorphic-visualizer-AR
git checkout main && git merge --ff-only vinculo-starseed-1010
sed -i '' 's/versionCode 4$/versionCode 5/; s/versionName "1.2.1"/versionName "1.2.2"/' android/app/build.gradle
npm test && bash scripts/pack-all.sh                              # web + dmg + exe + apk en ../Instaladores
# renombrar a Audiomorphic_v1.2.2_macOS_arm64.dmg, Audiomorphic_v1.2.2_Windows.zip, Audiomorphic_v1.2.2.apk
gh release create v1.2.2 --repo StarSeedSystem/Audiomorphic-AR-app --title "Audiomorphic 1.2.2" --notes "…" <instaladores>
git push origin main                                              # la web (Vercel) DESPUÉS del release:
                                                                  # sus enlaces de descarga apuntan a v1.2.2
```

Conviene saber esto antes de publicar:
- Android solo acepta una actualización si `versionCode` sube y la firma es la misma. Las APK
  publicadas están firmadas con `~/.android/debug.keystore`, que solo existe en la Mac. Si algún
  día se compila en CI, esa llave tiene que ir como secreto, o habrá que reinstalar.
- `android/` de Omnifrecuencias está fuera de git en la Mac, y por eso el `versionCode` se cambia
  allí con `sed`.

## Medido (2026-10-10, contenedor de la nube, 2 CPU compartidas)

| Prueba | Resultado |
|---|---|
| Kit: `vitest` (35 pruebas, también contra los módulos del OS) | verde |
| Kit: `tsc` estricto y sin «strict» | 0 errores |
| Omnifrecuencias: `npm test` (10, nuevas) | verde |
| Omnifrecuencias: `tsc` | 15 errores, todos anteriores (main tenía 17) |
| Omnifrecuencias: `vite build` | ok |
| Audiomorphic: `npm test` (8, nuevas) | verde |
| Audiomorphic: `tsc` | ningún error nuevo, uno menos que main (main ya tenía 3.664, casi todos por tipos JSX ausentes) |
| Audiomorphic: `vite build` | ok |
| Login de Audiomorphic | apuntaba a la base retirada (pqzdpmedcsgcedkvndzl). La base activa tiene todas sus tablas y `check_discount` (comprobado por PostgREST con la clave anon). |
| Dos navegadores aislados SIN internet, enlace local por código, misma estación privada (Omnifrecuencias) | misma ancla común; 0,60 ms y 4,90 ms de desfase en dos pasadas; pausar, reanudar y terminar llegan a los dos |
| Lo mismo con Audiomorphic | misma ancla; 4,6 ms en ventana pequeña. A pantalla completa, con la carga del contenedor en 8, 41,9 a 80 ms: el hilo principal no daba abasto, no es el protocolo |
| Supabase Realtime real desde el contenedor | no se pudo: el proxy de la nube rechaza el WebSocket (HTTP 500). Toca probarlo en la Mac o en un móvil |
| `GET https://starseed-os.vercel.app/api/vinculo/config` y `/estaciones/vivo/<id>` en producción | 404: están en `main` (8f4acb2) y llegan al publicar el OS. Hasta entonces las apps usan su respaldo |

## Estado (2026-10-10)

- Hecho:
  - login de Omnifrecuencias web arreglado y desplegado;
  - `/api/vinculo/config` en el OS (sin publicar todavía);
  - transporte universal;
  - kit `starseed-link` 1.0.1, con README, script de copia con huellas y 35 pruebas;
  - **Omnifrecuencias** (rama `vinculo-starseed-1010`):
    - estación del OS pública o privada desde «Transmitir en Vivo» (topología «Estación StarSeed
      OS») y desde el Generador;
    - salida de audio abierta en el instante común;
    - cambios de osciladores y volumen para todos;
    - sintonizar por enlace o desde el directorio;
    - enlace local sin internet;
    - presencia como medio de la neurona;
    - manifiesto publicado y versión 2.0.1;
  - **Audiomorphic** (rama `vinculo-starseed-1010`):
    - login reparado con la config del OS (antes apuntaba a la base retirada) y un solo cliente;
    - la espiral como estación, animada con el tiempo del reloj común;
    - VR/AR y menús no viajan;
    - quien sigue deja el piloto automático a quien transmite;
    - enlace local, presencia y manifiesto;
    - la sincronización de presets recibe por fin el id de la cuenta;
    - versión 1.2.2.
- Falta:
  - publicar el OS, para que `/api/vinculo/config` y `/estaciones/vivo/` respondan;
  - publicar las dos apps con los comandos de arriba;
  - **en el OS**:
    - compactar por tamaño en `src/lib/estaciones/transmision-parametrica.ts`, igual que el kit (hoy
      un anfitrión del OS con muchos cambios visuales pasa de 24 KB);
    - aceptar `fuente: "app:<id>"` para las apps registradas;
    - registrar manifiestos en PoliGenesis o Genesis y listarlos en la Biblioteca;
  - probar Supabase Realtime de punta a punta entre la Mac y un móvil;
  - Audiomorphic en VR (`VisualizerVR`) todavía anima con su propio tiempo.
