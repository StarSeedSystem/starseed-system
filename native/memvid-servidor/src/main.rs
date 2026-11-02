use std::process::Command;

use tiny_http::{Request, Response, Server, Method, HeaderField};



const DEFAULT_MEMVID_DIR: &str = ".starseed/memvid";

fn get_memvid_dir() -> std::path::PathBuf {
    dirs::home_dir()
        .map(|p| p.join(DEFAULT_MEMVID_DIR))
        .unwrap_or_else(|| std::path::PathBuf::from(DEFAULT_MEMVID_DIR))
}

fn read_token() -> String {
    let token_path = get_memvid_dir().join("memvid.token");
    if token_path.exists() {
        std::fs::read_to_string(&token_path).unwrap_or_default().trim().to_string()
    } else {
        let token: String = (0..32)
            .map(|_| {
                let b = fastrand::u8(0x40..0x7e);
                char::from(b)
            })
            .collect();
        let _ = std::fs::create_dir_all(&get_memvid_dir());
        let mut f = std::fs::File::create(&token_path).expect("create token");
        use std::io::Write;
        write!(f, "{}", token.trim()).expect("write token");
        let _ = Command::new("chmod").args(["0600", token_path.to_str().unwrap()]).output();
        token
    }
}

fn get_header_value(req: &Request, name: &str) -> Option<String> {
    let hf = HeaderField::from_bytes(name.as_bytes()).unwrap();
    req.headers()
        .iter()
        .find(|h| h.field == hf)
        .map(|h| h.value.as_str().to_string())
}

fn main() {
    let port = std::env::var("STARSEED_MEMVID_PUERTO")
        .unwrap_or_else(|_| "4490".to_string())
        .parse::<u16>()
        .expect("STARSEED_MEMVID_PUERTO must be a u16");

    let addr = format!("127.0.0.1:{port}");
    let server = Server::http(&addr).expect("bind memvid servidor");

    let memvid_dir = get_memvid_dir();
    let _ = std::fs::create_dir_all(&memvid_dir);

    let token = read_token();

    println!("Memvid servidor listening on {addr}");
    println!("Token: {token}");

    for mut request in server.incoming_requests() {
        let path = request.url().to_string();
        let method = request.method();

        // Validate origin
        if !validate_origin(&request) {
            let _ = request.respond(Response::from_string("403 Forbidden: Origin").with_status_code(403));
            continue;
        }

        // Validate host
        if !validate_host(&request, port) {
            let _ = request.respond(Response::from_string("403 Forbidden: Host").with_status_code(403));
            continue;
        }

        // Validate token
        if !validate_token(&request) {
            let _ = request.respond(Response::from_string("403 Forbidden: Token").with_status_code(403));
            continue;
        }

        // /salud
        if path == "/salud" && *method == Method::Get {
            let _ = request.respond(Response::from_string(r#"{"status":"ok"}"#).with_status_code(200));
            continue;
        }

        // /capsulas/<nombre>/<accion>
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 4 && parts[1] == "capsulas" {
            let nombre = parts.get(2).copied().unwrap_or("");
            let accion = parts.get(3).copied().unwrap_or("");

            // Validate capsule name
            if !validate_capsula_name(nombre) {
                let _ = request.respond(Response::from_string("400 Bad Request: nombre de cápsula").with_status_code(400));
                continue;
            }

            let _ruta_capsula = get_memvid_dir().join(nombre);

            match accion {
                "poner" => {
                    if *method != Method::Post {
                        let _ = request.respond(Response::from_string("405 Method Not Allowed").with_status_code(405));
                        continue;
                    }
                    let mut body = String::new();
                    let _ = request.as_reader().read_to_string(&mut body);
                    let _ = request.respond(Response::from_string("{}").with_status_code(200));
                }
                "buscar" => {
                    if *method != Method::Post {
                        let _ = request.respond(Response::from_string("405 Method Not Allowed").with_status_code(405));
                        continue;
                    }
                    let mut body = String::new();
                    let _ = request.as_reader().read_to_string(&mut body);
                    let _ = request.respond(Response::from_string(r#"{"aciertos":[]}"#).with_status_code(200));
                }
                "estado" => {
                    if *method != Method::Get {
                        let _ = request.respond(Response::from_string("405 Method Not Allowed").with_status_code(405));
                        continue;
                    }
                    let _ = request.respond(
                        Response::from_string(r#"{"frames":0,"size_bytes":0,"capacity_bytes":52428800,"used_percent":0}"#)
                            .with_status_code(200),
                    );
                }
                "linea" => {
                    if *method != Method::Get {
                        let _ = request.respond(Response::from_string("405 Method Not Allowed").with_status_code(405));
                        continue;
                    }
                    let _ = request.respond(Response::from_string("[]").with_status_code(200));
                }
                _ => {
                    let _ = request.respond(Response::from_string("404 Not Found").with_status_code(404));
                }
            }
            continue;
        }

        let _ = request.respond(Response::from_string("404 Not Found").with_status_code(404));
    }
}

fn validate_origin(req: &Request) -> bool {
    let origin = get_header_value(req, "Origin");
    origin.map_or(true, |o| {
        o == "http://127.0.0.1:" || o == "http://localhost:" || o.ends_with(":4490")
    })
}

fn validate_host(req: &Request, port: u16) -> bool {
    let host = get_header_value(req, "Host");
    host.map_or(false, |h| {
        h == format!("127.0.0.1:{port}") || h == format!("localhost:{port}")
    })
}

fn validate_token(req: &Request) -> bool {
    let token = read_token();
    let request_token = get_header_value(req, "X-StarSeed-Token");
    request_token.map_or(false, |t| t == token)
}

fn validate_capsula_name(nombre: &str) -> bool {
    let ends_with_mv2e = nombre.ends_with(".mv2e");
    let ends_with_mv2 = nombre.ends_with(".mv2") && !ends_with_mv2e;

    if !ends_with_mv2 && !ends_with_mv2e {
        return false;
    }

    let core_part = if ends_with_mv2e {
        nombre.strip_suffix(".mv2e").unwrap_or(nombre)
    } else {
        nombre.strip_suffix(".mv2").unwrap_or(nombre)
    };

    if core_part.is_empty() {
        return false;
    }

    let valid_core = core_part.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');

    if nombre.contains('/') || nombre.contains("..") {
        return false;
    }

    valid_core && (ends_with_mv2e || ends_with_mv2)
}