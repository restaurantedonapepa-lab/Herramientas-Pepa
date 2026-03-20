import React, { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, ImageIcon, AlertCircle, Edit3, Check } from 'lucide-react';
import { getDriveImageUrl } from '../firebase';

interface ImageUploadProps {
  onUploadSuccess: (fileId: string) => void;
  defaultValue?: string;
  productName?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onUploadSuccess, defaultValue, productName }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(getDriveImageUrl(defaultValue));
  const [manualId, setManualId] = useState(defaultValue || '');
  const [showManual, setShowManual] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxa_Z0q9imww8owIfO1xhLLeF2ECzljrIqFSJv2zVr9h93VSDyLxjoR4kaANg9KTDPb0w/exec';

  useEffect(() => {
    setManualId(defaultValue || '');
    setPreview(getDriveImageUrl(defaultValue));
  }, [defaultValue]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor selecciona una imagen válida.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen es demasiado grande (máximo 5MB).');
      return;
    }

    setUploading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        
        // Enviamos el formato exacto que procesa tu script
        const payload = {
          action: 'UPLOAD_ONLY',
          productName: productName || 'Sin Nombre',
          files: [{
            base64: base64,
            type: file.type,
            name: file.name
          }]
        };

        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        
        if (result.status === 'success' && result.id) {
          onUploadSuccess(result.id);
          setManualId(result.id);
          setPreview(getDriveImageUrl(result.id));
          setUploading(false);
          setError(null);
        } else {
          throw new Error(result.message || 'Error al obtener el ID de Drive');
        }
      } catch (err: any) {
        console.error('Upload error:', err);
        setError('Error al subir. Asegúrate de haber actualizado el código GS con la función UPLOAD_ONLY.');
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden relative group">
          {preview ? (
            <img src={preview} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-300" />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>
        
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Subiendo...' : 'Subir a Drive'}
            </button>
            <button
              type="button"
              onClick={() => setShowManual(!showManual)}
              className={`p-2 rounded-xl transition ${showManual ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              title="Ingresar ID manualmente"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            Se guardará en tu Google Drive
          </p>
        </div>
      </div>

      {(showManual || manualId) && (
        <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase flex justify-between">
            <span>ID de Imagen (Drive)</span>
            {manualId && <span className="text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Vinculado</span>}
          </label>
          <input
            type="text"
            value={manualId}
            onChange={(e) => {
              const val = e.target.value;
              setManualId(val);
              onUploadSuccess(val);
              setPreview(getDriveImageUrl(val));
            }}
            placeholder="Pega el ID aquí..."
            className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none font-mono"
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
};
