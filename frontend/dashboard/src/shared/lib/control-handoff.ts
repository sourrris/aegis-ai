export function resolveExternalUrl(target: string): string {
  return new URL(target, window.location.origin).toString();
}
