import { ExchangeRate } from '../types';

export class CurrencyConverter {
  static convert(amount: number, fromCurrency: string, toCurrency: string, rates: ExchangeRate[]): number {
    if (fromCurrency === toCurrency) return amount;
    
    // If fromCurrency is RMB (CNY), rate is 1.
    // rates store the rate of other currencies to CNY. e.g. USD rate = 7.2 means 1 USD = 7.2 CNY.
    const fromRate = fromCurrency === 'CNY' ? 1 : rates.find(r => r.currency === fromCurrency)?.rate || 1;
    const toRate = toCurrency === 'CNY' ? 1 : rates.find(r => r.currency === toCurrency)?.rate || 1;
    
    // Convert 'from' to RMB
    const amountInRMB = amount * fromRate;
    
    // Convert RMB to 'to'
    return amountInRMB / toRate;
  }

  static getMainCurrencyAmount(amount: number, currency: string, rates: ExchangeRate[]): number {
    return this.convert(amount, currency, 'CNY', rates);
  }
}
