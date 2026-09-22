// Icônes SVG maison (trait, currentColor). Remplacent les émojis pour garder
// une palette 100 % bleue. Les chaînes servent aussi aux pins Leaflet.

export const ICONS = {
  drop: `<path d="M12 2.5c3.6 4.3 6.2 7.5 6.2 10.8a6.2 6.2 0 1 1-12.4 0C5.8 10 8.4 6.8 12 2.5z"/>`,
  pin: `<path d="M12 21.5s7-5.6 7-11.5a7 7 0 1 0-14 0c0 5.9 7 11.5 7 11.5z"/><circle cx="12" cy="10" r="2.5"/>`,
  nav: `<path d="M3.5 11 20.5 3.5 13 20.5l-2-7.5-7.5-2z"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  chat: `<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3.5 21l1.6-4.9A8.5 8.5 0 1 1 21 12z"/>`,
  map: `<path d="m9 4-6 2.5V20l6-2.5L15 20l6-2.5V4l-6 2.5L9 4z"/><path d="M9 4v13.5M15 6.5V20"/>`,
  truck: `<path d="M2.5 16V7.5h10V16M12.5 10.5h4l3 3.2V16h-2"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/><path d="M9 16h6"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  power: `<path d="M12 3v9M6.3 6.7a8 8 0 1 0 11.4 0"/>`,
  arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18"/>`,
  home: `<path d="M3.5 11 12 3.5l8.5 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>`,
  bell: `<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>`,
  bellOff: `<path d="M6 16.5V11a6 6 0 0 1 9-5.2M18 11v5.5l1.5 2h-15M10 21h4M3 3l18 18"/>`,
  user: `<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-5.5 7.5-5.5s6.5 1.5 7.5 5.5"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>`,
  layers: `<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>`,
  phone: `<path d="M5.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 4 5.6 1.5 1.5 0 0 1 5.5 4z"/>`,
  alert: `<path d="M12 3.5 21.5 20h-19L12 3.5z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>`,
  money: `<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 6.5v11M18 6.5v11"/>`,
  logout: `<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 16l5-4-5-4"/><path d="M20 12H9"/>`,
  shield: `<path d="M12 3.5 19.5 6.5V12c0 5-3.3 7.7-7.5 9.5C7.8 19.7 4.5 17 4.5 12V6.5L12 3.5z"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  trash: `<path d="M5 7h14M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>`,
  users: `<circle cx="8.5" cy="8" r="3.2"/><path d="M2.5 20c.7-3.7 3-5.7 6-5.7s5.3 2 6 5.7"/><circle cx="17" cy="9" r="2.6"/><path d="M15.7 14.4c2.3.4 3.9 2.1 4.5 5.1"/>`,
} as const;

export type IconName = keyof typeof ICONS;

/** Markup SVG complet (pour Leaflet). */
export const iconSvg = (name: IconName, size = 20) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

export function Icon({
  name,
  size = 20,
  className = "",
  fill = false,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** remplit la forme (goutte du logo) */
  fill?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
