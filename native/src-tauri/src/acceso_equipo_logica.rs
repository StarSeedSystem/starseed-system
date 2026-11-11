//! (SEG1111U) «Acceso al equipo»: la concesión que la persona da EN este aparato, con un diálogo nativo,
//! para que StarSeed OS pueda ejecutar programas (la terminal de `run_terminal`, abrir el instalador de
//! Ollama). Aquí solo la lógica pura —estado guardado, puerta del diálogo, quién puede pedir y usar,
//! qué órdenes se confirman una a una y el registro encadenado—, probada sin Tauri. El pegamento
//! (diálogo, indicador en la barra de menús/bandeja, archivos) está en `acceso_equipo.rs`.
//! Contrato: architecture/permisos-y-control-del-dispositivo.md §4.8.

use serde::{Deserialize, Serialize};

/// Versión del archivo de la concesión. Otra versión (o un archivo ilegible) = apagado.
pub const VERSION: u32 = 1;
/// Archivo de la concesión, en la carpeta de configuración de la app (nunca en el almacenamiento web).
pub const ARCHIVO: &str = "acceso-equipo.json";
/// Registro de solo-añadir de lo que se pidió, concedió, ejecutó y rechazó.
pub const REGISTRO: &str = "acceso-equipo.log";
/// Tras un «no», durante este tiempo no se vuelve a preguntar (una página no puede insistir).
pub const ESPERA_TRAS_NO_MS: u64 = 30_000;
/// Tope de una orden de terminal (caracteres). Más larga, se rechaza sin preguntar.
pub const MAX_ORDEN: usize = 8_000;
/// Lo que se apunta de una orden en el registro (caracteres).
pub const MAX_ORDEN_REGISTRO: usize = 2_000;
/// Lo que se enseña de una orden en el diálogo de confirmación (caracteres).
pub const MAX_ORDEN_DIALOGO: usize = 600;
/// Lo que se enseña del motivo que da la página (caracteres).
pub const MAX_MOTIVO: usize = 120;
/// Primer «anterior» de la cadena del registro.
pub const INICIO_CADENA: &str = "inicio";

/// Lo que se guarda en `acceso-equipo.json`. Solo `acceso_equipo::pedir` lo enciende (tras el «sí» del
/// diálogo nativo); la web no puede pasar el valor: ningún comando lo acepta por argumento.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Default)]
pub struct Concesion {
    pub version: u32,
    pub activo: bool,
    /// Cuándo se concedió (ms desde 1970, reloj de pared).
    pub desde_ms: u64,
    /// Origen de la página que la pidió (para el registro y el menú).
    pub origen: String,
}

impl Concesion {
    /// Lee el archivo. Sin archivo, ilegible, de otra versión o a medias: APAGADO (falla cerrado).
    pub fn leer(texto: Option<&str>) -> Concesion {
        let Some(t) = texto else { return Concesion::default() };
        match serde_json::from_str::<Concesion>(t) {
            Ok(c) if c.version == VERSION && c.activo => c,
            _ => Concesion::default(),
        }
    }

    pub fn a_texto(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".into())
    }

    fn concedida(desde_ms: u64, origen: &str) -> Concesion {
        Concesion { version: VERSION, activo: true, desde_ms, origen: origen.to_string() }
    }

    fn apagada() -> Concesion {
        Concesion { version: VERSION, activo: false, desde_ms: 0, origen: String::new() }
    }
}

/// Dónde vive la concesión. En la app, un archivo; en las pruebas, memoria.
pub trait Almacen {
    fn leer(&self) -> Option<String>;
    fn escribir(&mut self, texto: &str) -> Result<(), String>;
}

/// Por qué se rechaza algo. El código (`acceso:…`) va al principio del error que ve la web, para que
/// `src/lib/nativa/acceso-equipo.ts` sepa ofrecer el diálogo en vez de enseñar un error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rechazo {
    /// Esta app o este sistema no ejecutan programas desde la web (Nexus, Café, Android, iOS).
    NoAplica,
    /// No es la ventana principal.
    Ventana,
    /// La página no es la web de StarSeed OS ni su servidor local.
    Origen,
    /// La persona no ha dado «acceso al equipo» en este aparato (o lo quitó).
    SinConcesion,
    /// No se puede enseñar el aviso en la barra de menús/bandeja: sin aviso visible, no hay acceso.
    SinIndicador,
    /// Ya hay un diálogo de StarSeed abierto esperando a la persona.
    Pendiente,
    /// La persona dijo que no hace poco: faltan estos ms para volver a preguntar.
    Espera(u64),
    /// La persona no confirmó esta orden.
    NoConfirmado,
    /// Orden vacía o demasiado larga.
    Orden,
}

