//! (TRM1125B) Terminal entre neuronas · lógica pura para decidir si una orden se permite con el
//! nivel de permiso concedido. Sin Tauri ni E/S: todo entra por argumento. La usan los comandos
//! de `terminal_remota.rs` y las pruebas.
//!
//! Contrato: architecture/terminal-entre-neuronas.md y architecture/control-remoto-entre-neuronas.md
//! §4 (terminal y archivos) y §2.3 (niveles). Reglas: permiso apagado por defecto, encendido en el
//! aparato; dos niveles (usuario, administrador); contraseñas nunca viajan; órdenes selladas;
//! aviso visible; «Terminar» y «Quitar permiso»; registro encadenado.

use serde::{Deserialize, Serialize};

/// Nivel de permiso para la terminal remota.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NivelTerminal {
    /// Terminal de la cuenta, sin privilegios (nivel «usuario» del contrato).
    Usuario,
    /// Terminal con privilegios de administrador (nivel «administrador» del contrato).
    /// Solo a través del ayudante con privilegios (TRM1125C), nunca sudo con contraseña.
    Administrador,
}

impl NivelTerminal {
    /// Valida que el nivel sea uno de los permitidos.
    pub fn valido(nivel: &str) -> bool {
        matches!(nivel, "usuario" | "administrador")
    }

    /// Convierte desde string (para compatibilidad con órdenes firmadas).
    pub fn desde_str(s: &str) -> Option<Self> {
        match s {
            "usuario" => Some(Self::Usuario),
            "administrador" => Some(Self::Administrador),
            _ => None,
        }
    }

    /// Convierte a string para el registro y la web.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Usuario => "usuario",
            Self::Administrador => "administrador",
        }
    }
}

/// Clase de una orden según su riesgo (reutiliza la clasificación de `acceso_equipo_logica`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClaseOrden {
    /// La orden borra o sobrescribe datos.
    Borrar,
    /// Cambia ajustes del sistema, permisos o procesos (o pide privilegios).
    Sistema,
    /// Toca contraseñas, claves o credenciales.
    Credenciales,
    /// Envía datos o mensajes fuera de este aparato.
    Mensajes,
    /// Instala software.
    Instalar,
    /// Construye o descifra otra orden al ejecutarse: no se puede saber de antemano qué hará.
    Opaca,
}

impl ClaseOrden {
    pub fn texto(&self) -> &'static str {
        match self {
            Self::Borrar => "borra o sobrescribe datos",
            Self::Sistema => "cambia ajustes del sistema, permisos o procesos (o pide privilegios)",
            Self::Credenciales => "toca contraseñas, claves o credenciales",
            Self::Mensajes => "envía datos o mensajes fuera de este aparato",
            Self::Instalar => "instala software",
            Self::Opaca => "construye o descifra otra orden al ejecutarse: no se puede saber de antemano qué hará",
        }
    }
}

/// Resultado de la decisión: ¿se permite ejecutar esta orden con este nivel?
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DecisionTerminal {
    /// `true` si la orden se puede ejecutar directamente; `false` si necesita confirmación o se rechaza.
    pub permite: bool,
    /// Clases de riesgo detectadas en la orden (vacío = ninguna detectada).
    pub clases: Vec<ClaseOrden>,
    /// Motivo legible si `permite == false` (para el diálogo de confirmación o el rechazo).
    pub motivo: Option<String>,
    /// Nivel mínimo requerido para esta orden.
    pub nivel_requerido: NivelTerminal,
}

/// Límites de ejecución para la terminal remota.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LimitesTerminal {
    /// Tiempo máximo de ejecución en milisegundos.
    pub tiempo_max_ms: u64,
    /// Tamaño máximo de salida (stdout + stderr) en bytes.
    pub salida_max_bytes: usize,
    /// Tamaño máximo de una orden en caracteres.
    pub orden_max_chars: usize,
}

impl Default for LimitesTerminal {
    fn default() -> Self {
        Self {
            tiempo_max_ms: 30_000,      // 30 segundos
            salida_max_bytes: 100_000,  // 100 KB
            orden_max_chars: 8_000,     // mismo tope que acceso_equipo
        }
    }
}

