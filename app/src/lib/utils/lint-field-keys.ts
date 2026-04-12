export function normalizeSectionKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/experience/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getSectionFieldKey(name: string): string {
  return `section:${normalizeSectionKey(name)}`;
}

export function getBulletFieldKey(name: string, index: number): string {
  return `${getSectionFieldKey(name)}:bullet:${index + 1}`;
}

export function getCoverLetterFieldKey(): string {
  return 'section:war-cover-letter';
}
