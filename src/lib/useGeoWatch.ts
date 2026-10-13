"use client";

import { useEffect, useRef } from "react";
import {
  distanceMetres,
  GPS_INTERVALLE_LENT_MS,
  GPS_INTERVALLE_MOUVEMENT_MS,
  GPS_SEUIL_ARRET_M,
  GPS_SEUIL_MOUVEMENT_M,
} from "./format";

/**
 * Suivi GPS côté chauffeur, actif UNIQUEMENT quand `enabled` (commande ARRIVING,
 * après « J'arrive chez toi »). Le capteur peut se déclencher très souvent ; on
 * n'envoie au serveur que :
 *   - dès la 1re position (le client voit le tricycle tout de suite) ;
 *   - s'il a bougé de ≥ 15 m depuis le dernier envoi : au plus toutes les 10 s ;
 *   - petit déplacement (5 à 15 m) : au plus toutes les 30 s ;
 *   - à l'arrêt (< 5 m, bruit GPS) : rien.
 * `onPosition` renvoie false quand le serveur dit que le partage est terminé :
 * le GPS est alors coupé jusqu'au prochain changement de `enabled`/`key`.
 */
export function useGeoWatch(enabled: boolean, key: string | null, onPosition: (lat: number, lng: number) => Promise<boolean>) {
  const cb = useRef(onPosition);
  cb.current = onPosition;

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    let last: { lat: number; lng: number; at: number } | null = null;
    let stopped = false;
    let id: number | null = null;

    const stop = () => {
      stopped = true;
      if (id !== null) navigator.geolocation.clearWatch(id);
    };

    id = navigator.geolocation.watchPosition(
      (pos) => {
        if (stopped) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const now = Date.now();
        if (last) {
          const d = distanceMetres(last.lat, last.lng, lat, lng);
          const dt = now - last.at;
          const bouge = d >= GPS_SEUIL_MOUVEMENT_M && dt >= GPS_INTERVALLE_MOUVEMENT_MS;
          const lent = d >= GPS_SEUIL_ARRET_M && dt >= GPS_INTERVALLE_LENT_MS;
          if (!bouge && !lent) return;
        }
        last = { lat, lng, at: now };
        void cb.current(lat, lng).then((actif) => {
          if (!actif) stop();
        });
      },
      () => {}, // refus/erreur silencieux : le suivi live est un bonus, pas un bloquant
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return stop;
  }, [enabled, key]);
}
