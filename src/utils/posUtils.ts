import { Product, CartItem } from '../types';

export const calculatePrice = (pricePerUnit: number, quantity: number, unit: string): number => {
  if (unit === 'g' || unit === 'ml') {
    return (pricePerUnit / 1000) * quantity;
  }
  return pricePerUnit * quantity;
};

export const convertToBaseUnit = (quantity: number, unit: string): number => {
  if (unit === 'g' || unit === 'ml') {
    return quantity / 1000;
  }
  return quantity;
};

export const formatCurrency = (amount: number, symbol: string = '₹'): string => {
  return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const generateInvoiceId = (): string => {
  return `INV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
};
