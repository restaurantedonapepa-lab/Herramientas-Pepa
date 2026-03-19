import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';

export const CheckoutModal: React.FC = () => {
  const { showCheckoutForm, setShowCheckoutForm, handleCheckout } = useCart();
  const [clientInfo, setClientInfo] = useState({ name: '', phone: '', address: '', notes: '' });

  if (!showCheckoutForm) return null;

  const onSubmit = async () => {
    await handleCheckout(clientInfo);
    setClientInfo({ name: '', phone: '', address: '', notes: '' });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 flex items-center justify-center z-[200] p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowCheckoutForm(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden"
        >
          <div className="p-8 border-b flex items-center justify-between bg-gray-50">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Datos de Envío</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Completa tu información</p>
            </div>
            <button onClick={() => setShowCheckoutForm(false)} className="p-3 hover:bg-white rounded-full transition shadow-sm">
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nombre Completo</label>
              <input 
                type="text" 
                value={clientInfo.name}
                onChange={(e) => setClientInfo({ ...clientInfo, name: e.target.value })}
                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                placeholder="Ej: Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Teléfono / WhatsApp</label>
              <input 
                type="tel" 
                value={clientInfo.phone}
                onChange={(e) => setClientInfo({ ...clientInfo, phone: e.target.value })}
                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                placeholder="Ej: 310 123 4567"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Dirección de Entrega</label>
              <input 
                type="text" 
                value={clientInfo.address}
                onChange={(e) => setClientInfo({ ...clientInfo, address: e.target.value })}
                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                placeholder="Barrio, Calle, Número..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Notas Adicionales</label>
              <textarea 
                value={clientInfo.notes}
                onChange={(e) => setClientInfo({ ...clientInfo, notes: e.target.value })}
                className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold resize-none h-24"
                placeholder="Ej: Tocar el timbre, sin cebolla..."
              />
            </div>

            <button 
              onClick={onSubmit}
              className="w-full bg-green-600 text-white py-5 rounded-[24px] font-black text-lg shadow-xl shadow-green-200 hover:bg-green-700 transition-all flex items-center justify-center gap-3 mt-4"
            >
              ENVIAR POR WHATSAPP <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
