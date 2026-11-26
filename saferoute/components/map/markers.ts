import L from "leaflet";

export const pickupIcon = L.divIcon({
  className: "sr-marker",
  html: '<div class="sr-dot" aria-hidden="true"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

export const destinationIcon = L.divIcon({
  className: "sr-marker",
  html: `<svg class="sr-pin" viewBox="0 0 34 44" aria-hidden="true">
      <path d="M17 1C8.2 1 1 8 1 16.7 1 28.5 17 43 17 43s16-14.5 16-26.3C33 8 25.8 1 17 1z" fill="#E87524" stroke="#FFFDF8" stroke-width="2"/>
      <circle cx="17" cy="16.5" r="5.5" fill="#FFFDF8"/>
    </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 43],
  popupAnchor: [0, -40],
});

export const userIcon = L.divIcon({
  className: "sr-marker",
  html: '<div class="sr-user" aria-hidden="true"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Metro station marker. */
export const metroIcon = L.divIcon({
  className: "sr-marker",
  html: '<div class="sr-metro" aria-hidden="true">M</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -12],
});

/** Glowing dot that leads the route while it draws itself. */
export const routeHeadIcon = L.divIcon({
  className: "sr-marker",
  html: '<div class="sr-route-head" aria-hidden="true"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const iconCache = new Map<string, L.DivIcon>();

/** Marker for a community-reported spot. Unconfirmed spots are faded with a dashed ring. */
export function communityIcon(emoji: string, confirmed: boolean): L.DivIcon {
  const key = `${emoji}|${confirmed}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "sr-marker",
      html: `<div class="sr-community ${confirmed ? "is-confirmed" : ""}" aria-hidden="true">${emoji}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -13],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

export const LOCATE_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>';
