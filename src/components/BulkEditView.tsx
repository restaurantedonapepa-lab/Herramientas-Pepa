import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product } from '../types';
import { Save, ArrowLeft, Loader2, Check, AlertCircle, Search, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const BulkEditView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [editedProducts, setEditedProducts] = useState<{ [id: string]: Partial<Product> }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleFieldChange = (id: string, field: keyof Product, value: any) => {
    setEditedProducts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const generateAIDescription = async (product: Product) => {
    const currentData = { ...product, ...editedProducts[product.id] };
    
    if (!currentData.name) {
      Swal.fire('Atención', 'El plato debe tener un nombre.', 'warning');
      return;
    }

    setGeneratingId(product.id);
    try {
      const ai = getAiClient();
      if (!ai) {
        Swal.fire('Configuración Requerida', 'La API Key de Gemini no está configurada.', 'info');
        return;
      }
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Eres un experto redactor gastronómico para el restaurante 'Doña Pepa'. Crea una descripción corta (máximo 150 caracteres), provocativa y deliciosa para un plato llamado '${currentData.name}' de la categoría '${currentData.category || 'General'}'. Resalta el sabor tradicional y casero. No uses comillas.`,
      });

      const text = response.text;
      if (text) {
        handleFieldChange(product.id, 'description', text.trim());
      }
    } catch (error) {
      console.error("Error generating description:", error);
      Swal.fire('Error', 'No se pudo generar la descripción con IA.', 'error');
    } finally {
      setGeneratingId(null);
    }
  };

  const handleSaveAll = async () => {
    const editCount = Object.keys(editedProducts).length;
    if (editCount === 0) return;

    setSaving(true);
    const batch = writeBatch(db);

    try {
      Object.entries(editedProducts).forEach(([id, changes]) => {
        const productRef = doc(db, 'products', id);
        batch.update(productRef, changes);
      });

      await batch.commit();
      setEditedProducts({});
      Swal.fire({
        title: '¡Guardado!',
        text: `Se han actualizado ${editCount} platos correctamente.`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error("Error saving bulk edits:", error);
      Swal.fire('Error', 'No se pudieron guardar los cambios.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/inventory')}
            className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">Edición Masiva de Platos</h1>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Editor tipo hoja de cálculo</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Filtrar platos..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={handleSaveAll}
            disabled={saving || Object.keys(editedProducts).length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white font-black rounded-xl hover:bg-green-700 transition shadow-lg disabled:opacity-50 disabled:grayscale"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'GUARDANDO...' : 'GUARDAR TODO'}
          </button>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden min-w-[1000px]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-16">Estado</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nombre del Plato</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-40">Categoría</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-32">Precio ($)</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-40">Recargo Empaque</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Descripción</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-24 text-center">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProducts.map(product => {
                const isEdited = !!editedProducts[product.id];
                const currentData = { ...product, ...editedProducts[product.id] };

                return (
                  <tr key={product.id} className={`hover:bg-gray-50 transition ${isEdited ? 'bg-blue-50/30' : ''}`}>
                    <td className="p-4 text-center">
                      {isEdited ? (
                        <div className="flex items-center justify-center" title="Cambios pendientes">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center text-green-500">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <input 
                        type="text"
                        value={currentData.name}
                        onChange={(e) => handleFieldChange(product.id, 'name', e.target.value)}
                        className="w-full bg-transparent border-none focus:bg-white focus:ring-2 focus:ring-red-500 rounded p-2 text-sm font-bold outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="text"
                        value={currentData.category}
                        onChange={(e) => handleFieldChange(product.id, 'category', e.target.value)}
                        className="w-full bg-transparent border-none focus:bg-white focus:ring-2 focus:ring-red-500 rounded p-2 text-sm font-medium outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="number"
                        value={currentData.price}
                        onChange={(e) => handleFieldChange(product.id, 'price', Number(e.target.value))}
                        className="w-full bg-transparent border-none focus:bg-white focus:ring-2 focus:ring-red-500 rounded p-2 text-sm font-black text-red-600 outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="number"
                        value={currentData.packagingPrice || 0}
                        onChange={(e) => handleFieldChange(product.id, 'packagingPrice', Number(e.target.value))}
                        className="w-full bg-transparent border-none focus:bg-white focus:ring-2 focus:ring-red-500 rounded p-2 text-sm font-bold text-orange-600 outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <div className="relative group/desc">
                        <textarea 
                          value={currentData.description}
                          onChange={(e) => handleFieldChange(product.id, 'description', e.target.value)}
                          rows={1}
                          className="w-full bg-transparent border-none focus:bg-white focus:ring-2 focus:ring-red-500 rounded p-2 pr-8 text-xs font-medium outline-none resize-none overflow-hidden"
                        />
                        <button
                          onClick={() => generateAIDescription(product)}
                          disabled={generatingId === product.id}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-red-600 transition-all opacity-0 group-hover/desc:opacity-100 disabled:opacity-50"
                          title="Generar con IA"
                        >
                          {generatingId === product.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <input 
                        type="checkbox"
                        checked={currentData.active}
                        onChange={(e) => handleFieldChange(product.id, 'active', e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {filteredProducts.length === 0 && (
            <div className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 font-bold italic">No se encontraron platos para editar</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-white border-t px-6 py-3 flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
        <div className="flex gap-4">
          <span>Total: {products.length} platos</span>
          {Object.keys(editedProducts).length > 0 && (
            <span className="text-blue-600 animate-pulse">
              {Object.keys(editedProducts).length} cambios pendientes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span>Sincronizado con Firebase</span>
        </div>
      </div>
    </div>
  );
};
