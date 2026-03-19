import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDriveImageUrl, auth } from '../firebase';
import { Product, Ingredient, RecipeItem } from '../types';
import { Plus, Edit2, Trash2, Package, UtensilsCrossed, Save, X, Search, Sparkles, MoreVertical, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import Swal from 'sweetalert2';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const InventoryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'products'>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isProductActive, setIsProductActive] = useState(true);
  const [showIngredientList, setShowIngredientList] = useState(false);
  const [isQuickCreatingIngredient, setIsQuickCreatingIngredient] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');

  const filteredIngredients = ingredients.filter(i => i.name.toLowerCase().includes(inventorySearch.toLowerCase()));
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(inventorySearch.toLowerCase()) || p.category.toLowerCase().includes(inventorySearch.toLowerCase()));

  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT_KUYEvt5fxkTpwMd38bu7VjuNrjlSwIYQ753QFWLRS93gTlTUuiDvBwJaYSsc8NOn01_yvSGJpkDG/pub?gid=0&single=true&output=csv';

  useEffect(() => {
    let unsubIngredients: (() => void) | undefined;
    let unsubProducts: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (unsubIngredients) unsubIngredients();
      if (unsubProducts) unsubProducts();

      if (!user) {
        setIngredients([]);
        setProducts([]);
        return;
      }

      unsubIngredients = onSnapshot(collection(db, 'ingredients'), (snapshot) => {
        setIngredients(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'ingredients');
      });
      unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
        setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'products');
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubIngredients) unsubIngredients();
      if (unsubProducts) unsubProducts();
    };
  }, []);

  const handleImportFromSheets = async () => {
    setIsImporting(true);
    try {
      const response = await fetch(CSV_URL);
      if (!response.ok) throw new Error('No se pudo descargar la hoja de cálculo. Verifica que esté publicada como CSV.');
      
      const text = await response.text();
      
      const parseCSV = (str: string) => {
        const arr = [];
        let quote = false;
        let col = "";
        let row = [];
        for (let c = 0; c < str.length; c++) {
          const char = str[c];
          const next = str[c+1];
          if (char === '"' && quote && next === '"') { col += char; c++; continue; }
          if (char === '"') { quote = !quote; continue; }
          if (char === ',' && !quote) { row.push(col); col = ""; continue; }
          if (char === '\n' && !quote) { row.push(col); arr.push(row); col = ""; row = []; continue; }
          if (char === '\r') continue;
          col += char;
        }
        if (col || row.length) { row.push(col); arr.push(row); }
        return arr;
      };

      const rows = parseCSV(text);
      let importedCount = 0;
      let updatedCount = 0;
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2 || !row[1]) continue;

        const name = row[1].trim();
        const price = parseFloat(row[2].replace(/[^0-9.]/g, '')) || 0;
        const category = row[3]?.trim() || 'General';
        const description = row[4]?.trim() || '';
        
        let imageId = '';
        const driveLink = row[5] || '';
        const idMatch = driveLink.match(/id=([a-zA-Z0-9_-]+)/) || driveLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (idMatch) imageId = idMatch[1];

        try {
          const existingProduct = products.find(p => 
            p.name.toLowerCase().trim() === name.toLowerCase().trim() && 
            p.category.toLowerCase().trim() === category.toLowerCase().trim()
          );

          if (existingProduct) {
            if (price > existingProduct.price) {
              await updateDoc(doc(db, 'products', existingProduct.id), { price });
              updatedCount++;
            }
          } else {
            await addDoc(collection(db, 'products'), {
              name,
              price: price,
              category,
              description,
              imageId,
              active: true,
              recipe: []
            });
            importedCount++;
          }
        } catch (err) {
          console.error(`Error importando fila ${i}:`, err);
        }
      }
      
      Swal.fire({
        title: 'Importación Finalizada',
        html: `
          <div class="text-left space-y-2">
            <p>✅ <b>${importedCount}</b> platos nuevos añadidos.</p>
            <p>📈 <b>${updatedCount}</b> precios actualizados.</p>
            <p>Total procesado: ${rows.length - 1} filas.</p>
          </div>
        `,
        icon: 'success'
      });
    } catch (error) {
      console.error('Error importing:', error);
      Swal.fire('Error', 'No se pudo completar la importación.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCleanDuplicates = async () => {
    const confirm = await Swal.fire({
      title: '¿Limpiar duplicados?',
      text: "Se eliminarán los platos que tengan el mismo nombre y categoría, dejando solo uno de cada uno.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, limpiar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    const seen = new Set();
    const toDelete = [];

    // Ordenamos para que si hay duplicados, se mantenga el que tenga más información (opcional)
    // Pero aquí simplemente el primero que encontremos se queda.
    for (const prod of products) {
      const key = `${prod.name.toLowerCase().trim()}-${prod.category.toLowerCase().trim()}`;
      if (seen.has(key)) {
        toDelete.push(prod.id);
      } else {
        seen.add(key);
      }
    }

    if (toDelete.length === 0) {
      Swal.fire('Sin duplicados', 'No se encontraron platos duplicados.', 'info');
      return;
    }

    try {
      for (const id of toDelete) {
        await deleteDoc(doc(db, 'products', id));
      }
      Swal.fire('Limpieza completada', `Se eliminaron ${toDelete.length} platos duplicados.`, 'success');
    } catch (error) {
      console.error("Error cleaning duplicates:", error);
      Swal.fire('Error', 'Hubo un problema al eliminar los duplicados.', 'error');
    }
  };

  const handleSaveIngredient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      stock: Number(formData.get('stock')),
      unit: formData.get('unit') as string,
      minStock: Number(formData.get('minStock')) || 0,
      price: Number(formData.get('price')) || 0
    };

    if (editingItem) {
      try {
        await updateDoc(doc(db, 'ingredients', editingItem.id), data);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `ingredients/${editingItem.id}`);
      }
    } else {
      try {
        await addDoc(collection(db, 'ingredients'), data);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'ingredients');
      }
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleDeleteIngredient = async (id: string) => {
    const confirm = await Swal.fire({
      title: '¿Eliminar insumo?',
      text: "Esta acción no se puede deshacer y podría afectar a las recetas que usan este insumo.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'ingredients', id));
        Swal.fire('Eliminado', 'El insumo ha sido eliminado.', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `ingredients/${id}`);
      }
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const confirm = await Swal.fire({
      title: '¿Eliminar plato?',
      text: "Esta acción no se puede deshacer y el plato desaparecerá del catálogo y TPV.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'products', id));
        Swal.fire('Eliminado', 'El plato ha sido eliminado.', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      }
    }
  };

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      price: Number(formData.get('price')),
      category: formData.get('category') as string,
      description: formData.get('description') as string,
      imageId: formData.get('imageId') as string,
      active: formData.get('active') === 'on',
      packagingPrice: Number(formData.get('packagingPrice')) || 0,
      recipe: editingItem?.recipe || []
    };

    if (editingItem) {
      try {
        await updateDoc(doc(db, 'products', editingItem.id), data);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `products/${editingItem.id}`);
      }
    } else {
      try {
        await addDoc(collection(db, 'products'), data);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'products');
      }
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const addRecipeItem = (ingredientId: string) => {
    if (!editingItem) return;
    const newRecipe = [...(editingItem.recipe || []), { ingredientId, quantity: 1 }];
    setEditingItem({ ...editingItem, recipe: newRecipe });
    setShowIngredientList(false);
  };

  const updateRecipeQty = (index: number, qty: number) => {
    const newRecipe = [...(editingItem.recipe || [])];
    if (newRecipe[index]) {
      newRecipe[index].quantity = qty;
      setEditingItem({ ...editingItem, recipe: newRecipe });
    }
  };

  const removeRecipeItem = (index: number) => {
    const newRecipe = (editingItem.recipe || []).filter((_: any, i: number) => i !== index);
    setEditingItem({ ...editingItem, recipe: newRecipe });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="flex bg-white rounded-xl p-1 shadow-sm border">
          <button 
            onClick={() => setActiveTab('ingredients')}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition ${activeTab === 'ingredients' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <Package className="w-4 h-4" /> Insumos
          </button>
          <button 
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition ${activeTab === 'products' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <UtensilsCrossed className="w-4 h-4" /> Platos (Recetas)
          </button>
        </div>

        <div className="flex flex-1 w-full max-w-2xl gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder={activeTab === 'ingredients' ? "Buscar insumos..." : "Buscar platos o categorías..."}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-medium shadow-sm transition-all"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
            />
          </div>
          {activeTab === 'products' && (
            <div className="md:hidden">
              <div className="relative group">
                <button className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition shadow-sm">
                  <MoreVertical className="w-5 h-5 text-gray-600" />
                </button>
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 py-2">
                  <button 
                    onClick={handleCleanDuplicates}
                    className="w-full px-4 py-3 text-left hover:bg-orange-50 text-orange-600 font-bold flex items-center gap-3 transition"
                  >
                    <Sparkles className="w-4 h-4" /> Limpiar Duplicados
                  </button>
                  <button 
                    onClick={handleImportFromSheets}
                    disabled={isImporting}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 text-blue-600 font-bold flex items-center gap-3 transition disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> {isImporting ? 'Importando...' : 'Importar desde Sheets'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="hidden md:flex gap-2">
          {activeTab === 'products' && (
            <div className="relative group">
              <button className="p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition shadow-sm">
                <MoreVertical className="w-6 h-6 text-gray-600" />
              </button>
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 py-2">
                <button 
                  onClick={handleCleanDuplicates}
                  className="w-full px-4 py-3 text-left hover:bg-orange-50 text-orange-600 font-bold flex items-center gap-3 transition"
                >
                  <Sparkles className="w-4 h-4" /> Limpiar Duplicados
                </button>
                <button 
                  onClick={handleImportFromSheets}
                  disabled={isImporting}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 text-blue-600 font-bold flex items-center gap-3 transition disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" /> {isImporting ? 'Importando...' : 'Importar desde Sheets'}
                </button>
              </div>
            </div>
          )}
          <button 
            onClick={() => { 
              setEditingItem(null); 
              setIsProductActive(true);
              setIsModalOpen(true); 
            }}
            className={cn(
              "px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-md text-white",
              activeTab === 'ingredients' ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            )}
          >
            <Plus className="w-5 h-5" /> Nuevo {activeTab === 'ingredients' ? 'Insumo' : 'Plato'}
          </button>
        </div>
      </div>

      {activeTab === 'ingredients' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIngredients.map(ing => (
            <div key={ing.id} className="bg-white p-5 rounded-2xl shadow-sm border hover:shadow-md transition flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-black text-gray-800 text-lg">{ing.name}</h3>
                  <div className="mt-1">
                    {ing.stock <= ing.minStock ? (
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">Stock Bajo</span>
                    ) : (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">Stock OK</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingItem(ing); setIsModalOpen(true); }} className="text-blue-600 p-2 hover:bg-blue-50 rounded-xl transition"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDeleteIngredient(ing.id)} className="text-red-600 p-2 hover:bg-red-50 rounded-xl transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Disponible</span>
                  <span className="text-2xl font-black text-gray-900">{ing.stock} <span className="text-sm text-gray-400 font-bold">{ing.unit}</span></span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Precio/Costo</span>
                  <span className="text-sm font-bold text-green-600">${(ing.price || 0).toLocaleString()}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Mínimo</span>
                  <span className="text-sm font-bold text-gray-600">{ing.minStock} {ing.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map(prod => (
            <div key={prod.id} className="bg-white p-4 rounded-2xl shadow-sm border hover:shadow-md transition flex gap-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 border">
                <img 
                  src={getDriveImageUrl(prod.imageId)} 
                  alt={prod.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-gray-800">{prod.name}</h3>
                    <p className="text-xs text-gray-500 uppercase font-bold">{prod.category}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { 
                      setEditingItem(prod); 
                      setIsProductActive(prod.active ?? true);
                      setIsModalOpen(true); 
                    }} className="text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteProduct(prod.id)} className="text-red-600 p-2 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase">Receta:</p>
                  {prod.recipe?.length > 0 ? (
                    <div className="space-y-1">
                      {prod.recipe.map((item, idx) => {
                        const ing = ingredients.find(i => i.id === item.ingredientId);
                        return (
                          <div key={idx} className="flex justify-between text-xs text-gray-600 bg-gray-50 p-1.5 rounded">
                            <span>{ing?.name || 'Insumo eliminado'}</span>
                            <span className="font-bold">{item.quantity} {ing?.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-orange-500 italic">Sin receta configurada</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Action Button for New Item */}
      <button
        onClick={() => {
          setEditingItem(null);
          setIsProductActive(true);
          setIsModalOpen(true);
        }}
        className={cn(
          "fixed bottom-8 right-8 w-16 h-16 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40 group",
          activeTab === 'ingredients' ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
        )}
        title={activeTab === 'ingredients' ? "Nuevo Insumo" : "Nuevo Plato"}
      >
        <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-gray-800">
                {editingItem ? 'Editar' : 'Nuevo'} {activeTab === 'ingredients' ? 'Insumo' : 'Plato'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>

            <form onSubmit={activeTab === 'ingredients' ? handleSaveIngredient : handleSaveProduct} className="p-6 space-y-6">
              {activeTab === 'ingredients' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre</label>
                    <input name="name" defaultValue={editingItem?.name} required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Stock Inicial</label>
                    <input name="stock" type="number" step="any" defaultValue={editingItem?.stock} required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Unidad</label>
                    <input name="unit" defaultValue={editingItem?.unit} placeholder="kg, gr, und..." required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Stock Mínimo</label>
                    <input name="minStock" type="number" step="any" defaultValue={editingItem?.minStock} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Precio/Costo</label>
                    <input name="price" type="number" step="any" defaultValue={editingItem?.price || 0} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del Plato</label>
                      <input name="name" defaultValue={editingItem?.name} required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Precio</label>
                      <input name="price" type="number" defaultValue={editingItem?.price} required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Categoría</label>
                      <input name="category" defaultValue={editingItem?.category} required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-bold text-gray-700 mb-1">ID Imagen (Google Drive)</label>
                      <input name="imageId" defaultValue={editingItem?.imageId} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                      <textarea name="description" defaultValue={editingItem?.description} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none h-20" />
                    </div>
                    <div className="flex flex-col gap-4 col-span-2">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          name="active" 
                          checked={isProductActive} 
                          onChange={(e) => setIsProductActive(e.target.checked)}
                          id="active" 
                          className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500" 
                        />
                        <label htmlFor="active" className="text-sm font-bold text-gray-700">Activo en catálogo web</label>
                      </div>
                      
                      <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 animate-in fade-in slide-in-from-top-2">
                        <label className="block text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2">Recargo Domicilio / Web (Empaque)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-bold">$</span>
                          <input 
                            name="packagingPrice" 
                            type="number" 
                            defaultValue={editingItem?.packagingPrice || 0} 
                            className="w-full pl-8 pr-4 py-2 bg-white border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-bold text-orange-900" 
                            placeholder="0"
                          />
                        </div>
                        <p className="text-[10px] text-orange-400 mt-2 font-medium italic">* Este valor se sumará al precio base en domicilios (TPV y Web).</p>
                      </div>
                    </div>
                  </div>

                  {/* Recipe Management */}
                  <div className="border-t pt-6">
                    <h3 className="font-black text-gray-800 mb-4 flex items-center justify-between uppercase tracking-widest text-xs">
                      Receta (Insumos)
                      <button 
                        type="button" 
                        onClick={() => {
                          setShowIngredientList(true);
                          setRecipeSearch('');
                        }}
                        className="text-xs bg-red-50 text-red-600 px-4 py-1.5 rounded-full hover:bg-red-100 transition font-black uppercase tracking-widest"
                      >
                        + Añadir Insumo
                      </button>
                    </h3>

                    {/* Enhanced Ingredient Selection Modal */}
                    {showIngredientList && (
                      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                          <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                            <div className="flex items-center gap-2">
                              {isQuickCreatingIngredient && (
                                <button 
                                  type="button" 
                                  onClick={() => setIsQuickCreatingIngredient(false)}
                                  className="p-2 hover:bg-gray-200 rounded-full transition"
                                >
                                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                                </button>
                              )}
                              <h3 className="font-black text-gray-800 uppercase tracking-widest text-sm">
                                {isQuickCreatingIngredient ? 'Nuevo Insumo' : 'Seleccionar Insumo'}
                              </h3>
                            </div>
                            <button type="button" onClick={() => { setShowIngredientList(false); setIsQuickCreatingIngredient(false); }} className="p-2 hover:bg-gray-200 rounded-full transition"><X className="w-5 h-5 text-gray-400" /></button>
                          </div>
                          
                          {isQuickCreatingIngredient ? (
                            <form 
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                const data = {
                                  name: formData.get('name') as string,
                                  stock: Number(formData.get('stock')),
                                  unit: formData.get('unit') as string,
                                  minStock: Number(formData.get('minStock')) || 0
                                };
                                try {
                                  const docRef = await addDoc(collection(db, 'ingredients'), data);
                                  addRecipeItem(docRef.id);
                                  setIsQuickCreatingIngredient(false);
                                  setShowIngredientList(false);
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.CREATE, 'ingredients');
                                }
                              }}
                              className="p-6 space-y-4 overflow-y-auto"
                            >
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nombre</label>
                                <input name="name" required className="w-full bg-gray-100 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Stock Inicial</label>
                                  <input name="stock" type="number" step="any" required className="w-full bg-gray-100 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Unidad</label>
                                  <input name="unit" required placeholder="kg, gr, und..." className="w-full bg-gray-100 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Stock Mínimo</label>
                                <input name="minStock" type="number" step="any" className="w-full bg-gray-100 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Precio/Costo</label>
                                <input name="price" type="number" step="any" className="w-full bg-gray-100 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none" />
                              </div>
                              <button type="submit" className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg hover:bg-red-700 transition flex items-center justify-center gap-2">
                                <Plus className="w-5 h-5" /> Crear y Añadir
                              </button>
                            </form>
                          ) : (
                            <>
                              <div className="p-4 border-b">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                  <input 
                                    type="text"
                                    placeholder="Buscar insumo..."
                                    className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                                    value={recipeSearch}
                                    onChange={(e) => setRecipeSearch(e.target.value)}
                                    autoFocus
                                  />
                                </div>
                              </div>

                              <div className="flex-1 overflow-y-auto p-2 divide-y">
                                {ingredients
                                  .filter(ing => ing.name.toLowerCase().includes(recipeSearch.toLowerCase()))
                                  .map(ing => (
                                    <button 
                                      key={ing.id} 
                                      type="button"
                                      onClick={() => addRecipeItem(ing.id)}
                                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex justify-between items-center group"
                                    >
                                      <div>
                                        <p className="font-bold text-gray-800 group-hover:text-red-600 transition">{ing.name}</p>
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Unidad: {ing.unit}</p>
                                      </div>
                                      <Plus className="w-4 h-4 text-gray-300 group-hover:text-red-600" />
                                    </button>
                                  ))}
                                {ingredients.filter(ing => ing.name.toLowerCase().includes(recipeSearch.toLowerCase())).length === 0 && (
                                  <div className="p-8 text-center">
                                    <p className="text-gray-400 text-sm font-bold italic">No se encontraron insumos</p>
                                  </div>
                                )}
                              </div>

                              <div className="p-4 bg-gray-50 border-t">
                                <button 
                                  type="button"
                                  onClick={() => setIsQuickCreatingIngredient(true)}
                                  className="w-full py-3 bg-white border-2 border-dashed border-gray-300 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:border-red-500 hover:text-red-600 transition flex items-center justify-center gap-2"
                                >
                                  <Plus className="w-4 h-4" /> Crear Nuevo Insumo
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      {editingItem?.recipe?.map((item: any, idx: number) => {
                        const ing = ingredients.find(i => i.id === item.ingredientId);
                        return (
                          <div key={idx} className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg">
                            <span className="flex-1 text-sm font-medium">{ing?.name}</span>
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                step="any"
                                value={item.quantity} 
                                onChange={(e) => updateRecipeQty(idx, Number(e.target.value))}
                                className="w-20 border rounded p-1 text-sm text-center"
                              />
                              <span className="text-xs text-gray-500 w-8">{ing?.unit}</span>
                              <button type="button" onClick={() => removeRecipeItem(idx)} className="text-red-500 hover:bg-red-100 p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                      {(!editingItem?.recipe || editingItem.recipe.length === 0) && (
                        <p className="text-center py-4 text-gray-400 text-sm italic">No has añadido insumos a esta receta</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-6 border-t sticky bottom-0 bg-white">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition shadow-lg flex items-center justify-center gap-2">
                  <Save className="w-5 h-5" /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
