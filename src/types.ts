export interface Product {
  product_id: string;
  product_name: string;
  brand_name: string;
  category: string;
  barcode: string;
  price_per_unit: number;
  unit_type: 'kg' | 'g' | 'liter' | 'ml' | 'pcs';
  stock_quantity: number;
  image_url?: string;
}

export interface CartItem extends Product {
  quantity: number;
  displayQuantity: number;
  selectedUnit: string;
  subtotal: number;
}

export interface Sale {
  id: string;
  timestamp: number;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: 'Cash' | 'UPI' | 'Card';
  customerName?: string;
  customerPhone?: string;
}

export interface AppSettings {
  shopName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  footerNote: string;
  upiId: string;
  taxRate: number;
  currency: string;
  lowStockThreshold: number;
  logo?: string;
}