impl Rechazo {
    pub fn codigo(&self) -> String {
        match self {
            Rechazo::NoAplica => "no-aplica".into(),
            Rechazo::Ventana => "ventana".into(),
            Rechazo::Origen => "origen".into(),
            Rechazo::SinConcesion => "sin-concesion".into(),
            Rechazo::SinIndicador => "sin-indicador".into(),
            Rechazo::Pendiente => "pendiente".into(),
            Rechazo::Espera(ms) => format!("espera-{}", ms.div_ceil(1000)),
            Rechazo::NoConfirmado => "no-confirmado".into(),
            Rechazo::Orden => "orden".into(),
        }
    }

    /// «acceso:<código> · <frase para una persona>».
    pub fn mensaje(&self) -> String {
        let frase = match self {
            Rechazo::NoAplica => "en esta app o en este sistema StarSeed no ejecuta programas".to_string(),
            Rechazo::Ventana => "solo la ventana principal de StarSeed OS puede hacerlo".to_string(),
            Rechazo::Origen => "solo la web de StarSeed OS o su servidor local pueden pedirlo".to_string(),
            Rechazo::SinConcesion => {
                "hace falta «acceso al equipo» en esta neurona: se da una vez en un diálogo del sistema y se quita desde el icono de StarSeed en la barra de menús o la bandeja".to_string()
            }
            Rechazo::SinIndicador => "este sistema no puede enseñar el aviso de «acceso al equipo» en la barra de menús o la bandeja, y sin aviso visible no se concede".to_string(),
            Rechazo::Pendiente => "ya hay un diálogo de StarSeed esperando tu respuesta".to_string(),
            Rechazo::Espera(ms) => format!("dijiste que no hace un momento; se podrá volver a preguntar en {} s", ms.div_ceil(1000)),
            Rechazo::NoConfirmado => "no confirmaste esta orden en el diálogo del sistema: no se ejecutó".to_string(),
            Rechazo::Orden => format!("la orden está vacía o pasa de {MAX_ORDEN} caracteres"),
        };
        format!("acceso:{} · {frase}", self.codigo())
    }
}

/// Orígenes que pueden pedir y usar «acceso al equipo»: la web publicada de StarSeed OS y los diez
/// puertos de su servidor local. Las webs hermanas (Nexus, Café) no. Es la MISMA lista que la de
/// prestar ventana (`prestamo_ventana_logica::origen_puede_prestar`) y que `capabilities/acceso-equipo.json`.
pub fn origen_permitido(origen: &str) -> bool {
    crate::prestamo_ventana_logica::origen_puede_prestar(origen)
}

/// La puerta de cada uso: ventana principal, origen propio, concesión encendida y aviso visible.
pub fn autorizar(c: &Concesion, ventana: &str, origen: &str, indicador_visible: bool) -> Result<(), Rechazo> {
    if ventana != "main" {
        return Err(Rechazo::Ventana);
    }
    if !origen_permitido(origen) {
        return Err(Rechazo::Origen);
    }
    if !(c.activo && c.version == VERSION) {
        return Err(Rechazo::SinConcesion);
    }
    if !indicador_visible {
        return Err(Rechazo::SinIndicador);
    }
    Ok(())
}

/// Un diálogo a la vez y, tras un «no», un rato sin volver a preguntar. En memoria (por proceso).
#[derive(Debug, Default)]
pub struct Puerta {
    abierta: bool,
    ultimo_no: Option<u64>,
}

impl Puerta {
    pub fn empezar(&mut self, ahora: u64) -> Result<(), Rechazo> {
        if self.abierta {
            return Err(Rechazo::Pendiente);
        }
        if let Some(t) = self.ultimo_no {
            let pasado = ahora.saturating_sub(t);
            if pasado < ESPERA_TRAS_NO_MS {
                return Err(Rechazo::Espera(ESPERA_TRAS_NO_MS - pasado));
            }
        }
        self.abierta = true;
        Ok(())
    }

    pub fn terminar(&mut self, si: bool, ahora: u64) {
        self.abierta = false;
        if !si {
            self.ultimo_no = Some(ahora);
        }
    }
}

