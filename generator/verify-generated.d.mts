/** Types for `verify-generated.mjs`. See `hours.d.mts` for why these exist. */

export interface Difference {
  path: string;
  actual: unknown;
  expected: unknown;
}

export interface ExpectedDifference extends Difference {
  /** The decision that makes this difference intended rather than a defect. */
  why: string;
}

export interface VerifyResult {
  ok: boolean;
  unexpected: Difference[];
  expected: ExpectedDifference[];
  actual: unknown;
}

/** Extracts and evaluates an `export const <name> = <literal>` from source. */
export declare function extractExport(source: string, name: string): unknown;

export declare function diff(
  actual: unknown,
  expected: unknown,
  path?: string,
  out?: Difference[],
): Difference[];

export declare const EXPECTED_DIFFERENCES: Array<{ suffix: string; why: string }>;

export declare function classify(differences: Difference[]): {
  expected: ExpectedDifference[];
  unexpected: Difference[];
};

export declare function verifyExport(options: {
  generatedSource: string;
  exportName: string;
  snapshotValue: unknown;
}): VerifyResult;

export declare function formatReport(name: string, result: VerifyResult): string;
