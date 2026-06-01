/**
 * src/lib/units.ts
 * Centralized utility for handling metric (DB) to imperial (Display) conversions.
 */

export type UnitSystem = 'metric' | 'imperial'

// --- Conversion Constants ---
export const KM_PER_MILE = 1.609344
export const L_PER_GAL = 3.785411
export const KML_TO_MPG = 2.352145

// --- Formatting (Metric DB -> Display) ---

/**
 * Formats distance from km to preferred system.
 * Returns integer miles or km.
 */
export function formatDistance(km: number, system: UnitSystem): number {
  return system === 'metric' ? Math.round(km) : Math.round(km / KM_PER_MILE)
}

/**
 * Formats volume from liters to preferred system.
 * Returns value with up to 3 decimals (standard for fuel pumps).
 */
export function formatVolume(liters: number, system: UnitSystem): number {
  const val = system === 'metric' ? liters : liters / L_PER_GAL
  return parseFloat(val.toFixed(3))
}

/**
 * Formats efficiency from km/L to preferred system (MPG or km/L).
 */
export function formatEfficiency(kml: number, system: UnitSystem): number {
  const val = system === 'metric' ? kml : kml * KML_TO_MPG
  return parseFloat(val.toFixed(1))
}

// --- Parsing (Display -> Metric DB) ---

/**
 * Parses odometer input into km.
 */
export function parseOdometer(displayVal: number | string, system: UnitSystem): number {
  const num = typeof displayVal === 'string' ? parseFloat(displayVal) : displayVal
  if (isNaN(num)) return 0
  return system === 'metric' ? Math.round(num) : Math.round(num * KM_PER_MILE)
}

/**
 * Parses volume input into liters.
 */
export function parseVolume(displayVal: number | string, system: UnitSystem): number {
  const num = typeof displayVal === 'string' ? parseFloat(displayVal) : displayVal
  if (isNaN(num)) return 0
  return system === 'metric' ? num : num * L_PER_GAL
}

// --- Labels ---

export function getDistanceLabel(system: UnitSystem): string {
  return system === 'metric' ? 'km' : 'mi'
}

export function getVolumeLabel(system: UnitSystem): string {
  return system === 'metric' ? 'L' : 'gal'
}

export function getEfficiencyLabel(system: UnitSystem): string {
  return system === 'metric' ? 'km/L' : 'MPG'
}
