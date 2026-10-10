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

## Estado (2026-10-10)

- Hecho:
  - login de Omnifrecuencias web arreglado y desplegado;
  - `/api/vinculo/config` en el OS;
  - estaciones paramétricas de Omnifrecuencias en el OS, con el paquete para su repo en
    `integraciones-de-codigo/omnifrecuencias/`;
  - transporte universal.
- Falta:
  - aplicar el paquete de estaciones en el repo de Omnifrecuencias (clon local:
    `~/Documents/omni-frecuencias-holográficas`) y publicar sus apps nativas 2.0.x con el login
    nuevo;
  - Audiomorphic (repo `StarSeedSystem/Audiomorphic-AR-app`, clon `~/Documents/audiomorphic-visualizer-AR`)
    con el mismo kit;
  - el kit `starseed-link` como paquete reutilizable;
  - la presencia de las apps como medios.
