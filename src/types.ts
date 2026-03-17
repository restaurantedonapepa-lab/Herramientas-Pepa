export interface Product {
  id: string;
  name: string;
  slug?: string;
  price: number;
  category: string;
  description: string;
  imageId: string;
  recipe: RecipeItem[];
  active: boolean;
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
}

export interface Expense {
  id: string;
  concept: string;
  category: string;
  amount: number;
  timestamp: any;
}
