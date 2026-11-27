# Ayudante privilegiado macOS (TRM1125C)

El ayudante con privilegios de StarSeed OS en macOS se registra como **LaunchDaemon** usando `SMAppService` (disponible en macOS 13 Ventura+). El sistema pide la **autorización de administrador** la primera vez que se registra.

## Qué hace

Ofrece **órdenes tipadas** que la dirección y MetaGenesis usan para administrar una neurona macOS con privilegios, sin que las contraseñas viajen nunca:

| Orden | Qué hace | Guardia |
|-------|----------|---------|
| `almacenes_estado` | `diskutil list` + `diskutil apfs list` | solo lectura |
| `almacen_salud` | SMART, temperatura, ciclos por serie | solo lectura |
| `almacen_formatear` | `diskutil eraseDisk` **SOLO si la serie está autorizada** | serie en lista firmada + confirmación |
| `almacen_montar` / `desmontar` | `diskutil mount/unmount` por serie | solo lectura |
| `almacen_verificar` | `diskutil verifyDisk/verifyVolume` | solo lectura |
| `servicios_estado` | `launchctl list com.starseed.*` | solo lectura |
| `servicio_iniciar/parar/reiniciar` | `launchctl bootstrap/bootout` **solo `com.starseed.*`** | prefijo verificado |
| `actualizar_app` | Dispara actualización firmada (tauri-plugin-updater) | confirmación |
| `logs_leer` | `log show` filtrado (últimas N líneas, predicado) | solo lectura |
| `reiniciar_app` | Reinicia el bundle `app.starseed.os` via `launchctl` | confirmación |
| `terminal_administrador` | Ejecuta `sh -c "<orden>"` **como root** (LaunchDaemon) | confirmación + auditoría completa |

## Requisitos previos

1. **macOS 13 (Ventura) o posterior** — `SMAppService` no existe en versiones anteriores.
2. **StarSeed OS** — el ayudante solo está disponible en la app StarSeed OS (no en Nexus ni Café).
3. **Ventana principal** — los comandos solo responden desde la ventana `main`.
4. **Origen permitido** — solo `https://starseed-os.vercel.app` y `http://127.0.0.1:47610…47619`.
5. **«Acceso al equipo» concedido** — la persona debió darlo en este Mac (diálogo nativo, aviso visible en la barra de menús).
6. **Ayudante registrado** — la persona autorizó el registro con su contraseña de administrador (una sola vez).

## Cómo se registra (la primera vez)

1. La web invoca `ayudante_registrar`.
2. Rust escribe un `plist` temporal para `com.starseed.ayudante`.
3. `launchctl bootstrap system <plist>` **pide la contraseña de administrador** en un diálogo nativo del sistema.
4. Si la persona autoriza, el LaunchDaemon queda instalado en `/Library/LaunchDaemons/`.
5. El estado `registrado: true` persiste entre reinicios de la app y del Mac.

## Cómo se desregistra

La web invoca `ayudante_desregistrar` → `launchctl bootout system com.starseed.ayudante`. Quitarlo **siempre se puede** (sin diálogo de confirmación adicional).

## Series autorizadas para formatear

`almacen_formatear` **solo funciona** si la serie del disco está en la lista autorizada. La lista vive en:

```
<carpeta de configuración de la app>/ayudante-series-autorizadas.json
```

Formato: array JSON de strings (ej. `["ABC123DEF456", "XYZ789UVW012"]`).

> **Cómo se pone la lista:** en el CI de `native-build.yml` (job `firmar-y-empaquetar`) se incluye un archivo firmado con las series de los discos de la Maggabox / nodos autorizados. **Nunca se edita a mano en producción.**

## Registro de solo-añadir

Cada ejecución queda en:

```
~/Library/Logs/app.starseed.os/ayudante.log
```

Formato: JSON Lines encadenado por SHA-256 (`ant` = hash anterior, `h` = hash de la línea). Cambiar o borrar una línea rompe la cadena y `ayudante_estado.registro_integro` lo detecta.

Resumen también en `enlaces.log` (líneas `[ayudante] evento`).

## Comandos Tauri (capability `ayudante-macos.json`)

| Comando | Parámetros | Devuelve |
|---------|------------|----------|
| `ayudante_registrar` | — | `EstadoAyudante` |
| `ayudante_desregistrar` | — | `EstadoAyudante` |
| `ayudante_estado` | — | `EstadoAyudante` |
| `ayudante_ejecutar` | `{ orden, args, tiempo_max_ms? }` | `EjecutarResultado` |

### `EstadoAyudante`
```ts
{
  registrado: boolean,      // true si el LaunchDaemon está instalado
  disponible: boolean,      // true en macOS 13+ + StarSeed OS
  motivo: string,           // vacío si disponible
  version_contrato: number  // 1
}
```

