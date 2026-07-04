// Builds the payload for onShareAppMessage / onShareTimeline. Drops an empty
// imageUrl so WeChat falls back to a page snapshot instead of a blank card.
import { fetchMiniShareSettings, type MiniShareSettings } from '../services/api';

let miniShareSettings: MiniShareSettings | null = null;
let miniShareSettingsPromise: Promise<MiniShareSettings | null> | null = null;

export function shareCard(title: string, path: string, imageUrl?: string | null) {
  return imageUrl ? { title, path, imageUrl } : { title, path };
}

export function timelineCard(title: string, query: string, imageUrl?: string | null) {
  return imageUrl ? { title, query, imageUrl } : { title, query };
}

export function configuredShareTitle(key: keyof MiniShareSettings, fallback: string) {
  const configured = miniShareSettings?.[key]?.trim();
  return configured || fallback;
}

function warmMiniShareSettings() {
  if (!miniShareSettingsPromise) {
    miniShareSettingsPromise = fetchMiniShareSettings()
      .then((settings) => {
        miniShareSettings = settings;
        return settings;
      })
      .catch(() => {
        miniShareSettingsPromise = null;
        return null;
      });
  }
  return miniShareSettingsPromise;
}

export function enableShareMenu() {
  void warmMiniShareSettings();
  const wxWithShare = wx as typeof wx & {
    showShareMenu?: (options: {
      withShareTicket?: boolean;
      menus?: Array<'shareAppMessage' | 'shareTimeline'>;
      success?: () => void;
      fail?: () => void;
    }) => void;
  };
  wxWithShare.showShareMenu?.({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline'],
  });
}