/// El ÚNICO camino que enciende la concesión: origen propio, ventana principal, la puerta libre y el
/// «sí» del diálogo nativo (`dialogo`, que en la app enseña `tauri-plugin-dialog` y solo devuelve lo
/// que pulsó la persona). `origen_tras` es el origen de la página al cerrarse el diálogo: si navegó
/// mientras tanto, no se concede. Devuelve la concesión resultante.
pub fn pedir(
    almacen: &mut dyn Almacen,
    puerta: &mut Puerta,
    ventana: &str,
    origen: &str,
    ahora_pared_ms: u64,
    ahora_mono_ms: u64,
    dialogo: impl FnOnce() -> (bool, String),
) -> Result<Concesion, Rechazo> {
    if ventana != "main" {
        return Err(Rechazo::Ventana);
    }
    if !origen_permitido(origen) {
        return Err(Rechazo::Origen);
    }
    let actual = Concesion::leer(almacen.leer().as_deref());
    if actual.activo {
        return Ok(actual);
    }
    puerta.empezar(ahora_mono_ms)?;
    let (si, origen_tras) = dialogo();
    let si = si && origen_tras == origen;
    puerta.terminar(si, ahora_mono_ms);
    if !si {
        return Err(Rechazo::NoConfirmado);
    }
    let nueva = Concesion::concedida(ahora_pared_ms, origen);
    almacen.escribir(&nueva.a_texto()).map_err(|_| Rechazo::SinConcesion)?;
    Ok(nueva)
}

/// Quita la concesión (la persona desde el menú, o la página: quitar siempre se puede).
pub fn revocar(almacen: &mut dyn Almacen) -> Result<bool, String> {
    let habia = Concesion::leer(almacen.leer().as_deref()).activo;
    almacen.escribir(&Concesion::apagada().a_texto())?;
    Ok(habia)
}

// ─────────────────────────── Órdenes que se confirman una a una ───────────────────────────

/// Clases de §4 regla 4 que se pueden reconocer EN UNA LÍNEA DE ÓRDENES, más «opaca»: una orden que
/// construye o descifra otra al ejecutarse no se puede leer de antemano, así que también se confirma.
/// Los pagos NO se reconocen desde una línea de órdenes (no hay palabra que los delate): no se finge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Clase {
    Borrar,
    Sistema,
    Credenciales,
    Mensajes,
    Instalar,
    Opaca,
}

impl Clase {
    pub fn texto(&self) -> &'static str {
        match self {
            Clase::Borrar => "borra o sobrescribe datos",
            Clase::Sistema => "cambia ajustes del sistema, permisos o procesos (o pide privilegios)",
            Clase::Credenciales => "toca contraseñas, claves o credenciales",
            Clase::Mensajes => "envía datos o mensajes fuera de este aparato",
            Clase::Instalar => "instala software",
            Clase::Opaca => "construye o descifra otra orden al ejecutarse: no se puede saber de antemano qué hará",
        }
    }
}

const BORRAR: &[&str] = &[
    "rm", "rmdir", "unlink", "shred", "srm", "del", "erase", "rd", "dd", "truncate", "wipefs", "format", "trash",
    "remove-item", "clear-content", "diskpart",
];
const SISTEMA: &[&str] = &[
    "sudo", "su", "doas", "runas", "defaults", "systemsetup", "networksetup", "scutil", "pmset", "launchctl", "csrutil",
    "spctl", "nvram", "tccutil", "kextload", "kmutil", "softwareupdate", "crontab", "chmod", "chown", "chflags", "chattr",
    "xattr", "sysctl", "reg", "regedit", "netsh", "sc", "bcdedit", "schtasks", "setx", "systemctl", "service", "ufw",
    "iptables", "nft", "firewall-cmd", "mount", "umount", "shutdown", "reboot", "halt", "poweroff", "kill", "killall",
    "pkill", "taskkill", "dscl", "profiles", "set-executionpolicy", "set-itemproperty", "new-itemproperty", "stop-process",
    "gsettings", "dconf", "visudo", "usermod", "useradd", "userdel", "passwd",
];
const CREDENCIALES_ORDENES: &[&str] = &["security", "ssh-keygen", "ssh-add", "gpg", "gpg2", "keytool", "cmdkey", "pass", "keyring", "secret-tool"];
const CREDENCIALES_RUTAS: &[&str] = &[
    ".ssh", "id_rsa", "id_ed25519", "id_ecdsa", ".gnupg", ".aws", ".azure", ".kube", ".docker/config", ".netrc", ".npmrc",
    ".pypirc", ".git-credentials", ".env", "keychain", "credentials", "password", "passwd", "shadow", "token", "secret",
    "cookies", "login data", "wallet", ".hermes", ".starseed/env", ".oci", "1password", "bitwarden", "keepass",
];
const MENSAJES: &[&str] = &[
    "mail", "mailx", "sendmail", "msmtp", "ssh", "scp", "sftp", "rsync", "nc", "ncat", "netcat", "socat", "telnet", "ftp",
    "tftp", "smbclient", "gh", "send-mailmessage", "invoke-webrequest", "invoke-restmethod", "iwr", "irm",
];
const INSTALAR: &[&str] = &[
    "brew", "port", "apt", "apt-get", "dpkg", "dnf", "yum", "rpm", "pacman", "zypper", "snap", "flatpak", "installer",
    "msiexec", "winget", "choco", "scoop", "add-appxpackage", "pkgutil",
];
const OPACA: &[&str] = &["eval", "exec", "source", "iex", "invoke-expression", "osascript", "xargs", "sh", "bash", "zsh", "fish", "dash", "ksh", "cmd", "powershell", "pwsh"];
const INTERPRETES: &[&str] = &["python", "python3", "python2", "node", "deno", "bun", "perl", "ruby", "php", "lua", "osascript", "powershell", "pwsh"];

