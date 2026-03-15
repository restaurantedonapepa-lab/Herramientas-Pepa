import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Ingredient, SaleItem } from '../types';
import { DriveImage } from './DriveImage';
import { Search, Trash2, CreditCard, Banknote, QrCode, User, Table as TableIcon, ShoppingCart } from 'lucide-react';

export const POSView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientName, setClientName] = useState('');
  const [tableName, setTableName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });
    const unsubIngredients = onSnapshot(collection(db, 'ingredients'), (snapshot) => {
      setIngredients(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'ingredients');
    });
    return () => { unsubProducts(); unsubIngredients(); };
  }, []);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSale = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    try {
      // 1. Register Sale
      await addDoc(collection(db, 'sales'), {
        items: cart,
        total,
        paymentMethod,
        clientName,
        table: tableName,
        timestamp: serverTimestamp()
      });

      // 2. Deduct Inventory
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        if (product?.recipe) {
          for (const recipeItem of product.recipe) {
            const ingredientRef = doc(db, 'ingredients', recipeItem.ingredientId);
            await updateDoc(ingredientRef, {
              stock: increment(-(recipeItem.quantity * item.quantity))
            });
          }
        }
      }

      // 3. Reset
      setCart([]);
      setClientName('');
      setTableName('');
      console.log('Venta registrada con éxito');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sales/ingredients');
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex h-full bg-gray-100 overflow-hidden">
      {/* Products Selection */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 bg-white border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar producto..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredProducts.map(product => (
            <button 
              key={product.id}
              onClick={() => addToCart(product)}
              className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition text-left flex flex-col h-full"
            >
              <DriveImage imageId={product.imageId} className="w-full aspect-square object-cover rounded-lg mb-2" />
              <div className="flex-1">
                <h3 className="font-bold text-sm text-gray-800 line-clamp-2">{product.name}</h3>
                <p className="text-blue-600 font-bold mt-1">${product.price.toLocaleString()}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Ticket / Cart */}
      <div className="w-96 bg-white border-l shadow-xl flex flex-col">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            Ticket de Venta
          </h2>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Cliente"
              className="w-full pl-9 pr-3 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <div className="relative">
            <TableIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Mesa"
              className="w-full pl-9 pr-3 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.map(item => (
            <div key={item.productId} className="flex gap-3 items-start border-b pb-3">
              <div className="flex-1">
                <h4 className="font-bold text-sm text-gray-800">{item.name}</h4>
                <p className="text-xs text-gray-500">${item.price.toLocaleString()} c/u</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-2 py-1">
                  <button onClick={() => updateQuantity(item.productId, -1)} className="text-gray-500 hover:text-red-500 font-bold">-</button>
                  <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.productId, 1)} className="text-gray-500 hover:text-green-500 font-bold">+</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">${(item.price * item.quantity).toLocaleString()}</span>
                  <button onClick={() => removeFromCart(item.productId)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="text-center py-20 text-gray-400 italic">Ticket vacío</div>
          )}
        </div>

        <div className="p-4 bg-gray-50 border-t space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'Efectivo', icon: Banknote },
              { id: 'Tarjeta', icon: CreditCard },
              { id: 'QR', icon: QrCode }
            ].map(method => (
              <button
                key={method.id}
                onClick={() => setPaymentMethod(method.id)}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-bold transition ${
                  paymentMethod === method.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <method.icon className="w-4 h-4" />
                {method.id}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-end">
            <span className="text-sm text-gray-500 font-bold">Total:</span>
            <span className="text-3xl font-black text-gray-900">${total.toLocaleString()}</span>
          </div>

          <button 
            disabled={cart.length === 0 || processing}
            onClick={handleSale}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl text-lg shadow-lg transition flex items-center justify-center gap-2"
          >
            {processing ? 'PROCESANDO...' : 'CONFIRMAR VENTA'}
          </button>
        </div>
      </div>
    </div>
  );
};
