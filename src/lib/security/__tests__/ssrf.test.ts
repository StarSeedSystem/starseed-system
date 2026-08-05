// StarSeed · Guarda anti-SSRF (src/lib/security/ssrf.ts) — tests de la
// CLASIFICACIÓN de IP (el núcleo de la defensa; donde vivió el bypass real de
// IPv6-mapeado corregido en la Adenda 130/131) y de otros helpers puros y
// deterministas (buildUrl, allowPrivate). NO se prueban `resolveAndPin` /
// `isBlocked` / `safeFetch` aquí: dependen de DNS/red real (getaddrinfo,
// undici) — fuera de alcance de un test unitario puro; ese comportamiento se
// mantiene cubierto por `scripts/test-ssrf.ts` (clasificación) y por la
// verificación manual/E2E documentada para los saltos de red.
import { afterEach, describe, expect, it } from "vitest";
import {
  BLOCKED_HOSTNAMES,
  allowPrivate,
  buildUrl,
  classifyIp,
  classifyIpv4,
  classifyIpv6,
  expandIpv6,
} from "@/lib/security/ssrf";

describe("classifyIpv4", () => {
  it("bloquea SIEMPRE los hosts de metadatos cloud (IMDS), sin importar allowPrivate", () => {
    expect(classifyIpv4("169.254.169.254")).toBe("always-blocked"); // AWS/GCP/Azure IMDS
    expect(classifyIpv4("100.100.100.200")).toBe("always-blocked"); // Alibaba/ECS IMDS
    expect(classifyIpv4("192.0.0.192")).toBe("always-blocked"); // Oracle IMDS (IANA 192.0.0.0/24)
  });

  it("clasifica como 'private' los rangos reservados (gated por allowPrivate)", () => {
    expect(classifyIpv4("127.0.0.1")).toBe("private"); // loopback
    expect(classifyIpv4("10.0.0.1")).toBe("private"); // 10/8
    expect(classifyIpv4("172.16.0.1")).toBe("private"); // 172.16/12
    expect(classifyIpv4("192.168.1.1")).toBe("private"); // 192.168/16
    expect(classifyIpv4("100.64.0.1")).toBe("private"); // CGNAT 100.64/10
  });

  it("respeta los límites EXACTOS de los rangos (público justo fuera del rango privado)", () => {
    expect(classifyIpv4("172.15.255.255")).toBe("public"); // justo por debajo de 172.16/12
    expect(classifyIpv4("172.32.0.1")).toBe("public"); // justo por encima
    expect(classifyIpv4("100.63.255.255")).toBe("public"); // justo por debajo de CGNAT
    expect(classifyIpv4("8.8.8.8")).toBe("public");
  });

  it("las IPv4 inválidas fallan CERRADO (always-blocked, no 'public' por defecto)", () => {
    expect(classifyIpv4("256.1.1.1")).toBe("always-blocked"); // octeto fuera de rango
    expect(classifyIpv4("1.2.3.4.5")).toBe("always-blocked"); // demasiados octetos
  });
});

