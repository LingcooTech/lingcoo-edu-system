const BRAND_ICON_SELECTOR = 'link[data-fd-brand-icon="true"]';

function upsertIconLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    `${BRAND_ICON_SELECTOR}[rel="${rel}"]`,
  );
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    element.setAttribute('data-fd-brand-icon', 'true');
    document.head.appendChild(element);
  }
  element.href = href;
}

export function updateDocumentFavicon(rawHref?: string | null) {
  const href = rawHref?.trim();
  if (!href) {
    document.head
      .querySelectorAll<HTMLLinkElement>(BRAND_ICON_SELECTOR)
      .forEach((element) => element.remove());
    return;
  }

  upsertIconLink('icon', href);
  upsertIconLink('shortcut icon', href);
  upsertIconLink('apple-touch-icon', href);
}
