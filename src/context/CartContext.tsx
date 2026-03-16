import React, { createContext, useContext, useState, useEffect } from 'react';
import { SaleItem, Product } from '../types';
import { auth, db } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'cliente' | 'mesero' | 'cajero' | 'cocina';
}

interface CartContextType {
  cart: SaleItem[];
  favorites: Product[];
  addToCart: (item: SaleItem) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleFavorite: (product: Product) => void;
  isFavorite: (productId: string) => boolean;
  total: number;
  itemCount: number;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  triggerFlyAnimation: (e: React.MouseEvent | { clientX: number, clientY: number }, imageUrl: string, target: 'cart' | 'favorites') => void;
  animations: FlyingAnimation[];
  userProfile: UserProfile | null;
}

export interface FlyingAnimation {
  id: string;
  x: number;
  y: number;
  imageUrl: string;
  target: 'cart' | 'favorites';
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<SaleItem[]>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });

  const [favorites, setFavorites] = useState<Product[]>(() => {
    const saved = localStorage.getItem('favorites');
    return saved ? JSON.parse(saved) : [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [animations, setAnimations] = useState<FlyingAnimation[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        return onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setUserProfile(data as UserProfile);
            
            // Sync cart and favorites from Firestore if they exist and are different
            if (data.cart) {
              setCart(currentCart => {
                if (JSON.stringify(data.cart) === JSON.stringify(currentCart)) return currentCart;
                return data.cart;
              });
            }
            if (data.favorites) {
              setFavorites(currentFavs => {
                if (JSON.stringify(data.favorites) === JSON.stringify(currentFavs)) return currentFavs;
                return data.favorites;
              });
            }
          }
        });
      } else {
        setUserProfile(null);
        // Load from localStorage for guests
        const savedCart = localStorage.getItem('cart');
        const savedFavs = localStorage.getItem('favorites');
        if (savedCart) setCart(JSON.parse(savedCart));
        if (savedFavs) setFavorites(JSON.parse(savedFavs));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userProfile) {
      localStorage.setItem('cart', JSON.stringify(cart));
    } else {
      // Update Firestore
      const userRef = doc(db, 'users', userProfile.uid);
      updateDoc(userRef, { cart }).catch(err => console.error("Error syncing cart:", err));
    }
  }, [cart, userProfile]);

  useEffect(() => {
    if (!userProfile) {
      localStorage.setItem('favorites', JSON.stringify(favorites));
    } else {
      // Update Firestore
      const userRef = doc(db, 'users', userProfile.uid);
      updateDoc(userRef, { favorites }).catch(err => console.error("Error syncing favorites:", err));
    }
  }, [favorites, userProfile]);

  const addToCart = (item: SaleItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === item.productId);
      if (existing) {
        return prev.map(i => i.productId === item.productId 
          ? { ...i, quantity: i.quantity + item.quantity } 
          : i
        );
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setCart(prev => prev.map(i => i.productId === productId 
      ? { ...i, quantity: Math.max(1, quantity) } 
      : i
    ));
  };

  const clearCart = () => setCart([]);

  const toggleFavorite = (product: Product) => {
    setFavorites(prev => {
      const exists = prev.find(p => p.id === product.id);
      if (exists) {
        return prev.filter(p => p.id !== product.id);
      }
      return [...prev, product];
    });
  };

  const isFavorite = (productId: string) => {
    return favorites.some(p => p.id === productId);
  };

  const triggerFlyAnimation = (e: React.MouseEvent | { clientX: number, clientY: number }, imageUrl: string, target: 'cart' | 'favorites') => {
    const id = Math.random().toString(36).substr(2, 9);
    const x = 'clientX' in e ? e.clientX : (e as any).nativeEvent.clientX;
    const y = 'clientY' in e ? e.clientY : (e as any).nativeEvent.clientY;
    
    setAnimations(prev => [...prev, { id, x, y, imageUrl, target }]);
    
    setTimeout(() => {
      setAnimations(prev => prev.filter(a => a.id !== id));
    }, 1000);
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ 
      cart, favorites, addToCart, removeFromCart, updateQuantity, 
      clearCart, toggleFavorite, isFavorite, total, itemCount,
      searchTerm, setSearchTerm, triggerFlyAnimation, animations,
      userProfile
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
};
