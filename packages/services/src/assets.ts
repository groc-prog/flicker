/**
 * Returns the full image URL for a path returned by the TMDB Api.
 * @param imagePath - The path provided by the TMDB Api.
 * @returns The full image URL.
 */
export function getTmdbImageUrl(imagePath: string): string {
  return `https://image.tmdb.org/t/p/original${imagePath}`;
}
