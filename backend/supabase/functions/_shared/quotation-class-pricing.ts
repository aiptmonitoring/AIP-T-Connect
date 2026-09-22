export const classTypes = ['Per mark per class', 'Multi-class', 'Up to 3 classes', 'Up to 5 classes'] as const;
export type ClassType = typeof classTypes[number];
export type Price = { official_fee: number; attorney_fee: number; total_fee: number; currency?: string; available?: boolean; issue?: string | null };
export type ClassRate = Price & { country_id: string; class_type: ClassType; class_number: number };
export type PricingRow = Price & { label: string; class_from: number; class_to: number };
export const roundPrice = (value: number) => Math.round(value * 100) / 100;
export const ordinal = (value: number) => `${value}${value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] || 'th'}`;

export function validatePrice(price: Price): Price {
  if (price.available === false) throw Error(price.issue || 'This published fee is unavailable.');
  if (price.currency !== 'USD' || ![price.official_fee, price.attorney_fee, price.total_fee].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0) || roundPrice(price.total_fee) < roundPrice(price.official_fee + price.attorney_fee)) {
    throw Error('A complete published USD fee is required.');
  }
  return price;
}

export function availableClassTypes(countryIds: string[], rates: ClassRate[], perMarkCountryIds: string[]): ClassType[] {
  if (!countryIds.length) return [];
  return classTypes.filter(type => countryIds.every(id => type === 'Per mark per class'
    ? perMarkCountryIds.includes(id)
    : rates.some(rate => rate.country_id === id && rate.class_type === type && rate.class_number === 1 && rate.available !== false)));
}

/** Class numbers identify goods/services; ordinal class positions determine fees. */
export function calculateClassPricing(base: Price, countryId: string, type: ClassType, count: number, rates: ClassRate[]) {
  if (type === 'Per mark per class') validatePrice(base);
  if (!classTypes.includes(type)) throw Error('Select an available type of class.');
  if (!Number.isInteger(count) || count < 1 || count > 45) throw Error('Select a whole-number class count from 1 to 45.');
  const rows: PricingRow[] = [];
  const rateAt = (position: number) => {
    const matches = rates.filter(rate => rate.country_id === countryId && rate.class_type === type && rate.class_number === position);
    if (matches.length !== 1) throw Error(`${type}: ${ordinal(position)} class has ${matches.length ? 'multiple published rates' : 'no published rate'} on the Fees page.`);
    return validatePrice(matches[0]);
  };
  if (type === 'Per mark per class') {
    for (let position = 1; position <= count; position++) rows.push({ ...base, label: `${ordinal(position)} class`, class_from: position, class_to: position });
  } else {
    const bundle = type === 'Up to 3 classes' ? 3 : type === 'Up to 5 classes' ? 5 : 1;
    const first = rateAt(1);
    // A bundle is charged once. Conflicting configured bundle values need correction.
    for (let position = 2; position <= Math.min(bundle, count); position++) {
      const next = rateAt(position);
      if (['official_fee', 'attorney_fee', 'total_fee'].some(key => next[key as keyof Price] !== first[key as keyof Price])) throw Error(`${type}: included classes have inconsistent fees on the Fees page.`);
    }
    rows.push({ ...first, label: bundle === 1 ? '1st class' : `1st to ${ordinal(Math.min(bundle, count))} class (up to ${bundle} classes: one fee)`, class_from: 1, class_to: Math.min(bundle, count) });
    for (let position = bundle + 1; position <= count; position++) rows.push({ ...rateAt(position), label: `Additional ${ordinal(position)} class`, class_from: position, class_to: position });
  }
  return { rows, official_fee: roundPrice(rows.reduce((sum, row) => sum + row.official_fee, 0)), attorney_fee: roundPrice(rows.reduce((sum, row) => sum + row.attorney_fee, 0)), total_fee: roundPrice(rows.reduce((sum, row) => sum + row.total_fee, 0)) };
}
