"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeoStatus = "idle" | "asking" | "granted" | "denied" | "unavailable";
export type Coords = { lat: number; lng: number; accuracy: number };

const DISMISSED_KEY = "awa:geo-dismissed";

/**
 * Géolocalisation 100 % optionnelle. Le système fonctionne dans tous les cas :
 * - permission déjà accordée → position récupérée en silence dès le chargement
 * - permission à demander    → `shouldPrompt` passe à true (pop-up custom), puis
 *   `request()` déclenche navigator.geolocation.getCurrentPosition()
 * - refus / indisponible     → coords = null, la commande part avec le lot seul
 */
export function useGeo() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [shouldPrompt, setShouldPrompt] = useState(false);
  const started = useRef(false);

  const request = useCallback(() => {
    setShouldPrompt(false);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setStatus("granted");
        try {
          sessionStorage.removeItem(DISMISSED_KEY);
        } catch {}
      },
      (err) => {
        setCoords(null);
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );
  }, []);

  const disable = useCallback(() => {
    setCoords(null);
    setStatus("idle");
    setShouldPrompt(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }, []);

  const dismissPrompt = useCallback(() => {
    setShouldPrompt(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }, []);

  // Au chargement de la page
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {}

    const query = navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (!query) {
      if (!dismissed) setShouldPrompt(true);
      return;
    }
    query
      .then((p) => {
        if (p.state === "granted") request();
        else if (p.state === "denied") setStatus("denied");
        else if (!dismissed) setTimeout(() => setShouldPrompt(true), 900);
      })
      .catch(() => {
        if (!dismissed) setShouldPrompt(true);
      });
  }, [request]);

  return { status, coords, shouldPrompt, request, disable, dismissPrompt };
}
