import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, onSnapshot, addDoc, updateDoc, doc, 
  increment, serverTimestamp, query, where, getDocs,
  setDoc, orderBy, deleteDoc, deleteField, getDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDriveImageUrl, auth } from '../firebase';
import { Product, Ingredient, SaleItem, Table, Sale, Expense, BusinessSettings } from '../types';
import { 
  Search, Trash2, CreditCard, Banknote, QrCode, User, 
  Table as TableIcon, ShoppingCart, ArrowLeft, Plus, 
  Minus, MessageSquare, Edit2, Save, X, History, 
  ChartLine, RefreshCw, CheckCircle2, Calendar,
  LayoutGrid, UtensilsCrossed, Split, ChevronLeft, ChevronRight, Printer, Globe,
  FileText, Settings
} from 'lucide-react';
import { printerService } from '../services/PrinterService';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import Swal from 'sweetalert2';
import Papa from 'papaparse';
import { writeBatch } from 'firebase/firestore';
import { useCart } from '../context/CartContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const defaultSettings: BusinessSettings = {
  name: 'RESTAURANTE DOÑA PEPA',
  address: 'Cúcuta, Norte de Santander',
  phone: '310 123 4567',
  whatsapp: '573102456789',
  tableCount: 40,
  currencySymbol: '$'
};