describe("expandIpv6", () => {
  it("expande formas abreviadas y casos especiales", () => {
    expect(expandIpv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("expande la IPv4 embebida en punto (::ffff:a.b.c.d) a hexadecimal", () => {
    expect(expandIpv6("::ffff:169.254.169.254")).toEqual([0, 0, 0, 0, 0, 0xffff, 0xa9fe, 0xa9fe]);
  });

  it("devuelve null ante formas no parseables — fail-closed, sin truncar silenciosamente", () => {
    expect(expandIpv6("1::2::3")).toBeNull(); // doble "::" (ambiguo)
    expect(expandIpv6("gggg::")).toBeNull(); // grupo hex inválido
    expect(expandIpv6("::ffff:1.2.3.4.5")).toBeNull(); // dotted-quad mal formado
  });
});

describe("classifyIpv6", () => {
  it("el bypass histórico corregido: IPv4-mapped de IMDS bloquea SIEMPRE, en forma dotted o hex", () => {
    expect(classifyIpv6("::ffff:169.254.169.254")).toBe("always-blocked"); // el bug original de la Adenda 130
    expect(classifyIpv6("::ffff:a9fe:a9fe")).toBe("always-blocked"); // misma IP, forma hex normalizada por WHATWG
    expect(classifyIpv6("::ffff:10.0.0.1")).toBe("private"); // mapeado privado
  });

  it("clasifica direcciones IPv6 nativas", () => {
    expect(classifyIpv6("::1")).toBe("private"); // loopback
    expect(classifyIpv6("fe80::1")).toBe("always-blocked"); // link-local /10 (incl. IMDSv6)
    expect(classifyIpv6("fd00:ec2::254")).toBe("always-blocked"); // IMDSv6 de AWS
    expect(classifyIpv6("fc00::1")).toBe("private"); // unique-local fc00::/7
    expect(classifyIpv6("2001:4860:4860::8888")).toBe("public"); // Google DNS
  });

  it("clasifica IPv4 embebida vía NAT64 (64:ff9b::/96) y 6to4 (2002::/16) por su IPv4 real", () => {
    expect(classifyIpv6("64:ff9b::a9fe:a9fe")).toBe("always-blocked"); // NAT64 de 169.254.169.254 (IMDS)
    expect(classifyIpv6("2002:a9fe:a9fe::")).toBe("always-blocked"); // 6to4 de la misma IMDS
    expect(classifyIpv6("64:ff9b::808:808")).toBe("public"); // NAT64 de 8.8.8.8
  });

  it("una forma no parseable falla CERRADO (always-blocked)", () => {
    expect(classifyIpv6("basura-no-ip")).toBe("always-blocked");
  });
});

describe("classifyIp (despachador v4/v6)", () => {
  it("despacha según la familia detectada y falla cerrado si el string no es una IP", () => {
    expect(classifyIp("169.254.169.254")).toBe("always-blocked");
    expect(classifyIp("::ffff:169.254.169.254")).toBe("always-blocked");
    expect(classifyIp("8.8.8.8")).toBe("public");
    expect(classifyIp("no-soy-una-ip")).toBe("always-blocked");
  });
});

describe("buildUrl", () => {
  it("antepone http:// por defecto y compone base + path + query", () => {
    const url = buildUrl("localhost:8080", "/api/x", { a: "1", b: "2" });
    expect(url?.toString()).toBe("http://localhost:8080/api/x?a=1&b=2");
  });

  it("respeta un esquema https:// explícito y no duplica la barra del path", () => {
    const url = buildUrl("https://example.com/", "/y");
    expect(url?.toString()).toBe("https://example.com/y");
  });

  it("devuelve null con un endpoint vacío o en blanco (nunca construye una URL a ciegas)", () => {
    expect(buildUrl("")).toBeNull();
    expect(buildUrl("   ")).toBeNull();
  });
});

describe("allowPrivate", () => {
  const KEY = "INTEGRATIONS_PROXY_ALLOW_PRIVATE";
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("por defecto PERMITE destinos privados (self-host es el propósito del proxy)", () => {
    delete process.env[KEY];
    expect(allowPrivate()).toBe(true);
  });

  it("se endurece explícitamente con '0' o 'false'", () => {
    process.env[KEY] = "0";
    expect(allowPrivate()).toBe(false);
    process.env[KEY] = "false";
    expect(allowPrivate()).toBe(false);
  });
});

describe("BLOCKED_HOSTNAMES", () => {
  it("incluye los hostnames de metadatos conocidos por NOMBRE (sin necesidad de resolver DNS)", () => {
    expect(BLOCKED_HOSTNAMES.has("metadata.google.internal")).toBe(true);
    expect(BLOCKED_HOSTNAMES.has("metadata.goog")).toBe(true);
  });
});
