import { Sale, Expense } from '../types';

const SALES_STORAGE_KEY = 'donapepa_pos_sales';
const EXPENSES_STORAGE_KEY = 'donapepa_pos_expenses';

export function getLocalSales(): Sale[] {
  try {
    const raw = localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error reading local sales:', e);
    return [];
  }
}

export function saveLocalSale(sale: Sale): void {
  try {
    const current = getLocalSales();
    const existingIndex = current.findIndex(s => s.id === sale.id);
    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...sale };
    } else {
      current.unshift(sale);
    }
    // Limit storage to the most recent 5000 transactions
    localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(current.slice(0, 5000)));
  } catch (e) {
    console.error('Error saving local sale:', e);
  }
}

export function saveMultipleLocalSales(newSales: Sale[]): void {
  try {
    if (!newSales || newSales.length === 0) return;
    const current = getLocalSales();
    const map = new Map<string, Sale>();
    current.forEach(s => {
      if (s?.id) map.set(s.id, s);
    });
    newSales.forEach(s => {
      if (s?.id) map.set(s.id, s);
    });
    const merged = Array.from(map.values());
    localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(merged.slice(0, 5000)));
  } catch (e) {
    console.error('Error saving multiple local sales:', e);
  }
}

export function updateLocalSale(id: string, updates: Partial<Sale>): void {
  try {
    const current = getLocalSales();
    const idx = current.findIndex(s => s.id === id);
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...updates };
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(current));
    }
  } catch (e) {
    console.error('Error updating local sale:', e);
  }
}

export function getLocalExpenses(): Expense[] {
  try {
    const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error reading local expenses:', e);
    return [];
  }
}

export function saveLocalExpense(expense: Expense): void {
  try {
    const current = getLocalExpenses();
    const existingIndex = current.findIndex(e => e.id === expense.id);
    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...expense };
    } else {
      current.unshift(expense);
    }
    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(current.slice(0, 2000)));
  } catch (e) {
    console.error('Error saving local expense:', e);
  }
}

export function saveMultipleLocalExpenses(newExpenses: Expense[]): void {
  try {
    if (!newExpenses || newExpenses.length === 0) return;
    const current = getLocalExpenses();
    const map = new Map<string, Expense>();
    current.forEach(e => {
      if (e?.id) map.set(e.id, e);
    });
    newExpenses.forEach(e => {
      if (e?.id) map.set(e.id, e);
    });
    const merged = Array.from(map.values());
    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(merged.slice(0, 2000)));
  } catch (e) {
    console.error('Error saving multiple local expenses:', e);
  }
}
