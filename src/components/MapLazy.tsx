"use client";

import dynamic from "next/dynamic";

/** Leaflet touche `window` : on ne le charge que côté navigateur. */
const MapLazy = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-[200px] w-full place-items-center rounded-2xl border-brut border-ink bg-sky font-semibold text-azur">
      Chargement de la carte…
    </div>
  ),
});

export default MapLazy;
