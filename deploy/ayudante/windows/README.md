# Ayudante privilegiado Windows (TRM1125G)

El ayudante con privilegios de StarSeed OS en Windows se instala como **servicio de Windows** usando el instalador NSIS (`installMode: perMachine`) con su ventana de **UAC**. El sistema pide la **autorización de administrador** durante la instalación.

## Qué hace

Ofrece **órdenes tipadas** que la dirección y MetaGenesis usan para administrar una neurona Windows con privilegios, sin que las contraseñas viajen nunca:

| Orden | Qué hace | Guardia |
|-------|----------|---------|
| `almacenes_estado` | `Get-Volume` + `Get-Disk` (PowerShell) | solo lectura |
| `almacen_salud` | SMART, temperatura, ciclos por serie (`Get-PhysicalDisk`) | solo lectura |
| `almacen_formatear` | `Format-Volume` **SOLO si la serie está autorizada** | serie en lista firmada + confirmación |
| `almacen_montar` / `desmontar` | `Set-Partition -NewDriveLetter` / `-RemoveDriveLetter` | solo lectura |
| `almacen_verificar` | `Repair-Volume -Scan` (chkdsk) | solo lectura |
| `servicios_estado` | `sc query StarSeed*` | solo lectura |
| `servicio_iniciar/parar/reiniciar` | `sc start/stop` **solo `StarSeed*`** | prefijo verificado |
| `actualizar_app` | Dispara actualización firmada (tauri-plugin-updater) | confirmación |
| `logs_leer` | `Get-WinEvent` filtrado (últimas N líneas, predicado) | solo lectura |
| `reiniciar_app` | Reinicia el bundle `app.starseed.os` via `start shell:AppsFolder\...` | confirmación |
| `terminal_administrador` | Ejecuta `powershell -NoProfile -Command "<orden>"` **como SYSTEM** (servicio) | confirmación + auditoría completa |

## Requisitos previos

1. **Windows 10 versión 1809 (build 17763) o posterior** — APIs de servicio y PowerShell necesarias.
2. **StarSeed OS** — el ayudante solo está disponible en la app StarSeed OS (no en Nexus ni Café).
3. **Ventana principal** — los comandos solo responden desde la ventana `main`.
4. **Origen permitido** — solo `https://starseed-os.vercel.app` y `http://127.0.0.1:47610…47619`.
5. **«Acceso al equipo» concedido** — la persona debió darlo en este Windows (diálogo nativo, aviso visible en la bandeja del sistema).
6. **Ayudante registrado** — el servicio `StarSeedAyudante` está instalado y corriendo (el instalador NSIS lo hace con UAC).

## Cómo se instala (la primera vez)

El instalador NSIS (generado por `tauri.conf.json` con `installMode: perMachine` y `includeScript: windows/hooks.nsh`):

1. Pide **UAC** (ejecución como administrador) al iniciar la instalación.
2. Copia el binario `ayudante.exe` en `$INSTDIR\` (junto a la app principal).
3. Ejecuta `hooks.nsh → onInstallService`:
   - Crea el servicio `StarSeedAyudante` con `sc create` (cuenta `LocalSystem`, inicio automático).
   - Configura descripción y recuperación ante fallos (reinicio a los 60s).
   - Inicia el servicio con `sc start`.
4. El estado `registrado: true` persiste entre reinicios de la app y de Windows.

## Cómo se desinstala

El desinstalador NSIS ejecuta `hooks.nsh → un.InstallServiceCleanup`:
1. Detiene el servicio con `sc stop StarSeedAyudante`.
2. Borra el servicio con `sc delete StarSeedAyudante`.
3. Quitarlo **siempre se puede** (sin diálogo de confirmación adicional).

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
%LOCALAPPDATA%\StarSeed OS\Logs\ayudante.log
```

Formato: JSON Lines encadenado por SHA-256 (`ant` = hash anterior, `h` = hash de la línea). Cambiar o borrar una línea rompe la cadena y `ayudante_estado.registro_integro` lo detecta.

Resumen también en `enlaces.log` (líneas `[ayudante] evento`).

## Comandos Tauri (capability `acceso-equipo.json`)

| Comando | Parámetros | Devuelve |
|---------|------------|----------|
| `ayudante_registrar` | — | `EstadoAyudante` |
| `ayudante_desregistrar` | — | `EstadoAyudante` |
| `ayudante_estado` | — | `EstadoAyudante` |
| `ayudante_ejecutar` | `{ orden, args, tiempo_max_ms? }` | `EjecutarResultado` |

