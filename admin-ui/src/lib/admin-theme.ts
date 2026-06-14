import type { OrganizationSettings } from '@/api/types';

export const ADMIN_ORGANIZATION_UPDATED_EVENT = 'fd:admin-organization-updated';

const DEFAULT_COLORS = {
  background: '#ffffff',
  card: '#ffffff',
  foreground: '#020817',
  primary: '#9a6a4b',
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function applyAdminTheme(organization: OrganizationSettings) {
  const root = document.documentElement;
  const branding = organization.branding ?? {};
  const background = colorValue(branding.backgroundColor, DEFAULT_COLORS.background);
  const card = colorValue(branding.cardColor, DEFAULT_COLORS.card);
  const foreground = colorValue(branding.textColor, DEFAULT_COLORS.foreground);
  const primary = colorValue(branding.primaryColor, DEFAULT_COLORS.primary);
  const border = mix(background, foreground, 0.14);
  const muted = mix(background, foreground, 0.055);
  const mutedForeground = mix(background, foreground, 0.58);

  root.style.setProperty('--background', hslValue(background));
  root.style.setProperty('--foreground', hslValue(foreground));
  root.style.setProperty('--card', hslValue(card));
  root.style.setProperty('--card-foreground', hslValue(foreground));
  root.style.setProperty('--muted', hslValue(muted));
  root.style.setProperty('--muted-foreground', hslValue(mutedForeground));
  root.style.setProperty('--primary', hslValue(primary));
  root.style.setProperty('--primary-foreground', hslValue(contrastColor(primary)));
  root.style.setProperty('--border', hslValue(border));
  root.style.setProperty('--ring', hslValue(primary));
  root.style.setProperty('--font-sans', fontStack(branding.bodyFont));
  root.style.setProperty('--font-heading', fontStack(branding.headingFont || branding.bodyFont));

  const radius = cssLength(branding.radius);
  if (radius) {
    root.style.setProperty('--radius-md', `calc(${radius} * 0.75)`);
    root.style.setProperty('--radius-lg', radius);
    root.style.setProperty('--radius-xl', `calc(${radius} * 1.25)`);
  }
}

export function notifyAdminOrganizationUpdated(organization: OrganizationSettings) {
  window.dispatchEvent(
    new CustomEvent<OrganizationSettings>(ADMIN_ORGANIZATION_UPDATED_EVENT, {
      detail: organization,
    }),
  );
}

function colorValue(value: string | undefined, fallback: string): Rgb {
  return parseHexColor(value) ?? parseHexColor(fallback)!;
}

function parseHexColor(value: string | undefined): Rgb | null {
  const raw = value?.trim();
  if (!raw) return null;
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].replace(/(.)/g, '$1$1') : match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function hslValue(color: Rgb) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    if (max === g) hue = (b - r) / delta + 2;
    if (max === b) hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

function mix(left: Rgb, right: Rgb, rightWeight: number): Rgb {
  const leftWeight = 1 - rightWeight;
  return {
    r: Math.round(left.r * leftWeight + right.r * rightWeight),
    g: Math.round(left.g * leftWeight + right.g * rightWeight),
    b: Math.round(left.b * leftWeight + right.b * rightWeight),
  };
}

function contrastColor(color: Rgb): Rgb {
  const luminance = [color.r, color.g, color.b]
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.55 ? { r: 2, g: 8, b: 23 } : { r: 248, g: 250, b: 252 };
}

function fontStack(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || /[;{}<>]/.test(normalized)) return 'var(--default-font-sans)';
  return `${normalized}, var(--default-font-sans)`;
}

function cssLength(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return '';
  return /^(\d+|\d*\.\d+)(px|rem|em)$/i.test(normalized) ? normalized : '';
}
