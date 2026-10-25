import { Sale } from '../types';

export function normalizePaymentMethod(raw: string): string {
  if (!raw) return 'Efectivo';
  const lower = raw.trim().toLowerCase();
  if (lower.includes('crédit') || lower.includes('credit') || lower.includes('fiado')) return 'Crédito';
  if (lower.includes('nequi') || lower.includes('transf') || lower.includes('bancolombia')) return 'Nequi';
  if (lower.includes('daviplata') || lower.includes('davi')) return 'Daviplata';
  if (lower.includes('tarjeta') || lower.includes('datafono') || lower.includes('bold') || lower.includes('pos')) return 'Tarjeta';
  if (lower.includes('qr')) return 'QR';
  if (lower.includes('efectivo') || lower.includes('cash')) return 'Efectivo';
  return 'Efectivo';
}

export interface ParsedPaymentResult {
  isCredit: boolean;
  isMixed: boolean;
  methodTotals: Record<string, number>;
}

export function parseSalePaymentMethods(sale: { total?: number | string; paymentMethod?: string }): ParsedPaymentResult {
  const saleTotal = Number(sale.total) || 0;
  const rawMethod = (sale.paymentMethod || 'Efectivo').trim();
  const lower = rawMethod.toLowerCase();

  const isCredit = normalizePaymentMethod(rawMethod) === 'Crédito';
  if (isCredit) {
    return {
      isCredit: true,
      isMixed: false,
      methodTotals: { 'Crédito': saleTotal }
    };
  }

  const isMixed = lower.startsWith('mixto') || rawMethod.includes('|') || 
                  (lower.includes('nequi') && lower.includes('efectivo')) || 
                  (lower.includes('tarjeta') && lower.includes('efectivo')) ||
                  (lower.includes('daviplata') && lower.includes('efectivo'));

  if (!isMixed) {
    const norm = normalizePaymentMethod(rawMethod);
    return {
      isCredit: false,
      isMixed: false,
      methodTotals: { [norm]: saleTotal }
    };
  }

  // Regex matches method name followed by its numeric value even with commas or dots ($50,000 or $50.000)
  const regex = /(Efectivo|Nequi|Daviplata|Tarjeta|QR|Cr[eé]dito|Transferencia|Bancolombia)[^0-9]*([0-9.,]+)/gi;
  let match: RegExpExecArray | null;
  let parsedSum = 0;
  const methodTotals: Record<string, number> = {};

  while ((match = regex.exec(rawMethod)) !== null) {
    const methodStr = match[1];
    const cleanNum = match[2].replace(/[^0-9]/g, '');
    const val = parseInt(cleanNum, 10) || 0;
    const norm = normalizePaymentMethod(methodStr);
    if (val > 0) {
      methodTotals[norm] = (methodTotals[norm] || 0) + val;
      parsedSum += val;
    }
  }

  if (parsedSum === 0) {
    const norm = normalizePaymentMethod(rawMethod);
    methodTotals[norm] = saleTotal;
  } else if (saleTotal > 0 && parsedSum !== saleTotal) {
    const diff = saleTotal - parsedSum;
    const firstMethod = Object.keys(methodTotals)[0] || 'Efectivo';
    methodTotals[firstMethod] = (methodTotals[firstMethod] || 0) + diff;
  }

  return {
    isCredit: false,
    isMixed: true,
    methodTotals
  };
}

export function saleMatchesMethod(sale: { paymentMethod?: string; total?: number | string }, filter: string): boolean {
  if (!filter || filter === 'todos') return true;
  const parsed = parseSalePaymentMethods(sale);
  if (filter === 'Crédito') {
    return parsed.isCredit;
  }
  return (parsed.methodTotals[filter] || 0) > 0;
}

export function getMethodAmountFromSale(sale: { paymentMethod?: string; total?: number | string }, method: string): number {
  if (!method || method === 'todos') return Number(sale.total) || 0;
  const parsed = parseSalePaymentMethods(sale);
  return parsed.methodTotals[method] || 0;
}
