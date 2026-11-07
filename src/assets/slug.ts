


export function slug(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}


export function leagueSlug(name: unknown): string {
  if (typeof name !== 'string') return '';
  return slug(name.replace(/\./g, '').replace(/\bleagues?\b/gi, ' '));
}


export function leagueFamily(name: unknown): string {
  return leagueSlug(name).replace(/-(?:i{1,3}|iv|v|\d+)$/, '');
}
