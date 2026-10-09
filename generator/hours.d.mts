/**
 * Types for `hours.mjs`.
 *
 * The generator is deliberately plain JavaScript with zero dependencies,
 * because it ships to the frontend repo and runs from `prebuild` there. These
 * declarations exist so this repository's `tsc --noEmit` and its tests still get
 * full type checking across the boundary.
 */

export interface HoursWindow {
  open: string;
  close: string;
}

export interface StructuredHoursDay {
  day: number | string;
  windows: HoursWindow[];
}

export interface DisplayHoursEntry {
  days: string;
  time: string;
}

export declare const DASH: string;
export declare const RANGE_SEPARATOR: string;
export declare const DAY_ORDER: number[];
export declare const DAY_NAMES: Record<number, string>;

export declare function normaliseDayIndex(day: number | string): number;
export declare function formatTime(hhmm: string): string;
export declare function windowKey(windows: HoursWindow[]): string;
export declare function formatWindows(windows: HoursWindow[]): string;
export declare function validateStructuredHours(hours: unknown): string[];
export declare function toDisplayHours(hours: StructuredHoursDay[]): DisplayHoursEntry[];
export declare function labelDays(days: number[]): string;
export declare function assertDisplayHoursUsable(display: DisplayHoursEntry[]): void;
export declare function toStructuredExport(
  hours: StructuredHoursDay[],
): Array<{ day: number; windows: HoursWindow[] }>;
