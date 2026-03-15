import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Ingredient, RecipeItem } from '../types';
import { Plus, Edit2, Trash2, Package, UtensilsCrossed, Save, X } from 'lucide-react';

export const InventoryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'products'>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showIngredientList, setShowIngredientList] = useState(false);

  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT_KUYEvt5fxkTpwMd38bu7VjuNrjlSwIYQ753QFWLRS93gTlTUuiDvBwJaYSsc8NOn01_yvSGJpkDG/pub?gid=0&single=true&output=csv';

  useEffect(() => {
    const unsubIngredients = onSnapshot(collection(db, 'ingredients'), (snapshot) => {
      setIngredients(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'ingredients');
    });
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });
    return () => { unsubIngredients(); unsubProducts(); };
  }, []);

  const handleImportFromSheets = async () => {
    setIsImporting(true);
    try {
      const response = await fetch(CSV_URL);
      if (!response.ok) throw new Error('No se pudo descargar la hoja de cálculo. Verifica que esté publicada como CSV.');
      
      const text = await response.text();
      
      // Función simple para parsear CSV respetando comillas
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
      
      // Saltar cabecera (i=1)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2 || !row[1]) continue;

        const name = row[1].trim();
        const price = parseFloat(row[2].replace(/[^0-9.]/g, '')) || 0;
        const category = row[3]?.trim() || 'General';
        const description = row[4]?.trim() || '';
        
        // Extraer ID de imagen de Drive
        let imageId = '';
        const driveLink = row[5] || '';
        const idMatch = driveLink.match(/id=([a-zA-Z0-9_-]+)/) || driveLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (idMatch) imageId = idMatch[1];

        try {
          await addDoc(collection(db, 'products'), {
            name,
            price: price, // Quitamos el +1000 para ser fieles a la hoja
            category,
            description,
            imageId,
            active: true,
            recipe: []
          });
          importedCount++;
        } catch (err) {
          console.error(`Error importando fila ${i}:`, err);
          // Si es error de permisos, lanzamos para que lo vea el ErrorBoundary o el catch general
          if (err instanceof Error && err.message.includes('permission')) {
            handleFirestoreError(err, OperationType.CREATE, 'products');
          }
        }
      }
      console.log(`Importación completada: ${importedCount} platos añadidos.`);
    } catch (error) {
      console.error('Error importing:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveIngredient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      stock: Number(formData.get('stock')),
      unit: formData.get('unit') as string,
      minStock: Number(formData.get('minStock')) || 0
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
    const newRecipe = [...editingItem.recipe];
    newRecipe[index].quantity = qty;
    setEditingItem({ ...editingItem, recipe: newRecipe });
  };

  const removeRecipeItem = (index: number) => {
    const newRecipe = editingItem.recipe.filter((_: any, i: number) => i !== index);
    setEditingItem({ ...editingItem, recipe: newRecipe });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
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

        <div className="flex gap-2">
          <button 
            onClick={handleImportFromSheets}
            disabled={isImporting}
            className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-50 transition shadow-sm disabled:opacity-50"
          >
            {isImporting ? 'Importando...' : 'Importar desde Sheets'}
          </button>
          <button 
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="bg-green-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-green-700 transition shadow-md"
          >
            <Plus className="w-5 h-5" /> Nuevo {activeTab === 'ingredients' ? 'Insumo' : 'Plato'}
          </button>
        </div>
      </div>

      {activeTab === 'ingredients' ? (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 font-bold text-gray-700">Nombre</th>
                <th className="px-6 py-4 font-bold text-gray-700">Stock</th>
                <th className="px-6 py-4 font-bold text-gray-700">Unidad</th>
                <th className="px-6 py-4 font-bold text-gray-700">Estado</th>
                <th className="px-6 py-4 font-bold text-gray-700 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ingredients.map(ing => (
                <tr key={ing.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-medium text-gray-800">{ing.name}</td>
                  <td className="px-6 py-4 font-bold">{ing.stock}</td>
                  <td className="px-6 py-4 text-gray-500">{ing.unit}</td>
                  <td className="px-6 py-4">
                    {ing.stock <= ing.minStock ? (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">STOCK BAJO</span>
                    ) : (
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">OK</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => { setEditingItem(ing); setIsModalOpen(true); }} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteDoc(doc(db, 'ingredients', ing.id))} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(prod => (
            <div key={prod.id} className="bg-white p-4 rounded-2xl shadow-sm border hover:shadow-md transition">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-gray-800">{prod.name}</h3>
                  <p className="text-xs text-gray-500 uppercase font-bold">{prod.category}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingItem(prod); setIsModalOpen(true); }} className="text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => deleteDoc(doc(db, 'products', prod.id))} className="text-red-600 p-2 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
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
          ))}
        </div>
      )}

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
                    <div className="flex items-center gap-2">
                      <input type="checkbox" name="active" defaultChecked={editingItem?.active ?? true} id="active" />
                      <label htmlFor="active" className="text-sm font-bold text-gray-700">Activo en catálogo</label>
                    </div>
                  </div>

                  {/* Recipe Management */}
                  <div className="border-t pt-6">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center justify-between">
                      Receta (Insumos)
                      <div className="relative">
                        <button 
                          type="button" 
                          onClick={() => setShowIngredientList(!showIngredientList)}
                          className="text-xs bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200 transition"
                        >
                          + Añadir Insumo
                        </button>
                        {showIngredientList && (
                          <div className="absolute right-0 mt-2 w-64 bg-white border rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto py-1">
                            {ingredients.length > 0 ? (
                              ingredients.map(ing => (
                                <button 
                                  key={ing.id} 
                                  type="button"
                                  onClick={() => addRecipeItem(ing.id)}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition border-b last:border-0"
                                >
                                  {ing.name} ({ing.unit})
                                </button>
                              ))
                            ) : (
                              <p className="px-4 py-2 text-xs text-gray-400 italic">No hay insumos registrados</p>
                            )}
                          </div>
                        )}
                      </div>
                    </h3>
                    
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