### `EjecutarParams`
```ts
{
  orden: "almacenes_estado" | "almacen_salud" | "almacen_formatear" | "almacen_montar"
       | "almacen_desmontar" | "almacen_verificar" | "servicios_estado"
       | "servicio_iniciar" | "servicio_parar" | "servicio_reiniciar"
       | "actualizar_app" | "logs_leer" | "reiniciar_app" | "terminal_administrador",
  args: Record<string, string>,   // según la orden (ver abajo)
  tiempo_max_ms?: number          // defecto 60000
}
```

### Args por orden

| Orden | Args obligatorios | Args opcionales |
|-------|-------------------|-----------------|
| `almacen_salud` | `serie` | — |
| `almacen_formatear` | `serie` | `formato` (def. "APFS"), `nombre` (def. "StarSeed") |
| `almacen_montar` / `desmontar` / `verificar` | `serie` | — |
| `servicio_iniciar` / `parar` / `reiniciar` | `servicio` (prefijo `com.starseed.`) | — |
| `logs_leer` | — | `filtro` (predicado `log show`), `lineas` (def. 100, máx 5000) |
| `terminal_administrador` | `orden` (máx 8000 chars) | — |

### `EjecutarResultado`
```ts
{
  exito: boolean,
  salida?: string,    // stdout (truncado a 500 KB)
  error?: string,     // stderr si hubo
  codigo?: number     // código de salida (null si señal)
}
```

## Flujo típico desde Genesis / control remoto

1. La persona quiere formatear un disco en su Mac remota.
2. Genesis muestra el botón «Formatear» solo si:
   - El Mac destino tiene el ayudante registrado (`ayudante_estado.registrado === true`).
   - La serie del disco está en la lista autorizada.
3. La persona pulsa → Genesis firma la orden `almacen_formatear` con `args: { serie: "ABC123" }`.
4. La orden viaja por la malla (P2P o relé sellado) al Mac destino.
5. La página del Mac destino invoca `ayudante_ejecutar` con la orden firmada.
6. Rust valida: ayudante registrado + serie autorizada + origen permitido + ventana main.
7. Como `requiere_confirmacion === true`, la página **ya pidió la confirmación nativa** antes de firmar (diálogo «¿Formateas este disco?»).
8. El ayudante (LaunchDaemon, root) ejecuta `diskutil eraseDisk APFS StarSeed ABC123`.
9. Resultado vuelve firmado → Genesis lo muestra → registro encadenado en el Mac destino.

## Seguridad

- **Contraseñas nunca viajan**: el nivel administrador es el LaunchDaemon (root), no `sudo` con contraseña.
- **Órdenes selladas**: cada orden lleva firma ECDSA por aparato, `seq` monótono, nonce, caducidad (15 min). Replay = 409.
- **Lista blanca cerrada**: solo las órdenes de la tabla de arriba. Nada de shell arbitrario salvo `terminal_administrador` (auditado).
- **Guardia dura en formateo**: serie debe estar en lista firmada en el CI. Una serie no autorizada **nunca** se formatea.
- **Servicios solo `com.starseed.*`**: no se puede tocar `com.apple.*` ni otros.
- **Aviso visible**: mientras el ayudante está registrado, el icono de «Acceso al equipo» está en la barra de menús. Sin aviso, los comandos se niegan (`sin-indicador`).
- **Aparato bloqueado**: con pantalla bloqueada (`CGSSessionScreenIsLocked`) no se acepta ninguna orden.
- **Registro inmutable**: cadena SHA-256. Cualquier manipulación se detecta.

## CI / Empaquetado (para el equipo de dirección)

El binario del ayudante (`ayudante`) se compila como parte del crate y se empaqueta en:

```
StarSeed OS.app/Contents/Library/LaunchServices/com.starseed.ayudante
```

El `plist` del LaunchDaemon apunta a esa ruta (`ProgramArguments = ["/Applications/StarSeed OS.app/Contents/Library/LaunchServices/com.starseed.ayudante"]`).

En `native-build.yml` (job `firmar-y-empaquetar`):

1. Se compila el helper (`cargo build --bin ayudante` — target aparte en `Cargo.toml`).
2. Se firma con el mismo certificado que la app (`codesign --deep --options runtime`).
3. Se notariza junto con la app (`xcrun notarytool submit`).
4. El archivo `ayudante-series-autorizadas.json` (firmado) se incluye en `Contents/Resources/`.

> **Sin claves en el repo**: el certificado y las credenciales de notarización están en `~/.starseed/env` (variables `MACOS_CERT_P12_BASE64`, `NOTARY_*`). El CI las lee con `entorno.leer_clave()`.

## Pruebas

```bash
# Solo la lógica pura (corre en cualquier SO)
cargo test --lib ayudante_macos_logica

# Con Tauri (solo macOS)
cargo test --lib ayudante_macos
```

Las pruebas de `ayudante_macos_logica` cubren:
- Decisiones de permiso (registrado, series, prefijos de servicio).
- Validación de argumentos (formatear, montar, logs, terminal).
- Serialización/deserialización de tipos.