// SVG icons as data URIs for WeChat mini program.

const ICON_COLOR = '#8b857c';
const ICON_ACTIVE_COLOR = '#9a6a4b';

function iconConfig(color: string) {
  return {
    brand: {
      label: '品牌介绍',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="${color}" d="M12 2.4 3 9.2v10.1A2.7 2.7 0 0 0 5.7 22h12.6a2.7 2.7 0 0 0 2.7-2.7V9.2L12 2.4Zm3 17.4H9v-7.2h6v7.2Z"/>
      </svg>`,
    },
    course: {
      label: '核心优势',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="${color}" d="m12 2.1 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.3 2 9.4l6.9-1L12 2.1Z"/>
      </svg>`,
    },
    campus: {
      label: '校区环境',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="${color}" d="M12 2.3a8.2 8.2 0 0 0-8.2 8.2c0 5.8 7 10.9 7.4 11.2a1.4 1.4 0 0 0 1.6 0c.4-.3 7.4-5.4 7.4-11.2A8.2 8.2 0 0 0 12 2.3Zm0 11.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z"/>
      </svg>`,
    },
    teacher: {
      label: '师资团队',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="${color}" d="M9.5 11.4a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8Zm0 2.1c-4.3 0-7.7 2.4-7.7 5.4v1.2c0 .8.6 1.4 1.4 1.4h12.6c.8 0 1.4-.6 1.4-1.4v-1.2c0-3-3.4-5.4-7.7-5.4Zm7.1-.3c2.9.6 5.4 2.6 5.4 5.1v.8c0 .7-.6 1.3-1.3 1.3h-1.6v-1.5c0-2.2-.9-4.1-2.5-5.7Zm-.4-2a4.1 4.1 0 0 0 0-8.2 4.7 4.7 0 0 1 0 8.2Z"/>
      </svg>`,
    },
    story: {
      label: '成长故事',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="${color}" d="M6.4 2.5h12.1c.8 0 1.5.7 1.5 1.5v16.7c0 .5-.4.8-.8.8H6.6A3.6 3.6 0 0 1 3 17.9V5.9a3.4 3.4 0 0 1 3.4-3.4Zm.2 14.6c-.8 0-1.4.6-1.4 1.3s.6 1.3 1.4 1.3h11.2v-2.6H6.6Zm1.2-10.5v6.3l4.2-2.2 4.2 2.2V6.6H7.8Z"/>
      </svg>`,
    },
  };
}

function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg.trim())
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

export function getIconDataUri(key: string, color = ICON_COLOR): string {
  const ICON_CONFIG = iconConfig(color);
  const icon = ICON_CONFIG[key as keyof typeof ICON_CONFIG];
  if (!icon) return '';
  return svgToDataUri(icon.svg);
}

export const HOME_QUICK_ACTIONS_ICONS = {
  intro: getIconDataUri('brand'),
  introActive: getIconDataUri('brand', ICON_ACTIVE_COLOR),
  advantages: getIconDataUri('course'),
  advantagesActive: getIconDataUri('course', ICON_ACTIVE_COLOR),
  campuses: getIconDataUri('campus'),
  campusesActive: getIconDataUri('campus', ICON_ACTIVE_COLOR),
  teachers: getIconDataUri('teacher'),
  teachersActive: getIconDataUri('teacher', ICON_ACTIVE_COLOR),
  stories: getIconDataUri('story'),
  storiesActive: getIconDataUri('story', ICON_ACTIVE_COLOR),
};
