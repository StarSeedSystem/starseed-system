from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

def _no_spaces(*values):
    for v in values:
        if not isinstance(v, str):
            raise TypeError("los valores deben ser cadenas")
        if " " in v or "\t" in v or "\n" in v:
            raise ValueError(f"valor con espacio no permitido: {v!r}")

def build_utm_url(base_url, source, medium, campaign, content):
    _no_spaces(source, medium, campaign, content)
    parsed = urlparse(base_url)
    if not parsed.scheme:
        raise ValueError("URL sin esquema")
    qs = parse_qs(parsed.query, keep_blank_values=True)
    for k in qs:
        if k.startswith("utm_"):
            raise ValueError(f"parámetro utm duplicado en URL: {k}")
    qs["utm_source"] = [source]
    qs["utm_medium"] = [medium]
    qs["utm_campaign"] = [campaign]
    qs["utm_content"] = [content]
    new_qs = urlencode(qs, doseq=True)
    return urlunparse(parsed._replace(query=new_qs))
