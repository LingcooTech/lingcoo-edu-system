const ATTRIBUTION_KEY = 'fd_edu_attribution';

export interface Attribution {
  source?: string;
  campaign?: string;
  course?: string;
  medium?: string;
}

/**
 * Reads acquisition params from the current URL and persists them for the
 * session, so a parent who scans a campaign QR keeps the attribution while
 * browsing course list → detail → registration. Last-touch wins per key.
 */
export function captureAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const next: Attribution = {};
  const source = params.get('source');
  const campaign = params.get('campaign');
  const course = params.get('course');
  const medium = params.get('medium') ?? (campaign ? 'qr_code' : null);
  if (source) next.source = source;
  if (campaign) next.campaign = campaign;
  if (course) next.course = course;
  if (medium) next.medium = medium;

  if (Object.keys(next).length > 0) {
    const merged = { ...getAttribution(), ...next };
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(merged));
    return merged;
  }
  return getAttribution();
}

export function getAttribution(): Attribution {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}
