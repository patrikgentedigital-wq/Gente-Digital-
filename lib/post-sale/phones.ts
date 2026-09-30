export function normalizePhoneDigits(input: string): string {
  return String(input ?? '').replace(/\D/g, '');
}

export function isValidPhoneDigits(input: string): boolean {
  const digits = normalizePhoneDigits(input);
  return digits.length >= 10 && digits.length <= 15;
}

export function duplicatePhoneIndexes(inputs: string[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];

  inputs.forEach((input, index) => {
    const digits = normalizePhoneDigits(input);
    if (!digits) return;
    if (seen.has(digits)) {
      duplicates.push(index);
    } else {
      seen.add(digits);
    }
  });

  return duplicates;
}
