// SQLite's native directory and File's URI use different representations.
export function sqliteDirectoryUri(directory: string): string {
  if (!directory.startsWith('/')) return directory;
  return `file://${directory.split('/').map(encodeURIComponent).join('/')}`;
}