/// Decide si una orden de terminal se permite con el nivel concedido.
///
/// Reglas (contrato §4 y §2.3):
/// - Nivel `usuario`: solo órdenes sin clases de riesgo (clases vacío = permite directo).
/// - Nivel `administrador`: permite todas, pero las de riesgo se confirman una a una.
/// - Órdenes vacías o demasiado largas se rechazan siempre.
/// - Las contraseñas nunca viajan: nivel `administrador` solo vía ayudante con privilegios (TRM1125C).
pub fn decidir_orden(
    orden: &str,
    nivel: NivelTerminal,
    limites: LimitesTerminal,
) -> DecisionTerminal {
    // Validaciones básicas
    if orden.trim().is_empty() || orden.chars().count() > limites.orden_max_chars {
        return DecisionTerminal {
            permite: false,
            clases: vec![],
            motivo: Some(format!("la orden está vacía o pasa de {} caracteres", limites.orden_max_chars)),
            nivel_requerido: NivelTerminal::Usuario,
        };
    }

    // Clasificar la orden (reutiliza la lógica de acceso_equipo_logica)
    let clases = clasificar_orden(orden);

    // Nivel usuario: solo permite si no hay clases de riesgo
    if nivel == NivelTerminal::Usuario {
        if clases.is_empty() {
            return DecisionTerminal {
                permite: true,
                clases,
                motivo: None,
                nivel_requerido: NivelTerminal::Usuario,
            };
        }
        // Tiene clases de riesgo: necesita confirmación (no se permite directo)
        return DecisionTerminal {
            permite: false,
            clases: clases.clone(),
            motivo: Some(texto_confirmar(&clases)),
            nivel_requerido: NivelTerminal::Administrador,
        };
    }

    // Nivel administrador: permite todo, pero las de riesgo avisan (se confirman en la capa de arriba)
    DecisionTerminal {
        permite: true,
        clases,
        motivo: None,
        nivel_requerido: NivelTerminal::Administrador,
    }
}

/// Texto para el diálogo de confirmación de una orden con riesgo.
fn texto_confirmar(clases: &[ClaseOrden]) -> String {
    let lista: Vec<String> = clases.iter().map(|c| format!("· {}", c.texto())).collect();
    format!(
        "Esta orden requiere nivel administrador:\n{}",
        lista.join("\n")
    )
}

