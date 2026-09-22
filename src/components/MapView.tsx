"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { iconSvg, type IconName } from "./icons";

export type MarkerKind = "source" | "tricycle" | "tricycle-off" | "commande" | "commande-cours" | "client";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  kind: MarkerKind;
  title?: string;
  lines?: string[];
};

export type MapLine = { id: string; from: [number, number]; to: [number, number] };

type Props = {
  markers: MapMarker[];
  lines?: MapLine[];
  height?: number | string;
  /** La carte se recadre quand cette clé change (et non à chaque mise à jour temps réel). */
  fitKey?: string;
  interactive?: boolean;
};

const KINDS: Record<MarkerKind, { bg: string; fg: string; icon: IconName }> = {
  source: { bg: "#0A1931", fg: "#FFFFFF", icon: "drop" },
  tricycle: { bg: "#0096FF", fg: "#FFFFFF", icon: "truck" },
  "tricycle-off": { bg: "#C9D5E3", fg: "#0A1931", icon: "truck" },
  commande: { bg: "#FFFFFF", fg: "#0096FF", icon: "pin" },
  "commande-cours": { bg: "#0096FF", fg: "#FFFFFF", icon: "pin" },
  client: { bg: "#0096FF", fg: "#FFFFFF", icon: "home" },
};

// Songon (Abidjan) — centre par défaut quand il n'y a aucun point
const DEFAULT_CENTER: [number, number] = [5.3833, -4.2667];

// Pins en divIcon : aucune image à héberger, aucun bug d'icônes Leaflet avec les bundlers.
const iconCache = new Map<MarkerKind, L.DivIcon>();
function pin(kind: MarkerKind) {
  let icon = iconCache.get(kind);
  if (!icon) {
    const k = KINDS[kind];
    icon = L.divIcon({
      className: "",
      html: `<div class="awa-pin" style="background:${k.bg};color:${k.fg}">${iconSvg(k.icon)}</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -34],
    });
    iconCache.set(kind, icon);
  }
  return icon;
}

function Fit({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    // animate: false — un panoramique animé encore en vol au démontage (navigation
    // rapide, AnimatePresence qui retire la carte) fait planter Leaflet en interne
    // (_leaflet_pos undefined) car son requestAnimationFrame vise un DOM déjà détruit.
    if (points.length === 1) map.setView(points[0], 17, { animate: false });
    else map.fitBounds(points, { padding: [48, 48], maxZoom: 17, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);

  // Filet de sécurité : annule tout panoramique/zoom encore en cours avant le
  // démontage, au cas où une autre interaction (popup, clic utilisateur) en aurait
  // déclenché un.
  useEffect(() => () => {
    try {
      map.stop();
    } catch {}
  }, [map]);

  return null;
}

export default function MapView({ markers, lines = [], height = 280, fitKey, interactive = true }: Props) {
  const points = useMemo(() => markers.map((m) => [m.lat, m.lng] as [number, number]), [markers]);
  const key = fitKey ?? markers.map((m) => m.id).join(",");

  return (
    <div className="overflow-hidden rounded-2xl border-brut border-ink" style={{ height, width: "100%" }}>
      <MapContainer
        center={points[0] ?? DEFAULT_CENTER}
        zoom={points.length ? 16 : 13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Fit points={points} fitKey={key} />
        {lines.map((l) => (
          <Polyline key={l.id} positions={[l.from, l.to]} pathOptions={{ color: "#0A1931", weight: 3, dashArray: "6 8" }} />
        ))}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={pin(m.kind)}>
            {(m.title || m.lines?.length) && (
              <Popup>
                {m.title && <strong className="block text-base">{m.title}</strong>}
                {m.lines?.filter(Boolean).map((l, i) => (
                  <span key={i} className="block text-sm">
                    {l}
                  </span>
                ))}
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
