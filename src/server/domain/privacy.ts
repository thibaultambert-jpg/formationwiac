// GDPR retention rules (section 10 and compliance audit E5). Proofs of
// external trainees are kept N years after their last training; internal
// trainees N years after they leave; technical attendance data (IP address,
// browser) and expired links for shorter periods. A legal hold blocks every
// purge.

export type RetentionPolicy = {
  /** Externals: years after the end of their last training. */
  externalYears: number;
  /** Internals: years after leaving the company. */
  internalYears: number;
  /** IP address and browser of signatures, in months. */
  technicalMonths: number;
  /** Expired or revoked links, in days after expiry. */
  tokenDays: number;
};

export const DEFAULT_RETENTION: RetentionPolicy = {
  externalYears: 5,
  internalYears: 5,
  technicalMonths: 12,
  tokenDays: 7,
};

export function retentionPolicy(
  settings: {
    dataRetentionYears: number;
    internalRetentionYears: number;
    technicalRetentionMonths: number;
    tokenRetentionDays: number;
  } | null,
): RetentionPolicy {
  if (!settings) return DEFAULT_RETENTION;
  return {
    externalYears: settings.dataRetentionYears,
    internalYears: settings.internalRetentionYears,
    technicalMonths: settings.technicalRetentionMonths,
    tokenDays: settings.tokenRetentionDays,
  };
}

/** Date before which a training ended long enough ago to be anonymized. */
export function retentionCutoff(now: Date, years: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}

export function monthsBefore(now: Date, months: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Last activity is the end of the latest training, or the creation date without any training. */
export function isRetentionExpired(lastActivity: Date, now: Date, years: number): boolean {
  return lastActivity < retentionCutoff(now, years);
}

export type RetentionSubject = {
  type: "internal" | "external";
  /** End of the latest training (creation date without training). */
  lastActivity: Date;
  /** Departure of an internal trainee (null while employed). */
  leftAt: Date | null;
  /** The participant or one of their sessions is under legal hold. */
  legalHold: boolean;
};

/**
 * The participant can be anonymized: externals after the end of their last
 * training plus the external period; internals only once they left, after
 * the latest of departure and last training plus the internal period.
 */
export function retentionExpired(subject: RetentionSubject, now: Date, policy: RetentionPolicy): boolean {
  if (subject.legalHold) return false;
  if (subject.type === "external") return isRetentionExpired(subject.lastActivity, now, policy.externalYears);
  if (!subject.leftAt) return false;
  const reference = subject.leftAt > subject.lastActivity ? subject.leftAt : subject.lastActivity;
  return isRetentionExpired(reference, now, policy.internalYears);
}

export function validRetentionPolicy(policy: RetentionPolicy): Partial<Record<keyof RetentionPolicy, string>> {
  const errors: Partial<Record<keyof RetentionPolicy, string>> = {};
  const check = (key: keyof RetentionPolicy, min: number, max: number, message: string) => {
    const value = policy[key];
    if (!Number.isInteger(value) || value < min || value > max) errors[key] = message;
  };
  check("externalYears", 1, 30, "Entre 1 et 30 ans.");
  check("internalYears", 1, 30, "Entre 1 et 30 ans.");
  check("technicalMonths", 1, 60, "Entre 1 et 60 mois.");
  check("tokenDays", 1, 365, "Entre 1 et 365 jours.");
  return errors;
}

export function anonymizedEmail(id: string): string {
  return `anonyme+${id}@anonymise.invalid`;
}

export const ANONYMIZED_FIRST_NAME = "Participant";
export const ANONYMIZED_LAST_NAME = "anonymisé";
