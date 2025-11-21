/**
 * Helper functions for daily summary calculations
 */

/**
 * Update min/max tracking for a temperature reading
 */
export function updateMinMax(
  current: number | null,
  min: number | null,
  max: number | null
): { min: number | null; max: number | null } {
  if (current === null) {
    return { min, max };
  }

  return {
    min: min === null || current < min ? current : min,
    max: max === null || current > max ? current : max,
  };
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateISO(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format temperature for display, handling null values
 */
export function formatTemp(value: number | null): string {
  return value !== null ? value.toFixed(1) : 'n/a';
}
