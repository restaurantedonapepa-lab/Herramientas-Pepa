export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  imageId: string;
  recipe: RecipeItem[];
  active: boolean;
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
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Expense {
  id: string;
  concept: string;
  category: string;
  amount: number;
  timestamp: any;
}
