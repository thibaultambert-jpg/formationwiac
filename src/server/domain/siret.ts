export function normalizeSiret(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

/** 14 digits with a valid Luhn checksum (La Poste establishments use a digit sum rule). */
export function isValidSiret(value: string): boolean {
  const siret = normalizeSiret(value);
  if (!/^\d{14}$/.test(siret)) return false;

  if (siret.startsWith("356000000")) {
    const sum = [...siret].reduce((total, digit) => total + Number(digit), 0);
    return sum % 5 === 0;
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = Number(siret[13 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
