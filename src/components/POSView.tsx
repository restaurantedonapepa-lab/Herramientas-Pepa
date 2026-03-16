import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, onSnapshot, addDoc, updateDoc, doc, 
  increment, serverTimestamp, query, where, getDocs,
  setDoc, orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDriveImageUrl, auth } from '../firebase';
import { Product, Ingredient, SaleItem, Table, Sale, Expense } from '../types';
import { 
  Search, Trash2, CreditCard, Banknote, QrCode, User, 
  Table as TableIcon, ShoppingCart, ArrowLeft, Plus, 
  Minus, MessageSquare, Edit2, Save, X, History, 
  ChartLine, RefreshCw, CheckCircle2, 
  LayoutGrid, UtensilsCrossed, Split, ChevronRight, Printer, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import Swal from 'sweetalert2';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TOTAL_TABLES = 40;
const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export const POSView: React.FC = () => {
  // Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  
  // UI States
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'tables' | 'menu'>('tables');
  
  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showWebOrdersModal, setShowWebOrdersModal] = useState(false);
  const [webOrders, setWebOrders] = useState<any[]>([]);
  const [splitCount, setSplitCount] = useState<number>(1);
  const [isSplitting, setIsSplitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Payment States
  const [selectedItemsForPayment, setSelectedItemsForPayment] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Nequi' | 'Daviplata' | 'Tarjeta' | 'QR' | 'Mixto'>('Efectivo');
  const [mixedPayments, setMixedPayments] = useState({ 
    method1: 'Efectivo', val1: 0, 
    method2: 'Nequi', val2: 0,
    method3: 'Daviplata', val3: 0 
  });
  const [receivedAmount, setReceivedAmount] = useState<number>(0);

  // Report States
  const [reportRange, setReportRange] = useState({ start: new Date().toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });
  const [reportData, setReportData] = useState<{ sales: Sale[], expenses: Expense[] }>({ sales: [], expenses: [] });
  const [historyData, setHistoryData] = useState<Sale[]>([]);

  // Derived States
  const activeTable = useMemo(() => tables.find(t => t.id === activeTableId), [tables, activeTableId]);
  const categories = useMemo(() => ['all', ...new Set(products.map(p => p.category))], [products]);
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(p => p.active);
    if (searchTerm) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else if (activeCategory !== 'all') {
      filtered = filtered.filter(p => p.category === activeCategory);
    }
    return filtered;
  }, [products, activeCategory, searchTerm]);

  // ... (previous memos)

  const printComanda = (type: 'customer' | 'kitchen' = 'customer') => {
    if (!activeTable) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = activeTable.items.map(item => `
      <tr>
        <td style="padding: 5px 0;">${item.quantity}x ${item.name}</td>
        ${type === 'customer' ? `<td style="text-align: right;">$${(item.price * item.quantity).toLocaleString()}</td>` : ''}
      </tr>
      ${item.note ? `<tr><td colspan="2" style="font-size: 12px; color: #666; padding-bottom: 5px;">* ${item.note}</td></tr>` : ''}
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${type === 'customer' ? 'Cuenta' : 'Comanda'} - Mesa ${activeTable.number}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 5mm; margin: 0; }
            h2 { text-align: center; margin: 0 0 10px 0; border-bottom: 1px dashed #000; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; }
            .total { border-top: 1px dashed #000; margin-top: 10px; padding-top: 10px; font-weight: bold; font-size: 18px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; }
            .header-info { margin-bottom: 10px; font-size: 14px; }
          </style>
        </head>
        <body>
          <h2>${type === 'customer' ? 'CUENTA' : 'COMANDA COCINA'}</h2>
          <div class="header-info">
            <p><strong>Mesa: ${activeTable.number}</strong></p>
            <p>Cliente: ${activeTable.clientName || 'Mostrador'}</p>
            <p>Fecha: ${new Date().toLocaleString()}</p>
          </div>
          <table>${itemsHtml}</table>
          ${type === 'customer' ? `<div class="total">TOTAL: $${orderTotal.toLocaleString()}</div>` : ''}
          <div class="footer">Restaurante Doña Pepa<br>¡Gracias por su visita!</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Sync Data
  useEffect(() => {
    let unsubProducts: (() => void) | undefined;
    let unsubIngredients: (() => void) | undefined;
    let unsubTables: (() => void) | undefined;
    let unsubWebOrders: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      // Limpiar listeners anteriores si existen
      if (unsubProducts) unsubProducts();
      if (unsubIngredients) unsubIngredients();
      if (unsubTables) unsubTables();
      if (unsubWebOrders) unsubWebOrders();

      if (!user) {
        setProducts([]);
        setIngredients([]);
        setTables([]);
        setWebOrders([]);
        return;
      }

      unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
        setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

      unsubIngredients = onSnapshot(collection(db, 'ingredients'), (snapshot) => {
        setIngredients(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'ingredients'));

      unsubTables = onSnapshot(collection(db, 'tables'), (snapshot) => {
        const tablesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Table));
        if (tablesData.length === 0) {
          initializeTables();
        } else {
          setTables(tablesData.sort((a, b) => a.number - b.number));
        }
      }, (error) => handleFirestoreError(error, OperationType.GET, 'tables'));

      unsubWebOrders = onSnapshot(query(collection(db, 'web_orders'), where('status', '==', 'pending')), (snapshot) => {
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWebOrders(orders);
        if (snapshot.docChanges().some(change => change.type === 'added')) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: '¡Nuevo Pedido Web!',
            showConfirmButton: false,
            timer: 3000
          });
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, 'web_orders'));
    });

    return () => {
      unsubscribeAuth();
      if (unsubProducts) unsubProducts();
      if (unsubIngredients) unsubIngredients();
      if (unsubTables) unsubTables();
      if (unsubWebOrders) unsubWebOrders();
    };
  }, []);

  const initializeTables = async () => {
    for (let i = 1; i <= TOTAL_TABLES; i++) {
      await setDoc(doc(db, 'tables', `mesa-${i}`), {
        number: i,
        items: [],
        clientName: '',
        status: 'free',
        lastUpdate: serverTimestamp()
      });
    }
  };

  const fetchReportData = async () => {
    try {
      const start = new Date(reportRange.start);
      const end = new Date(reportRange.end + 'T23:59:59');
      
      const salesQuery = query(collection(db, 'sales'), where('timestamp', '>=', start), where('timestamp', '<=', end));
      const expensesQuery = query(collection(db, 'expenses'), where('timestamp', '>=', start), where('timestamp', '<=', end));

      const [salesSnap, expensesSnap] = await Promise.all([getDocs(salesQuery), getDocs(expensesQuery)]);

      setReportData({
        sales: salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)),
        expenses: expensesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense))
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'reports');
    }
  };

  const fetchHistoryData = async () => {
    try {
      const q = query(collection(db, 'sales'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      setHistoryData(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'sales');
    }
  };

  useEffect(() => { if (showReportsModal) fetchReportData(); }, [showReportsModal, reportRange]);
  useEffect(() => { if (showHistoryModal) fetchHistoryData(); }, [showHistoryModal]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showPaymentModal && paymentMethod === 'Efectivo') {
        if (e.key >= '0' && e.key <= '9') {
          setReceivedAmount(prev => Number(prev.toString() + e.key));
          return;
        } else if (e.key === 'Backspace') {
          setReceivedAmount(prev => {
            const s = prev.toString();
            return s.length > 1 ? Number(s.slice(0, -1)) : 0;
          });
          return;
        }
      }

      if (view === 'menu' && !showPaymentModal && !showReportsModal && !showExpensesModal && !showHistoryModal && !showWebOrdersModal) {
        // If not typing in an input (except our search input)
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          // If it's a letter, number or space
          if (e.key.length === 1 || e.key === 'Backspace') {
            searchInputRef.current?.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, showPaymentModal, showReportsModal, showExpensesModal, showHistoryModal, showWebOrdersModal, paymentMethod]);

  const reportStats = useMemo(() => {
    const totalSales = reportData.sales.reduce((sum, s) => sum + s.total, 0);
    const totalExpenses = reportData.expenses.reduce((sum, e) => sum + e.amount, 0);
    
    const salesByCategory: Record<string, number> = {};
    reportData.sales.forEach(sale => {
      sale.items.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        const cat = prod?.category || 'Otros';
        salesByCategory[cat] = (salesByCategory[cat] || 0) + (item.price * item.quantity);
      });
    });

    const salesByMethod: Record<string, number> = {};
    reportData.sales.forEach(sale => {
      const method = sale.paymentMethod.split(':')[0].trim();
      salesByMethod[method] = (salesByMethod[method] || 0) + sale.total;
    });

    return {
      totalSales,
      totalExpenses,
      balance: totalSales - totalExpenses,
      categoryData: Object.entries(salesByCategory).map(([name, value]) => ({ name, value })),
      methodData: Object.entries(salesByMethod).map(([name, value]) => ({ name, value }))
    };
  }, [reportData, products]);

  // Table Actions
  const openTable = (tableId: string) => {
    setActiveTableId(tableId);
    setView('menu');
    setActiveCategory('all');
    setSearchTerm('');
    setSelectedItemsForPayment({});
    // Focus search input after a short delay to allow transition
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 300);
  };

  const closeTable = () => {
    setActiveTableId(null);
    setView('tables');
    setSelectedItemsForPayment({});
  };

  const orderTotal = useMemo(() => {
    if (!activeTable) return 0;
    return activeTable.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [activeTable]);

  const partialTotal = useMemo(() => {
    if (!activeTable) return 0;
    return Object.entries(selectedItemsForPayment).reduce((sum, [id, qty]) => {
      const item = activeTable.items.find(i => i.productId === id);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  }, [activeTable, selectedItemsForPayment]);

  const currentTotalToPay = Object.keys(selectedItemsForPayment).length > 0 ? partialTotal : orderTotal;

  const addToOrder = async (product: Product) => {
    if (!activeTableId || !activeTable) return;
    const newItems = [...activeTable.items];
    const existingIndex = newItems.findIndex(item => item.productId === product.id);
    if (existingIndex >= 0) {
      newItems[existingIndex].quantity += 1;
    } else {
      newItems.push({ productId: product.id, name: product.name, price: product.price, quantity: 1, originalPrice: product.price, note: '' });
    }
    await updateDoc(doc(db, 'tables', activeTableId), { items: newItems, status: 'busy', lastUpdate: serverTimestamp() });
  };

  const updateItemQty = async (productId: string, delta: number) => {
    if (!activeTableId || !activeTable) return;
    const newItems = activeTable.items.map(item => {
      if (item.productId === productId) return { ...item, quantity: Math.max(0, item.quantity + delta) };
      return item;
    }).filter(item => item.quantity > 0);
    await updateDoc(doc(db, 'tables', activeTableId), { items: newItems, status: newItems.length > 0 ? 'busy' : 'free', lastUpdate: serverTimestamp() });
  };

  const updateItemNote = async (productId: string, note: string) => {
    if (!activeTableId || !activeTable) return;
    const newItems = activeTable.items.map(item => item.productId === productId ? { ...item, note } : item);
    await updateDoc(doc(db, 'tables', activeTableId), { items: newItems });
  };

  const updateItemPrice = async (productId: string, price: number) => {
    if (!activeTableId || !activeTable) return;
    const newItems = activeTable.items.map(item => item.productId === productId ? { ...item, price } : item);
    await updateDoc(doc(db, 'tables', activeTableId), { items: newItems });
  };

  const toggleItemSelection = (productId: string, maxQty: number) => {
    setSelectedItemsForPayment(prev => {
      if (prev[productId]) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: maxQty };
    });
  };

  const handlePayment = async () => {
    if (!activeTableId || !activeTable) return;
    const isPartial = Object.keys(selectedItemsForPayment).length > 0;
    const itemsToPay = isPartial 
      ? activeTable.items.filter(i => selectedItemsForPayment[i.productId]).map(i => ({ ...i, quantity: selectedItemsForPayment[i.productId] }))
      : activeTable.items;
    const total = itemsToPay.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    try {
      await addDoc(collection(db, 'sales'), {
        items: itemsToPay,
        total,
        paymentMethod: paymentMethod === 'Mixto' 
          ? `${mixedPayments.method1}: ${mixedPayments.val1} | ${mixedPayments.method2}: ${mixedPayments.val2}`
          : paymentMethod,
        clientName: activeTable.clientName || 'Mostrador',
        table: `Mesa ${activeTable.number}`,
        timestamp: serverTimestamp()
      });

      for (const item of itemsToPay) {
        const product = products.find(p => p.id === item.productId);
        if (product?.recipe) {
          for (const recipeItem of product.recipe) {
            await updateDoc(doc(db, 'ingredients', recipeItem.ingredientId), { stock: increment(-(recipeItem.quantity * item.quantity)) });
          }
        }
      }

      if (isPartial) {
        const remainingItems = activeTable.items.map(item => {
          if (selectedItemsForPayment[item.productId]) return { ...item, quantity: item.quantity - selectedItemsForPayment[item.productId] };
          return item;
        }).filter(item => item.quantity > 0);
        await updateDoc(doc(db, 'tables', activeTableId), { items: remainingItems, status: remainingItems.length > 0 ? 'busy' : 'free', clientName: remainingItems.length > 0 ? activeTable.clientName : '' });
      } else {
        await updateDoc(doc(db, 'tables', activeTableId), { items: [], status: 'free', clientName: '' });
      }

      setShowPaymentModal(false);
      setSelectedItemsForPayment({});
      if (!isPartial || (isPartial && activeTable.items.length === Object.keys(selectedItemsForPayment).length)) closeTable();
      Swal.fire({ icon: 'success', title: 'Venta Registrada', timer: 1500, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sales');
    }
  };

  const moveTable = async (targetNumber: number) => {
    if (!activeTableId || !activeTable) return;
    const targetTable = tables.find(t => t.number === targetNumber);
    if (!targetTable) return;
    if (targetTable.status === 'busy') {
      const mergedItems = [...targetTable.items];
      activeTable.items.forEach(item => {
        const existing = mergedItems.find(i => i.productId === item.productId);
        if (existing) existing.quantity += item.quantity;
        else mergedItems.push(item);
      });
      await updateDoc(doc(db, 'tables', targetTable.id), { items: mergedItems, clientName: targetTable.clientName || activeTable.clientName, status: 'busy' });
    } else {
      await updateDoc(doc(db, 'tables', targetTable.id), { items: activeTable.items, clientName: activeTable.clientName, status: 'busy' });
    }
    await updateDoc(doc(db, 'tables', activeTableId), { items: [], status: 'free', clientName: '' });
    setActiveTableId(targetTable.id);
  };

  return (
    <div className="flex h-full bg-gray-100 overflow-hidden relative">
      {/* Left Panel */}
      <div className="flex-1 flex flex-col min-w-0 border-r relative">
        <AnimatePresence mode="wait">
          {view === 'tables' && (
            <motion.div key="tables" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-800 flex items-center gap-2"><LayoutGrid className="w-6 h-6 text-red-600" />Mapa de Mesas</h2>
                <div className="flex gap-2">
                  <button onClick={() => setShowHistoryModal(true)} className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm"><History className="w-5 h-5 text-gray-600" /></button>
                  <button onClick={() => setShowReportsModal(true)} className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm"><ChartLine className="w-5 h-5 text-blue-600" /></button>
                  <button onClick={() => setShowExpensesModal(true)} className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm"><Banknote className="w-5 h-5 text-red-600" /></button>
                  <button onClick={() => setShowWebOrdersModal(true)} className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm relative">
                    <Globe className="w-5 h-5 text-orange-600" />
                    {webOrders.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[8px] flex items-center justify-center rounded-full border-2 border-white animate-bounce">
                        {webOrders.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {tables.map(table => (
                  <button key={table.id} onClick={() => openTable(table.id)} className={cn("aspect-square rounded-3xl border-2 transition-all duration-300 flex flex-col items-center justify-center gap-2 shadow-sm hover:shadow-md hover:-translate-y-1", table.status === 'busy' ? "bg-red-50 border-red-200 text-red-800" : "bg-white border-gray-100 text-gray-400 hover:border-blue-200")}>
                    <TableIcon className={cn("w-8 h-8", table.status === 'busy' ? "text-red-600" : "text-gray-200")} />
                    <span className="font-black text-lg">MESA {table.number}</span>
                    {table.status === 'busy' && <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">${table.items.reduce((s, i) => s + (i.price * i.quantity), 0).toLocaleString()}</span>}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'menu' && (
            <motion.div key="menu" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex-1 flex flex-col">
              <div className="p-6 bg-white border-b space-y-4 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <button onClick={closeTable} className="p-2 bg-gray-50 border rounded-xl hover:bg-gray-100 transition"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                      ref={searchInputRef}
                      type="text" 
                      placeholder="Buscar plato o categoría..." 
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-medium" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                    />
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {activeCategory === 'all' && !searchTerm ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {categories.filter(c => c !== 'all').map(cat => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className="aspect-square bg-white rounded-[32px] border-2 border-gray-100 shadow-sm hover:shadow-xl hover:border-red-200 transition-all flex flex-col items-center justify-center p-4 text-center group"
                      >
                        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <UtensilsCrossed className="w-8 h-8 text-red-600" />
                        </div>
                        <span className="font-black text-xs uppercase tracking-widest text-gray-800">{cat}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start">
                    {filteredProducts.map(product => (
                      <button key={product.id} onClick={() => addToOrder(product)} className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-left overflow-hidden flex flex-col group">
                        <div className="aspect-square relative overflow-hidden bg-gray-50">
                          <img src={getDriveImageUrl(product.imageId)} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3"><span className="text-white text-xs font-bold uppercase tracking-widest">Añadir</span></div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <h3 className="font-black text-sm text-gray-800 line-clamp-2 leading-tight mb-2">{product.name}</h3>
                          <p className="text-red-600 font-black text-lg mt-auto">${product.price.toLocaleString()}</p>
                        </div>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="col-span-full py-20 text-center text-gray-400">
                        <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="font-black uppercase tracking-widest text-sm">No se encontraron platos</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Panel */}
      <div className="w-[400px] bg-white shadow-2xl flex flex-col z-20">
        <div className="p-6 border-b bg-gray-50/50">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-red-600" />{activeTable ? `Mesa ${activeTable.number}` : 'Seleccione Mesa'}</h2>
            <div className="flex gap-1">
              {activeTable && (
                <>
                  <button onClick={() => printComanda('kitchen')} className="p-2 text-orange-600 hover:bg-orange-50 rounded-xl transition" title="Comanda Cocina"><UtensilsCrossed className="w-5 h-5" /></button>
                  <button onClick={() => printComanda('customer')} className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition" title="Imprimir Cuenta"><Printer className="w-5 h-5" /></button>
                  <button onClick={async () => {
                    const { value: target } = await Swal.fire({ title: 'Mover Mesa', input: 'number', inputLabel: 'Número de mesa destino', showCancelButton: true });
                    if (target) moveTable(Number(target));
                  }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition" title="Mover Mesa"><RefreshCw className="w-5 h-5" /></button>
                </>
              )}
            </div>
          </div>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" placeholder="Nombre del Cliente" className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm font-bold" value={activeTable?.clientName || ''} onChange={async (e) => { if (activeTableId) await updateDoc(doc(db, 'tables', activeTableId), { clientName: e.target.value }); }} disabled={!activeTable} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {activeTable?.items.map(item => (
            <div key={item.productId} className="p-4 hover:bg-gray-50 transition group">
              <div className="flex gap-3 mb-3">
                <input type="checkbox" checked={!!selectedItemsForPayment[item.productId]} onChange={() => toggleItemSelection(item.productId, item.quantity)} className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer mt-1" />
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1"><h4 className="font-black text-gray-800 leading-tight">{item.name}</h4><span className="font-black text-gray-900">${(item.price * item.quantity).toLocaleString()}</span></div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 font-bold uppercase tracking-wider"><span>${item.price.toLocaleString()} c/u</span><button onClick={async () => { const { value: price } = await Swal.fire({ title: 'Editar Precio', input: 'number', inputValue: item.price, showCancelButton: true }); if (price) updateItemPrice(item.productId, Number(price)); }} className="hover:text-blue-600 transition"><Edit2 className="w-3 h-3" /></button></div>
                  {item.note && <div className="mt-2 text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded-lg font-bold flex items-center gap-1"><MessageSquare className="w-3 h-3" />{item.note}</div>}
                </div>
              </div>
              <div className="flex justify-between items-center pl-8">
                <div className="flex items-center gap-1">
                  <button onClick={async () => { const { value: note } = await Swal.fire({ title: 'Nota del Plato', input: 'text', inputValue: item.note || '', showCancelButton: true }); if (note !== undefined) updateItemNote(item.productId, note); }} className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition"><MessageSquare className="w-4 h-4" /></button>
                  <button onClick={() => updateItemQty(item.productId, -100)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-1 shadow-sm">
                  <button onClick={() => updateItemQty(item.productId, -1)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"><Minus className="w-4 h-4" /></button>
                  <span className="font-black text-gray-800 w-6 text-center">{item.quantity}</span>
                  <button onClick={() => updateItemQty(item.productId, 1)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {(!activeTable || activeTable.items.length === 0) && <div className="flex-1 flex flex-col items-center justify-center text-gray-300 p-12 text-center"><UtensilsCrossed className="w-16 h-16 mb-4 opacity-20" /><p className="font-black uppercase tracking-widest text-sm opacity-50">Mesa Vacía</p></div>}
        </div>
        <div className="p-6 bg-white border-t space-y-6">
          <div className="flex justify-between items-end">
            <div className="flex flex-col"><span className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Total a Pagar</span>{Object.keys(selectedItemsForPayment).length > 0 && <span className="text-xs font-bold text-red-500 uppercase mb-1">Selección Parcial</span>}</div>
            <span className="text-4xl font-black text-gray-900 tracking-tight">${currentTotalToPay.toLocaleString()}</span>
          </div>
          <button disabled={!activeTable || activeTable.items.length === 0} onClick={() => { setReceivedAmount(currentTotalToPay); setShowPaymentModal(true); }} className={cn("w-full py-5 rounded-3xl font-black text-xl shadow-xl transition-all flex items-center justify-center gap-3", Object.keys(selectedItemsForPayment).length > 0 ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none")}>{Object.keys(selectedItemsForPayment).length > 0 ? <><Split className="w-6 h-6" /> COBRAR PARCIAL</> : <><CheckCircle2 className="w-6 h-6" /> COBRAR MESA</>}</button>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl overflow-hidden flex h-[600px]">
              <div className="w-1/3 bg-gray-900 text-white p-10 flex flex-col">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-12">Resumen de Pago</h3>
                <div className="space-y-8 flex-1">
                  <div><p className="text-xs font-bold text-gray-500 uppercase mb-2">Total</p><p className="text-4xl font-black">${currentTotalToPay.toLocaleString()}</p></div>
                  <div><p className="text-xs font-bold text-gray-500 uppercase mb-2">Recibido</p><p className="text-4xl font-black text-blue-400">${receivedAmount.toLocaleString()}</p></div>
                  <div className="pt-8 border-t border-white/10"><p className="text-xs font-bold text-gray-500 uppercase mb-2">Cambio</p><p className={cn("text-5xl font-black", receivedAmount >= currentTotalToPay ? "text-green-400" : "text-red-400")}>${Math.max(0, receivedAmount - currentTotalToPay).toLocaleString()}</p></div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 text-center"><p className="text-xs font-black uppercase tracking-widest text-gray-400">{paymentMethod}</p></div>
              </div>
              <div className="flex-1 p-10 flex flex-col">
                <div className="flex justify-between items-center mb-8"><h3 className="text-2xl font-black text-gray-800">Método de Pago</h3><button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-gray-400" /></button></div>
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {['Efectivo', 'Nequi', 'Daviplata', 'Tarjeta', 'QR', 'Mixto'].map(m => (
                    <button key={m} onClick={() => setPaymentMethod(m as any)} className={cn("py-4 rounded-2xl border-2 font-black text-sm transition-all flex flex-col items-center gap-2", paymentMethod === m ? "bg-red-50 border-red-600 text-red-800" : "bg-white border-gray-100 text-gray-400 hover:border-gray-200")}>{m}</button>
                  ))}
                </div>
                <div className="flex-1">
                  {paymentMethod === 'Efectivo' ? (
                    <div className="grid grid-cols-3 gap-3 h-full">
                      {[7, 8, 9, 4, 5, 6, 1, 2, 3, 'C', 0, '00'].map(val => (
                        <button key={val} onClick={() => { if (val === 'C') setReceivedAmount(0); else if (val === '00') setReceivedAmount(prev => Number(prev.toString() + '00')); else setReceivedAmount(prev => Number(prev.toString() + val.toString())); }} className="bg-gray-50 rounded-2xl font-black text-2xl text-gray-800 hover:bg-gray-100 transition">{val}</button>
                      ))}
                    </div>
                  ) : paymentMethod === 'Mixto' ? (
                    <div className="space-y-4 overflow-y-auto max-h-[300px] pr-2">
                      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Método 1</label>
                          <select className="w-full p-2 bg-white border rounded-xl font-bold text-sm" value={mixedPayments.method1} onChange={(e) => setMixedPayments(prev => ({ ...prev, method1: e.target.value }))}>
                            <option>Efectivo</option><option>Nequi</option><option>Daviplata</option><option>Tarjeta</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Monto 1</label>
                          <input type="number" className="w-full p-2 bg-white border-2 border-red-100 rounded-xl font-black text-lg" value={mixedPayments.val1} onChange={(e) => { 
                            const v1 = Number(e.target.value); 
                            const remaining = Math.max(0, currentTotalToPay - v1);
                            setMixedPayments(prev => ({ ...prev, val1: v1, val2: remaining, val3: 0 })); 
                          }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Método 2</label>
                          <select className="w-full p-2 bg-white border rounded-xl font-bold text-sm" value={mixedPayments.method2} onChange={(e) => setMixedPayments(prev => ({ ...prev, method2: e.target.value }))}>
                            <option>Efectivo</option><option>Nequi</option><option>Daviplata</option><option>Tarjeta</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Monto 2</label>
                          <input type="number" className="w-full p-2 bg-white border-2 border-red-100 rounded-xl font-black text-lg" value={mixedPayments.val2} onChange={(e) => { 
                            const v2 = Number(e.target.value); 
                            const remaining = Math.max(0, currentTotalToPay - mixedPayments.val1 - v2);
                            setMixedPayments(prev => ({ ...prev, val2: v2, val3: remaining })); 
                          }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Método 3</label>
                          <select className="w-full p-2 bg-white border rounded-xl font-bold text-sm" value={mixedPayments.method3} onChange={(e) => setMixedPayments(prev => ({ ...prev, method3: e.target.value }))}>
                            <option>Efectivo</option><option>Nequi</option><option>Daviplata</option><option>Tarjeta</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Monto 3</label>
                          <input type="number" className="w-full p-2 bg-gray-100 border rounded-xl font-black text-lg text-gray-500" value={mixedPayments.val3} readOnly />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-400"><CheckCircle2 className="w-16 h-16 mb-4 text-green-500" /><p className="font-black uppercase tracking-widest">Monto Asignado</p></div>
                  )}
                </div>
                <button onClick={handlePayment} disabled={receivedAmount < currentTotalToPay && paymentMethod !== 'Mixto'} className="mt-8 w-full py-5 bg-red-600 hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-300 text-white font-black text-xl rounded-3xl shadow-xl transition-all">CONFIRMAR PAGO</button>
              </div>
            </motion.div>
          </div>
        )}

        {showReportsModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white rounded-[40px] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-8 border-b flex justify-between items-center bg-gray-50">
                <h3 className="text-2xl font-black text-gray-800">Informe Financiero</h3>
                <div className="flex items-center gap-4">
                  <input type="date" className="p-2 border rounded-xl font-bold" value={reportRange.start} onChange={(e) => setReportRange(p => ({ ...p, start: e.target.value }))} />
                  <input type="date" className="p-2 border rounded-xl font-bold" value={reportRange.end} onChange={(e) => setReportRange(p => ({ ...p, end: e.target.value }))} />
                  <button onClick={() => setShowReportsModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-gray-400" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-green-50 p-6 rounded-3xl border border-green-100"><p className="text-xs font-black text-green-600 uppercase mb-2">Ventas Totales</p><p className="text-3xl font-black text-green-800">${reportStats.totalSales.toLocaleString()}</p></div>
                  <div className="bg-red-50 p-6 rounded-3xl border border-red-100"><p className="text-xs font-black text-red-600 uppercase mb-2">Gastos Totales</p><p className="text-3xl font-black text-red-800">${reportStats.totalExpenses.toLocaleString()}</p></div>
                  <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100"><p className="text-xs font-black text-blue-600 uppercase mb-2">Balance Neto</p><p className="text-3xl font-black text-blue-800">${reportStats.balance.toLocaleString()}</p></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-3xl border h-[400px]">
                    <h4 className="font-black text-gray-800 mb-6 uppercase tracking-widest text-sm">Ventas por Categoría</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportStats.categoryData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border h-[400px]">
                    <h4 className="font-black text-gray-800 mb-6 uppercase tracking-widest text-sm">Métodos de Pago</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={reportStats.methodData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label>{reportStats.methodData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showHistoryModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-8 border-b flex justify-between items-center bg-gray-50">
                <h3 className="text-2xl font-black text-gray-800">Historial de Ventas</h3>
                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-gray-400" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8">
                <table className="w-full text-left">
                  <thead><tr className="text-xs font-black text-gray-400 uppercase tracking-widest border-b"><th className="pb-4">Fecha</th><th className="pb-4">Mesa</th><th className="pb-4">Cliente</th><th className="pb-4">Método</th><th className="pb-4 text-right">Total</th></tr></thead>
                  <tbody className="divide-y">
                    {historyData.map(sale => (
                      <tr key={sale.id} className="hover:bg-gray-50 transition">
                        <td className="py-4 text-sm font-bold">{sale.timestamp?.toDate().toLocaleString()}</td>
                        <td className="py-4 text-sm font-black">{sale.table}</td>
                        <td className="py-4 text-sm font-medium">{sale.clientName}</td>
                        <td className="py-4 text-xs font-black uppercase text-gray-500">{sale.paymentMethod}</td>
                        <td className="py-4 text-right font-black text-gray-900">${sale.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}

        {showExpensesModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
              <div className="p-8 border-b flex justify-between items-center">
                <h3 className="text-2xl font-black text-gray-800">Registrar Gasto</h3>
                <button onClick={() => setShowExpensesModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-gray-400" /></button>
              </div>
              <form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); await addDoc(collection(db, 'expenses'), { concept: fd.get('concept'), category: fd.get('category'), amount: Number(fd.get('amount')), timestamp: serverTimestamp() }); setShowExpensesModal(false); Swal.fire({ icon: 'success', title: 'Gasto Registrado', timer: 1500, showConfirmButton: false }); }} className="p-8 space-y-6">
                <div><label className="block text-xs font-black text-gray-400 uppercase mb-2">Concepto</label><input name="concept" required className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold" /></div>
                <div><label className="block text-xs font-black text-gray-400 uppercase mb-2">Categoría</label><select name="category" className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"><option>Insumos</option><option>Servicios</option><option>Nómina</option><option>Varios</option></select></div>
                <div><label className="block text-xs font-black text-gray-400 uppercase mb-2">Monto</label><input name="amount" type="number" required className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-2xl" /></div>
                <button type="submit" className="w-full py-5 bg-red-600 text-white font-black text-xl rounded-3xl shadow-xl hover:bg-red-700 transition">REGISTRAR</button>
              </form>
            </motion.div>
          </div>
        )}

        {showWebOrdersModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4">
            <div className="bg-gray-50 rounded-[40px] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-8 bg-white border-b flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-black text-gray-900">Pedidos Web Pendientes</h2>
                  <p className="text-gray-400 font-bold">Gestiona los pedidos recibidos desde el catálogo</p>
                </div>
                <button onClick={() => setShowWebOrdersModal(false)} className="p-3 hover:bg-gray-100 rounded-full transition">
                  <X className="w-8 h-8 text-gray-400" />
                </button>
              </div>
              
              <div className="flex-1 p-8 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {webOrders.map(order => (
                    <div key={order.id} className="bg-white p-6 rounded-[32px] shadow-sm border-2 border-gray-100 hover:border-red-100 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-xs font-black text-gray-400 uppercase">Cliente</p>
                          <h3 className="text-xl font-black text-gray-900">{order.clientInfo.name}</h3>
                          <p className="text-sm font-bold text-red-600">{order.clientInfo.phone}</p>
                        </div>
                        <span className="px-3 py-1 bg-orange-100 text-orange-600 text-[10px] font-black rounded-full uppercase">Pendiente</span>
                      </div>
                      
                      <div className="space-y-2 mb-6">
                        {order.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-sm font-bold text-gray-600">
                            <span>{item.quantity}x {item.name}</span>
                            <span>${(item.price * item.quantity).toLocaleString()}</span>
                          </div>
                        ))}
                        <div className="pt-2 border-t flex justify-between font-black text-gray-900">
                          <span>Total</span>
                          <span>${order.total.toLocaleString()}</span>
                        </div>
                      </div>

                      {order.clientInfo.address && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Dirección</p>
                          <p className="text-xs font-bold text-gray-700">{order.clientInfo.address}</p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            try {
                              await updateDoc(doc(db, 'web_orders', order.id), { status: 'completed' });
                              Swal.fire('¡Completado!', 'El pedido ha sido marcado como completado.', 'success');
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, `web_orders/${order.id}`);
                            }
                          }}
                          className="flex-1 py-3 bg-green-600 text-white font-black rounded-2xl hover:bg-green-700 transition"
                        >
                          COMPLETAR
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              await updateDoc(doc(db, 'web_orders', order.id), { status: 'cancelled' });
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, `web_orders/${order.id}`);
                            }
                          }}
                          className="px-4 py-3 bg-gray-100 text-gray-400 font-black rounded-2xl hover:bg-gray-200 transition"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {webOrders.length === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <Globe className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                      <p className="text-gray-400 font-black text-xl">No hay pedidos web pendientes</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