/// Las palabras de una orden: separadas por espacios y por los operadores de la shell, en minúsculas,
/// sin comillas y con la ruta quitada de los programas (`/bin/rm` → `rm`).
fn palabras(orden: &str) -> Vec<String> {
    let mut v = Vec::new();
    for crudo in orden.split(|c: char| c.is_whitespace() || matches!(c, ';' | '|' | '&' | '(' | ')' | '{' | '}' | '`' | '\n')) {
        let p = crudo.trim_matches(|c: char| matches!(c, '"' | '\'' | '\\' | '$' | '<' | '>')).to_lowercase();
        if p.is_empty() {
            continue;
        }
        let base = p.rsplit(['/', '\\']).next().unwrap_or(&p).trim_end_matches(".exe").to_string();
        v.push(base);
    }
    v
}

/// ¿Hay una redirección que sobrescribe un archivo (`> x`, sin `>>`, `2>`, `&>` ni `/dev/null`)?
fn sobrescribe(orden: &str) -> bool {
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

/// Qué clases de «confirmar cada vez» se reconocen en `orden`. Vacío = no se reconoce ninguna (lo que
/// NO quiere decir que sea inofensiva: el reconocimiento es por palabras y una orden puede disfrazarse;
/// por eso lo que se construye al ejecutarse cuenta como «opaca»). Ver contrato §4.8.
pub fn clasificar(orden: &str) -> Vec<Clase> {
    let minus = orden.to_lowercase();
    let w = palabras(orden);
    let tiene = |lista: &[&str]| w.iter().any(|p| lista.contains(&p.as_str()));
    let mut c = Vec::new();

    if tiene(BORRAR)
        || w.iter().any(|p| p.starts_with("mkfs") || p.starts_with("newfs"))
        || (w.iter().any(|p| p == "diskutil") && minus.contains("erase"))
        || (w.iter().any(|p| p == "find") && minus.contains("-delete"))
        || (w.iter().any(|p| p == "git") && (minus.contains("clean") || minus.contains("reset --hard")))
        || sobrescribe(orden)
    {
        c.push(Clase::Borrar);
    }
    if tiene(SISTEMA) {
        c.push(Clase::Sistema);
    }
    if tiene(CREDENCIALES_ORDENES) || CREDENCIALES_RUTAS.iter().any(|r| minus.contains(r)) {
        c.push(Clase::Credenciales);
    }
    // Las opciones de curl distinguen mayúsculas (-f «falla» ≠ -F «formulario»): se miran sin pasar a minúsculas.
    let crudas: Vec<&str> = orden.split_whitespace().collect();
    let curl_envia = w.iter().any(|p| p == "curl")
        && crudas.iter().any(|p| {
            matches!(*p, "-d" | "--data" | "--data-binary" | "--data-raw" | "--data-urlencode" | "-F" | "--form" | "-T" | "--upload-file" | "--json")
                || p.starts_with("--data")
                || p.starts_with("-d")
        })
        || (w.iter().any(|p| p == "curl") && (minus.contains("-x post") || minus.contains("-x put") || minus.contains("-xpost") || minus.contains("--request post") || minus.contains("-x delete")));
    let wget_envia = w.iter().any(|p| p == "wget") && minus.contains("--post");
    let git_envia = w.iter().any(|p| p == "git") && w.iter().any(|p| p == "push" || p == "send-email");
    if tiene(MENSAJES) || curl_envia || wget_envia || git_envia {
        c.push(Clase::Mensajes);
    }
    let gestor_instala = |gestor: &str, verbos: &[&str]| {
        w.windows(2).any(|par| par[0] == gestor && verbos.contains(&par[1].as_str()))
            || (w.iter().any(|p| p == gestor) && w.iter().any(|p| p == "-g" || p == "--global") && gestor.ends_with("npm"))
    };
    let descarga_y_ejecuta = (minus.contains("curl") || minus.contains("wget") || minus.contains("iwr")) && w.iter().any(|p| OPACA.contains(&p.as_str()) && p != "xargs");
    if tiene(INSTALAR)
        || gestor_instala("pip", &["install"])
        || gestor_instala("pip3", &["install"])
        || gestor_instala("npm", &["install", "i", "add", "ci"])
        || gestor_instala("pnpm", &["install", "i", "add"])
        || gestor_instala("yarn", &["add", "install"])
        || gestor_instala("cargo", &["install"])
        || gestor_instala("gem", &["install"])
        || gestor_instala("go", &["install"])
        || (w.iter().any(|p| p == "hdiutil") && minus.contains("attach"))
        || (w.iter().any(|p| p == "open") && (minus.contains(".pkg") || minus.contains(".dmg") || minus.contains(".app")))
        || (w.iter().any(|p| p == "start-process") && minus.contains(".exe"))
        || descarga_y_ejecuta
    {
        c.push(Clase::Instalar);
    }
    let interprete_en_linea = w.windows(2).any(|par| {
        INTERPRETES.contains(&par[0].as_str())
            && matches!(par[1].as_str(), "-c" | "-e" | "--eval" | "-command" | "-encodedcommand" | "-enc" | "-ec" | "-p" | "-")
    });
    if tiene(OPACA)
        || interprete_en_linea
        || orden.contains('`')
        || orden.contains("$(")
        || minus.contains("base64 -d")
        || minus.contains("base64 --decode")
        || minus.contains("frombase64string")
    {
        c.push(Clase::Opaca);
    }
    c.sort();
    c.dedup();
    c
}

fn limpiar(t: &str, max: usize) -> String {
    let s: String = t.chars().map(|c| if c.is_control() && c != '\n' { ' ' } else { c }).collect();
    let mut r: String = s.chars().take(max).collect();
    if s.chars().count() > max {
        r.push('…');
    }
    r.trim().to_string()
}

/// El motivo que da la página, tal como se enseña: sin caracteres de control y acotado.
pub fn limpiar_motivo(m: &str) -> String {
    limpiar(&m.replace('\n', " "), MAX_MOTIVO)
}

/// Texto del diálogo que concede «acceso al equipo».
pub fn texto_concesion(motivo: &str, sistema_bandeja: &str) -> String {
    let motivo = limpiar_motivo(motivo);
    let para = if motivo.is_empty() { String::new() } else { format!("Para: «{motivo}» (lo dice la página).\n\n") };
    format!(
        "{para}StarSeed OS pide ACCESO AL EQUIPO en esta neurona (solo en este aparato).\n\n\
         Con él podrá ejecutar órdenes de terminal con tus permisos de usuario y abrir instaladores que descargue. \
         Las órdenes que borran datos, cambian ajustes del sistema, tocan contraseñas o claves, envían datos fuera, \
         instalan software o no se pueden leer de antemano te las volverá a preguntar una a una. \
         Cada orden queda apuntada en un registro de este aparato.\n\n\
         Mientras esté dado verás «● Acceso al equipo» en {sistema_bandeja}; desde ahí lo quitas cuando quieras. \
         Sigue dado tras cerrar la app, hasta que lo quites.\n\n\
         Dalo solo si lo has pedido tú ahora."
    )
}

/// Texto del diálogo que confirma una orden concreta.
pub fn texto_confirmar(orden: &str, clases: &[Clase]) -> String {
    let lista: Vec<String> = clases.iter().map(|c| format!("· {}", c.texto())).collect();
    format!(
        "StarSeed OS quiere ejecutar en este aparato:\n\n{}\n\nEsta orden:\n{}\n\n¿La ejecutas?",
        limpiar(orden, MAX_ORDEN_DIALOGO),
        lista.join("\n")
    )
}

// ─────────────────────────── Registro encadenado ───────────────────────────

/// Una línea del registro de solo-añadir: JSON con hora, evento, origen, detalle, el hash de la línea
/// anterior (`ant`) y el suyo (`h` = sha256 de `ant|t|ev|origen|detalle`). Borrar o cambiar una línea
/// rompe la cadena desde ahí (`verificar_registro`).
pub fn linea_registro(anterior: &str, t: &str, evento: &str, origen: &str, detalle: &str) -> String {
    let detalle = limpiar(&detalle.replace('\n', " ⏎ "), MAX_ORDEN_REGISTRO);
    let evento = limpiar(evento, 60);
    let origen = limpiar(origen, 80);
    let h = hash_de(anterior, t, &evento, &origen, &detalle);
    serde_json::json!({ "t": t, "ev": evento, "origen": origen, "detalle": detalle, "ant": anterior, "h": h }).to_string()
}

fn hash_de(ant: &str, t: &str, ev: &str, origen: &str, detalle: &str) -> String {
    crate::sha256::hex(&crate::sha256::sha256(format!("{ant}|{t}|{ev}|{origen}|{detalle}").as_bytes()))
}

/// Hash de la última línea del registro (o `INICIO_CADENA` si está vacío o ilegible al final).
pub fn ultimo_hash(texto: &str) -> String {
    texto
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .and_then(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .and_then(|v| v.get("h").and_then(|h| h.as_str()).map(str::to_string))
        .unwrap_or_else(|| INICIO_CADENA.to_string())
}

/// Comprueba la cadena entera. Ok(líneas) o Err(número de la primera línea rota, desde 1).
pub fn verificar_registro(texto: &str) -> Result<usize, usize> {
    let mut ant = INICIO_CADENA.to_string();
    let mut n = 0;
    for (i, l) in texto.lines().enumerate().filter(|(_, l)| !l.trim().is_empty()) {
        let v: serde_json::Value = serde_json::from_str(l).map_err(|_| i + 1)?;
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        if s("ant") != ant || hash_de(&s("ant"), &s("t"), &s("ev"), &s("origen"), &s("detalle")) != s("h") {
            return Err(i + 1);
        }
        ant = s("h");
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[derive(Default)]
    struct Memoria(Option<String>);
    impl Almacen for Memoria {
        fn leer(&self) -> Option<String> {
            self.0.clone()
        }
        fn escribir(&mut self, t: &str) -> Result<(), String> {
            self.0 = Some(t.to_string());
            Ok(())
        }
    }

    const OS: &str = "https://starseed-os.vercel.app";
    const LOCAL: &str = "http://127.0.0.1:47613";

    #[test]
    fn apagada_de_fabrica_y_ante_cualquier_archivo_raro() {
        assert!(!Concesion::leer(None).activo);
        assert!(!Concesion::leer(Some("")).activo);
        assert!(!Concesion::leer(Some("{\"activo\":true}")).activo, "sin versión no vale");
        assert!(!Concesion::leer(Some("{\"version\":2,\"activo\":true,\"desde_ms\":1,\"origen\":\"x\"}")).activo);
        assert!(!Concesion::leer(Some("{\"version\":1,\"activo\":tru")).activo, "a medias = apagada");
        assert_eq!(autorizar(&Concesion::default(), "main", OS, true), Err(Rechazo::SinConcesion));
    }

    #[test]
    fn solo_el_si_del_dialogo_la_enciende() {
        let mut m = Memoria::default();
        let mut p = Puerta::default();
        // «No»: sigue apagada y no se escribe nada.
        assert_eq!(pedir(&mut m, &mut p, "main", OS, 1, 0, || (false, OS.into())), Err(Rechazo::NoConfirmado));
        assert!(m.0.is_none());
        // Tras un «no», 30 s sin volver a preguntar (el diálogo ni se abre).
        let mut abierto = false;
        let r = pedir(&mut m, &mut p, "main", OS, 2, 10_000, || {
            abierto = true;
            (true, OS.into())
        });
        assert!(matches!(r, Err(Rechazo::Espera(_))));
        assert!(!abierto);
        // «Sí», pero la página navegó a otro sitio mientras el diálogo estaba abierto: no.
        assert_eq!(pedir(&mut m, &mut p, "main", OS, 3, 40_000, || (true, "https://otra.example".into())), Err(Rechazo::NoConfirmado));
        // «Sí» del mismo origen: encendida y guardada.
        let c = pedir(&mut m, &mut p, "main", OS, 5, 80_000, || (true, OS.into())).unwrap();
        assert!(c.activo);
        assert_eq!(c.origen, OS);
        assert!(Concesion::leer(m.0.as_deref()).activo);
        assert_eq!(autorizar(&c, "main", OS, true), Ok(()));
        assert_eq!(autorizar(&c, "main", LOCAL, true), Ok(()));
    }

    #[test]
    fn ni_otra_ventana_ni_otro_origen_pueden_pedirla() {
        let mut m = Memoria::default();
        let mut p = Puerta::default();
        let mut abierto = false;
        for (v, o) in [
            ("main", "https://starseed-nexus.vercel.app"),
            ("main", "https://starseed-cafe.vercel.app"),
            ("main", "http://127.0.0.1:47620"),
            ("main", "https://starseed-os.vercel.app.evil.example"),
            ("main", "tauri://localhost"),
            ("migracion-origen", OS),
        ] {
            let r = pedir(&mut m, &mut p, v, o, 1, 0, || {
                abierto = true;
                (true, o.into())
            });
            assert!(r.is_err(), "{v} {o}");
        }
        assert!(!abierto, "el diálogo no se abre para nadie de fuera");
        assert!(m.0.is_none());
    }

    #[test]
    fn un_segundo_origen_no_la_usa_aunque_este_dada() {
        let c = Concesion::concedida(1, OS);
        assert_eq!(autorizar(&c, "main", "https://starseed-nexus.vercel.app", true), Err(Rechazo::Origen));
        assert_eq!(autorizar(&c, "main", "https://evil.example", true), Err(Rechazo::Origen));
        assert_eq!(autorizar(&c, "otra", OS, true), Err(Rechazo::Ventana));
        // Sin aviso visible en la barra de menús/bandeja, no se usa.
        assert_eq!(autorizar(&c, "main", OS, false), Err(Rechazo::SinIndicador));
    }

    #[test]
    fn se_quita_y_sobrevive_al_reinicio_solo_si_estaba_dada() {
        let mut m = Memoria::default();
        let mut p = Puerta::default();
        pedir(&mut m, &mut p, "main", OS, 7, 0, || (true, OS.into())).unwrap();
        // «Reinicio»: otro proceso lee el mismo archivo.
        let tras_reinicio = Concesion::leer(m.0.as_deref());
        assert!(tras_reinicio.activo);
        assert_eq!(tras_reinicio.desde_ms, 7);
        // Ya dada: pedirla otra vez no abre el diálogo.
        let mut abierto = false;
        pedir(&mut m, &mut p, "main", OS, 8, 1, || {
            abierto = true;
            (false, OS.into())
        })
        .unwrap();
        assert!(!abierto);
        assert_eq!(revocar(&mut m), Ok(true));
        assert!(!Concesion::leer(m.0.as_deref()).activo);
        assert_eq!(revocar(&mut m), Ok(false));
        // Tras quitarla, el «reinicio» la ve apagada.
        assert_eq!(autorizar(&Concesion::leer(m.0.as_deref()), "main", OS, true), Err(Rechazo::SinConcesion));
    }

    #[test]
    fn el_pegamento_no_tiene_otro_camino_para_encenderla() {
        // `Concesion::concedida` es privada de este módulo y solo la llama `pedir`. El pegamento no
        // construye una concesión encendida ni escribe el archivo por su cuenta.
        let pegamento = include_str!("acceso_equipo.rs");
        for prohibido in ["activo: true", "activo = true", "concedida(", "\"activo\":true"] {
            assert!(!pegamento.contains(prohibido), "acceso_equipo.rs contiene «{prohibido}»");
        }
        assert_eq!(pegamento.matches("l::pedir(").count(), 1);
        // Ningún comando recibe la concesión por argumento.
        for firma in pegamento.split("#[tauri::command]").skip(1) {
            let cabecera = firma.split('{').next().unwrap_or("");
            assert!(!cabecera.contains("activo") && !cabecera.contains("Concesion"), "{cabecera}");
        }
    }

    #[test]
    fn un_dialogo_a_la_vez() {
        let mut p = Puerta::default();
        p.empezar(0).unwrap();
        assert_eq!(p.empezar(1), Err(Rechazo::Pendiente));
        p.terminar(true, 2);
        assert!(p.empezar(3).is_ok());
    }

    #[test]
    fn mensajes_con_su_codigo() {
        assert!(Rechazo::SinConcesion.mensaje().starts_with("acceso:sin-concesion · "));
        assert!(Rechazo::Espera(12_300).mensaje().starts_with("acceso:espera-13 · "));
        assert!(Rechazo::NoConfirmado.mensaje().starts_with("acceso:no-confirmado"));
    }

    #[test]
    fn ordenes_que_se_confirman() {
        let c = |o: &str| clasificar(o);
        assert_eq!(c("ls -la ~/Documents"), vec![]);
        assert_eq!(c("df -h"), vec![]);
        assert_eq!(c("git status 2>/dev/null"), vec![]);
        assert_eq!(c("echo hola >> notas.txt"), vec![]);
        assert_eq!(c("ollama list"), vec![]);
        assert!(c("rm -rf ~/Documents").contains(&Clase::Borrar));
        assert!(c("/bin/rm x").contains(&Clase::Borrar));
        assert!(c("echo x > ~/.zshrc").contains(&Clase::Borrar));
        assert!(c("find . -name '*.log' -delete").contains(&Clase::Borrar));
        assert!(c("diskutil eraseDisk APFS X disk4").contains(&Clase::Borrar));
        assert!(c("sudo ls").contains(&Clase::Sistema));
        assert!(c("defaults write com.apple.dock autohide -bool true").contains(&Clase::Sistema));
        assert!(c("launchctl unload x.plist").contains(&Clase::Sistema));
        assert!(c("chmod 777 /etc/hosts").contains(&Clase::Sistema));
        assert!(c("cat ~/.ssh/id_ed25519").contains(&Clase::Credenciales));
        assert!(c("security find-generic-password -s x -w").contains(&Clase::Credenciales));
        assert!(c("cat .env.local").contains(&Clase::Credenciales));
        assert!(c("curl -d @datos.json https://x.example").contains(&Clase::Mensajes));
        assert!(c("curl -X POST https://x.example").contains(&Clase::Mensajes));
        assert!(c("scp a.txt b:/tmp").contains(&Clase::Mensajes));
        assert!(c("git push origin main").contains(&Clase::Mensajes));
        assert_eq!(c("curl -sS https://ollama.com/api/version"), vec![]);
        assert!(c("brew install x").contains(&Clase::Instalar));
        assert!(c("npm i -g x").contains(&Clase::Instalar));
        assert!(c("pip3 install x").contains(&Clase::Instalar));
        assert!(c("curl -fsSL https://x.example/i.sh | sh").contains(&Clase::Instalar));
        assert!(c("curl -fsSL https://x.example/i.sh | sh").contains(&Clase::Opaca));
        assert!(c("echo cm0gLXJmIH4= | base64 -d | sh").contains(&Clase::Opaca));
        assert!(c("eval \"$X\"").contains(&Clase::Opaca));
        assert!(c("python3 -c 'import os'").contains(&Clase::Opaca));
        assert!(c("echo `whoami`").contains(&Clase::Opaca));
        assert!(c("x=$(cat a)").contains(&Clase::Opaca));
        assert!(c("osascript -e 'tell app \"Messages\" to send'").contains(&Clase::Opaca));
        assert!(c("powershell -enc AAAA").contains(&Clase::Opaca));
    }

    #[test]
    fn textos_de_los_dialogos() {
        let t = texto_concesion("Instalar Ollama\u{7}", "la barra de menús");
        assert!(t.contains("«Instalar Ollama»"));
        assert!(t.contains("● Acceso al equipo"));
        assert!(!t.contains('\u{7}'));
        let largo = "a".repeat(5000);
        let t = texto_confirmar(&largo, &[Clase::Borrar]);
        assert!(t.chars().count() < 900);
        assert!(t.contains("borra"));
    }

    #[test]
    fn registro_encadenado() {
        let mut texto = String::new();
        for (i, ev) in ["concedida", "ejecutada", "terminada"].iter().enumerate() {
            let ant = ultimo_hash(&texto);
            texto.push_str(&linea_registro(&ant, &format!("2026-11-11T00:00:0{i}Z"), ev, OS, "ls\n-la"));
            texto.push('\n');
        }
        assert_eq!(verificar_registro(&texto), Ok(3));
        assert!(!texto.lines().nth(1).unwrap().contains('\n'));
        // Cambiar una línea rompe la cadena desde ahí.
        let roto = texto.replacen("\"ev\":\"ejecutada\"", "\"ev\":\"nada\"", 1);
        assert_eq!(verificar_registro(&roto), Err(2));
        // Quitar una línea también.
        let sin: Vec<&str> = texto.lines().collect();
        assert_eq!(verificar_registro(&format!("{}\n{}\n", sin[0], sin[2])), Err(2));
        assert_eq!(ultimo_hash(""), INICIO_CADENA);
    }
}
