// GDPR retention rules (section 10): proofs kept N years after the training.

/** Date before which a training ended long enough ago to be anonymized. */
export function retentionCutoff(now: Date, years: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}

/** Last activity is the end of the latest training, or the creation date without any training. */
export function isRetentionExpired(lastActivity: Date, now: Date, years: number): boolean {
  return lastActivity < retentionCutoff(now, years);
}

export function anonymizedEmail(id: string): string {
  return `anonyme+${id}@anonymise.invalid`;
}

export const ANONYMIZED_FIRST_NAME = "Participant";
export const ANONYMIZED_LAST_NAME = "anonymisé";
