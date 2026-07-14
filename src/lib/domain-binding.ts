export function normalizeRequestHost(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('[')) {
    const closingBracket = normalized.indexOf(']');
    return closingBracket >= 0 ? normalized.slice(1, closingBracket) : normalized;
  }

  return normalized.split(':', 1)[0]?.replace(/\.$/, '') ?? '';
}

export function isRequestHostAllowed(input: {
  bindingSource: string;
  boundHost?: string;
  requestHost?: string;
}): boolean {
  if (!input.bindingSource || input.bindingSource === 'none') {
    return true;
  }

  const boundHost = normalizeRequestHost(input.boundHost);
  const requestHost = normalizeRequestHost(input.requestHost);
  return Boolean(boundHost) && requestHost === boundHost;
}
