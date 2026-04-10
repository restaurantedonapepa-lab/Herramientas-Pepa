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
  Trash2,
  User,
  LogIn,
  LogOut,
  Users,
  Globe
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth, loginWithGoogle, logout } from '../firebase';
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
      initial={{ x: animation.x - 20, y: animation.y - 20, scale: 0, rotate: -45, opacity: 0 }}
      animate={{ 
        x: [animation.x - 20, animation.x - 20, targetPos.x - 25],
        y: [animation.y - 20, animation.y - 60, targetPos.y - 25],
        scale: [0, 1.5, 0.3], 
        rotate: [0, 180, 720], 
        opacity: [0, 1, 0] 
      }}
      transition={{ duration: 1, ease: "backOut" }}
      className={cn(
        "fixed z-[9999] w-12 h-12 rounded-full flex items-center justify-center text-white pointer-events-none shadow-[0_0_20px_rgba(220,38,38,0.5)] border-2 border-white/20",
        animation.target === 'cart' ? "bg-red-600" : "bg-red-600"
      )}
    >
      {animation.target === 'cart' ? <ShoppingCart className="w-6 h-6" /> : <Heart className="w-6 h-6 fill-current" />}
    </motion.div>
  );
};

export const DigitalMenu: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [productOrder, setProductOrder] = useState<string[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string, message: string, type: 'cart' | 'favorite' }[]>([]);

  const { 
    cart, favorites, addToCart, removeFromCart, updateQuantity, total, itemCount, 
    toggleFavorite, isFavorite, triggerFlyAnimation, animations,
    setShowCheckoutForm, searchTerm, setSearchTerm, userProfile
  } = useCart();

  const user = auth.currentUser;

  const addNotification = (message: string, type: 'cart' | 'favorite') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

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
    return sorted;
  }, [products, categoryOrder]);

  // Filtering Logic
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && (searchTerm.length > 0 || matchesCategory);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getProductWebPrice = (product: Product) => {
    const deliveryFeePerItem = 1000; // Recargo de domicilio solicitado: $1.000
    return product.price + deliveryFeePerItem;
  };

  const ProductItem = ({ product, idx }: { product: Product, idx: number }) => (
    <motion.div
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
            <h3 className="text-[14px] font-bold text-white group-hover:text-red-600 transition-colors truncate">
              {product.name}
            </h3>
          </div>
          <p className="text-[12px] text-gray-600 line-clamp-1 leading-relaxed">
            {product.description}
          </p>
        </Link>

        {/* Price and Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[14px] font-black text-white">
            ${getProductWebPrice(product).toLocaleString()}
          </span>
          
          <button 
            onClick={(e) => {
              const finalPrice = getProductWebPrice(product);
              addToCart({ productId: product.id, name: product.name, price: finalPrice, quantity: 1 });
              triggerFlyAnimation(e, '', 'cart');
              addNotification(`${product.name} añadido al pedido`, 'cart');
            }}
            className="px-4 py-1.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-red-700 active:scale-95 transition-all shadow-lg shadow-red-600/20"
          >
            Pedir
          </button>
        </div>
      </div>
    </motion.div>
  );

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
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-red-600/30">
      {/* Notifications */}
      <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-xs px-4">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "px-4 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3 backdrop-blur-md",
                n.type === 'cart' ? "bg-red-600 text-white" : "bg-white text-gray-900"
              )}
            >
              {n.type === 'cart' ? <ShoppingCart className="w-4 h-4" /> : <Heart className="w-4 h-4 text-red-600 fill-current" />}
              <span className="text-xs font-black uppercase tracking-tight">{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

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
            <div className="w-14 h-14 mx-auto mb-3 bg-white rounded-full p-1.5 shadow-2xl shadow-red-600/20">
              <img 
                src="https://lh3.googleusercontent.com/d/1wqVtaAyck4GGizYQZjj-gEi0y__9PYeh=w40-h40-c" 
                alt="Doña Pepa Logo" 
                className="w-full h-full object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase mb-0.5">
              Menú <span className="text-red-600">Doña Pepa</span>
            </h1>
            <p className="text-gray-500 text-[8px] md:text-[9px] tracking-[0.5em] uppercase font-bold">
              Sabor Tradicional • Desde 1957
            </p>
          </motion.div>
        </div>
      </section>

      {/* Sticky Header with Search */}
      <div className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        isScrolled ? "bg-[#0a0a0a]/95 backdrop-blur-md shadow-2xl" : "bg-transparent"
      )}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            {selectedCategory && searchTerm.length === 0 && (
              <button 
                onClick={() => setSelectedCategory(null)}
                className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-red-600 hover:bg-white/10 transition-all"
              >
                <ChevronUp className="w-5 h-5 -rotate-90" />
              </button>
            )}
            
            {/* Search Bar */}
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-red-600 transition-colors" />
              <input 
                type="text"
                placeholder="Buscar plato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-[14px] focus:outline-none focus:ring-2 focus:ring-red-600/50 focus:bg-white/10 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Category Grid (TPV Style) - Hidden when searching or category selected */}
        {searchTerm.length === 0 && !selectedCategory && (
          <div className="max-w-4xl mx-auto px-4 pb-4">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 transition-all duration-500">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => scrollToCategory(cat)}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20 transition-all text-center gap-2 shrink-0 aspect-square"
                >
                  <div className="p-2 rounded-lg bg-red-600/10 text-red-600">
                    <Utensils className="w-6 h-6" />
                  </div>
                  <span className="text-[14px] font-black uppercase tracking-tighter leading-none line-clamp-2 text-gray-400">
                    {cat}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Menu Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-10">
        {searchTerm.length > 0 ? (
          /* Search Results View */
          <section className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1 bg-red-600/10 rounded text-red-600">
                <Search className="w-3 h-3" />
              </div>
              <h2 className="text-base font-black uppercase tracking-tight">
                Resultados para "{searchTerm}"
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            <div className="grid gap-2">
              {filteredProducts.map((product, idx) => (
                <ProductItem key={product.id} product={product} idx={idx} />
              ))}
            </div>
          </section>
        ) : selectedCategory ? (
          /* Category Content View */
          <section key={selectedCategory} className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1 bg-red-600/10 rounded text-red-600">
                <Utensils className="w-3 h-3" />
              </div>
              <h2 className="text-base font-black uppercase tracking-tight">
                {selectedCategory}
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            <div className="grid gap-2">
              {groupedProducts[selectedCategory]?.map((product, idx) => (
                <ProductItem key={product.id} product={product} idx={idx} />
              ))}
            </div>
          </section>
        ) : (
          /* Initial View (Empty or Welcome) */
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <Utensils className="w-8 h-8 text-red-600/50" />
            </div>
            <h2 className="text-xl font-black uppercase tracking-widest mb-2">Bienvenido</h2>
            <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Selecciona una categoría para ver el menú</p>
          </div>
        )}

        {searchTerm.length > 0 && filteredProducts.length === 0 && (
          <div className="text-center py-16">
            <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
              <Search className="w-4 h-4 text-gray-800" />
            </div>
            <p className="text-gray-700 text-[9px] font-bold uppercase tracking-widest">Sin resultados</p>
          </div>
        )}
      </main>

      {/* Bottom Navigation Menu */}
      <div className="fixed bottom-0 left-0 right-0 z-[100] bg-[#0a0a0a]/95 backdrop-blur-md border-t border-white/5 px-4 py-2 pb-safe">
        <div className="max-w-md mx-auto flex items-center justify-between">
          {/* WhatsApp */}
          <a 
            href="https://wa.me/573123456789" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 p-2 text-gray-400 hover:text-red-600 transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">WhatsApp</span>
          </a>

          {/* Favorites */}
          <button 
            id="favorites-button"
            onClick={() => setShowFavorites(true)}
            className="flex flex-col items-center gap-1 p-2 text-gray-400 hover:text-red-600 transition-colors relative"
          >
            <Heart className="w-5 h-5" />
            {favorites.length > 0 && (
              <span className="absolute top-1 right-2 bg-red-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg">
                {favorites.length}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-tighter">Favoritos</span>
          </button>

          {/* Cart */}
          <button 
            id="cart-button"
            onClick={() => setShowCart(true)}
            className="flex flex-col items-center gap-1 p-2 text-red-600 hover:text-red-500 transition-colors relative"
          >
            <div className="relative">
              <ShoppingCart className="w-6 h-6" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-white text-red-600 text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg">
                  {itemCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Pedido</span>
          </button>

          {/* Login / User Menu */}
          <div className="relative">
            <button 
              onClick={() => {
                if (user) {
                  setShowUserMenu(!showUserMenu);
                } else {
                  loginWithGoogle();
                }
              }}
              className="flex flex-col items-center gap-1 p-2 text-gray-400 hover:text-red-600 transition-colors"
            >
              {user ? (
                <img 
                  src={user.photoURL || ''} 
                  alt={user.displayName || ''} 
                  className="w-6 h-6 rounded-full border border-white/10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="w-5 h-5" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-tighter">
                {user ? 'Mi Cuenta' : 'Ingresar'}
              </span>
            </button>

            <AnimatePresence>
              {showUserMenu && user && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-full right-0 mb-2 w-48 bg-[#1a1a1a] rounded-2xl shadow-2xl border border-white/5 py-2 z-[110]"
                >
                  <div className="px-4 py-2 border-b border-white/5 mb-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase">Hola,</p>
                    <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
                  </div>
                  <button 
                    onClick={() => { setShowFavorites(true); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition"
                  >
                    <Heart className="w-3 h-3 text-red-600" /> Mis Favoritos
                  </button>
                  {userProfile?.role === 'admin' && (
                    <Link 
                      to="/users" 
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <Users className="w-3 h-3 text-purple-600" /> Gestión Usuarios
                    </Link>
                  )}
                  {['admin', 'mesero', 'cajero', 'cocina'].includes(userProfile?.role || '') && (
                    <Link 
                      to="/pos" 
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <Globe className="w-3 h-3 text-blue-600" /> Administración
                    </Link>
                  )}
                  <button 
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-600/10 transition mt-2 border-t border-white/5 pt-2"
                  >
                    <LogOut className="w-3 h-3" /> Cerrar Sesión
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
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
                        <p className="text-[10px] font-black text-white mt-1">${getProductWebPrice(product).toLocaleString()}</p>
                        <Link 
                          to={`/${product.slug || product.name.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                          onClick={() => setShowFavorites(false)}
                          className="text-[8px] font-black text-gray-500 hover:text-red-600 transition uppercase tracking-widest mt-3 block"
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
                  <ShoppingCart className="w-5 h-5 text-red-600" /> Tu Pedido
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
                        <p className="text-[10px] font-black text-white mt-1">${item.price.toLocaleString()}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <button 
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="w-7 h-7 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 transition"
                          >
                            -
                          </button>
                          <span className="font-black text-xs text-white">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            className="w-7 h-7 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 transition"
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
                    <span className="text-2xl font-black text-white">${total.toLocaleString()}</span>
                  </div>
                  <button 
                    onClick={() => { setShowCart(false); setShowCheckoutForm(true); }}
                    className="w-full py-4 bg-red-600 text-white font-black text-sm rounded-2xl shadow-xl shadow-red-600/20 hover:bg-red-700 transition uppercase tracking-widest"
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
            className="fixed bottom-24 left-6 w-10 h-10 bg-white/5 backdrop-blur-md border border-white/10 text-white rounded-full flex items-center justify-center shadow-xl hover:bg-white/10 transition-all z-[60]"
          >
            <ChevronUp className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white/[0.01] border-t border-white/5 py-8 px-4 pb-24">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Clock className="w-3 h-3 text-red-600/50 mx-auto" />
              <h4 className="font-bold uppercase tracking-widest text-[8px] text-gray-500">Horario</h4>
              <p className="text-gray-700 text-[8px]">Lun - Dom | 8:00 AM - 8:30 PM</p>
            </div>
            <div className="space-y-1">
              <MapPin className="w-3 h-3 text-red-600/50 mx-auto" />
              <h4 className="font-bold uppercase tracking-widest text-[8px] text-gray-500">Ubicación</h4>
              <p className="text-gray-700 text-[8px]">Cúcuta, Norte de Santander</p>
            </div>
            <div className="space-y-1">
              <Phone className="w-3 h-3 text-red-600/50 mx-auto" />
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
