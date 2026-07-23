// SVG icons for custom tabBar
const TABBAR_ICON_COLOR = '#8b857c';
const TABBAR_ICON_COLOR_ACTIVE = '#9a6a4b';

const TABBAR_ICONS_DATA = {
  work: {
    inactive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR}" stroke-width="2">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m15 5 3 3"/>
    </svg>`,
    active: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR_ACTIVE}" stroke-width="2">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m15 5 3 3"/>
    </svg>`,
  },
  home: {
    inactive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR}" stroke-width="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>`,
    active: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR_ACTIVE}" stroke-width="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>`,
  },
  course: {
    inactive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR}" stroke-width="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`,
    active: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR_ACTIVE}" stroke-width="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`,
  },
  trial: {
    inactive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR}" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>`,
    active: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR_ACTIVE}" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>`,
  },
  schedule: {
    inactive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR}" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>`,
    active: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR_ACTIVE}" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>`,
  },
  account: {
    inactive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR}" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>`,
    active: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${TABBAR_ICON_COLOR_ACTIVE}" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>`,
  },
};

function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg.trim()).replace(/'/g, '%27').replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

export const TABBAR_ICONS = {
  work: {
    inactive: svgToDataUri(TABBAR_ICONS_DATA.work.inactive),
    active: svgToDataUri(TABBAR_ICONS_DATA.work.active),
  },
  home: {
    inactive: svgToDataUri(TABBAR_ICONS_DATA.home.inactive),
    active: svgToDataUri(TABBAR_ICONS_DATA.home.active),
  },
  course: {
    inactive: svgToDataUri(TABBAR_ICONS_DATA.course.inactive),
    active: svgToDataUri(TABBAR_ICONS_DATA.course.active),
  },
  trial: {
    inactive: svgToDataUri(TABBAR_ICONS_DATA.trial.inactive),
    active: svgToDataUri(TABBAR_ICONS_DATA.trial.active),
  },
  schedule: {
    inactive: svgToDataUri(TABBAR_ICONS_DATA.schedule.inactive),
    active: svgToDataUri(TABBAR_ICONS_DATA.schedule.active),
  },
  account: {
    inactive: svgToDataUri(TABBAR_ICONS_DATA.account.inactive),
    active: svgToDataUri(TABBAR_ICONS_DATA.account.active),
  },
};
