// Builds the payload for onShareAppMessage / onShareTimeline. Drops an empty
// imageUrl so WeChat falls back to a page snapshot instead of a blank card.
export function shareCard(title: string, path: string, imageUrl?: string | null) {
  return imageUrl ? { title, path, imageUrl } : { title, path };
}

export function timelineCard(title: string, query: string, imageUrl?: string | null) {
  return imageUrl ? { title, query, imageUrl } : { title, query };
}

export function enableShareMenu() {
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
