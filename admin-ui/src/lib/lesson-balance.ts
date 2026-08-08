/** A package balance is always shown as remaining lessons over its own total. */
export function formatPackageLessonBalance(remaining: number, total: number) {
  return `${remaining} / ${total} 节`;
}
