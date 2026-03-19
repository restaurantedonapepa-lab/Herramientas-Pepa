export interface Product {
  id: string;
  name: string;
  slug?: string;
  price: number;
  category: string;
  description: string;
  imageId: string;
  recipe: RecipeItem[];
  webRecipe?: RecipeItem[]; // Insumos exclusivos para pedidos web (empaques)
  active: boolean;
  packagingPrice?: number;
}

export interface Review {
  id: string;
  productId: string;
  userName: string;
  rating: number;
  comment: string;
  timestamp: any;
}

export interface RecipeItem {
  ingredientId: string;
  quantity: number;
}

export interface Ingredient {
  id: string;
  name: string;
  stock: number;
  unit: string;
  minStock: number;
  price?: number; // Precio o costo del insumo
}

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  paymentMethod: string;
  timestamp: any;
  clientName: string;
  table: string;
  status?: 'cancelled';
  isCreditPayment?: boolean;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  originalPrice?: number;
  note?: string;
}

export interface Table {
  id: string;
  number: number;
  items: SaleItem[];
  clientName: string;
  status: 'free' | 'busy';
  lastUpdate: any;
  isCredit?: boolean;
  saleId?: string;
  shippingInfo?: {
    name: string;
    phone: string;
    address: string;
    notes: string;
  };
}

export interface Expense {
  id: string;
  concept: string;
  category: string;
  amount: number;
  timestamp: any;
}

export interface BusinessSettings {
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  tableCount: number;
  currencySymbol: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes?: string;
  lastOrder?: any;
}