/// Clasifica una orden según su riesgo (versión simplificada de `acceso_equipo_logica::clasificar`).
/// Solo reconoce patrones en una línea de órdenes; no finge detectar pagos ni binarios propios.
pub fn clasificar_orden(orden: &str) -> Vec<ClaseOrden> {
    let minus = orden.to_lowercase();
    let palabras = palabras_orden(orden);
    let tiene = |lista: &[&str]| palabras.iter().any(|p| lista.contains(&p.as_str()));

    let mut clases = Vec::new();

    // Borrar
    const BORRAR: &[&str] = &[
        "rm", "rmdir", "unlink", "shred", "srm", "del", "erase", "rd", "dd", "truncate",
        "wipefs", "format", "trash", "remove-item", "clear-content", "diskpart",
    ];
    if tiene(BORRAR)
        || palabras.iter().any(|p| p.starts_with("mkfs") || p.starts_with("newfs"))
        || (palabras.iter().any(|p| p == "diskutil") && minus.contains("erase"))
        || (palabras.iter().any(|p| p == "find") && minus.contains("-delete"))
        || (palabras.iter().any(|p| p == "git") && (minus.contains("clean") || minus.contains("reset --hard")))
        || sobrescribe_archivo(orden)
    {
        clases.push(ClaseOrden::Borrar);
    }

    // Sistema
    const SISTEMA: &[&str] = &[
        "sudo", "su", "doas", "runas", "defaults", "systemsetup", "networksetup", "scutil",
        "pmset", "launchctl", "csrutil", "spctl", "nvram", "tccutil", "kextload", "kmutil",
        "softwareupdate", "crontab", "chmod", "chown", "chflags", "chattr", "xattr", "sysctl",
        "reg", "regedit", "netsh", "sc", "bcdedit", "schtasks", "setx", "systemctl", "service",
        "ufw", "iptables", "nft", "firewall-cmd", "mount", "umount", "shutdown", "reboot",
        "halt", "poweroff", "kill", "killall", "pkill", "taskkill", "dscl", "profiles",
        "set-executionpolicy", "set-itemproperty", "new-itemproperty", "stop-process",
        "gsettings", "dconf", "visudo", "usermod", "useradd", "userdel", "passwd",
    ];
    if tiene(SISTEMA) {
        clases.push(ClaseOrden::Sistema);
    }

    // Credenciales
    const CREDENCIALES_ORDENES: &[&str] = &[
        "security", "ssh-keygen", "ssh-add", "gpg", "gpg2", "keytool", "cmdkey", "pass",
        "keyring", "secret-tool",
    ];
    const CREDENCIALES_RUTAS: &[&str] = &[
        ".ssh", "id_rsa", "id_ed25519", "id_ecdsa", ".gnupg", ".aws", ".azure", ".kube",
        ".docker/config", ".netrc", ".npmrc", ".pypirc", ".git-credentials", ".env",
        "keychain", "credentials", "password", "passwd", "shadow", "token", "secret",
        "cookies", "login data", "wallet", ".hermes", ".starseed/env", ".oci", "1password",
        "bitwarden", "keepass",
    ];
    if tiene(CREDENCIALES_ORDENES) || CREDENCIALES_RUTAS.iter().any(|r| minus.contains(r)) {
        clases.push(ClaseOrden::Credenciales);
    }

    // Mensajes (envía datos fuera)
    const MENSAJES: &[&str] = &[
        "mail", "mailx", "sendmail", "msmtp", "ssh", "scp", "sftp", "rsync", "nc", "ncat",
        "netcat", "socat", "telnet", "ftp", "tftp", "smbclient", "gh", "send-mailmessage",
        "invoke-webrequest", "invoke-restmethod", "iwr", "irm",
    ];
    let crudas: Vec<&str> = orden.split_whitespace().collect();
    let curl_envia = palabras.iter().any(|p| p == "curl")
        && crudas.iter().any(|p| {
            matches!(
                *p,
                "-d" | "--data" | "--data-binary" | "--data-raw" | "--data-urlencode"
                    | "-F" | "--form" | "-T" | "--upload-file" | "--json"
            ) || p.starts_with("--data") || p.starts_with("-d")
        })
        || (palabras.iter().any(|p| p == "curl")
            && (minus.contains("-x post")
                || minus.contains("-x put")
                || minus.contains("-xpost")
                || minus.contains("--request post")
                || minus.contains("-x delete")));
    let wget_envia = palabras.iter().any(|p| p == "wget") && minus.contains("--post");
    let git_envia = palabras.iter().any(|p| p == "git")
        && palabras.iter().any(|p| p == "push" || p == "send-email");
    if tiene(MENSAJES) || curl_envia || wget_envia || git_envia {
        clases.push(ClaseOrden::Mensajes);
    }

    // Instalar
    const INSTALAR: &[&str] = &[
        "brew", "port", "apt", "apt-get", "dpkg", "dnf", "yum", "rpm", "pacman", "zypper",
        "snap", "flatpak", "installer", "msiexec", "winget", "choco", "scoop", "add-appxpackage",
        "pkgutil",
    ];
    let gestor_instala = |gestor: &str, verbos: &[&str]| {
        palabras.windows(2).any(|par| par[0] == gestor && verbos.contains(&par[1].as_str()))
            || (palabras.iter().any(|p| p == gestor)
                && palabras.iter().any(|p| p == "-g" || p == "--global")
                && gestor.ends_with("npm"))
    };
    let descarga_y_ejecuta = (minus.contains("curl") || minus.contains("wget") || minus.contains("iwr"))
        && palabras.iter().any(|p| OPACA.contains(&p.as_str()) && p != "xargs");
    if tiene(INSTALAR)
        || gestor_instala("pip", &["install"])
        || gestor_instala("pip3", &["install"])
        || gestor_instala("npm", &["install", "i", "add", "ci"])
        || gestor_instala("pnpm", &["install", "i", "add"])
        || gestor_instala("yarn", &["add", "install"])
        || gestor_instala("cargo", &["install"])
        || gestor_instala("gem", &["install"])
        || gestor_instala("go", &["install"])
        || (palabras.iter().any(|p| p == "hdiutil") && minus.contains("attach"))
        || (palabras.iter().any(|p| p == "open") && (minus.contains(".pkg") || minus.contains(".dmg") || minus.contains(".app")))
        || (palabras.iter().any(|p| p == "start-process") && minus.contains(".exe"))
        || descarga_y_ejecuta
    {
        clases.push(ClaseOrden::Instalar);
    }

    // Opaca
    const OPACA: &[&str] = &[
        "eval", "exec", "source", "iex", "invoke-expression", "osascript", "xargs", "sh",
        "bash", "zsh", "fish", "dash", "ksh", "cmd", "powershell", "pwsh",
    ];
    const INTERPRETES: &[&str] = &[
        "python", "python3", "python2", "node", "deno", "bun", "perl", "ruby", "php", "lua",
        "osascript", "powershell", "pwsh",
    ];
    let interprete_en_linea = palabras.windows(2).any(|par| {
        INTERPRETES.contains(&par[0].as_str())
            && matches!(
                par[1].as_str(),
                "-c" | "-e" | "--eval" | "-command" | "-encodedcommand" | "-enc" | "-ec" | "-p" | "-"
            )
    });
    if tiene(OPACA)
        || interprete_en_linea
        || orden.contains('`')
        || orden.contains("$(")
        || minus.contains("base64 -d")
        || minus.contains("base64 --decode")
        || minus.contains("frombase64string")
    {
        clases.push(ClaseOrden::Opaca);
    }

    clases.sort();
    clases.dedup();
    clases
}

