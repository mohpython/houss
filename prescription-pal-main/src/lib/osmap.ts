import type { DivIcon } from "leaflet";

// Cartographie OpenStreetMap (Leaflet) — sans clé API.
// Remplace l'ancien `src/lib/gmaps.ts` (Google Maps).

type LeafletNS = typeof import("leaflet");

let leafletPromise: Promise<LeafletNS> | null = null;

/** Charge Leaflet une seule fois (import dynamique JS + CSS), côté navigateur uniquement. */
export function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (!leafletPromise) {
    leafletPromise = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(
      ([L]) => {
        // Interop CJS/ESM : selon le bundler, le module peut être exposé via `default`.
        const interop = L as unknown as { default?: LeafletNS };
        return interop.default ?? L;
      },
    );
  }
  return leafletPromise;
}

const PIN_STYLE =
  "box-sizing:border-box;display:flex;align-items:center;justify-content:center;" +
  "border-radius:9999px;color:#fff;font-weight:700;border:2px solid #fff;" +
  "box-shadow:0 1px 4px rgba(0,0,0,.45);";

/** Pastille lettrée (équivalent des labels « P » / « V » des marqueurs Google). */
export function letterIcon(L: LeafletNS, letter: string, background: string): DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="${PIN_STYLE}background:${background};width:26px;height:26px;font-size:13px;">${letter}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Pastille ronde pleine (position dynamique du coursier). */
export function dotIcon(L: LeafletNS, color: string, size = 18): DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="${PIN_STYLE}background:${color};width:${size}px;height:${size}px;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Décode une polyline encodée (format Google, précision 1e-5) en points lat/lng. */
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Encode des points lat/lng en polyline (format Google, précision 1e-5) — réciproque de decodePolyline. */
export function encodePolyline(points: { lat: number; lng: number }[]): string {
  const encodeValue = (value: number): string => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };

  let output = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    output += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}
