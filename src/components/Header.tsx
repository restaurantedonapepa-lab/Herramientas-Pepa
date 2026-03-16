import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, Heart, User, LogIn, LogOut, X, Globe, Menu, Search, MessageCircle } from 'lucide-react';
import { useCart, FlyingAnimation } from '../context/CartContext';
import { auth, loginWithGoogle, logout } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';

const FlyingImage: React.FC<{ animation: FlyingAnimation }> = ({ animation }) => {
  const targetId = animation.target === 'cart' ? 'floating-cart' : 'floating-favorites';
  const [targetPos, setTargetPos] = React.useState({ x: window.innerWidth, y: window.innerHeight });

  React.useEffect(() => {
    const target = document.getElementById(targetId);
    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  }, [targetId]);

  return (
    <motion.img
      initial={{ x: animation.x, y: animation.y, scale: 1, rotate: 0, opacity: 1 }}
      animate={{ 
        x: targetPos.x - 20, 
        y: targetPos.y - 20, 
        scale: 0.2, 
        rotate: 360, 
        opacity: 0 
      }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      src={animation.imageUrl}
      className="fixed z-[9999] w-10 h-10 rounded-full object-cover pointer-events-none"
    />
  );
};

export const Header: React.FC = () => {
  const { 
    itemCount, favorites, cart, removeFromCart, updateQuantity, 
    total, toggleFavorite, searchTerm, setSearchTerm, animations 
  } = useCart();
  const [showCart, setShowCart] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const location = useLocation();
  const user = auth.currentUser;

  const isPublic = !['/pos', '/inventory'].includes(location.pathname);

  if (!isPublic) return null;

  return (
    <>
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 px-4 py-3 border-b border-gray-100">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition shrink-0">
            <img 
              src="https://lh3.googleusercontent.com/d/1wqVtaAyck4GGizYQZjj-gEi0y__9PYeh=w40-h40-c" 
              alt="Logo Doña Pepa" 
              className="w-8 h-8 sm:w-10 h-10 rounded-xl shadow-md"
              referrerPolicy="no-referrer"
            />
            <div className="hidden md:block">
              <h1 className="font-black text-gray-900 text-lg leading-none">Restaurante Doña Pepa</h1>
              <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mt-1">Tradicion desde 1957</p>
            </div>
          </Link>

          {/* Search Bar - Now in Header for all devices */}
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Buscar..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-red-500 transition outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="p-1 bg-gray-50 rounded-2xl border-2 border-transparent hover:border-red-200 transition"
                >
                  <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-10 h-10 rounded-xl" referrerPolicy="no-referrer" />
                </button>
                
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60]"
                    >
                      <div className="px-4 py-2 border-b border-gray-50 mb-2">
                        <p className="text-xs font-black text-gray-400 uppercase">Hola,</p>
                        <p className="text-sm font-bold text-gray-900 truncate">{user.displayName}</p>
                      </div>
                      <button 
                        onClick={() => { setShowFavorites(true); setShowUserMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
                      >
                        <Heart className="w-4 h-4 text-red-600" /> Mis Favoritos
                      </button>
                      {['restaurantedonapepa@gmail.com'].includes(user.email || '') && (
                        <Link 
                          to="/pos" 
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <Globe className="w-4 h-4 text-blue-600" /> Administración
                        </Link>
                      )}
                      <button 
                        onClick={() => { logout(); setShowUserMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 transition mt-2 border-t border-gray-50 pt-2"
                      >
                        <LogOut className="w-4 h-4" /> Cerrar Sesión
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button 
                onClick={loginWithGoogle}
                className="p-3 bg-gray-50 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-2xl transition"
              >
                <LogIn className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-4">
        <button 
          id="floating-favorites"
          onClick={() => setShowFavorites(true)}
          className="p-4 bg-white text-gray-400 hover:text-red-600 rounded-full shadow-2xl transition relative group"
        >
          <Heart className="w-6 h-6" />
          {favorites.length > 0 && (
            <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-600 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white font-black">
              {favorites.length}
            </span>
          )}
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1 bg-gray-900 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
            FAVORITOS
          </span>
        </button>

        <button 
          id="floating-cart"
          onClick={() => setShowCart(true)}
          className="p-4 bg-red-600 text-white rounded-full shadow-2xl shadow-red-200 hover:bg-red-700 transition relative group"
        >
          <ShoppingCart className="w-6 h-6" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 w-6 h-6 bg-white text-red-600 text-[10px] flex items-center justify-center rounded-full border-2 border-red-600 font-black">
              {itemCount}
            </span>
          )}
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1 bg-gray-900 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
            MI PEDIDO
          </span>
        </button>

        <a 
          href="https://wa.me/573100000000" // Replace with actual number
          target="_blank"
          rel="noopener noreferrer"
          className="p-4 bg-green-500 text-white rounded-full shadow-2xl shadow-green-200 hover:bg-green-600 transition group"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1 bg-gray-900 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
            WHATSAPP
          </span>
        </a>
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
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <Heart className="w-6 h-6 text-red-600" /> Mis Favoritos
                </h2>
                <button onClick={() => setShowFavorites(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {favorites.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
                      <Heart className="w-10 h-10 text-red-200" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-gray-900">Tu lista está vacía</p>
                      <p className="text-gray-400 font-bold">¡Dale amor a tus platos favoritos!</p>
                    </div>
                  </div>
                ) : (
                  favorites.map(product => (
                    <div key={product.id} className="flex gap-4 p-4 bg-gray-50 rounded-3xl group relative">
                      <img 
                        src={`https://lh3.googleusercontent.com/d/${product.imageId}=w200-h200-c`} 
                        alt={product.name} 
                        className="w-20 h-20 rounded-2xl object-cover shadow-sm"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1">
                        <h3 className="font-black text-gray-900">{product.name}</h3>
                        <p className="text-sm font-bold text-red-600">${product.price.toLocaleString()}</p>
                        <Link 
                          to={`/${product.name.toLowerCase().replace(/\s+/g, '-')}`}
                          onClick={() => setShowFavorites(false)}
                          className="text-xs font-black text-gray-400 hover:text-red-600 transition uppercase tracking-widest mt-2 block"
                        >
                          Ver detalle
                        </Link>
                      </div>
                      <button 
                        onClick={() => toggleFavorite(product)}
                        className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-sm text-red-600 hover:scale-110 transition"
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
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <ShoppingCart className="w-6 h-6 text-red-600" /> Tu Pedido
                </h2>
                <button onClick={() => setShowCart(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                      <ShoppingCart className="w-10 h-10 text-gray-200" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-gray-900">Tu carrito está vacío</p>
                      <p className="text-gray-400 font-bold">¿Qué se te antoja hoy?</p>
                    </div>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.productId} className="flex gap-4 p-4 bg-gray-50 rounded-3xl">
                      <div className="flex-1">
                        <h3 className="font-black text-gray-900">{item.name}</h3>
                        <p className="text-sm font-bold text-red-600">${item.price.toLocaleString()}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <button 
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-gray-400 hover:text-red-600 transition shadow-sm"
                          >
                            -
                          </button>
                          <span className="font-black text-gray-900">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-gray-400 hover:text-red-600 transition shadow-sm"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.productId)}
                        className="p-2 text-gray-300 hover:text-red-600 transition"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t bg-gray-50">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-gray-400 font-black uppercase tracking-widest text-xs">Total a pagar</span>
                    <span className="text-3xl font-black text-gray-900">${total.toLocaleString()}</span>
                  </div>
                  <Link 
                    to="/" 
                    onClick={() => { setShowCart(false); /* Trigger checkout logic if needed */ }}
                    className="w-full py-5 bg-red-600 text-white font-black text-xl rounded-3xl shadow-xl shadow-red-200 hover:bg-red-700 transition block text-center"
                  >
                    FINALIZAR PEDIDO
                  </Link>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