/// Extrae las palabras de una orden: separadas por espacios y operadores de shell,
/// en minúsculas, sin comillas y con la ruta quitada de los programas.
fn palabras_orden(orden: &str) -> Vec<String> {
    let mut v = Vec::new();
    for crudo in orden.split(|c: char| {
        c.is_whitespace() || matches!(c, ';' | '|' | '&' | '(' | ')' | '{' | '}' | '`' | '\n')
    }) {
        let p = crudo
            .trim_matches(|c: char| matches!(c, '"' | '\'' | '\\' | '$' | '<' | '>'))
            .to_lowercase();
        if p.is_empty() {
            continue;
        }
        let base = p
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or(&p)
            .trim_end_matches(".exe")
            .to_string();
        v.push(base);
    }
    v
}

/// Detecta si hay una redirección que sobrescribe un archivo (`> x`, sin `>>`, `2>`, `&>` ni `/dev/null`).
fn sobrescribe_archivo(orden: &str) -> bool {
    let b = orden.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'>' {
            let antes = if i > 0 { b[i - 1] } else { b' ' };
            let despues = b.get(i + 1).copied().unwrap_or(b' ');
            if despues == b'>' {
                i += 2;
                continue;
            }
            if antes == b'>' || antes == b'&' || antes.is_ascii_digit() || despues == b'&' {
                i += 1;
                continue;
            }
            let resto = orden[i + 1..].trim_start();
            let destino: String = resto.chars().take_while(|c| !c.is_whitespace() && !matches!(c, ';' | '|' | '&')).collect();
            if !destino.is_empty() && destino != "/dev/null" && !destino.eq_ignore_ascii_case("nul") {
                return true;
            }
        }
        i += 1;
    }
    false
}

/// Resultado de ejecutar una orden de terminal (para la web).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultadoTerminal {
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,
    pub success: bool,
    /// `true` si la salida se truncó por el límite.
    pub truncada: bool,
    /// `true` si el proceso se mató por tiempo.
    pub tiempo_agotado: bool,
}

