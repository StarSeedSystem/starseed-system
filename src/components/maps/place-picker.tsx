'use client';

// ════════════════════════════════════════════════════════════════════════════
// PlacePicker — Selector de geografía con geocodificación GRATUITA (sin API key)
// ----------------------------------------------------------------------------
// Caja de búsqueda que consulta el geocoder Photon de Komoot
// (https://photon.komoot.io/api — gratis, sin clave). Si Photon falla o no
// devuelve resultados, cae a Nominatim (OpenStreetMap) con `Accept-Language`
// y un contacto en la query string (buena práctica de la política de uso).
//
// Devuelve una selección `{ lat, lng, label }` al componente padre vía
// onSelect, y muestra la etiqueta elegida. Totalmente DEFENSIVO:
//   · Debounce de 450 ms para no saturar los servicios públicos.
//   · Todas las llamadas van en try/catch + AbortController (cancela la anterior).
//   · Si no hay red / resultados / el servicio está caído → estado vacío honesto,
//     nunca rompe el formulario. Funciona "offline" (sin sugerencias).
//   · Permite BORRAR la geografía (volver a sin-ubicación).
//
// Diseño "Crystal Liquid Glass" coherente con MASTER.md (sin emojis como iconos;
// Lucide; cursor pointer en clicables; transiciones 150–300 ms).
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Loader2, Search, X, LocateFixed } from 'lucide-react';

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface PlaceSelection {
  lat: number;
  lng: number;
  label: string;
}

interface PlacePickerProps {
  /** Valor actual (lat/lng/label) o null si no hay geografía seleccionada. */
  value?: PlaceSelection | null;
  /** Se llama al elegir un resultado o al limpiar (null). */
  onSelect: (place: PlaceSelection | null) => void;
  /** Texto del label del campo. */
  label?: string;
  /** Placeholder de la caja de búsqueda. */
  placeholder?: string;
  /** id del input (accesibilidad). */
  id?: string;
  /** Idioma preferido para resultados (Accept-Language / lang). */
  lang?: string;
}

// ── Resultado interno normalizado de cualquier geocoder ──────────────────────

interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEBOUNCE_MS = 450;
const MIN_QUERY = 3;

// ── Geocoders (cada uno nunca lanza; devuelve [] ante cualquier fallo) ───────

/** Compone una etiqueta legible a partir de las propiedades de un feature Photon. */
function photonLabel(props: Record<string, any>): string {
  const parts = [
    props.name,
    props.street,
    props.city ?? props.town ?? props.village ?? props.county,
    props.state,
    props.country,
  ].filter((p) => typeof p === 'string' && p.trim().length > 0);
  // Evita duplicar el nombre si coincide con la ciudad.
  const seen = new Set<string>();
  const dedup = parts.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return dedup.join(', ') || 'Ubicación sin nombre';
}

async function geocodePhoton(
  query: string,
  lang: string,
  signal: AbortSignal,
): Promise<GeoResult[]> {
  try {
    const url = `${PHOTON_URL}?q=${encodeURIComponent(query)}&limit=6&lang=${encodeURIComponent(
      lang.slice(0, 2) || 'es',
    )}`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const feats: any[] = Array.isArray(data?.features) ? data.features : [];
    const out: GeoResult[] = [];
    for (const f of feats) {
      const coords = f?.geometry?.coordinates;
      // GeoJSON: [lng, lat]
      if (Array.isArray(coords) && coords.length >= 2) {
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          out.push({ lat, lng, label: photonLabel(f?.properties ?? {}) });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function geocodeNominatim(
  query: string,
  lang: string,
  signal: AbortSignal,
): Promise<GeoResult[]> {
  try {
    // Nota: los navegadores no permiten fijar User-Agent; en su lugar añadimos
    // `email`/`Accept-Language` como recomienda la política de uso de Nominatim.
    const url =
      `${NOMINATIM_URL}?format=json&limit=6&addressdetails=1` +
      `&accept-language=${encodeURIComponent(lang || 'es')}` +
      `&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json', 'Accept-Language': lang || 'es' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rows: any[] = Array.isArray(data) ? data : [];
    const out: GeoResult[] = [];
    for (const r of rows) {
      const lat = Number(r?.lat);
      const lng = Number(r?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        out.push({ lat, lng, label: String(r?.display_name ?? 'Ubicación sin nombre') });
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export function PlacePicker({
  value,
  onSelect,
  label = 'Geografía',
  placeholder = 'Busca una ciudad, dirección o lugar…',
  id = 'place-picker',
  lang = 'es',
}: PlacePickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [geoLocating, setGeoLocating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY) {
        setResults([]);
        setLoading(false);
        setNote(null);
        return;
      }
      // Cancela la búsqueda anterior en vuelo.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setNote(null);
      try {
        let found = await geocodePhoton(trimmed, lang, controller.signal);
        if (found.length === 0 && !controller.signal.aborted) {
          // Fallback a Nominatim.
          found = await geocodeNominatim(trimmed, lang, controller.signal);
        }
        if (controller.signal.aborted) return;
        setResults(found);
        setOpen(true);
        if (found.length === 0) {
          setNote('Sin resultados. Prueba con otro término o continúa sin geografía.');
        }
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setNote('No se pudo buscar ahora mismo. Puedes continuar sin geografía.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [lang],
  );

  // Debounce sobre la query.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      setNote(null);
      return;
    }
    debounceRef.current = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // Cierra la lista al hacer click fuera.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Limpieza final.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const choose = (r: GeoResult) => {
    onSelect({ lat: r.lat, lng: r.lng, label: r.label });
    setQuery('');
    setResults([]);
    setOpen(false);
    setNote(null);
  };

  const clear = () => {
    onSelect(null);
    setQuery('');
    setResults([]);
    setOpen(false);
    setNote(null);
  };

  // Usa la ubicación del navegador (opcional, defensivo).
  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNote('Tu navegador no permite geolocalización.');
      return;
    }
    setGeoLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocating(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        onSelect({
          lat,
          lng,
          label: `Mi ubicación (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
      },
      () => {
        setGeoLocating(false);
        setNote('No se pudo obtener tu ubicación.');
      },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  };

  const hasValue = useMemo(
    () => !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng),
    [value],
  );

  return (
    <div className="flex flex-col gap-1.5" ref={boxRef}>
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
          (opcional)
        </span>
      </label>

      {/* Valor seleccionado (chip) */}
      {hasValue && value && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
          <MapPin className="h-4 w-4 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-emerald-100">{value.label}</p>
            <p className="text-[10px] tabular-nums text-emerald-300/70">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            aria-label="Quitar geografía"
            className="shrink-0 cursor-pointer rounded-full p-1 text-emerald-200/70 transition-colors hover:bg-emerald-500/20 hover:text-emerald-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Caja de búsqueda + botón "mi ubicación" */}
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id={id}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={hasValue ? 'Cambiar geografía…' : placeholder}
            autoComplete="off"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pl-8 pr-8 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoLocating}
          title="Usar mi ubicación actual"
          aria-label="Usar mi ubicación actual"
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md border border-input bg-transparent text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {geoLocating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className="h-4 w-4" />
          )}
        </button>

        {/* Lista de resultados (glass, flotante) */}
        {open && results.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/85 p-1 shadow-2xl backdrop-blur-xl"
          >
            {results.map((r, i) => (
              <li key={`${r.lat}-${r.lng}-${i}`}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/80" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white/90">{r.label}</p>
                    <p className="text-[10px] tabular-nums text-white/40">
                      {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

export default PlacePicker;