export const POSView: React.FC = () => {
  const { businessSettings, userProfile } = useCart();
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState({ name: '', phone: '', address: '', notes: '' });
  const [editingSettings, setEditingSettings] = useState<BusinessSettings | null>(null);
  const [isPrinterConnected, setIsPrinterConnected] = useState(printerService.isConnected());
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [productOrder, setProductOrder] = useState<string[]>([]);
  const [mobileActiveTab, setMobileActiveTab] = useState<'menu' | 'cart'>('menu');

  // Detectar cambios en la conexión USB
  useEffect(() => {
    const handleUsbChange = () => {
      setIsPrinterConnected(printerService.isConnected());
    };

    navigator.usb?.addEventListener('connect', handleUsbChange);
    navigator.usb?.addEventListener('disconnect', handleUsbChange);

    return () => {
      navigator.usb?.removeEventListener('connect', handleUsbChange);
      navigator.usb?.removeEventListener('disconnect', handleUsbChange);
    };
  }, []);
  const [splitCount, setSplitCount] = useState<number>(1);
  const [isSplitting, setIsSplitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reportScrollRef = useRef<HTMLDivElement>(null);

  // Payment States
  const [selectedItemsForPayment, setSelectedItemsForPayment] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Nequi' | 'Daviplata' | 'Tarjeta' | 'QR' | 'Mixto'>('Efectivo');
  const [mixedPayments, setMixedPayments] = useState({ 
    method1: 'Efectivo', val1: 0, 
    method2: 'Nequi', val2: 0,
    method3: 'Daviplata', val3: 0 
  });
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const isFirstPaymentKeyPress = useRef(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const getTodayDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Report States
  const [reportRange, setReportRange] = useState({ start: getTodayDate(), end: getTodayDate() });
  const [reportTab, setReportTab] = useState<'ventas' | 'gastos' | 'graficos' | 'creditos'>('ventas');
  const [reportData, setReportData] = useState<{ sales: Sale[], expenses: Expense[] }>({ sales: [], expenses: [] });
  const [historyData, setHistoryData] = useState<Sale[]>([]);
  const [historyDate, setHistoryDate] = useState(getTodayDate());
  const [lastImportBatch, setLastImportBatch] = useState<string | null>(localStorage.getItem('lastImportBatch'));

  const lookupCustomer = async (phone: string) => {
    if (phone.length < 7) return;
    try {
      // First check dedicated customers collection
      const q = query(collection(db, 'customers'), where('phone', '==', phone));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setDeliveryInfo(prev => ({
          ...prev,
          name: data.name || prev.name,
          address: data.address || prev.address,
          notes: data.notes || prev.notes || ''
        }));
        return;
      }

      // Then check users collection (catalog customers)
      const q2 = query(collection(db, 'users'), where('phone', '==', phone));
      const snapshot2 = await getDocs(q2);
      if (!snapshot2.empty) {
        const data = snapshot2.docs[0].data();
        setDeliveryInfo(prev => ({
          ...prev,
          name: data.displayName || prev.name,
          address: data.address || prev.address,
          notes: data.notes || prev.notes || ''
        }));
      }
    } catch (error) {
      console.error('Error looking up customer:', error);
    }
  };

  // Derived States
  const activeTable = useMemo(() => tables.find(t => t.id === activeTableId), [tables, activeTableId]);
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
    return ['all', ...sorted];
  }, [products, categoryOrder]);
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

    // Sort by productOrder
    return filtered.sort((a, b) => {
      const indexA = productOrder.indexOf(a.id);
      const indexB = productOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [products, activeCategory, searchTerm, productOrder]);

  // ... (previous memos)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Check if we are dragging a category or a product
    const isCategory = categories.includes(active.id as string);

    if (isCategory) {
      const oldIndex = categories.indexOf(active.id as string);
      const newIndex = categories.indexOf(over.id as string);
      
      const newOrder = arrayMove(categories, oldIndex, newIndex)
        .filter(c => c !== 'all');
      
      setCategoryOrder(newOrder);
      try {
        if (auth.currentUser) {
          await setDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'category_order'), { order: newOrder });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'settings');
      }
    } else {
      // Dragging a product
      const oldIndex = filteredProducts.findIndex(p => p.id === active.id);
      const newIndex = filteredProducts.findIndex(p => p.id === over.id);
      
      if (oldIndex === -1 || newIndex === -1) return;
      
      let newOrder = [...productOrder];
      
      // Ensure all products in the current view are in the order list
      filteredProducts.forEach(p => {
        if (!newOrder.includes(p.id)) newOrder.push(p.id);
      });

      const orderOldIndex = newOrder.indexOf(active.id as string);
      const orderNewIndex = newOrder.indexOf(over.id as string);
      
      newOrder = arrayMove(newOrder, orderOldIndex, orderNewIndex) as string[];
      
      setProductOrder(newOrder);
      try {
        if (auth.currentUser) {
          await setDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'product_order'), { order: newOrder });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'settings');
      }
    }
  };

  const SortableProduct = ({ product, onClick }: { product: Product, onClick: () => void }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id: product.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : 'auto',
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <button
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={onClick}
        className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-left overflow-hidden flex flex-col group touch-none"
      >
        <div className="aspect-square relative overflow-hidden bg-gray-50">
          <img src={getDriveImageUrl(product.imageId)} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3"><span className="text-white text-xs font-bold uppercase tracking-widest">Añadir</span></div>
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-black text-sm text-gray-800 line-clamp-2 leading-tight mb-2">{product.name}</h3>
          <p className="text-red-600 font-black text-lg mt-auto">${product.price.toLocaleString()}</p>
        </div>
      </button>
    );
  };
  const SortableCategory = ({ cat, onClick }: { cat: string, onClick: () => void }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id: cat });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : 'auto',
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <button
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={onClick}
        className="aspect-square bg-white rounded-[32px] border-2 border-gray-100 shadow-sm hover:shadow-xl hover:border-red-200 transition-all flex flex-col items-center justify-center p-4 text-center group touch-none"
      >
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <UtensilsCrossed className="w-8 h-8 text-red-600" />
        </div>
        <span className="font-black text-xs uppercase tracking-widest text-gray-800">{cat}</span>
      </button>
    );
  };

  const printComanda = async (type: 'customer' | 'kitchen' = 'customer') => {
    if (!activeTable) return;

    const total = activeTable.items.reduce((a, b) => a + (b.price * b.quantity), 0);
    const client = activeTable.clientName || 'Cliente';
    const dateStr = new Date().toLocaleString('es-CO');
    const businessName = businessSettings?.name || 'DOÑA PEPA';

    // 1. INTENTAR IMPRESIÓN DIRECTA (USB)
    if (isPrinterConnected && printerService.isConnected()) {
      try {
        await printerService.printTicket({
          businessName: businessName,
          table: activeTable.number < 1 ? `DOM ${Math.round(activeTable.number * 100)}` : activeTable.number.toString(),
          client: client,
          items: activeTable.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
          total: total,
          type: type,
          shippingInfo: activeTable.shippingInfo ? {
            phone: activeTable.shippingInfo.phone,
            address: activeTable.shippingInfo.address,
            notes: activeTable.shippingInfo.notes
          } : undefined
        });
        return; // Éxito, salir
      } catch (error) {
        console.error('Error en impresión USB:', error);
        Swal.fire('Error Impresora', 'No se pudo imprimir por USB. Intentando impresión normal...', 'warning');
      }
    }

    // 2. IMPRESIÓN NORMAL (FALLBACK)
    const htmlItems = activeTable.items.map(i => `
        <div style="display:flex; align-items:flex-start; margin-bottom:4px; font-size:12px;">
            <div style="white-space:nowrap; margin-right:5px; font-weight:bold;">${i.quantity} x</div>
            <div style="flex:1; text-align:left; padding-right:5px; line-height:1.2;">${i.name}</div>
            ${type === 'customer' ? `<div style="white-space:nowrap; font-weight:bold;">$${(i.price * i.quantity).toLocaleString('es-CO')}</div>` : ''}
        </div>
        ${i.note ? `<div style="font-size: 10px; color: #666; margin-left: 25px; margin-bottom: 4px;">* ${i.note}</div>` : ''}
    `).join('');

    const printArea = document.getElementById('printable-area');
    if (!printArea) {
      // Si no existe el área, usar ventana emergente como último recurso
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(`
        <html><body style="font-family:monospace; width:80mm; padding:10px;">
          <h2 style="text-align:center;">${businessName}</h2>
          <p style="text-align:center;">*** ${type === 'customer' ? 'CUENTA' : 'COMANDA'} ***</p>
          <hr>
          <p>Mesa: ${activeTable.number < 1 ? `DOM ${Math.round(activeTable.number * 100)}` : `MESA ${activeTable.number}`} - ${client}</p>
          <p>${dateStr}</p>
          ${activeTable.shippingInfo ? `
          <div style="margin-top: 10px; padding: 5px; border: 1px dashed black;">
              <p style="margin: 2px 0;"><strong>DOMICILIO:</strong></p>
              <p style="margin: 2px 0;"><strong>Tel:</strong> ${activeTable.shippingInfo.phone}</p>
              <p style="margin: 2px 0;"><strong>Dir:</strong> ${activeTable.shippingInfo.address}</p>
              ${activeTable.shippingInfo.notes ? `<p style="margin: 2px 0;"><strong>Notas:</strong> ${activeTable.shippingInfo.notes}</p>` : ''}
          </div>
          ` : ''}
          <hr>
          ${htmlItems}
          <hr>
          ${type === 'customer' ? `<h3 style="text-align:right;">TOTAL: $${total.toLocaleString('es-CO')}</h3>` : ''}
        </body></html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
      return;
    }
    
    printArea.innerHTML = `
        <div style="width: 100%; text-align: center; font-family: monospace; color:black;">
            <h2 style="margin:0; font-size:18px; font-weight:bold;">${businessName}</h2>
            <p style="margin:0; font-size:14px; font-weight:bold;">*** ${type === 'customer' ? 'Nota de Pedido' : 'Comanda Cocina'} ***</p>
            <div style="border-bottom:1px dashed black; margin:5px 0;"></div>
            
            <div style="text-align:left; font-size:12px;">
                <p style="margin: 2px 0;"><strong>Mesa:</strong> ${activeTable.number < 1 ? `DOM ${Math.round(activeTable.number * 100)}` : `MESA ${activeTable.number}`} - ${client}</p>
                <p style="margin: 2px 0;">${dateStr}</p>
                ${activeTable.shippingInfo ? `
                <div style="margin-top: 10px; padding: 5px; border: 1px dashed black;">
                    <p style="margin: 2px 0;"><strong>DOMICILIO:</strong></p>
                    <p style="margin: 2px 0;"><strong>Tel:</strong> ${activeTable.shippingInfo.phone}</p>
                    <p style="margin: 2px 0;"><strong>Dir:</strong> ${activeTable.shippingInfo.address}</p>
                    ${activeTable.shippingInfo.notes ? `<p style="margin: 2px 0;"><strong>Notas:</strong> ${activeTable.shippingInfo.notes}</p>` : ''}
                </div>
                ` : ''}
            </div>
            
            <div style="border-bottom:1px dashed black; margin:5px 0;"></div>
            
            <div style="text-align:left;">
                ${htmlItems}
            </div>
            
            <div style="border-bottom:1px dashed black; margin:5px 0;"></div>
            
            ${type === 'customer' ? `
            <div style="text-align:right; font-size:16px; font-weight:bold; margin-top:5px;">
                <p style="margin: 0;">TOTAL: $${total.toLocaleString('es-CO')}</p>
            </div>
            ` : ''}
            
            <div style="margin-top:20px; font-size:11px;">
                <p style="margin: 2px 0;">Gracias por su visita</p>
                <p style="margin: 2px 0;">${businessSettings?.address || 'www.donapepacucuta.com'}</p>
            </div>
            <br>.
        </div>
    `;
    
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Sync Data
  useEffect(() => {
    let unsubProducts: (() => void) | undefined;
    let unsubIngredients: (() => void) | undefined;
    let unsubTables: (() => void) | undefined;
    let unsubCategoryOrder: (() => void) | undefined;
    let unsubProductOrder: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      // Limpiar listeners anteriores si existen
      if (unsubProducts) unsubProducts();
      if (unsubIngredients) unsubIngredients();
      if (unsubTables) unsubTables();
      if (unsubCategoryOrder) unsubCategoryOrder();
      if (unsubProductOrder) unsubProductOrder();

      if (!user) {
        setProducts([]);
        setIngredients([]);
        setTables([]);
        setCategoryOrder([]);
        setProductOrder([]);
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
          setTables(tablesData.sort((a, b) => {
            const getType = (t: Table) => {
              if (t.isCredit) return 1;
              if (t.number < 1) return 2;
              return 0;
            };
            const typeA = getType(a);
            const typeB = getType(b);
            if (typeA !== typeB) return typeA - typeB;
            return a.number - b.number;
          }));
        }
      }, (error) => handleFirestoreError(error, OperationType.GET, 'tables'));

      unsubCategoryOrder = onSnapshot(doc(db, 'users', user.uid, 'settings', 'category_order'), (snapshot) => {
        if (snapshot.exists()) {
          setCategoryOrder(snapshot.data().order || []);
        }
      });

      unsubProductOrder = onSnapshot(doc(db, 'users', user.uid, 'settings', 'product_order'), (snapshot) => {
        if (snapshot.exists()) {
          setProductOrder(snapshot.data().order || []);
        }
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubProducts) unsubProducts();
      if (unsubIngredients) unsubIngredients();
      if (unsubTables) unsubTables();
      if (unsubCategoryOrder) unsubCategoryOrder();
      if (unsubProductOrder) unsubProductOrder();
    };
  }, []);

  const initializeTables = async () => {
    const count = editingSettings?.tableCount || businessSettings?.tableCount || 40;
    const batch = writeBatch(db);
    for (let i = 1; i <= count; i++) {
      const tableId = `table-${i}`;
      batch.set(doc(db, 'tables', tableId), {
        number: i,
        status: 'free',
        items: [],
        clientName: '',
        lastUpdate: serverTimestamp()
      });
    }
    await batch.commit();
    setShowSettingsModal(false);
    Swal.fire({ icon: 'success', title: 'Mesas Inicializadas', text: `Se han creado ${count} mesas.` });
  };

  const saveBusinessSettings = async () => {
    if (!editingSettings) return;
    setIsProcessing(true);
    try {
      await setDoc(doc(db, 'settings', 'business'), editingSettings);
      setShowSettingsModal(false);
      Swal.fire({ icon: 'success', title: 'Configuración Guardada', timer: 1500, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchReportData = async () => {
    if (!reportRange.start || !reportRange.end) return;
    
    try {
      // Usar formato local T00:00:00 para que coincida con la zona horaria del navegador
      const start = new Date(reportRange.start + 'T00:00:00');
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
      const start = new Date(historyDate + 'T00:00:00');
      const end = new Date(historyDate + 'T23:59:59');
      const q = query(
        collection(db, 'sales'), 
        where('timestamp', '>=', start),
        where('timestamp', '<=', end),
        orderBy('timestamp', 'desc')
      );
      const snap = await getDocs(q);
      setHistoryData(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'sales');
    }
  };

  useEffect(() => { if (showReportsModal) fetchReportData(); }, [showReportsModal, reportRange]);
  useEffect(() => { if (showHistoryModal) fetchHistoryData(); }, [showHistoryModal, historyDate]);

  const importSalesFromCSV = async () => {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRYxU0BBrkOIiAMI6IROxj0Nu8a7nHYjMbm3KEuYI3WdN_6Z5CXNuHxBquHLVgCAYtfsvRNszeyhyri/pub?gid=0&single=true&output=csv';
    
    Swal.fire({
      title: 'Importando Historial',
      html: '<p>Iniciando descarga y procesamiento...</p><div id="import-progress" class="mt-4 font-black text-blue-600 text-2xl">0</div>',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const batchId = `import_${Date.now()}`;
    let totalCount = 0;
    const progressEl = document.getElementById('import-progress');

    Papa.parse(csvUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,
      chunkSize: 1024 * 1024 * 2, // 2MB chunks
      chunk: async (results, parser) => {
        parser.pause(); // Pause to handle async batch commit
        
        const data = results.data as any[];
        const batch = writeBatch(db);
        let chunkProcessed = 0;

        for (const row of data) {
          if (!row.Fecha) continue;
          
          try {
            const [day, month, year] = row.Fecha.split('/');
            const timeParts = (row.Hora || '00:00:00').split(':').map(Number);
            const timestamp = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), ...timeParts);
            
            const totalStr = (row['Total Venta'] || '0').toString().replace(/[^0-9-]/g, '');
            const total = parseInt(totalStr) || 0;

            if (total < 0) {
              // Es un gasto
              const expenseRef = doc(collection(db, 'expenses'));
              batch.set(expenseRef, {
                concept: row.Productos || 'Gasto Importado',
                category: 'Insumos',
                amount: Math.abs(total),
                timestamp,
                importBatch: batchId
              });
            } else {
              // Es una venta
              const productsStr = row.Productos || '';
              const items: SaleItem[] = [];
              const itemRegex = /(\d+)\s*x\s*([^($]+)\s*\(\$([\d.,]+)\)/g;
              let match;
              while ((match = itemRegex.exec(productsStr)) !== null) {
                const quantity = parseInt(match[1]);
                const name = match[2].trim();
                const priceStr = match[3].replace(/[^0-9]/g, '');
                const price = parseInt(priceStr) || 0;
                const product = products.find(p => p.name.toLowerCase() === name.toLowerCase());
                items.push({ productId: product?.id || 'imported_item', name, price, quantity });
              }

              const newSaleRef = doc(collection(db, 'sales'));
              batch.set(newSaleRef, {
                items,
                total,
                paymentMethod: row['Método Pago'] || 'Efectivo',
                timestamp,
                clientName: row.Cliente || 'Mostrador',
                table: row.Mesa || 'Mostrador',
                importBatch: batchId
              });
            }
            chunkProcessed++;
            totalCount++;
          } catch (e) {
            console.warn('Error procesando fila:', row, e);
          }
        }

        if (chunkProcessed > 0) {
          await batch.commit();
          if (progressEl) progressEl.innerText = totalCount.toString();
        }
        
        parser.resume();
      },
      complete: () => {
        setLastImportBatch(batchId);
        localStorage.setItem('lastImportBatch', batchId);
        
        Swal.fire({
          icon: 'success',
          title: 'Importación Exitosa',
          text: `Se han importado ${totalCount} ventas correctamente.`,
        });
        
        if (showReportsModal) fetchReportData();
        if (showHistoryModal) fetchHistoryData();
      },
      error: (error: any) => {
        console.error('Error parsing CSV:', error);
        Swal.fire('Error', 'No se pudo procesar el archivo CSV.', 'error');
      }
    });
  };

  const undoLastImport = async () => {
    if (!lastImportBatch) return;

    const result = await Swal.fire({
      title: '¿Deshacer Importación?',
      text: 'Se eliminarán todas las ventas de la última importación.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      Swal.fire({
        title: 'Eliminando...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });

      try {
        const q = query(collection(db, 'sales'), where('importBatch', '==', lastImportBatch));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        setLastImportBatch(null);
        localStorage.removeItem('lastImportBatch');

        Swal.fire('Eliminado', 'La importación ha sido deshecha.', 'success');
        if (showReportsModal) fetchReportData();
        if (showHistoryModal) fetchHistoryData();
      } catch (error) {
        console.error('Error undoing import:', error);
        Swal.fire('Error', 'No se pudo deshacer la importación.', 'error');
      }
    }
  };

  const deleteSale = async (saleId: string) => {
    if (isProcessing) return;
    const result = await Swal.fire({
      title: '¿Anular Venta?',
      text: 'La venta aparecerá tachada en el historial y no se contará en los reportes.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      setIsProcessing(true);
      try {
        const saleSnap = await getDoc(doc(db, 'sales', saleId));
        if (saleSnap.exists()) {
          const saleData = saleSnap.data() as Sale;
          // Devolver inventario (solo si no es un pago de crédito, ya que el crédito original es el que descuenta)
          if (!saleData.isCreditPayment) {
            for (const item of saleData.items) {
              const product = products.find(p => p.id === item.productId);
              if (product?.recipe) {
                for (const recipeItem of product.recipe) {
                  await updateDoc(doc(db, 'ingredients', recipeItem.ingredientId), { 
                    stock: increment(recipeItem.quantity * item.quantity) 
                  });
                }
              }
            }
          }
        }
        await updateDoc(doc(db, 'sales', saleId), { status: 'cancelled' });
        
        // Si es un crédito, buscar la mesa de crédito correspondiente y borrarla
        const creditTable = tables.find(t => t.isCredit && t.saleId === saleId);
        if (creditTable) {
          await deleteDoc(doc(db, 'tables', creditTable.id));
        }

        Swal.fire('Anulada', 'La venta ha sido anulada e inventario devuelto.', 'success');
        fetchHistoryData();
        if (showReportsModal) fetchReportData();
      } catch (error) {
        console.error('Error cancelling sale:', error);
        Swal.fire('Error', 'No se pudo anular la venta.', 'error');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const printSale = async (sale: Sale) => {
    const dateStr = sale.timestamp?.toDate ? sale.timestamp.toDate().toLocaleString('es-CO') : new Date().toLocaleString('es-CO');
    const htmlItems = sale.items.map(i => `
        <div style="display:flex; align-items:flex-start; margin-bottom:4px; font-size:12px;">
            <div style="white-space:nowrap; margin-right:5px; font-weight:bold;">${i.quantity} x</div>
            <div style="flex:1; text-align:left; padding-right:5px; line-height:1.2;">${i.name}</div>
            <div style="white-space:nowrap; font-weight:bold;">$${(i.price * i.quantity).toLocaleString('es-CO')}</div>
        </div>
        ${i.note ? `<div style="font-size: 10px; color: #666; margin-left: 25px; margin-bottom: 4px;">* ${i.note}</div>` : ''}
    `).join('');

    const printArea = document.getElementById('printable-area');
    if (!printArea) return;
    
    printArea.innerHTML = `
        <div style="width: 100%; text-align: center; font-family: monospace; color:black;">
            <h2 style="margin:0; font-size:18px; font-weight:bold;">RESTAURANTE</h2>
            <h2 style="margin:0; font-size:18px; font-weight:bold;">DOÑA PEPA</h2>
            <p style="margin:0; font-size:14px; font-weight:bold;">*** RECIBO DE VENTA ***</p>
            <div style="border-bottom:1px dashed black; margin:5px 0;"></div>
            
            <div style="text-align:left; font-size:12px;">
                <p style="margin: 2px 0;"><strong>Mesa:</strong> ${sale.table} - ${sale.clientName}</p>
                <p style="margin: 2px 0;">${dateStr}</p>
                <p style="margin: 2px 0;"><strong>Pago:</strong> ${sale.paymentMethod}</p>
            </div>
            
            <div style="border-bottom:1px dashed black; margin:5px 0;"></div>
            
            <div style="text-align:left;">
                ${htmlItems}
            </div>
            
            <div style="border-bottom:1px dashed black; margin:5px 0;"></div>
            
            <div style="text-align:right; font-size:16px; font-weight:bold; margin-top:5px;">
                <p style="margin: 0;">TOTAL: $${sale.total.toLocaleString('es-CO')}</p>
            </div>
            
            <div style="margin-top:20px; font-size:11px;">
                <p style="margin: 2px 0;">Gracias por su visita</p>
                <p style="margin: 2px 0;">www.donapepacucuta.com</p>
            </div>
            <br>.
        </div>
    `;
    
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const viewSale = (sale: Sale) => {
    const htmlItems = sale.items.map(i => `
      <div class="flex justify-between text-sm py-1 border-b border-gray-100">
        <span>${i.quantity}x ${i.name}</span>
        <span class="font-bold">$${(i.price * i.quantity).toLocaleString()}</span>
      </div>
    `).join('');

    Swal.fire({
      title: `<h3 class="text-xl font-black">Detalle de Venta</h3>`,
      html: `
        <div class="text-left space-y-4">
          <div class="bg-gray-50 p-4 rounded-2xl">
            <p class="text-xs font-black text-gray-400 uppercase">Información</p>
            <p class="text-sm font-bold">Mesa: ${sale.table}</p>
            <p class="text-sm font-bold">Cliente: ${sale.clientName}</p>
            <p class="text-sm font-bold">Fecha: ${sale.timestamp?.toDate ? sale.timestamp.toDate().toLocaleString() : 'N/A'}</p>
            <p class="text-sm font-bold">Método: ${sale.paymentMethod}</p>
          </div>
          <div>
            <p class="text-xs font-black text-gray-400 uppercase mb-2">Productos</p>
            ${htmlItems}
          </div>
          <div class="flex justify-between items-center pt-4 border-t">
            <span class="text-lg font-black uppercase">Total</span>
            <span class="text-2xl font-black text-red-600">$${sale.total.toLocaleString()}</span>
          </div>
        </div>
      `,
      showCloseButton: true,
      showConfirmButton: false,
      customClass: {
        popup: 'rounded-[32px]'
      }
    });
  };

  const clearAllSales = async () => {
    const result = await Swal.fire({
      title: '¿BORRAR TODO EL HISTORIAL?',
      text: 'Se eliminarán TODAS las ventas registradas. Esta acción es irreversible.',
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'SÍ, BORRAR TODO',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });

    if (result.isConfirmed) {
      const secondConfirm = await Swal.fire({
        title: '¿Estás seguro?',
        text: 'Escribe "BORRAR" para confirmar la eliminación total.',
        input: 'text',
        inputValidator: (value) => {
          if (value !== 'BORRAR') return 'Debes escribir BORRAR';
          return null;
        },
        showCancelButton: true,
        confirmButtonText: 'Confirmar eliminación total',
        confirmButtonColor: '#d33'
      });

      if (secondConfirm.isConfirmed) {
        Swal.fire({ title: 'Borrando historial...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          const snap = await getDocs(collection(db, 'sales'));
          const chunks = [];
          for (let i = 0; i < snap.docs.length; i += 450) {
            chunks.push(snap.docs.slice(i, i + 450));
          }
          
          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }

          Swal.fire('Historial Limpio', 'Se han eliminado todas las ventas.', 'success');
          fetchHistoryData();
          if (showReportsModal) fetchReportData();
        } catch (error) {
          console.error('Error clearing history:', error);
          Swal.fire('Error', 'No se pudo limpiar el historial.', 'error');
        }
      }
    }
  };

  const printConsumptionReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = reportStats.itemSales.map(item => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte de Consumo</title>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .subtitle { font-size: 14px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { text-align: left; border-bottom: 2px solid #000; padding-bottom: 10px; font-size: 14px; text-transform: uppercase; }
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #999; border-top: 1px dashed #ccc; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">REPORTE DE CONSUMO</div>
            <div class="subtitle">(Cantidades vendidas - Sin precios)</div>
            <div style="font-weight: bold;">Desde: ${reportRange.start} Hasta: ${reportRange.end}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th style="text-align: center;">Cant.</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="footer">--- Fin del Reporte ---</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const printCashReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const expensesHtml = reportData.expenses.map(e => `
      <tr>
        <td style="padding: 5px 0;">${new Date(e.timestamp?.toDate()).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })}</td>
        <td style="padding: 5px 0;">${e.concept} (${e.category})</td>
        <td style="padding: 5px 0; text-align: right; color: #ef4444;">-$${e.amount.toLocaleString()}</td>
      </tr>
    `).join('');

    const itemsHtml = reportStats.itemSales.map(item => `
      <tr>
        <td style="padding: 5px 0;">${item.name}</td>
        <td style="padding: 5px 0; text-align: center;">${item.quantity}</td>
        <td style="padding: 5px 0; text-align: right;">$${item.total.toLocaleString()}</td>
      </tr>
    `).join('');

    const creditsHtml = reportStats.creditSales.map(s => `
      <tr>
        <td style="padding: 5px 0;">${new Date(s.timestamp?.toDate()).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })}</td>
        <td style="padding: 5px 0;">${s.clientName}</td>
        <td style="padding: 5px 0; text-align: right; color: #f59e0b;">$${s.total.toLocaleString()}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte de Caja</title>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; color: #333; }
            .header { text-align: center; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .business-name { font-size: 18px; margin-bottom: 5px; }
            .dates { font-size: 14px; margin-bottom: 20px; }
            .section-title { font-size: 14px; font-weight: bold; background: #f4f4f4; padding: 5px 10px; margin-top: 20px; border-bottom: 2px solid #000; }
            .summary-row { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px dotted #ccc; }
            .summary-row.total { font-weight: bold; font-size: 16px; border-bottom: 2px solid #000; margin-top: 10px; }
            .summary-row.balance { font-weight: bold; font-size: 20px; border-bottom: none; background: #f9f9f9; margin-top: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { text-align: left; border-bottom: 1px solid #000; padding: 5px 0; font-size: 12px; }
            td { font-size: 12px; }
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">REPORTE DE CAJA</div>
            <div class="business-name">Doña Pepa</div>
            <div class="dates">Del: ${reportRange.start} Al: ${reportRange.end}</div>
          </div>

          <div class="section-title">RESUMEN</div>
          ${Object.entries(reportStats.salesByMethod)
            .filter(([_, value]) => value > 0)
            .map(([method, value]) => `
              <div class="summary-row"><span>${method}:</span> <span>$${value.toLocaleString()}</span></div>
            `).join('')}
          <div class="summary-row total"><span>TOTAL VENTAS (CAJA):</span> <span>$${reportStats.totalSales.toLocaleString()}</span></div>
          ${reportStats.totalCreditPayments > 0 ? `
            <div class="summary-row" style="color: #3b82f6; font-size: 13px;">
              <span>↳ Recaudo Créditos (Deuda Anterior):</span> 
              <span>$${reportStats.totalCreditPayments.toLocaleString()}</span>
            </div>
          ` : ''}
          <div class="summary-row" style="color: #f59e0b;"><span>TOTAL CRÉDITOS:</span> <span>$${reportStats.totalCredits.toLocaleString()}</span></div>
          <div class="summary-row" style="color: #ef4444;"><span>TOTAL GASTOS:</span> <span>-$${reportStats.totalExpenses.toLocaleString()}</span></div>
          <div class="summary-row balance"><span>BALANCE NETO (CAJA):</span> <span>$${reportStats.balance.toLocaleString()}</span></div>

          <div class="section-title">DETALLE DE GASTOS</div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th style="text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>${expensesHtml}</tbody>
          </table>

          <div class="section-title">DETALLE PRODUCTOS</div>
          ${reportStats.totalCreditPayments > 0 ? `
            <div style="font-size: 10px; color: #666; margin-top: 5px; font-style: italic;">
              * Nota: El detalle de productos no incluye los platos de los recaudos de créditos ($${reportStats.totalCreditPayments.toLocaleString()}).
            </div>
          ` : ''}
          <table>
            <thead>
              <tr>
                <th>Plato</th>
                <th style="text-align: center;">Cant.</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          ${reportStats.creditSales.length > 0 ? `
          <div class="section-title">DETALLE CRÉDITOS PENDIENTES</div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th style="text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>${creditsHtml}</tbody>
          </table>
          ` : ''}

          <div class="footer">
            --- Fin del Reporte ---<br>
            Generado: ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  useEffect(() => {
    if (showPaymentModal) {
      isFirstPaymentKeyPress.current = true;
    }
  }, [showPaymentModal, paymentMethod]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showPaymentModal) {
        if (e.key === 'Enter') {
          const confirmBtn = document.querySelector('button[data-confirm-payment="true"]') as HTMLButtonElement;
          if (confirmBtn && !confirmBtn.disabled) {
            handlePayment();
          }
          return;
        }

        if (paymentMethod === 'Efectivo') {
          if (e.key >= '0' && e.key <= '9') {
            if (isFirstPaymentKeyPress.current) {
              setReceivedAmount(Number(e.key));
              isFirstPaymentKeyPress.current = false;
            } else {
              setReceivedAmount(prev => Number(prev.toString() + e.key));
            }
            return;
          } else if (e.key === 'Backspace') {
            setReceivedAmount(prev => {
              const s = prev.toString();
              return s.length > 1 ? Number(s.slice(0, -1)) : 0;
            });
            return;
          }
        }
      }

      if (view === 'menu' && !showPaymentModal && !showReportsModal && !showExpensesModal && !showHistoryModal) {
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
  }, [view, showPaymentModal, showReportsModal, showExpensesModal, showHistoryModal, paymentMethod]);

  const reportStats = useMemo(() => {
    const activeSales = reportData.sales.filter(s => s.status !== 'cancelled');
    const totalSales = activeSales.filter(s => s.paymentMethod !== 'Crédito').reduce((sum, s) => sum + s.total, 0);
    const totalCreditPayments = activeSales.filter(s => s.isCreditPayment && s.paymentMethod !== 'Crédito').reduce((sum, s) => sum + s.total, 0);
    const totalCredits = activeSales.filter(s => s.paymentMethod === 'Crédito').reduce((sum, s) => sum + s.total, 0);
    const totalExpenses = reportData.expenses.reduce((sum, e) => sum + e.amount, 0);
    
    const salesByCategory: Record<string, number> = {};
    const salesByItem: Record<string, { name: string, quantity: number, total: number }> = {};
    
    activeSales.forEach(sale => {
      if (sale.isCreditPayment) return;
      sale.items.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        const cat = prod?.category || 'Otros';
        salesByCategory[cat] = (salesByCategory[cat] || 0) + (item.price * item.quantity);
        
        if (!salesByItem[item.productId]) {
          salesByItem[item.productId] = { name: item.name, quantity: 0, total: 0 };
        }
        salesByItem[item.productId].quantity += item.quantity;
        salesByItem[item.productId].total += (item.price * item.quantity);
      });
    });

    const salesByMethod: Record<string, number> = {
      'Efectivo': 0,
      'Nequi': 0,
      'Tarjeta': 0,
      'Daviplata': 0,
      'QR': 0,
      'Crédito': 0
    };
    
    activeSales.forEach(sale => {
      const method = sale.paymentMethod.split(':')[0].trim();
      if (method === 'Mixto') {
        // Parse mixed payment string: "Mixto: Efectivo ($10.000), Nequi ($5.000)"
        const parts = sale.paymentMethod.split(': ')[1].split(', ');
        parts.forEach(p => {
          const [m, vStr] = p.split(' ($');
          const mName = m.trim();
          const val = Number(vStr.replace(')', '').replace(/\./g, ''));
          if (salesByMethod[mName] !== undefined) {
            salesByMethod[mName] += val;
          } else {
            salesByMethod[mName] = (salesByMethod[mName] || 0) + val;
          }
        });
      } else {
        salesByMethod[method] = (salesByMethod[method] || 0) + sale.total;
      }
    });

    return {
      totalSales,
      totalCredits,
      totalCreditPayments,
      totalExpenses,
      balance: totalSales - totalExpenses,
      categoryData: Object.entries(salesByCategory).map(([name, value]) => ({ name, value })),
      methodData: Object.entries(salesByMethod).map(([name, value]) => ({ name, value })),
      itemSales: Object.values(salesByItem).sort((a, b) => b.total - a.total),
      salesByMethod,
      creditSales: activeSales.filter(s => s.paymentMethod === 'Crédito')
    };
  }, [reportData, products]);

  // Table Actions
  const openTable = (tableId: string) => {
    setActiveTableId(tableId);
    setView('menu');
    setMobileActiveTab('menu');
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
    
    const isDelivery = activeTable.number < 1 && !activeTable.isCredit;
    const itemPrice = isDelivery ? (product.price + (product.packagingPrice || 0)) : product.price;

    const newItems = [...activeTable.items];
    const existingIndex = newItems.findIndex(item => item.productId === product.id);
    if (existingIndex >= 0) {
      newItems[existingIndex].quantity += 1;
      newItems[existingIndex].price = itemPrice; // Asegurar que el precio sea el correcto para el modo actual
    } else {
      newItems.push({ 
        productId: product.id, 
        name: product.name, 
        price: itemPrice, 
        quantity: 1, 
        originalPrice: product.price, 
        note: '' 
      });
    }

    // Si es un crédito, descontar inventario inmediatamente y actualizar la venta
    if (activeTable.isCredit) {
      if (product.recipe) {
        for (const recipeItem of product.recipe) {
          await updateDoc(doc(db, 'ingredients', recipeItem.ingredientId), { 
            stock: increment(-recipeItem.quantity) 
          });
        }
      }
      
      if (activeTable.saleId) {
        const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        await updateDoc(doc(db, 'sales', activeTable.saleId), {
          items: newItems,
          total: newTotal
        });
      }
    }

    await updateDoc(doc(db, 'tables', activeTableId), { items: newItems, status: 'busy', lastUpdate: serverTimestamp() });
    setSearchTerm('');
  };

  const updateItemQty = async (productId: string, delta: number) => {
    if (!activeTableId || !activeTable) return;
    
    const itemToUpdate = activeTable.items.find(i => i.productId === productId);
    if (!itemToUpdate) return;

    // Si es un crédito, descontar/devolver inventario y actualizar la venta
    if (activeTable.isCredit) {
      const product = products.find(p => p.id === productId);
      if (product?.recipe) {
        // Si delta es positivo, descuenta. Si es negativo, devuelve.
        for (const recipeItem of product.recipe) {
          await updateDoc(doc(db, 'ingredients', recipeItem.ingredientId), { 
            stock: increment(-(recipeItem.quantity * delta)) 
          });
        }
      }
    }

    const newItems = activeTable.items.map(item => {
      if (item.productId === productId) return { ...item, quantity: Math.max(0, item.quantity + delta) };
      return item;
    }).filter(item => item.quantity > 0);

    if (activeTable.isCredit && activeTable.saleId) {
      const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      await updateDoc(doc(db, 'sales', activeTable.saleId), {
        items: newItems,
        total: newTotal
      });
    }

    await updateDoc(doc(db, 'tables', activeTableId), { items: newItems, status: newItems.length > 0 ? 'busy' : 'free', lastUpdate: serverTimestamp() });
  };

  const updateItemNote = async (productId: string, note: string) => {
    if (!activeTableId || !activeTable) return;
    const newItems = activeTable.items.map(item => item.productId === productId ? { ...item, note } : item);
    
    if (activeTable.isCredit && activeTable.saleId) {
      await updateDoc(doc(db, 'sales', activeTable.saleId), {
        items: newItems
      });
    }

    await updateDoc(doc(db, 'tables', activeTableId), { items: newItems });
  };

  const updateItemPrice = async (productId: string, price: number) => {
    if (!activeTableId || !activeTable) return;
    const newItems = activeTable.items.map(item => item.productId === productId ? { ...item, price } : item);
    
    if (activeTable.isCredit && activeTable.saleId) {
      const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      await updateDoc(doc(db, 'sales', activeTable.saleId), {
        items: newItems,
        total: newTotal
      });
    }

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
    if (!activeTableId || !activeTable || isProcessing) return;
    const isPartial = Object.keys(selectedItemsForPayment).length > 0;
    const itemsToPay = isPartial 
      ? activeTable.items.filter(i => selectedItemsForPayment[i.productId]).map(i => ({ ...i, quantity: selectedItemsForPayment[i.productId] }))
      : activeTable.items;
    const total = itemsToPay.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    setIsProcessing(true);
    try {
      let finalPaymentMethod = paymentMethod as string;
      if (paymentMethod === 'Mixto') {
        const methods = [];
        if (mixedPayments.val1 > 0) methods.push(`${mixedPayments.method1} ($${mixedPayments.val1.toLocaleString()})`);
        if (mixedPayments.val2 > 0) methods.push(`${mixedPayments.method2} ($${mixedPayments.val2.toLocaleString()})`);
        if (mixedPayments.val3 > 0) methods.push(`${mixedPayments.method3} ($${mixedPayments.val3.toLocaleString()})`);
        finalPaymentMethod = `Mixto: ${methods.join(', ')}`;
      }

      await addDoc(collection(db, 'sales'), {
        items: itemsToPay,
        total,
        paymentMethod: finalPaymentMethod,
        clientName: activeTable.clientName || 'Mostrador',
        table: activeTable.isCredit ? `CREDITO ${activeTable.number}` : (activeTable.number < 1 ? `DOM ${Math.round(activeTable.number * 100)}` : `Mesa ${activeTable.number}`),
        timestamp: serverTimestamp(),
        isCreditPayment: activeTable.isCredit || false
      });

      // Solo descontar inventario si NO es un pago de un crédito ya registrado
      if (!activeTable.isCredit) {
        for (const item of itemsToPay) {
          const product = products.find(p => p.id === item.productId);
          // Deduct regular recipe
          if (product?.recipe) {
            for (const recipeItem of product.recipe) {
              await updateDoc(doc(db, 'ingredients', recipeItem.ingredientId), { 
                stock: increment(-(recipeItem.quantity * item.quantity)) 
              });
            }
          }
        }
      }

      if (isPartial) {
        const remainingItems = activeTable.items.map(item => {
          if (selectedItemsForPayment[item.productId]) return { ...item, quantity: item.quantity - selectedItemsForPayment[item.productId] };
          return item;
        }).filter(item => item.quantity > 0);
        
        if (remainingItems.length === 0 && (activeTable.number < 1 || activeTable.isCredit)) {
          await deleteDoc(doc(db, 'tables', activeTableId));
        } else {
          await updateDoc(doc(db, 'tables', activeTableId), { 
            items: remainingItems, 
            status: remainingItems.length > 0 ? 'busy' : 'free', 
            clientName: remainingItems.length > 0 ? activeTable.clientName : '' 
          });
        }
      } else {
        if (activeTable.number < 1 || activeTable.isCredit) {
          await deleteDoc(doc(db, 'tables', activeTableId));
        } else {
          await updateDoc(doc(db, 'tables', activeTableId), { items: [], status: 'free', clientName: '' });
        }
      }

      setShowPaymentModal(false);
      setSelectedItemsForPayment({});
      if (!isPartial || (isPartial && activeTable.items.length === Object.keys(selectedItemsForPayment).length)) closeTable();
      Swal.fire({ icon: 'success', title: 'Venta Registrada', timer: 1500, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sales');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendToCredit = async () => {
    if (!activeTableId || !activeTable || isProcessing) return;
    if (activeTable.items.length === 0) {
      Swal.fire({ icon: 'error', title: 'Mesa Vacía', text: 'No hay productos para enviar a crédito.' });
      return;
    }

    if (!activeTable.clientName) {
      const { value: name } = await Swal.fire({
        title: 'Nombre del Cliente',
        input: 'text',
        inputLabel: 'Ingrese el nombre para el crédito',
        showCancelButton: true,
        inputValidator: (value) => {
          if (!value) return '¡Debe ingresar un nombre!';
          return null;
        }
      });
      if (!name) return;
      await updateDoc(doc(db, 'tables', activeTableId), { clientName: name });
      activeTable.clientName = name;
    }

    const result = await Swal.fire({
      title: '¿Enviar a Crédito?',
      text: `Se registrará la venta como crédito y se descontará del inventario.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      confirmButtonText: 'Sí, enviar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      setIsProcessing(true);
      try {
        // 1. Registrar la venta como crédito
        const saleRef = await addDoc(collection(db, 'sales'), {
          items: activeTable.items,
          total: orderTotal,
          paymentMethod: 'Crédito',
          clientName: activeTable.clientName,
          table: activeTable.number < 1 ? `DOM ${Math.round(activeTable.number * 100)}` : `Mesa ${activeTable.number}`,
          timestamp: serverTimestamp()
        });

        // 2. Descontar inventario
        for (const item of activeTable.items) {
          const product = products.find(p => p.id === item.productId);
          if (product?.recipe) {
            for (const recipeItem of product.recipe) {
              await updateDoc(doc(db, 'ingredients', recipeItem.ingredientId), { 
                stock: increment(-(recipeItem.quantity * item.quantity)) 
              });
            }
          }
        }

        // 3. Crear el registro de crédito persistente
        const creditTables = tables.filter(t => t.isCredit);
        const nextCreditNumber = creditTables.length > 0 
          ? Math.max(...creditTables.map(t => t.number)) + 1 
          : 1;
        
        const creditId = `credit-${Date.now()}`;
        await setDoc(doc(db, 'tables', creditId), {
          number: nextCreditNumber,
          items: activeTable.items,
          clientName: activeTable.clientName,
          status: 'busy',
          lastUpdate: serverTimestamp(),
          isCredit: true,
          saleId: saleRef.id
        });

        // 4. Limpiar la mesa original
        if (activeTable.number < 1) {
          await deleteDoc(doc(db, 'tables', activeTableId));
        } else {
          await updateDoc(doc(db, 'tables', activeTableId), { items: [], status: 'free', clientName: '' });
        }

        setActiveTableId(creditId);
        Swal.fire({ icon: 'success', title: 'Enviado a Crédito', timer: 1500, showConfirmButton: false });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'sales');
      } finally {
        setIsProcessing(false);
      }
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

  const clearTable = async () => {
    if (!activeTableId || !activeTable || isProcessing) return;
    const result = await Swal.fire({
      title: activeTable.isCredit ? '¿Eliminar Crédito?' : '¿Borrar pedido?',
      text: activeTable.isCredit 
        ? 'Se anulará el registro de crédito y se devolverá el inventario.' 
        : 'Esta acción vaciará la mesa y no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      setIsProcessing(true);
      try {
        if (activeTable.isCredit) {
          // 1. Devolver inventario
          for (const item of activeTable.items) {
            const product = products.find(p => p.id === item.productId);
            if (product?.recipe) {
              for (const recipeItem of product.recipe) {
                await updateDoc(doc(db, 'ingredients', recipeItem.ingredientId), { 
                  stock: increment(recipeItem.quantity * item.quantity) 
                });
              }
            }
          }
          // 2. Anular la venta original si existe
          if (activeTable.saleId) {
            await updateDoc(doc(db, 'sales', activeTable.saleId), { status: 'cancelled' });
          }
          // 3. Borrar la mesa de crédito
          await deleteDoc(doc(db, 'tables', activeTableId));
          setActiveTableId(null);
        } else if (activeTable.number < 1) {
          // Es un domicilio, borrar el documento
          await deleteDoc(doc(db, 'tables', activeTableId));
          setActiveTableId(null);
        } else {
          // Es una mesa normal, vaciarla
          await updateDoc(doc(db, 'tables', activeTableId), {
            items: [],
            status: 'free',
            clientName: '',
            shippingInfo: deleteField()
          });
        }
        Swal.fire({ icon: 'success', title: 'Pedido borrado', timer: 1500, showConfirmButton: false });
      } catch (error) {
        console.error('Error clearing table:', error);
        Swal.fire('Error', 'No se pudo borrar el pedido.', 'error');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="flex h-full bg-gray-100 overflow-hidden relative min-h-0 flex-col lg:flex-row">
      {/* Left Panel */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 min-h-0 border-r relative",
        view === 'menu' && mobileActiveTab === 'cart' ? 'hidden lg:flex' : 'flex'
      )}>
        <AnimatePresence mode="wait">
          {view === 'tables' && (
            <motion.div key="tables" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col p-6 overflow-y-auto min-h-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h2 className="text-xl sm:text-2xl font-black text-gray-800 flex items-center gap-2"><LayoutGrid className="w-6 h-6 text-red-600" />Mapa de Mesas</h2>
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
                  <button 
                    onClick={() => {
                      setDeliveryInfo({ name: '', phone: '', address: '', notes: '' });
                      setShowDeliveryModal(true);
                    }}
                    className="p-2 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition shadow-sm flex items-center gap-2 text-orange-600 font-bold text-xs"
                    title="Nuevo Domicilio"
                  >
                    <Globe className="w-5 h-5" />
                    <span className="hidden sm:inline">DOMICILIO</span>
                  </button>
                  <button onClick={() => setShowHistoryModal(true)} className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm" title="Historial"><History className="w-5 h-5 text-gray-600" /></button>
                  <button 
                    onClick={async () => {
                      try {
                        const connected = await printerService.requestDevice();
                        setIsPrinterConnected(connected);
                        if (connected) {
                          Swal.fire({ 
                            icon: 'success', 
                            title: 'Impresora Conectada', 
                            text: 'La impresora USB está lista para usar.', 
                            timer: 2000, 
                            showConfirmButton: false 
                          });
                        }
                      } catch (err: any) {
                        console.error(err);
                        setIsPrinterConnected(false);
                        
                        if (err.message === 'SISTEMA_BLOQUEADO') {
                          Swal.fire({
                            icon: 'warning',
                            title: 'Sistema Bloqueado',
                            html: `
                              <div class="text-left text-sm">
                                <p>Windows está bloqueando el acceso directo a la impresora porque tiene instalado un driver genérico.</p>
                                <br/>
                                <p><b>Para solucionarlo:</b></p>
                                <ol class="list-decimal ml-5 mt-2">
                                  <li>Desconecta y vuelve a conectar el USB.</li>
                                  <li>Si sigue fallando, necesitas usar <b>Zadig</b> para cambiar el driver a "WinUSB".</li>
                                  <li>O simplemente usa la <b>Impresión Normal</b> (el botón funcionará aunque el icono esté gris).</li>
                                </ol>
                              </div>
                            `,
                            confirmButtonText: 'Entendido'
                          });
                        } else {
                          Swal.fire({ 
                            icon: 'error', 
                            title: 'Error de Conexión', 
                            text: err.message || 'No se pudo establecer conexión con la impresora.',
                            confirmButtonText: 'Entendido'
                          });
                        }
                      }
                    }} 
                    className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm"
                    title="Configurar Impresora USB"
                  >
                    <Printer className={`w-5 h-5 ${isPrinterConnected ? 'text-green-600' : 'text-gray-400'}`} />
                  </button>
                  <button onClick={() => setShowReportsModal(true)} className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm" title="Reportes"><ChartLine className="w-5 h-5 text-blue-600" /></button>
                  <button onClick={() => setShowExpensesModal(true)} className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm"><Banknote className="w-5 h-5 text-red-600" /></button>
                  {userProfile?.role === 'admin' && (
                    <button 
                      onClick={() => {
                        setEditingSettings(businessSettings || defaultSettings);
                        setShowSettingsModal(true);
                      }} 
                      className="p-2 bg-white border rounded-xl hover:bg-gray-50 transition shadow-sm" 
                      title="Configuración del Negocio"
                    >
                      <Settings className="w-5 h-5 text-purple-600" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {tables.map(table => (
                  <button 
                    key={table.id} 
                    onClick={() => openTable(table.id)} 
                    className={cn(
                      "aspect-square rounded-3xl border-2 transition-all duration-300 flex flex-col items-center justify-center gap-2 shadow-sm hover:shadow-md hover:-translate-y-1", 
                      table.status === 'busy' 
                        ? (table.number < 1 ? "bg-orange-50 border-orange-200 text-orange-800" : "bg-red-50 border-red-200 text-red-800") 
                        : "bg-white border-gray-100 text-gray-400 hover:border-blue-200"
                    )}
                  >
                    <TableIcon className={cn("w-8 h-8", table.status === 'busy' ? (table.isCredit ? "text-amber-600" : (table.number < 1 ? "text-orange-600" : "text-red-600")) : "text-gray-200")} />
                    <span className="font-black text-lg">
                      {table.isCredit ? `CREDITO ${table.number}` : (table.number < 1 ? `DOM ${Math.round(table.number * 100)}` : `MESA ${table.number}`)}
                    </span>
                    {table.clientName && (
                      <span className="text-[10px] font-bold uppercase truncate max-w-[80%] opacity-70">
                        {table.clientName}
                      </span>
                    )}
                      {table.status === 'busy' && (
                      <span className={cn(
                        "text-xs font-bold text-white px-2 py-0.5 rounded-full",
                        table.isCredit ? "bg-amber-600" : (table.number < 1 ? "bg-orange-600" : "bg-red-600")
                      )}>
                        ${table.items.reduce((s, i) => s + (i.price * i.quantity), 0).toLocaleString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'menu' && (
            <motion.div key="menu" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex-1 flex flex-col min-h-0">
              <div className="p-6 bg-white border-b space-y-4 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                      if (activeCategory !== 'all') {
                        setActiveCategory('all');
                      } else {
                        closeTable();
                      }
                    }} 
                    className="p-2 bg-gray-50 border rounded-xl hover:bg-gray-100 transition"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="flex-1 relative flex items-center gap-2">
                    <div className="relative flex-1">
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
                    <button 
                      onClick={closeTable}
                      className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition shadow-sm flex items-center gap-2 border border-red-100"
                      title="Volver a Mesas"
                    >
                      <TableIcon className="w-5 h-5" />
                      <span className="hidden sm:inline font-black text-xs uppercase tracking-widest">Mesas</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {activeCategory === 'all' && !searchTerm ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={categories.filter(c => c !== 'all')}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {categories.filter(c => c !== 'all').map(cat => (
                          <SortableCategory 
                            key={cat} 
                            cat={cat} 
                            onClick={() => setActiveCategory(cat)} 
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={filteredProducts.map(p => p.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start">
                        {filteredProducts.map(product => (
                          <SortableProduct 
                            key={product.id} 
                            product={product} 
                            onClick={() => addToOrder(product)} 
                          />
                        ))}
                        {filteredProducts.length === 0 && (
                          <div className="col-span-full py-20 text-center text-gray-400">
                            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p className="font-black uppercase tracking-widest text-sm">No se encontraron platos</p>
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Panel */}
      <div className={cn(
        "w-full lg:w-[400px] bg-white shadow-2xl flex flex-col z-20 flex-1 lg:flex-none min-h-0",
        (view === 'tables' || (view === 'menu' && mobileActiveTab === 'menu')) ? 'hidden lg:flex' : 'flex'
      )}>
        <div className="p-6 border-b bg-gray-50/50 shrink-0">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
              <ShoppingCart className="w-6 h-6 text-red-600" />
              {activeTable ? (activeTable.isCredit ? `Crédito ${activeTable.number}` : (activeTable.number < 1 ? `Dom ${Math.round(activeTable.number * 100)}` : `Mesa ${activeTable.number}`)) : 'Seleccione Mesa'}
            </h2>
            <div className="flex gap-1">
              {activeTable && (
                <>
                  {!activeTable.isCredit && (
                    <button disabled={isProcessing} onClick={sendToCredit} className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition disabled:opacity-50" title="Enviar a Crédito"><CreditCard className="w-5 h-5" /></button>
                  )}
                  <button onClick={() => printComanda('kitchen')} className="p-2 text-orange-600 hover:bg-orange-50 rounded-xl transition" title="Comanda Cocina"><UtensilsCrossed className="w-5 h-5" /></button>
                  <button onClick={async () => {
                    const { value: target } = await Swal.fire({ title: 'Mover Mesa', input: 'number', inputLabel: 'Número de mesa destino', showCancelButton: true });
                    if (target) moveTable(Number(target));
                  }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition" title="Mover Mesa"><RefreshCw className="w-5 h-5" /></button>
                  <button disabled={isProcessing} onClick={clearTable} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition disabled:opacity-50" title="Borrar Pedido"><Trash2 className="w-5 h-5" /></button>
                </>
              )}
            </div>
          </div>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" placeholder="Nombre del Cliente" className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm font-bold" value={activeTable?.clientName || ''} onChange={async (e) => { if (activeTableId) await updateDoc(doc(db, 'tables', activeTableId), { clientName: e.target.value }); }} disabled={!activeTable} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 min-h-0">
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
          <div className="flex gap-3">
            <button 
              disabled={!activeTable || activeTable.items.length === 0} 
              onClick={() => printComanda('customer')} 
              className="flex-1 py-5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-3xl font-black text-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Printer className="w-6 h-6" />
            </button>
            <button 
              disabled={!activeTable || activeTable.items.length === 0 || isProcessing} 
              onClick={() => { 
                setReceivedAmount(currentTotalToPay); 
                setPaymentMethod('Efectivo');
                setShowPaymentModal(true); 
              }} 
              className={cn(
                "flex-[3] py-5 rounded-3xl font-black text-xl shadow-xl transition-all flex items-center justify-center gap-3", 
                Object.keys(selectedItemsForPayment).length > 0 ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none"
              )}
            >
              {Object.keys(selectedItemsForPayment).length > 0 ? <><Split className="w-6 h-6" /> COBRAR PARCIAL</> : <><CheckCircle2 className="w-6 h-6" /> COBRAR MESA</>}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      {view === 'menu' && (
        <div className="lg:hidden flex border-t bg-white p-2 gap-2 sticky bottom-0 z-[60] shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <button 
            onClick={() => setMobileActiveTab('menu')}
            className={cn(
              "flex-1 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all",
              mobileActiveTab === 'menu' ? "bg-red-600 text-white shadow-lg" : "bg-gray-50 text-gray-400"
            )}
          >
            <LayoutGrid className="w-5 h-5" />
            MENÚ
          </button>
          <button 
            onClick={() => setMobileActiveTab('cart')}
            className={cn(
              "flex-1 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all relative",
              mobileActiveTab === 'cart' ? "bg-red-600 text-white shadow-lg" : "bg-gray-50 text-gray-400"
            )}
          >
            <ShoppingCart className="w-5 h-5" />
            PEDIDO
            {activeTable && activeTable.items.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                {activeTable.items.reduce((acc, item) => acc + item.quantity, 0)}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col lg:flex-row h-full lg:h-[700px] max-h-screen lg:max-h-[95vh]">
              <div className="w-full lg:w-1/3 bg-gray-900 text-white p-6 lg:p-10 flex flex-col">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-6 lg:mb-12">Resumen de Pago</h3>
                <div className="space-y-4 lg:space-y-8 flex-1">
                  <div><p className="text-xs font-bold text-gray-500 uppercase mb-2">Recibido</p><p className="text-2xl lg:text-4xl font-black text-blue-400">${(paymentMethod === 'Mixto' ? (mixedPayments.val1 + mixedPayments.val2 + mixedPayments.val3) : receivedAmount).toLocaleString()}</p></div>
                  <div className="pt-4 lg:pt-8 border-t border-white/10"><p className="text-xs font-bold text-gray-500 uppercase mb-2">Cambio</p><p className={cn("text-3xl lg:text-5xl font-black", (paymentMethod === 'Mixto' ? (mixedPayments.val1 + mixedPayments.val2 + mixedPayments.val3) : receivedAmount) >= currentTotalToPay ? "text-green-400" : "text-red-400")}>${Math.max(0, (paymentMethod === 'Mixto' ? (mixedPayments.val1 + mixedPayments.val2 + mixedPayments.val3) : receivedAmount) - currentTotalToPay).toLocaleString()}</p></div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 text-center mt-4 lg:mt-0"><p className="text-xs font-black uppercase tracking-widest text-gray-400">{paymentMethod}</p></div>
              </div>
              <div className="flex-1 p-6 lg:p-10 flex flex-col overflow-hidden">
                <div className="flex justify-between items-center mb-4 lg:mb-8 flex-shrink-0"><h3 className="text-xl lg:text-2xl font-black text-gray-800">Método de Pago</h3><button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-gray-400" /></button></div>
                <div className="grid grid-cols-3 gap-3 mb-8 flex-shrink-0">
                  {['Efectivo', 'Nequi', 'Daviplata', 'Tarjeta', 'QR', 'Mixto'].map(m => (
                    <button key={m} onClick={() => setPaymentMethod(m as any)} className={cn("py-4 rounded-2xl border-2 font-black text-sm transition-all flex flex-col items-center gap-2", paymentMethod === m ? "bg-red-50 border-red-600 text-red-800" : "bg-white border-gray-100 text-gray-400 hover:border-gray-200")}>{m}</button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 mb-6">
                  {paymentMethod === 'Efectivo' ? (
                    <div className="grid grid-cols-3 gap-3 h-full">
                      {[7, 8, 9, 4, 5, 6, 1, 2, 3, 'C', 0, '00'].map(val => (
                        <button key={val} onClick={() => { 
                          if (val === 'C') {
                            setReceivedAmount(0);
                            isFirstPaymentKeyPress.current = true;
                          } else if (val === '00') {
                            if (isFirstPaymentKeyPress.current) {
                              setReceivedAmount(0);
                              isFirstPaymentKeyPress.current = false;
                            } else {
                              setReceivedAmount(prev => Number(prev.toString() + '00'));
                            }
                          } else {
                            if (isFirstPaymentKeyPress.current) {
                              setReceivedAmount(Number(val));
                              isFirstPaymentKeyPress.current = false;
                            } else {
                              setReceivedAmount(prev => Number(prev.toString() + val.toString()));
                            }
                          }
                        }} className="bg-gray-50 rounded-2xl font-black text-2xl text-gray-800 hover:bg-gray-100 transition">{val}</button>
                      ))}
                    </div>
                  ) : paymentMethod === 'Mixto' ? (
                    <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2">
                      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl relative group">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Método 1</label>
                          <select className="w-full p-2 bg-white border rounded-xl font-bold text-sm" value={mixedPayments.method1} onChange={(e) => setMixedPayments(prev => ({ ...prev, method1: e.target.value }))}>
                            <option>Efectivo</option><option>Nequi</option><option>Daviplata</option><option>Tarjeta</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-gray-400 uppercase">Monto 1</label>
                            <button 
                              onClick={() => setMixedPayments(prev => ({ ...prev, val1: currentTotalToPay, val2: 0, val3: 0 }))}
                              className="text-[10px] font-black text-blue-600 uppercase hover:underline"
                            >
                              Todo
                            </button>
                          </div>
                          <input type="number" className="w-full p-2 bg-white border-2 border-red-100 rounded-xl font-black text-lg" value={mixedPayments.val1} onChange={(e) => { 
                            const v1 = Number(e.target.value); 
                            const remaining = Math.max(0, currentTotalToPay - v1);
                            setMixedPayments(prev => ({ ...prev, val1: v1, val2: remaining, val3: 0 })); 
                          }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl relative group">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Método 2</label>
                          <select className="w-full p-2 bg-white border rounded-xl font-bold text-sm" value={mixedPayments.method2} onChange={(e) => setMixedPayments(prev => ({ ...prev, method2: e.target.value }))}>
                            <option>Efectivo</option><option>Nequi</option><option>Daviplata</option><option>Tarjeta</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-gray-400 uppercase">Monto 2</label>
                            <button 
                              onClick={() => {
                                const remaining = Math.max(0, currentTotalToPay - mixedPayments.val1);
                                setMixedPayments(prev => ({ ...prev, val2: remaining, val3: 0 }));
                              }}
                              className="text-[10px] font-black text-blue-600 uppercase hover:underline"
                            >
                              Resto
                            </button>
                          </div>
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
                          <label className="text-[10px] font-black text-gray-400 uppercase">Monto 3 (Automático)</label>
                          <input type="number" className="w-full p-2 bg-gray-100 border rounded-xl font-black text-lg text-gray-500" value={mixedPayments.val3} readOnly />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-400"><CheckCircle2 className="w-16 h-16 mb-4 text-green-500" /><p className="font-black uppercase tracking-widest">Monto Asignado</p></div>
                  )}
                </div>
                <button 
                  onClick={handlePayment} 
                  data-confirm-payment="true" 
                  disabled={
                    isProcessing || (paymentMethod === 'Mixto' 
                      ? (mixedPayments.val1 + mixedPayments.val2 + mixedPayments.val3) < currentTotalToPay
                      : receivedAmount < currentTotalToPay)
                  } 
                  className="flex-shrink-0 w-full py-5 bg-red-600 hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-300 text-white font-black text-xl rounded-3xl shadow-xl transition-all"
                >
                  CONFIRMAR PAGO
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showReportsModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col border border-gray-200">
              {/* Header */}
              <div className="px-6 py-4 border-b flex justify-between items-center bg-white">
                <div className="flex items-center gap-3">
                  <ChartLine className="w-6 h-6 text-blue-600" />
                  <h3 className="text-xl font-black text-gray-800">Informe Financiero</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={printConsumptionReport} className="flex items-center gap-2 px-4 py-1.5 bg-purple-50 text-purple-600 rounded-lg text-sm font-bold border border-purple-100 hover:bg-purple-100 transition">
                    <LayoutGrid className="w-4 h-4" />
                    Items
                  </button>
                  <button onClick={printCashReport} className="flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-bold border border-red-100 hover:bg-red-100 transition">
                    <FileText className="w-4 h-4" />
                    PDF
                  </button>
                  <button onClick={() => setShowReportsModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                    <X className="w-6 h-6 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Date Filters */}
              <div className="px-6 py-4 bg-gray-50 border-b flex items-center gap-3">
                <div className="flex-1 flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input type="date" className="w-full p-2.5 bg-white border rounded-lg font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500" value={reportRange.start} onChange={(e) => setReportRange(p => ({ ...p, start: e.target.value }))} />
                  </div>
                  <div className="flex-1 relative">
                    <input type="date" className="w-full p-2.5 bg-white border rounded-lg font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500" value={reportRange.end} onChange={(e) => setReportRange(p => ({ ...p, end: e.target.value }))} />
                  </div>
                </div>
                <button onClick={fetchReportData} className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm">
                  <Search className="w-6 h-6" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b bg-white">
                {[
                  { id: 'ventas', label: 'Ventas', icon: <ShoppingCart className="w-4 h-4" /> },
                  { id: 'creditos', label: 'Créditos', icon: <CreditCard className="w-4 h-4" /> },
                  { id: 'gastos', label: 'Gastos', icon: <Banknote className="w-4 h-4" /> },
                  { id: 'graficos', label: 'Gráficos', icon: <ChartLine className="w-4 h-4" /> }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setReportTab(tab.id as any)}
                    className={cn(
                      "flex-1 py-4 flex items-center justify-center gap-2 font-black text-sm uppercase tracking-widest transition-all relative",
                      reportTab === tab.id ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                    {reportTab === tab.id && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600" />}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-white">
                {reportTab === 'ventas' && (
                  <div className="space-y-6">
                    {/* Payment Method Cards with Scroll Controls */}
                    <div className="relative group">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => reportScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                          className="p-2 bg-white shadow-lg rounded-full border border-gray-100 text-gray-600 hover:text-blue-600"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                      </div>
                      
                      <div 
                        ref={reportScrollRef}
                        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
                      >
                        {['Efectivo', 'Nequi', 'Daviplata', 'Tarjeta', 'QR', 'Crédito']
                          .filter(method => (reportStats.salesByMethod[method] || 0) > 0)
                          .map(method => (
                            <div key={method} className="flex-shrink-0 w-[160px] bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-center snap-start">
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">{method}</p>
                              <p className="text-xl font-black text-blue-600">${(reportStats.salesByMethod[method] || 0).toLocaleString()}</p>
                            </div>
                          ))}
                      </div>

                      <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => reportScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                          className="p-2 bg-white shadow-lg rounded-full border border-gray-100 text-gray-600 hover:text-blue-600"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Sales Table */}
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b">
                          <tr className="text-xs font-black text-gray-500 uppercase tracking-widest">
                            <th className="px-6 py-4">Plato</th>
                            <th className="px-6 py-4 text-center">Cant.</th>
                            <th className="px-6 py-4 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportStats.itemSales.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition">
                              <td className="px-6 py-4 text-sm font-bold text-gray-700">{item.name}</td>
                              <td className="px-6 py-4 text-sm font-black text-center text-gray-900">{item.quantity}</td>
                              <td className="px-6 py-4 text-sm font-bold text-right text-green-600">${item.total.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {reportTab === 'creditos' && (
                  <div className="space-y-6">
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b">
                          <tr className="text-xs font-black text-gray-500 uppercase tracking-widest">
                            <th className="px-6 py-4">Fecha</th>
                            <th className="px-6 py-4">Cliente</th>
                            <th className="px-6 py-4 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportStats.creditSales.map((sale) => (
                            <tr key={sale.id} className="hover:bg-gray-50 transition">
                              <td className="px-6 py-4 text-sm font-medium text-gray-500">
                                {new Date(sale.timestamp?.toDate()).toLocaleDateString('es-CO')}
                              </td>
                              <td className="px-6 py-4 text-sm font-bold text-gray-700">{sale.clientName}</td>
                              <td className="px-6 py-4 text-sm font-bold text-right text-amber-600">${sale.total.toLocaleString()}</td>
                            </tr>
                          ))}
                          {reportStats.creditSales.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-6 py-12 text-center text-gray-400 italic">No hay créditos pendientes en este periodo</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {reportTab === 'gastos' && (
                  <div className="space-y-6">
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b">
                          <tr className="text-xs font-black text-gray-500 uppercase tracking-widest">
                            <th className="px-6 py-4">Concepto</th>
                            <th className="px-6 py-4">Categoría</th>
                            <th className="px-6 py-4 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportData.expenses.map((expense) => (
                            <tr key={expense.id} className="hover:bg-gray-50 transition">
                              <td className="px-6 py-4 text-sm font-bold text-gray-700">{expense.concept}</td>
                              <td className="px-6 py-4 text-sm font-medium text-gray-500">{expense.category}</td>
                              <td className="px-6 py-4 text-sm font-bold text-right text-red-600">-${expense.amount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {reportTab === 'graficos' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-6 rounded-3xl border h-[400px]">
                      <h4 className="font-black text-gray-800 mb-6 uppercase tracking-widest text-sm">Ventas por Categoría</h4>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportStats.categoryData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border h-[400px]">
                      <h4 className="font-black text-gray-800 mb-6 uppercase tracking-widest text-sm">Métodos de Pago</h4>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={reportStats.methodData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label>{reportStats.methodData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-8 py-6 bg-gray-50 border-t">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 text-sm font-bold gap-4">
                  <div className="flex flex-wrap gap-4 lg:gap-8">
                    <p className="text-gray-500">Ventas (Caja): <span className="text-green-600 font-black">${reportStats.totalSales.toLocaleString()}</span></p>
                    {reportStats.totalCreditPayments > 0 && (
                      <p className="text-blue-500">Recaudo Créditos: <span className="font-black">${reportStats.totalCreditPayments.toLocaleString()}</span></p>
                    )}
                    <p className="text-gray-500">Créditos (Pendientes): <span className="text-amber-600 font-black">${reportStats.totalCredits.toLocaleString()}</span></p>
                    <p className="text-gray-500">Gastos: <span className="text-red-600 font-black">-${reportStats.totalExpenses.toLocaleString()}</span></p>
                  </div>
                </div>
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
                  <p className="text-lg font-black text-gray-800 uppercase tracking-widest">Utilidad Neta (Caja):</p>
                  <p className="text-3xl lg:text-4xl font-black text-blue-600">${reportStats.balance.toLocaleString()}</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showHistoryModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-8 border-b flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-4">
                  <h3 className="text-2xl font-black text-gray-800">Historial de Ventas</h3>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <input 
                      type="date" 
                      value={historyDate}
                      onChange={(e) => setHistoryDate(e.target.value)}
                      className="text-sm font-bold text-gray-700 outline-none bg-transparent"
                    />
                  </div>
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-gray-400" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 lg:p-8">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead><tr className="text-xs font-black text-gray-400 uppercase tracking-widest border-b"><th className="pb-4">Fecha</th><th className="pb-4">Mesa</th><th className="pb-4">Cliente</th><th className="pb-4">Método</th><th className="pb-4 text-right">Total</th><th className="pb-4 text-right">Acción</th></tr></thead>
                  <tbody className="divide-y">
                    {historyData.map(sale => (
                      <tr key={sale.id} className={cn("hover:bg-gray-50 transition", sale.status === 'cancelled' && "opacity-50 line-through")}>
                        <td className="py-4 text-sm font-bold">{sale.timestamp?.toDate().toLocaleString()}</td>
                        <td className="py-4 text-sm font-black">{sale.table}</td>
                        <td className="py-4 text-sm font-medium">{sale.clientName}</td>
                        <td className="py-4 text-xs font-black uppercase text-gray-500">{sale.paymentMethod}</td>
                        <td className="py-4 text-right font-black text-gray-900">${sale.total.toLocaleString()}</td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => viewSale(sale)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Ver Tiquet">
                              <FileText className="w-4 h-4" />
                            </button>
                            <button onClick={() => printSale(sale)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition" title="Imprimir Tiquet">
                              <Printer className="w-4 h-4" />
                            </button>
                            {sale.status !== 'cancelled' && (
                              <button onClick={() => deleteSale(sale.id)} className="p-2 text-gray-300 hover:text-red-600 transition" title="Anular Venta">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <form onSubmit={async (e) => { 
                e.preventDefault(); 
                if (isProcessing) return;
                const fd = new FormData(e.currentTarget); 
                setIsProcessing(true);
                try {
                  await addDoc(collection(db, 'expenses'), { 
                    concept: fd.get('concept'), 
                    category: fd.get('category'), 
                    amount: Number(fd.get('amount')), 
                    timestamp: serverTimestamp() 
                  }); 
                  setShowExpensesModal(false); 
                  Swal.fire({ icon: 'success', title: 'Gasto Registrado', timer: 1500, showConfirmButton: false }); 
                } catch (error) {
                  handleFirestoreError(error, OperationType.WRITE, 'expenses');
                } finally {
                  setIsProcessing(false);
                }
              }} className="p-8 space-y-6">
                <div><label className="block text-xs font-black text-gray-400 uppercase mb-2">Concepto</label><input name="concept" required className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold" /></div>
                <div><label className="block text-xs font-black text-gray-400 uppercase mb-2">Categoría</label><select name="category" className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"><option>Insumos</option><option>Servicios</option><option>Nómina</option><option>Varios</option></select></div>
                <div><label className="block text-xs font-black text-gray-400 uppercase mb-2">Monto</label><input name="amount" type="number" required className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-2xl" /></div>
                <button type="submit" disabled={isProcessing} className="w-full py-5 bg-red-600 text-white font-black text-xl rounded-3xl shadow-xl hover:bg-red-700 transition disabled:opacity-50">REGISTRAR</button>
              </form>
            </motion.div>
          </div>
        )}

        {showSettingsModal && editingSettings && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-8 border-b flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-2xl">
                    <Settings className="w-6 h-6 text-purple-600" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-800">Configuración del Negocio</h3>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-gray-400" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Nombre del Negocio</label>
                    <input 
                      type="text" 
                      value={editingSettings.name} 
                      onChange={(e) => setEditingSettings({...editingSettings, name: e.target.value})}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">WhatsApp (Pedidos)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 573102456789"
                      value={editingSettings.whatsapp} 
                      onChange={(e) => setEditingSettings({...editingSettings, whatsapp: e.target.value})}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Teléfono de Contacto</label>
                    <input 
                      type="text" 
                      value={editingSettings.phone} 
                      onChange={(e) => setEditingSettings({...editingSettings, phone: e.target.value})}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Símbolo de Moneda</label>
                    <input 
                      type="text" 
                      value={editingSettings.currencySymbol} 
                      onChange={(e) => setEditingSettings({...editingSettings, currencySymbol: e.target.value})}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Dirección</label>
                    <input 
                      type="text" 
                      value={editingSettings.address} 
                      onChange={(e) => setEditingSettings({...editingSettings, address: e.target.value})}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Número de Mesas (TPV)</label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="number" 
                        value={editingSettings.tableCount} 
                        onChange={(e) => setEditingSettings({...editingSettings, tableCount: Number(e.target.value)})}
                        className="flex-1 p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none font-bold text-2xl text-center"
                      />
                      <button 
                        onClick={initializeTables}
                        className="px-6 py-4 bg-gray-100 text-gray-600 font-black rounded-2xl hover:bg-gray-200 transition text-sm"
                      >
                        REINICIALIZAR MESAS
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-wider">⚠️ REINICIALIZAR BORRARÁ EL ESTADO ACTUAL DE TODAS LAS MESAS</p>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-gray-50 border-t flex gap-4">
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-4 bg-white border border-gray-200 text-gray-400 font-black rounded-2xl hover:bg-gray-100 transition"
                >
                  CANCELAR
                </button>
                <button 
                  onClick={saveBusinessSettings}
                  disabled={isProcessing}
                  className="flex-1 py-4 bg-purple-600 text-white font-black rounded-2xl shadow-xl hover:bg-purple-700 transition disabled:opacity-50"
                >
                  {isProcessing ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showDeliveryModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
              <div className="p-8 border-b flex justify-between items-center bg-orange-50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-100 rounded-2xl">
                    <Globe className="w-6 h-6 text-orange-600" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-800">Nuevo Domicilio</h3>
                </div>
                <button onClick={() => setShowDeliveryModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-gray-400" /></button>
              </div>
              
              <div className="p-8 space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-2 tracking-widest">Teléfono (Prioridad)</label>
                  <input 
                    type="tel" 
                    placeholder="Ej: 3101234567"
                    value={deliveryInfo.phone}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDeliveryInfo(prev => ({ ...prev, phone: val }));
                      if (val.length >= 7) lookupCustomer(val);
                    }}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-2 tracking-widest">Nombre del Cliente</label>
                  <input 
                    type="text" 
                    placeholder="Nombre completo"
                    value={deliveryInfo.name}
                    onChange={(e) => setDeliveryInfo(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-2 tracking-widest">Dirección de Entrega</label>
                  <input 
                    type="text" 
                    placeholder="Calle, Carrera, Barrio..."
                    value={deliveryInfo.address}
                    onChange={(e) => setDeliveryInfo(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-2 tracking-widest">Notas / Referencias</label>
                  <textarea 
                    placeholder="Ej: Apartamento 201, frente al parque..."
                    value={deliveryInfo.notes}
                    onChange={(e) => setDeliveryInfo(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold resize-none h-24"
                  />
                </div>

                <button 
                  onClick={async () => {
                    if (!deliveryInfo.name || !deliveryInfo.phone || !deliveryInfo.address) {
                      Swal.fire({ icon: 'error', title: 'Campos Incompletos', text: 'Por favor complete nombre, teléfono y dirección.' });
                      return;
                    }

                    try {
                      // Save/Update customer info
                      const customerRef = doc(db, 'customers', deliveryInfo.phone);
                      await setDoc(customerRef, {
                        id: deliveryInfo.phone,
                        name: deliveryInfo.name,
                        phone: deliveryInfo.phone,
                        address: deliveryInfo.address,
                        notes: deliveryInfo.notes,
                        lastOrder: serverTimestamp()
                      }, { merge: true });

                      // Create delivery table
                      const domTables = tables.filter(t => t.number < 1);
                      const nextDomIndex = domTables.length > 0 
                        ? Math.max(...domTables.map(t => Math.round(t.number * 100))) + 1 
                        : 1;
                      const nextDomNumber = nextDomIndex / 100;
                      const tableId = `dom-${Date.now()}`;
                      
                      await setDoc(doc(db, 'tables', tableId), {
                        number: nextDomNumber,
                        items: [],
                        clientName: deliveryInfo.name,
                        status: 'busy',
                        lastUpdate: serverTimestamp(),
                        shippingInfo: {
                          name: deliveryInfo.name,
                          phone: deliveryInfo.phone,
                          address: deliveryInfo.address,
                          notes: deliveryInfo.notes
                        }
                      });
                      
                      setActiveTableId(tableId);
                      setView('menu');
                      setShowDeliveryModal(false);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, 'tables');
                    }
                  }}
                  className="w-full py-5 bg-orange-600 text-white font-black text-xl rounded-3xl shadow-xl hover:bg-orange-700 transition"
                >
                  CREAR PEDIDO
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
