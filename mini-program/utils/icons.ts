// SVG icons as Base64 data URIs for WeChat mini program
// These icons are simple, lightweight, and don't require external assets

// Use brand color #9a6a4b for icons
const ICON_COLOR = '#9a6a4b';

const ICON_CONFIG = {
  brand: {
    label: '品牌介绍',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_COLOR}" stroke-width="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>`,
  },
  course: {
    label: '核心优势',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_COLOR}" stroke-width="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>`,
  },
  campus: {
    label: '校区环境',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_COLOR}" stroke-width="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>`,
  },
  teacher: {
    label: '师资团队',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_COLOR}" stroke-width="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>`,
  },
  story: {
    label: '成长故事',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_COLOR}" stroke-width="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`,
  },
};

function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg.trim())
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

export function getIconDataUri(key: string): string {
  const icon = ICON_CONFIG[key as keyof typeof ICON_CONFIG];
  if (!icon) return '';
  return svgToDataUri(icon.svg);
}

export const HOME_QUICK_ACTIONS_ICONS = {
  intro: getIconDataUri('brand'),
  advantages: getIconDataUri('course'),
  campuses: getIconDataUri('campus'),
  teachers: getIconDataUri('teacher'),
  stories: getIconDataUri('story'),
};
