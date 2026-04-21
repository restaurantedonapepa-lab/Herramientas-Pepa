import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Code, 
  Palette, 
  Search as SeoIcon, 
  Terminal,
  RefreshCcw,
  Maximize2,
  Minimize2,
  Trash2,
  Layout
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { useCart } from '../context/CartContext';
import { db, auth } from '../firebase';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }
  return new GoogleGenAI({ apiKey });
};

interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
  timestamp: number;
}

export const AdminAgentView: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { userProfile } = useCart();

  // Agent context state
  const [projectStats, setProjectStats] = useState<any>(null);

  useEffect(() => {
    // Collect some baseline project data for the agent's context
    const fetchContext = async () => {
      try {
        const productsSnap = await getDocs(query(collection(db, 'products'), limit(5)));
        const salesSnap = await getDocs(query(collection(db, 'sales'), limit(5)));
        const settingsSnap = await getDocs(collection(db, 'settings'));
        
        setProjectStats({
          productsCount: productsSnap.size,
          lastSales: salesSnap.docs.map(d => d.data()),
          businessSettings: settingsSnap.docs.find(d => d.id === 'business')?.data()
        });
      } catch (err) {
        console.error("Context fetch error:", err);
      }
    };
    fetchContext();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      parts: [{ text: input }],
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: m.parts
      }));

      const systemInstruction = `Eres "Pepa Intelligence", el agente experto definitivo del proyecto Restaurante Doña Pepa.
      
      ESTADO DEL PROYECTO:
      - Tecnología: React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, Firebase (Auth & Firestore).
      - Módulos Activos: POS (Ventas), Inventario, Gestión de Usuarios, Catálogo Digital, Detalle de Productos.
      - Diseño: Brutalista Moderno / High Performance.
      - Branding: Doña Pepa - Sabor Tradicional desde 1957. Cúcuta, Colombia.
      
      TUS CAPACIDADES:
      1. PROGRAMACIÓN: Eres un experto en TypeScript y Firebase. Puedes sugerir refactorizaciones, nuevas features y optimizaciones de consultas.
      2. DISEÑO & BRANDING: Eres un Lead Creative Director. Sugieres paletas de colores, mejoras en la UI/UX y estrategias de marca.
      3. SEO & DIGITAL: Analizas cómo mejorar el posicionamiento del menú digital.
      4. DATA ANALYST: Puedes interpretar datos de ventas y tendencias (basado en el contexto proporcionado).
      
      CONTEXTO DINÁMICO: ${JSON.stringify(projectStats)}
      
      REGLAS DE RESPUESTA:
      - Sé profesional, directo y audaz.
      - Si sugieres código, utiliza bloques de Markdown con el lenguaje especificado (ej. \`\`\`tsx).
      - Siempre ten en cuenta que el usuario es el Administrador Principal del restaurante.
      - Idioma: Español.`;

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...history, { role: 'user', parts: [{ text: input }] }],
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      const aiMessage: Message = {
        role: 'model',
        parts: [{ text: response.text || "No pude generar una respuesta." }],
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error: any) {
      console.error("AI Error:", error);
      let errorMessage = "⚠️ Error al conectar con el cerebro de IA. Por favor, verifica tu conexión.";
      
      if (error.message === 'MISSING_API_KEY') {
        errorMessage = "⚠️ Falta la API Key de Gemini. Por favor, configúrala en el menú de Ajustes (Secretos).";
      }

      setMessages(prev => [...prev, {
        role: 'model',
        parts: [{ text: errorMessage }],
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (userProfile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-gray-50">
        <Bot className="w-20 h-20 text-gray-200 mb-6" />
        <h2 className="text-2xl font-black text-gray-900 uppercase">Acceso Restringido</h2>
        <p className="text-gray-500 mt-2">Solo el Agente Principal tiene acceso a la Inteligencia de Proyecto.</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col bg-white overflow-hidden transition-all duration-500",
      isFullscreen ? "fixed inset-0 z-[100]" : "h-full"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-200">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-black text-gray-900 flex items-center gap-2 leading-none uppercase tracking-tight">
              Pepa Intelligence <Sparkles className="w-3 h-3 text-red-600" />
            </h2>
            <span className="text-[10px] font-bold text-green-500 uppercase flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Conectado al Proyecto
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={clearChat}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
            title="Limpiar Conversación"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Context Insights */}
        <div className="hidden lg:flex w-64 border-r bg-gray-50/50 flex-col p-4 gap-6 overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Layout className="w-3 h-3" /> Especialidades
            </h3>
            <div className="space-y-2">
              {[
                { icon: Code, label: 'Arquitectura Soft', color: 'text-blue-600' },
                { icon: Palette, label: 'Design System', color: 'text-pink-600' },
                { icon: SeoIcon, label: 'Performance SEO', color: 'text-orange-600' },
                { icon: Terminal, label: 'Firebase Cloud', color: 'text-amber-600' },
              ].map(spec => (
                <div key={spec.label} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100 shadow-sm text-xs font-bold text-gray-700">
                  <spec.icon className={cn("w-3 h-3", spec.color)} />
                  {spec.label}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <RefreshCcw className="w-3 h-3" /> Estado Contextual
            </h3>
            <div className="p-3 bg-white border border-gray-100 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-gray-400 font-bold">PRODUCTOS</span>
                <span className="text-gray-900 font-black">{projectStats?.productsCount || 0}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-gray-400 font-bold">VENTAS</span>
                <span className="text-gray-900 font-black">{projectStats?.lastSales?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col bg-white">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth bg-gray-50/20"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
                <div className="w-20 h-20 bg-red-100/50 rounded-full flex items-center justify-center mb-6">
                  <Bot className="w-10 h-10 text-red-600" />
                </div>
                <h3 className="text-xl font-black text-gray-900 uppercase">Hola, Administrador</h3>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                  Soy tu Agente Experto. Puedo ayudarte a rediseñar la interfaz, optimizar tus bases de datos o crear estrategias de marketing digital. ¿En qué trabajamos hoy?
                </p>
                <div className="grid grid-cols-1 gap-2 mt-8 w-full">
                  {[
                    "¿Cómo puedo mejorar el SEO del menú?",
                    "Sugiere una paleta de colores moderna",
                    "Analiza el rendimiento de mis ventas",
                    "Añade un módulo de suscripción IA"
                  ].map(prompt => (
                    <button 
                      key={prompt}
                      onClick={() => setInput(prompt)}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:border-red-600 hover:text-red-600 transition-all text-left"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, idx) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={idx}
                className={cn(
                  "flex gap-3 max-w-[85%]",
                  message.role === 'user' ? "ml-auto flex-row-reverse" : ""
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                  message.role === 'user' ? "bg-gray-900" : "bg-red-600"
                )}>
                  {message.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={cn(
                  "p-4 rounded-2xl text-sm shadow-sm",
                  message.role === 'user' 
                    ? "bg-gray-900 text-white rounded-tr-none" 
                    : "bg-white border border-gray-100 text-gray-800 rounded-tl-none"
                )}>
                  <div className="prose prose-sm prose-slate max-w-none prose-headings:font-black prose-headings:text-gray-900 prose-strong:text-red-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown>{message.parts[0].text}</ReactMarkdown>
                  </div>
                  <div className={cn(
                    "text-[8px] font-black uppercase tracking-widest mt-2",
                    message.role === 'user' ? "text-gray-500" : "text-gray-400"
                  )}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shadow-lg">
                  <Bot className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div className="p-4 bg-white border border-gray-100 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                  </div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Analizando proyecto...</span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t bg-white">
            <form onSubmit={handleSubmit} className="flex items-center gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-100 focus-within:border-red-600 transition-all">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pregunta algo sobre diseño, código o SEO..."
                className="flex-1 bg-transparent border-none outline-none text-sm font-bold px-3 py-2 text-gray-800 placeholder:text-gray-400"
              />
              <button 
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-3 bg-red-600 text-white rounded-xl shadow-lg hover:bg-red-700 transition disabled:bg-gray-200 disabled:shadow-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <p className="text-[8px] text-center text-gray-400 mt-2 font-bold uppercase tracking-widest">
              Potenciado por Gemini 3 Flash • Pepa Intelligence v1.0
            </p>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .prose pre {
          background: #1a1a1a !important;
          color: #f8f8f2 !important;
          padding: 1rem;
          border-radius: 1rem;
          overflow-x: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          margin: 1rem 0;
        }
        .prose code {
          font-family: 'JetBrains Mono', monospace;
          background: rgba(220, 38, 38, 0.1);
          color: #dc2626;
          font-weight: bold;
        }
      `}} />
    </div>
  );
};
