"use client";

import { useEffect, useRef } from "react";

/**
 * Suivi GPS continu côté chauffeur (navigator.geolocation.watchPosition) :
 * envoie la position au serveur au plus toutes les `intervalMs` (le capteur
 * peut déclencher bien plus souvent, on throttle nous-mêmes). Actif tant que
 * le composant appelant est monté (tableau de bord chauffeur) — s'arrête tout
 * seul au démontage ou si la géolocalisation est refusée/indisponible.
 */
export function useGeoWatch(onPosition: (lat: number, lng: number) => void, intervalMs = 5000) {
  const cb = useRef(onPosition);
  cb.current = onPosition;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    let lastSent = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent < intervalMs) return;
        lastSent = now;
        cb.current(pos.coords.latitude, pos.coords.longitude);
      },
      () => {}, // refus/erreur silencieux : le suivi live est un bonus, pas un bloquant
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}