### `EstadoAyudante`
```ts
{
  registrado: boolean,      // true si el servicio está instalado
  disponible: boolean,      // true en Windows 10 1809+ + StarSeed OS
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
| `almacen_formatear` | `serie` | `formato` (def. "NTFS"), `nombre` (def. "StarSeed") |
| `almacen_montar` / `desmontar` / `verificar` | `serie` | — |
| `servicio_iniciar` / `parar` / `reiniciar` | `servicio` (prefijo `StarSeed*`) | — |
| `logs_leer` | — | `filtro` (predicado `Get-WinEvent`), `lineas` (def. 100, máx 5000) |
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

1. La persona quiere formatear un disco en su Windows remoto.
2. Genesis muestra el botón «Formatear» solo si:
   - El Windows destino tiene el ayudante registrado (`ayudante_estado.registrado === true`).
   - La serie del disco está en la lista autorizada.
3. La persona pulsa → Genesis firma la orden `almacen_formatear` con `args: { serie: "ABC123" }`.
4. La orden viaja por la malla (P2P o relé sellado) al Windows destino.
5. La página del Windows destino invoca `ayudante_ejecutar` con la orden firmada.
6. Rust valida: ayudante registrado + serie autorizada + origen permitido + ventana main.
7. Como `requiere_confirmacion === true`, la página **ya pidió la confirmación nativa** antes de firmar (diálogo «¿Formateas este disco?»).
8. El ayudante (servicio Windows, SYSTEM) ejecuta `Format-Volume -DriveLetter D -FileSystem NTFS -NewFileSystemLabel StarSeed -Force`.
9. Resultado vuelve firmado → Genesis lo muestra → registro encadenado en el Windows destino.

## Seguridad

- **Contraseñas nunca viajan**: el nivel administrador es el servicio Windows (SYSTEM), no `runas` con contraseña.
- **Órdenes selladas**: cada orden lleva firma ECDSA por aparato, `seq` monótono, nonce, caducidad (15 min). Replay = 409.
- **Lista blanca cerrada**: solo las órdenes de la tabla de arriba. Nada de shell arbitrario salvo `terminal_administrador` (auditado).
- **Guardia dura en formateo**: serie debe estar en lista firmada en el CI. Una serie no autorizada **nunca** se formatea.
- **Servicios solo `StarSeed*`**: no se puede tocar `AppleMobileDeviceService` ni otros.
- **Aviso visible**: mientras el ayudante está registrado, el icono de «Acceso al equipo» está en la bandeja del sistema. Sin aviso, los comandos se niegan (`sin-indicador`).
- **Aparato bloqueado**: con pantalla bloqueada (`WTSGetActiveConsoleSessionId` + `WTSQuerySessionInformation`) no se acepta ninguna orden.
- **Registro inmutable**: cadena SHA-256. Cualquier manipulación se detecta.

## CI / Empaquetado (para el equipo de dirección)

El binario del ayudante (`ayudante.exe`) se compila como parte del crate y se empaqueta en:

```
StarSeed OS/
├── StarSeed OS.exe
├── ayudante.exe          <-- binario del servicio
├── ...
```

El servicio apunta a esa ruta (`binPath= "C:\Program Files\StarSeed OS\ayudante.exe"`).

En `native-build.yml` (job `firmar-y-empaquetar`):

1. Se compila el helper (`cargo build --bin ayudante` — target aparte en `Cargo.toml`).
2. Se firma con el mismo certificado que la app (`signtool sign /tr ...`).
3. El archivo `ayudante-series-autorizadas.json` (firmado) se incluye en `resources/`.
4. El instalador NSIS incluye `hooks.nsh` que registra el servicio con UAC.

> **Sin claves en el repo**: el certificado y las credenciales de firma están en `~/.starseed/env` (variables `WINDOWS_CERT_PFX_BASE64`, `WINDOWS_CERT_PASSWORD`). El CI las lee con `entorno.leer_clave()`.

## Pruebas

```bash
# Solo la lógica pura (corre en cualquier SO)
cargo test --lib ayudante_windows_logica

# Con Tauri (solo Windows)
cargo test --lib ayudante_windows
```

Las pruebas de `ayudante_windows_logica` cubren:
- Decisiones de permiso (registrado, series, prefijos de servicio).
- Validación de argumentos (formatear, montar, logs, terminal).
- Serialización/deserialización de tipos.