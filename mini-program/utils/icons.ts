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
      label: '成长理念',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="${color}" d="m12 2.1 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.3 2 9.4l6.9-1L12 2.1Z"/>
      </svg>`,
    },
    campus: {
      label: '空间环境',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="${color}" d="M12 2.3a8.2 8.2 0 0 0-8.2 8.2c0 5.8 7 10.9 7.4 11.2a1.4 1.4 0 0 0 1.6 0c.4-.3 7.4-5.4 7.4-11.2A8.2 8.2 0 0 0 12 2.3Zm0 11.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z"/>
      </svg>`,
    },
    teacher: {
      label: '伙伴资源',
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

export const GUEST_ACCOUNT_ICONS = {
  wechat: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <path fill="#FFFFFF" d="M28 14C16.4 14 7 21.7 7 31.2c0 5.4 3.1 10.3 7.9 13.4l-1.7 6.1 7.2-3.6c2.3.8 4.8 1.3 7.6 1.3 11.6 0 21-7.7 21-17.2S39.6 14 28 14Z"/>
    <path fill="#FFFFFF" d="M42.2 28.6c8.2 0 14.8 5.5 14.8 12.3 0 3.8-2 7.2-5.3 9.5l1.2 4.5-5.2-2.6c-1.7.6-3.6.9-5.5.9-8.2 0-14.8-5.5-14.8-12.3s6.6-12.3 14.8-12.3Z"/>
    <circle fill="#A9704C" cx="21.5" cy="28.8" r="2.6"/>
    <circle fill="#A9704C" cx="34.4" cy="28.8" r="2.6"/>
    <circle fill="#A9704C" cx="37.2" cy="39.7" r="2.1"/>
    <circle fill="#A9704C" cx="47.2" cy="39.7" r="2.1"/>
  </svg>`),
  avatar:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22%23A9704C%22%2F%3E%3Cpath%20d%3D%22M13%2054c3.2-12%2012.4-18%2019-18s15.8%206%2019%2018%22%20fill%3D%22%23A9704C%22%2F%3E%3C%2Fsvg%3E',
  parent:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpath%20d%3D%22M12%2030%2032%2014l20%2016v22a4%204%200%200%201-4%204H16a4%204%200%200%201-4-4V30Z%22%20fill%3D%22none%22%20stroke%3D%22%23c46f2e%22%20stroke-width%3D%226%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M26%2056V40h12v16%22%20fill%3D%22none%22%20stroke%3D%22%23c46f2e%22%20stroke-width%3D%226%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
  teacher:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpath%20d%3D%22M10%2018h44v30H10z%22%20fill%3D%22none%22%20stroke%3D%22%239a6a4b%22%20stroke-width%3D%226%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M20%2054h24M32%2048v6%22%20stroke%3D%22%239a6a4b%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%2F%3E%3Cpath%20d%3D%22M22%2030h20M22%2038h12%22%20stroke%3D%22%239a6a4b%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E',
  calendar:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20x%3D%2213%22%20y%3D%2214%22%20width%3D%2238%22%20height%3D%2240%22%20rx%3D%227%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%2F%3E%3Cpath%20d%3D%22M13%2027h38M23%2010v10M41%2010v10%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%2F%3E%3Cpath%20d%3D%22M23%2038h5M36%2038h5M23%2047h5M36%2047h5%22%20stroke%3D%22%23fff%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E',
  clock:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2232%22%20r%3D%2221%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%2F%3E%3Cpath%20d%3D%22M32%2020v14l10%206%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
  headset:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpath%20d%3D%22M15%2034a17%2017%200%200%201%2034%200%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2232%22%20width%3D%2211%22%20height%3D%2217%22%20rx%3D%225%22%20fill%3D%22%23fff%22%2F%3E%3Crect%20x%3D%2243%22%20y%3D%2232%22%20width%3D%2211%22%20height%3D%2217%22%20rx%3D%225%22%20fill%3D%22%23fff%22%2F%3E%3Cpath%20d%3D%22M49%2048c-2%207-8%209-17%209%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E',
  message:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpath%20d%3D%22M13%2016h38a6%206%200%200%201%206%206v21a6%206%200%200%201-6%206H30l-13%208v-8h-4a6%206%200%200%201-6-6V22a6%206%200%200%201%206-6Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M21%2030h22M21%2039h14%22%20stroke%3D%22%23fff%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E',
  calendarCheck:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20x%3D%2213%22%20y%3D%2214%22%20width%3D%2238%22%20height%3D%2240%22%20rx%3D%227%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%2F%3E%3Cpath%20d%3D%22M13%2027h38M23%2010v10M41%2010v10%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%2F%3E%3Cpath%20d%3D%22m23%2042%207%207%2013-16%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
  users:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2224%22%20r%3D%2210%22%20fill%3D%22%23fff%22%2F%3E%3Cpath%20d%3D%22M14%2054c3-11%2011-17%2018-17s15%206%2018%2017%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2216%22%20cy%3D%2229%22%20r%3D%227%22%20fill%3D%22%23fff%22%20opacity%3D%22.85%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2229%22%20r%3D%227%22%20fill%3D%22%23fff%22%20opacity%3D%22.85%22%2F%3E%3C%2Fsvg%3E',
  check:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20x%3D%2214%22%20y%3D%2212%22%20width%3D%2236%22%20height%3D%2244%22%20rx%3D%227%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%2F%3E%3Cpath%20d%3D%22m22%2035%208%208%2015-18%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
  star:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpath%20d%3D%22m32%208%207%2015%2016%202-12%2012%203%2017-14-8-14%208%203-17L9%2025l16-2%207-15Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
};
