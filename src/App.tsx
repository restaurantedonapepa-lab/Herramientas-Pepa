import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, logout, ensureUserProfile } from './firebase';
import { useCart } from './context/CartContext';
import { CatalogView } from './components/CatalogView';
import { POSView } from './components/POSView';
import { InventoryView } from './components/InventoryView';
import { UserManagementView } from './components/UserManagementView';
import { ProductDetailView } from './components/ProductDetailView';
import { Header } from './components/Header';
import { CheckoutModal } from './components/CheckoutModal';
import { GoogleOneTap } from './components/GoogleOneTap';
import { CartProvider } from './context/CartContext';
import { 
  LayoutDashboard, 
  Utensils, 
  ShoppingCart, 
  Package, 
  LogOut, 
  LogIn,
  Menu,
  X,
  ChevronRight,
  AlertCircle,
  Home,
  Users
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Algo salió mal.";
      try {
        const errInfo = JSON.parse(this.state.error.message);
        if (errInfo.error.includes('permissions')) {
          message = "No tienes permisos suficientes para ver esta sección. Asegúrate de ser administrador.";
        }
      } catch (e) {
        message = this.state.error.message || message;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Error de Acceso</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Navigation: React.FC<{ user: User | null, userProfile: any }> = ({ user, userProfile }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isPublic = location.pathname === '/' || location.pathname.startsWith('/catalog') || (!['/pos', '/inventory', '/users'].includes(location.pathname) && location.pathname !== '/');

  const navItems = [
    { id: 'pos', label: 'TPV / Ventas', icon: ShoppingCart, color: 'text-blue-600', path: '/pos', roles: ['admin', 'cajero', 'mesero'] },
    { id: 'inventory', label: 'Inventario', icon: Package, color: 'text-orange-600', path: '/inventory', roles: ['admin', 'cocina'] },
    { id: 'users', label: 'Usuarios', icon: Users, color: 'text-purple-600', path: '/users', roles: ['admin'] },
    { id: 'catalog', label: 'Ver Catálogo', icon: Utensils, color: 'text-red-600', path: '/', roles: ['admin', 'mesero', 'cajero', 'cocina', 'cliente'] },
  ];

  if (isPublic) return null;

  const filteredItems = navItems.filter(item => item.roles.includes(userProfile?.role || 'cliente'));

  return (
    <aside className={`bg-white border-r shadow-sm flex flex-col transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
      <div className="p-4 border-b flex items-center justify-between">
        <div className={`flex items-center gap-2 overflow-hidden ${!isSidebarOpen && 'hidden'}`}>
          <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center text-white font-bold">DP</div>
          <span className="font-bold text-gray-800 whitespace-nowrap">Doña Pepa</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg transition mx-auto">
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-2">
        {filteredItems.map(item => (
          <Link
            key={item.id}
            to={item.path}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition font-bold ${
              location.pathname === item.path 
                ? 'bg-gray-100 text-gray-900' 
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <item.icon className={`w-6 h-6 flex-shrink-0 ${item.color}`} />
            <span className={`whitespace-nowrap overflow-hidden transition-all ${!isSidebarOpen && 'w-0 opacity-0'}`}>
              {item.label}
            </span>
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t">
        <button 
          onClick={logout}
          className="w-full flex items-center gap-3 p-3 rounded-xl text-red-600 hover:bg-red-50 transition font-bold"
        >
          <LogOut className="w-6 h-6 flex-shrink-0" />
          <span className={`whitespace-nowrap overflow-hidden transition-all ${!isSidebarOpen && 'w-0 opacity-0'}`}>
            Cerrar Sesión
          </span>
        </button>
      </div>
    </aside>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await ensureUserProfile(u);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <CartProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </CartProvider>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const { userProfile } = useCart();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const isKiosk = queryParams.get('kiosk') === 'true';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await ensureUserProfile(u);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <GoogleOneTap />
      <CheckoutModal />
      {!isKiosk && <Navigation user={user} userProfile={userProfile} />}
      <main className={cn("flex-1 flex flex-col", location.pathname === '/pos' ? "overflow-hidden" : "overflow-y-auto")}>
        {!isKiosk && <Header />}
        <ErrorBoundary>
          <div className="flex-1 flex flex-col min-h-0">
            <Routes>
              <Route path="/" element={<CatalogView />} />
              <Route path="/pos" element={<POSView />} />
              <Route path="/inventory" element={<InventoryView />} />
              <Route path="/users" element={<UserManagementView />} />
              <Route path="/:slug" element={<ProductDetailView />} />
            </Routes>
          </div>
        </ErrorBoundary>
      </main>
    </div>
  );
}
