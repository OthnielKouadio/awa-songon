"use client";

import { ApiError } from "./api";

export type Position = { lat: number; long: number; precision: number };

/** Position GPS du téléphone (haute précision, 20 s max). Sert UNIQUEMENT à
 *  enregistrer la position d'un portail (pose de l'autocollant, livreur sur
 *  place) — jamais à localiser un client. */
export function positionActuelle(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new ApiError("GPS_INDISPONIBLE"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, long: p.coords.longitude, precision: Math.round(p.coords.accuracy) }),
      (e) => reject(new ApiError(e.code === e.PERMISSION_DENIED ? "GPS_REFUSE" : "GPS_INDISPONIBLE")),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    );
  });
}

/** Itinéraire Google Maps (lien simple, aucune API payante). */
export const lienItineraire = (lat: number, long: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}`;
