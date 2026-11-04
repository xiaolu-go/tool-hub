import Decimal from 'decimal.js';

// Keep domain precision independent of other consumers' global Decimal settings.
export const Money = Decimal.clone({ precision: 64, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -100, toExpPos: 100 });
export const money = (value: Decimal.Value) => new Money(value).toFixed(2);
