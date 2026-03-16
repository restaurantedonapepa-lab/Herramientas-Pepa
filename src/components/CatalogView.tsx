import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDriveImageUrl } from '../firebase';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { 
  Search, ShoppingCart, Heart, Info, X, 
  Plus, Minus, Trash2, ArrowRight, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CatalogView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const { cart, addToCart, removeFromCart, updateQuantity, total, itemCount } = useCart();

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

  const categories = useMemo(() => ['Todos', ...new Set(products.map(p => p.category))], [products]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || selectedCategory === 'Todos' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-20">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 px-4 py-4 border-b border-gray-100">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-red-200">DP</div>
            <div className="hidden sm:block">
              <h1 className="font-black text-gray-900 text-xl leading-none">Doña Pepa</h1>
              <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mt-1">Sabor Tradicional</p>
            </div>
          </div>
          
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="¿Qué se te antoja hoy?..."
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-red-500 transition outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button 
            onClick={() => setShowCart(true)}
            className="p-3 bg-gray-900 text-white rounded-2xl hover:bg-black transition relative shadow-xl"
          >
            <ShoppingCart className="w-6 h-6" />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-gray-900 rounded-[40px] p-12 relative overflow-hidden text-white">
          <div className="relative z-10 max-w-lg">
            <h2 className="text-5xl font-black mb-4 leading-tight">El sabor que une a la familia.</h2>
            <p className="text-gray-400 text-lg mb-8 font-medium">Disfruta de nuestra selección premium de platos tradicionales preparados con amor.</p>
            <button className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-red-900/20 flex items-center gap-2">
              ORDENAR AHORA <ArrowRight className="w-5 h-5" />
            </button>
          </div>
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
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
                <Link 
                  to={`/${product.slug || product.name.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                  className="block aspect-[4/3] relative overflow-hidden bg-gray-50"
                >
                  <img 
                    src={getDriveImageUrl(product.imageId)} 
                    alt={product.name}
                    className="w-full h-full object-cover transition duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-4 right-4">
                    <button className="p-3 bg-white/90 backdrop-blur-sm rounded-full text-gray-400 hover:text-red-600 shadow-xl transition">
                      <Heart className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                    <span className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                      Ver Detalles <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </Link>
                
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
                      onClick={() => addToCart({ productId: product.id, name: product.name, price: product.price, quantity: 1 })}
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

      {/* Cart Sidebar */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCart(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-[101] shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                  <ShoppingCart className="w-8 h-8 text-red-600" /> Carrito
                </h2>
                <button onClick={() => setShowCart(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {cart.map(item => (
                  <div key={item.productId} className="flex gap-4 group">
                    <div className="w-20 h-20 bg-gray-50 rounded-2xl overflow-hidden flex-shrink-0">
                      <img 
                        src={getDriveImageUrl(products.find(p => p.id === item.productId)?.imageId || '')} 
                        alt={item.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-black text-gray-800 leading-tight">{item.name}</h4>
                        <button onClick={() => removeFromCart(item.productId)} className="text-gray-300 hover:text-red-600 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm font-black text-red-600 mb-3">${item.price.toLocaleString()}</p>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-1">
                          <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-white rounded-lg transition shadow-sm">
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="font-black text-gray-800 w-6 text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-white rounded-lg transition shadow-sm">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {cart.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-300">
                    <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
                    <p className="font-black uppercase tracking-widest text-sm">Tu carrito está vacío</p>
                  </div>
                )}
              </div>

              <div className="p-8 bg-gray-50 border-t border-gray-100 space-y-6">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Total Estimado</span>
                  <span className="text-4xl font-black text-gray-900">${total.toLocaleString()}</span>
                </div>
                <button 
                  disabled={cart.length === 0}
                  className="w-full py-5 bg-red-600 hover:bg-red-700 text-white font-black text-xl rounded-3xl shadow-xl shadow-red-900/10 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                >
                  FINALIZAR PEDIDO
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
