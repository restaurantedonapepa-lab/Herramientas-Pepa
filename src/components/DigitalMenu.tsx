import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  MapPin, 
  Phone, 
  Utensils, 
  Search,
  ShoppingCart,
  Heart,
  MessageCircle,
  Plus,
  Star,
  ChevronUp,
  Info,
  Menu as MenuIcon,
  X,
  Trash2
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { Product } from '../types';
import { useCart, FlyingAnimation } from '../context/CartContext';
import { Link } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FlyingImage: React.FC<{ animation: FlyingAnimation }> = ({ animation }) => {
  const targetId = animation.target === 'cart' ? 'cart-button' : 'favorites-button';
  const [targetPos, setTargetPos] = React.useState({ x: window.innerWidth, y: window.innerHeight });

  React.useEffect(() => {
    const target = document.getElementById(targetId);
    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  }, [targetId]);

  return (
    <motion.div
      initial={{ x: animation.x, y: animation.y, scale: 1, rotate: 0, opacity: 1 }}
      animate={{ 
        x: targetPos.x - 20, 
        y: targetPos.y - 20, 
        scale: 0.2, 
        rotate: 360, 
        opacity: 0 
      }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed z-[9999] w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white pointer-events-none shadow-xl"
    >
      {animation.target === 'cart' ? <ShoppingCart className="w-5 h-5" /> : <Heart className="w-5 h-5 fill-current" />}
    </motion.div>
  );
};

export const DigitalMenu: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [isScrolled, setIsScrolled] = useState(false);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [productOrder, setProductOrder] = useState<string[]>([]);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);

  const { 
    cart, favorites, addToCart, removeFromCart, updateQuantity, total, itemCount, 
    toggleFavorite, isFavorite, triggerFlyAnimation, animations,
    setShowCheckoutForm, searchTerm, setSearchTerm
  } = useCart();

  // Fetch Products
  useEffect(() => {
    const q = query(collection(db, 'products'), where('active', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => unsubscribe();
  }, []);

  // Fetch User Preferences (Sorting)
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

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Category Logic
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

  // Filtering Logic
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });

    return filtered.sort((a, b) => {
      const indexA = productOrder.indexOf(a.id);
      const indexB = productOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [products, searchTerm, productOrder]);

  const scrollToCategory = (cat: string) => {
    setSelectedCategory(cat);
    setShowCategoryMenu(false);
    if (cat === 'Todos') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const element = document.getElementById(cat);
    if (element) {
      const offset = 100;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const getProductWebPrice = (product: Product) => {
    return product.price + (product.packagingPrice || 0);
  };

  const groupedProducts = useMemo(() => {
    const groups: { [key: string]: Product[] } = {};
    filteredProducts.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [filteredProducts]);

  const sortedCategoryKeys = useMemo(() => {
    return Object.keys(groupedProducts).sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);
      const indexB = categoryOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [groupedProducts, categoryOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Hero Section */}
      <section className="relative h-[25vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1920" 
            alt="Food Background" 
            className="w-full h-full object-cover opacity-20 scale-110"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/50 to-[#0a0a0a]" />
        </div>
        
        <div className="relative z-10 text-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          >
            <div className="w-14 h-14 mx-auto mb-3 bg-white rounded-full p-1.5 shadow-2xl shadow-orange-500/20">
              <img 
                src="https://i.ibb.co/vB8S88S/logo-pepa.png" 
                alt="Doña Pepa Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://cdn-icons-png.flaticon.com/512/3448/3448609.png';
                }}
              />
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase mb-0.5">
              Menú <span className="text-orange-500">Doña Pepa</span>
            </h1>
            <p className="text-gray-500 text-[8px] md:text-[9px] tracking-[0.5em] uppercase font-bold">
              Sabor Tradicional • Desde 1957
            </p>
          </motion.div>
        </div>
      </section>

      {/* Sticky Header with Search and Menu Button */}
      <div className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        isScrolled ? "bg-[#0a0a0a]/95 backdrop-blur-md shadow-2xl" : "bg-transparent"
      )}>
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Menu Button */}
            <div className="relative">
              <button 
                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-orange-500 hover:bg-white/10 transition-all"
              >
                <MenuIcon className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {showCategoryMenu && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowCategoryMenu(false)}
                      className="fixed inset-0 z-40"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute left-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl py-2 z-50 overflow-hidden"
                    >
                      <div className="px-4 py-2 border-b border-white/5 mb-1">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Categorías</p>
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto no-scrollbar">
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            onClick={() => scrollToCategory(cat)}
                            className={cn(
                              "w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                              selectedCategory === cat ? "text-orange-500 bg-orange-500/5" : "text-gray-400 hover:bg-white/5"
                            )}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Search Bar */}
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type="text"
                placeholder="Buscar plato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-[11px] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:bg-white/10 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Menu Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-10">
        {sortedCategoryKeys.map((category) => (
          <section key={category} id={category} className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1 bg-orange-500/10 rounded text-orange-500">
                <Utensils className="w-3 h-3" />
              </div>
              <h2 className="text-base font-black uppercase tracking-tight">
                {category}
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            <div className="grid gap-2">
              {groupedProducts[category].map((product, idx) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 5 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.01 }}
                  className="group relative p-2.5 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-white/10 transition-all"
                >
                  <div className="flex justify-between items-center gap-3">
                    {/* Product Info */}
                    <Link 
                      to={`/${product.slug || product.name.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h3 className="text-[11px] font-bold text-white group-hover:text-orange-400 transition-colors truncate">
                          {product.name}
                        </h3>
                        <div className="flex items-center gap-0.5 text-orange-500/40">
                          <Star className="w-2 h-2 fill-current" />
                          <span className="text-[7px] font-black">4.9</span>
                        </div>
                      </div>
                      <p className="text-[8px] text-gray-600 line-clamp-1 leading-relaxed">
                        {product.description}
                      </p>
                    </Link>

                    {/* Price and Actions */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs font-black text-orange-500">
                        ${getProductWebPrice(product).toLocaleString()}
                      </span>
                      
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => {
                            toggleFavorite(product);
                            if (!isFavorite(product.id)) {
                              triggerFlyAnimation(e, '', 'favorites');
                            }
                          }}
                          className={cn(
                            "p-1.5 rounded-md transition-all",
                            isFavorite(product.id) 
                              ? "text-red-500" 
                              : "text-gray-700 hover:text-red-500"
                          )}
                        >
                          <Heart className={cn("w-3 h-3", isFavorite(product.id) && "fill-current")} />
                        </button>
                        <button 
                          onClick={(e) => {
                            const finalPrice = getProductWebPrice(product);
                            addToCart({ productId: product.id, name: product.name, price: finalPrice, quantity: 1 });
                            triggerFlyAnimation(e, '', 'cart');
                          }}
                          className="p-1.5 text-orange-500 hover:text-orange-400 active:scale-90 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        ))}

        {filteredProducts.length === 0 && (
          <div className="text-center py-16">
            <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
              <Search className="w-4 h-4 text-gray-800" />
            </div>
            <p className="text-gray-700 text-[9px] font-bold uppercase tracking-widest">Sin resultados</p>
          </div>
        )}
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-[60]">
        {/* WhatsApp */}
        <a 
          href="https://wa.me/573123456789" 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-10 h-10 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform"
        >
          <MessageCircle className="w-5 h-5" />
        </a>

        {/* Favorites */}
        <button 
          id="favorites-button"
          onClick={() => setShowFavorites(true)}
          className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform relative"
        >
          <Heart className="w-5 h-5" />
          {favorites.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-white text-red-600 text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg border border-red-600">
              {favorites.length}
            </span>
          )}
        </button>

        {/* Cart */}
        <button 
          id="cart-button"
          onClick={() => setShowCart(true)}
          className="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform relative"
        >
          <ShoppingCart className="w-6 h-6" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg">
              {itemCount}
            </span>
          )}
        </button>
      </div>

      {/* Flying Animations */}
      {animations.map(anim => (
        <FlyingImage key={anim.id} animation={anim} />
      ))}

      {/* Favorites Slider */}
      <AnimatePresence>
        {showFavorites && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFavorites(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="relative w-full max-w-md bg-[#0f0f0f] h-full shadow-2xl flex flex-col border-l border-white/5"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-tight">
                  <Heart className="w-5 h-5 text-red-600" /> Mis Favoritos
                </h2>
                <button onClick={() => setShowFavorites(false)} className="p-2 hover:bg-white/5 rounded-full transition">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {favorites.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
                      <Heart className="w-8 h-8 text-gray-800" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-white uppercase tracking-tight">Tu lista está vacía</p>
                      <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest">¡Dale amor a tus platos!</p>
                    </div>
                  </div>
                ) : (
                  favorites.map(product => (
                    <div key={product.id} className="flex gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl group relative">
                      <div className="flex-1">
                        <h3 className="font-bold text-[11px] text-white uppercase tracking-tight">{product.name}</h3>
                        <p className="text-[10px] font-black text-orange-500 mt-1">${product.price.toLocaleString()}</p>
                        <Link 
                          to={`/${product.slug || product.name.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                          onClick={() => setShowFavorites(false)}
                          className="text-[8px] font-black text-gray-500 hover:text-orange-500 transition uppercase tracking-widest mt-3 block"
                        >
                          Ver detalle
                        </Link>
                      </div>
                      <button 
                        onClick={() => toggleFavorite(product)}
                        className="p-2 text-red-600 hover:scale-110 transition"
                      >
                        <Heart className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart Slider */}
      <AnimatePresence>
        {showCart && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCart(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="relative w-full max-w-md bg-[#0f0f0f] h-full shadow-2xl flex flex-col border-l border-white/5"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-tight">
                  <ShoppingCart className="w-5 h-5 text-orange-500" /> Tu Pedido
                </h2>
                <button onClick={() => setShowCart(false)} className="p-2 hover:bg-white/5 rounded-full transition">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
                      <ShoppingCart className="w-8 h-8 text-gray-800" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-white uppercase tracking-tight">Tu carrito está vacío</p>
                      <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest">¿Qué se te antoja hoy?</p>
                    </div>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.productId} className="flex gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                      <div className="flex-1">
                        <h3 className="font-bold text-[11px] text-white uppercase tracking-tight">{item.name}</h3>
                        <p className="text-[10px] font-black text-orange-500 mt-1">${item.price.toLocaleString()}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <button 
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="w-7 h-7 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-gray-400 hover:text-orange-500 transition"
                          >
                            -
                          </button>
                          <span className="font-black text-xs text-white">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            className="w-7 h-7 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-gray-400 hover:text-orange-500 transition"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.productId)}
                        className="p-2 text-gray-700 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t border-white/5 bg-white/[0.01]">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-gray-600 font-black uppercase tracking-widest text-[10px]">Total a pagar</span>
                    <span className="text-2xl font-black text-orange-500">${total.toLocaleString()}</span>
                  </div>
                  <button 
                    onClick={() => { setShowCart(false); setShowCheckoutForm(true); }}
                    className="w-full py-4 bg-orange-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-orange-500/20 hover:bg-orange-600 transition uppercase tracking-widest"
                  >
                    FINALIZAR PEDIDO
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Scroll to Top */}
      <AnimatePresence>
        {isScrolled && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 left-6 w-10 h-10 bg-white/5 backdrop-blur-md border border-white/10 text-white rounded-full flex items-center justify-center shadow-xl hover:bg-white/10 transition-all z-[60]"
          >
            <ChevronUp className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white/[0.01] border-t border-white/5 py-8 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Clock className="w-3 h-3 text-orange-500/50 mx-auto" />
              <h4 className="font-bold uppercase tracking-widest text-[8px] text-gray-500">Horario</h4>
              <p className="text-gray-700 text-[8px]">Lun - Dom | 8:00 AM - 8:30 PM</p>
            </div>
            <div className="space-y-1">
              <MapPin className="w-3 h-3 text-orange-500/50 mx-auto" />
              <h4 className="font-bold uppercase tracking-widest text-[8px] text-gray-500">Ubicación</h4>
              <p className="text-gray-700 text-[8px]">Cúcuta, Norte de Santander</p>
            </div>
            <div className="space-y-1">
              <Phone className="w-3 h-3 text-orange-500/50 mx-auto" />
              <h4 className="font-bold uppercase tracking-widest text-[8px] text-gray-500">Contacto</h4>
              <p className="text-gray-700 text-[8px]">www.donapepacucuta.com</p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <p className="text-gray-800 text-[7px] uppercase tracking-[0.3em]">
              © 2024 Restaurante Doña Pepa
            </p>
          </div>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
};

export default DigitalMenu;
