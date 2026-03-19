import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDriveImageUrl, auth } from '../firebase';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { 
  Search, ShoppingCart, Heart, Info, X, 
  Plus, Minus, Trash2, ArrowRight, Star, Globe
} from 'lucide-react';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CatalogView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [productOrder, setProductOrder] = useState<string[]>([]);
  const [clientInfo, setClientInfo] = useState({ name: '', phone: '', address: '', notes: '' });
  const { 
    cart, addToCart, removeFromCart, updateQuantity, total, itemCount, 
    clearCart, toggleFavorite, isFavorite, searchTerm, triggerFlyAnimation 
  } = useCart();

  useEffect(() => {
    const q = query(collection(db, 'products'), where('active', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      // Filter: only show products with imageId
      setProducts(prods.filter(p => p.imageId && p.imageId.trim() !== ''));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setCategoryOrder([]);
        setProductOrder([]);
        return;
      }

      const unsubCategoryOrder = onSnapshot(doc(db, 'users', user.uid, 'settings', 'category_order'), (snapshot) => {
        if (snapshot.exists()) {
          setCategoryOrder(snapshot.data().order || []);
        }
      });

      const unsubProductOrder = onSnapshot(doc(db, 'users', user.uid, 'settings', 'product_order'), (snapshot) => {
        if (snapshot.exists()) {
          setProductOrder(snapshot.data().order || []);
        }
      });

      return () => {
        unsubCategoryOrder();
        unsubProductOrder();
      };
    });

    return () => unsubscribeAuth();
  }, []);

  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    const sorted = uniqueCategories.sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);
      const indexB = categoryOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    return ['Todos', ...sorted];
  }, [products, categoryOrder]);

  const filteredProducts = useMemo(() => {
    let filtered = products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || selectedCategory === 'Todos' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      const indexA = productOrder.indexOf(a.id);
      const indexB = productOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [products, selectedCategory, searchTerm, productOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-20">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-gray-900 rounded-[40px] p-8 sm:p-12 relative overflow-hidden text-white">
          <div className="relative z-10 max-w-lg">
            <h2 className="text-4xl sm:text-5xl font-black mb-4 leading-tight">El sabor que une a la familia.</h2>
            <p className="text-gray-400 text-lg mb-8 font-medium">Desde 1957 preparamos cada plato con ingredientes frescos y mucho amor para que te sientas como en casa.</p>
            <div className="flex flex-wrap gap-4">
              <button className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-red-900/20 flex items-center gap-2">
                ORDENAR AHORA <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none hidden md:block">
            <img src="https://picsum.photos/seed/food/800/800" alt="Hero" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border-2",
                (selectedCategory === cat || (!selectedCategory && cat === 'Todos'))
                  ? 'bg-red-600 border-red-600 text-white shadow-xl shadow-red-200'
                  : 'bg-white border-gray-100 text-gray-400 hover:border-red-200'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map(product => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={product.id}
                className="bg-white rounded-[32px] overflow-hidden border border-gray-50 shadow-sm hover:shadow-2xl transition-all duration-500 group"
              >
                <div className="aspect-[4/3] relative overflow-hidden bg-gray-50">
                  <Link 
                    to={`/${product.slug || product.name.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                    className="block w-full h-full"
                  >
                    <img 
                      src={getDriveImageUrl(product.imageId)} 
                      alt={product.name}
                      className="w-full h-full object-cover transition duration-700 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                  </Link>
                  <div className="absolute top-4 right-4">
                    <button 
                      onClick={(e) => {
                        toggleFavorite(product);
                        if (!isFavorite(product.id)) {
                          triggerFlyAnimation(e, getDriveImageUrl(product.imageId), 'favorites');
                        }
                      }}
                      className={cn(
                        "p-3 rounded-full shadow-xl transition backdrop-blur-sm",
                        isFavorite(product.id) 
                          ? "bg-red-600 text-white" 
                          : "bg-white/90 text-gray-400 hover:text-red-600"
                      )}
                    >
                      <Heart className={cn("w-4 h-4", isFavorite(product.id) && "fill-current")} />
                    </button>
                  </div>
                  <Link 
                    to={`/${product.slug || product.name.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                    className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6"
                  >
                    <span className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                      Ver Detalles <ArrowRight className="w-4 h-4" />
                    </span>
                  </Link>
                </div>
                
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-red-600 uppercase tracking-widest bg-red-50 px-3 py-1 rounded-full">
                      {product.category}
                    </span>
                    <div className="flex items-center gap-1 text-orange-500">
                      <Star className="w-3 h-3 fill-current" />
                      <span className="text-[10px] font-black">4.9</span>
                    </div>
                  </div>
                  <h3 className="font-black text-gray-900 text-lg leading-tight mb-2 group-hover:text-red-600 transition-colors">{product.name}</h3>
                  <p className="text-xs text-gray-400 font-medium line-clamp-2 mb-6 h-8">{product.description}</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <span className="text-2xl font-black text-gray-900">
                      ${product.price.toLocaleString()}
                    </span>
                    <button 
                      onClick={(e) => {
                        addToCart({ productId: product.id, name: product.name, price: product.price, quantity: 1 });
                        triggerFlyAnimation(e, getDriveImageUrl(product.imageId), 'cart');
                      }}
                      className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center hover:bg-black hover:scale-110 transition-all shadow-lg"
                    >
                      <Plus className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        
        {filteredProducts.length === 0 && (
          <div className="text-center py-32">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Info className="w-10 h-10 text-gray-200" />
            </div>
            <p className="text-gray-400 font-black uppercase tracking-widest">No se encontraron platos</p>
          </div>
        )}
      </div>
    </div>
  );
};
