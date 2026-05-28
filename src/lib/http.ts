export function parseCorsOrigin(value: string): true | string[] {
  if (value.trim() === '*') {
    return true;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function required(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }

  return value;
}