/// Parámetros para ejecutar una orden de terminal remota.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EjecutarParams {
    pub orden: String,
    pub nivel: NivelTerminal,
    pub limites: Option<LimitesTerminal>,
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn nivel_usuario_permite_ordenes_simples() {
        let d = decidir_orden("ls -la", NivelTerminal::Usuario, LimitesTerminal::default());
        assert!(d.permite);
        assert!(d.clases.is_empty());
        assert_eq!(d.nivel_requerido, NivelTerminal::Usuario);
    }

    #[test]
    fn nivel_usuario_rechaza_orden_con_riesgo() {
        let d = decidir_orden("rm -rf /tmp", NivelTerminal::Usuario, LimitesTerminal::default());
        assert!(!d.permite);
        assert!(d.clases.contains(&ClaseOrden::Borrar));
        assert_eq!(d.nivel_requerido, NivelTerminal::Administrador);
        assert!(d.motivo.is_some());
    }

    #[test]
    fn nivel_administrador_permite_todo() {
        let d = decidir_orden("rm -rf /tmp", NivelTerminal::Administrador, LimitesTerminal::default());
        assert!(d.permite);
        assert!(d.clases.contains(&ClaseOrden::Borrar));
        assert_eq!(d.nivel_requerido, NivelTerminal::Administrador);
    }

    #[test]
    fn orden_vacia_se_rechaza() {
        let d = decidir_orden("", NivelTerminal::Usuario, LimitesTerminal::default());
        assert!(!d.permite);
        assert!(d.motivo.as_ref().unwrap().contains("vacía"));
    }

    #[test]
    fn orden_muy_larga_se_rechaza() {
        let larga = "a".repeat(9000);
        let d = decidir_orden(&larga, NivelTerminal::Usuario, LimitesTerminal::default());
        assert!(!d.permite);
        assert!(d.motivo.as_ref().unwrap().contains("pasa de"));
    }

    #[test]
    fn clasificar_detecta_borrar() {
        let c = clasificar_orden("rm -rf ~/Documents");
        assert!(c.contains(&ClaseOrden::Borrar));
    }

    #[test]
    fn clasificar_detecta_sistema() {
        let c = clasificar_orden("sudo ls");
        assert!(c.contains(&ClaseOrden::Sistema));
    }

    #[test]
    fn clasificar_detecta_credenciales() {
        let c = clasificar_orden("cat ~/.ssh/id_ed25519");
        assert!(c.contains(&ClaseOrden::Credenciales));
    }

    #[test]
    fn clasificar_detecta_mensajes() {
        let c = clasificar_orden("curl -d @datos.json https://x.example");
        assert!(c.contains(&ClaseOrden::Mensajes));
    }

    #[test]
    fn clasificar_detecta_instalar() {
        let c = clasificar_orden("brew install x");
        assert!(c.contains(&ClaseOrden::Instalar));
    }

    #[test]
    fn clasificar_detecta_opaca() {
        let c = clasificar_orden("eval \"$X\"");
        assert!(c.contains(&ClaseOrden::Opaca));
    }

    #[test]
    fn clasificar_orden_simple_sin_clases() {
        let c = clasificar_orden("ls -la ~/Documents");
        assert!(c.is_empty());
    }

    #[test]
    fn nivel_valido() {
        assert!(NivelTerminal::valido("usuario"));
        assert!(NivelTerminal::valido("administrador"));
        assert!(!NivelTerminal::valido("root"));
        assert!(!NivelTerminal::valido(""));
    }

    #[test]
    fn decision_terminal_serializa() {
        let d = DecisionTerminal {
            permite: true,
            clases: vec![],
            motivo: None,
            nivel_requerido: NivelTerminal::Usuario,
        };
        let json = serde_json::to_string(&d).unwrap();
        assert!(json.contains("\"permite\":true"));
        assert!(json.contains("\"nivel_requerido\":\"usuario\""));
    }
}