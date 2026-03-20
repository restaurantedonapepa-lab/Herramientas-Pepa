import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  Clock, 
  MapPin, 
  Phone, 
  Utensils, 
  Coffee, 
  Beef, 
  Fish, 
  Pizza, 
  Soup, 
  Salad,
  Search,
  ShoppingCart,
  Heart,
  MessageCircle,
  Plus,
  Star,
  X
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDriveImageUrl } from '../firebase';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DigitalMenu: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);

  const { 
    addToCart, toggleFavorite, isFavorite, itemCount, 
    triggerFlyAnimation, setShowCheckoutForm 
  } = useCart();

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

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    return ['Todos', ...uniqueCategories.sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, activeCategory, searchTerm]);

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    if (id === 'Todos') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const element = document.getElementById(id);
    if (element) {
      const offset = 180;
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
    return Object.keys(groupedProducts).sort();
  }, [groupedProducts]);

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
      <section className="relative h-[35vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1920" 
            alt="Food Background" 
            className="w-full h-full object-cover opacity-30 scale-110"
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
            <div className="w-20 h-20 mx-auto mb-4 bg-white rounded-full p-2 shadow-2xl shadow-orange-500/20">
              <img 
                src="https://i.ibb.co/vB8S88S/logo-pepa.png" 
                alt="Doña Pepa Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://cdn-icons-png.flaticon.com/512/3448/3448609.png';
                }}
              />
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase mb-1">
              Menú <span className="text-orange-500">Doña Pepa</span>
            </h1>
            <p className="text-gray-400 text-[10px] md:text-xs tracking-[0.3em] uppercase font-bold">
              Sabor Tradicional • Desde 1957
            </p>
          </motion.div>
        </div>
      </section>

      {/* Sticky Header with Search and Categories */}
      <div className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        isScrolled ? "bg-[#0a0a0a]/95 backdrop-blur-md shadow-2xl" : "bg-transparent"
      )}>
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
          {/* Search Bar */}
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-orange-500 transition-colors" />
            <input 
              type="text"
              placeholder="¿Qué se te antoja hoy?"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:bg-white/10 transition-all"
            />
          </div>

          {/* Category Nav */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={cn(
                  "px-5 py-2 rounded-xl whitespace-nowrap transition-all text-[10px] font-black uppercase tracking-widest border-2",
                  activeCategory === cat 
                    ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20" 
                    : "bg-white/5 border-white/5 text-gray-400 hover:border-orange-500/30"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-16">
        {sortedCategoryKeys.map((category) => (
          <section key={category} id={category} className="scroll-mt-40">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-orange-500/10 rounded-xl text-orange-500">
                <Utensils className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight">
                {category}
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            <div className="grid gap-4">
              {groupedProducts[category].map((product, idx) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.03 }}
                  className="group relative p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-white/10 transition-all"
                >
                  <div className="flex gap-4">
                    {/* Product Image */}
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-white/5">
                      <img 
                        src={getDriveImageUrl(product.imageId)} 
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors truncate">
                            {product.name}
                          </h3>
                          <div className="flex items-center gap-1 text-orange-500">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            <span className="text-[9px] font-black">4.9</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <span className="text-base font-black text-orange-500">
                          ${getProductWebPrice(product).toLocaleString()}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => {
                              toggleFavorite(product);
                              if (!isFavorite(product.id)) {
                                triggerFlyAnimation(e, getDriveImageUrl(product.imageId), 'favorites');
                              }
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              isFavorite(product.id) 
                                ? "bg-red-500/20 text-red-500" 
                                : "bg-white/5 text-gray-500 hover:text-red-500 hover:bg-red-500/10"
                            )}
                          >
                            <Heart className={cn("w-3.5 h-3.5", isFavorite(product.id) && "fill-current")} />
                          </button>
                          <button 
                            onClick={(e) => {
                              const finalPrice = getProductWebPrice(product);
                              addToCart({ productId: product.id, name: product.name, price: finalPrice, quantity: 1 });
                              triggerFlyAnimation(e, getDriveImageUrl(product.imageId), 'cart');
                            }}
                            className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 active:scale-90 transition-all shadow-lg shadow-orange-500/20"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        ))}

        {filteredProducts.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-6 h-6 text-gray-600" />
            </div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">No encontramos lo que buscas</p>
          </div>
        )}
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-4 z-[60]">
        {/* WhatsApp */}
        <a 
          href="https://wa.me/573123456789" 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center shadow-xl shadow-green-500/30 hover:scale-110 transition-transform"
        >
          <MessageCircle className="w-6 h-6" />
        </a>

        {/* Favorites */}
        <button 
          className="w-12 h-12 bg-red-500 text-white rounded-full flex items-center justify-center shadow-xl shadow-red-500/30 hover:scale-110 transition-transform relative"
        >
          <Heart className="w-6 h-6" />
        </button>

        {/* Cart */}
        <button 
          onClick={() => setShowCheckoutForm(true)}
          className="w-14 h-14 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-2xl shadow-orange-500/40 hover:scale-110 transition-transform relative"
        >
          <ShoppingCart className="w-7 h-7" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-white text-orange-500 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
              {itemCount}
            </span>
          )}
        </button>
      </div>

      {/* Footer */}
      <footer className="bg-white/[0.02] border-t border-white/5 py-12 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Clock className="w-4 h-4 text-orange-500 mx-auto" />
              <h4 className="font-bold uppercase tracking-widest text-[10px]">Horario</h4>
              <p className="text-gray-500 text-[10px]">Lunes a Domingo<br />8:00 AM - 8:30 PM</p>
            </div>
            <div className="space-y-2">
              <MapPin className="w-4 h-4 text-orange-500 mx-auto" />
              <h4 className="font-bold uppercase tracking-widest text-[10px]">Ubicación</h4>
              <p className="text-gray-500 text-[10px]">Cúcuta, Norte de Santander<br />Colombia</p>
            </div>
            <div className="space-y-2">
              <Phone className="w-4 h-4 text-orange-500 mx-auto" />
              <h4 className="font-bold uppercase tracking-widest text-[10px]">Contacto</h4>
              <p className="text-gray-500 text-[10px]">Domicilios y Reservas<br />www.donapepacucuta.com</p>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5">
            <p className="text-gray-600 text-[9px] uppercase tracking-[0.2em]">
              © 2024 Restaurante Doña Pepa • Sabor Tradicional
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
