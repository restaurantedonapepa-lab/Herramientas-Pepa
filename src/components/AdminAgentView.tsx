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
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  X,
  Plus,
  MessageSquare,
  History,
  Layout
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { useCart } from '../context/CartContext';
import { db, auth } from '../firebase';
import { 
  collection, 
  getDocs, 
  query, 
  limit, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  onSnapshot, 
  doc, 
  updateDoc,
  where
} from 'firebase/firestore';
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
  parts: ( { text: string } | { inlineData: { mimeType: string, data: string } } )[];
  timestamp: number;
}

interface SelectedFile {
  name: string;
  data: string; // base64
  type: string;
  preview?: string;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: any;
  createdAt: any;
}

export const AdminAgentView: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { userProfile } = useCart();

  // Agent context state
  const [projectStats, setProjectStats] = useState<any>(null);

  // Fetch chat sessions
  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const sessions = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as ChatSession[];
      setChatSessions(sessions);
    });

    return () => unsubscribe();
  }, []);

  // Fetch messages when activeChatId changes
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'chats', activeChatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => d.data()) as Message[];
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [activeChatId]);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const isImage = file.type.startsWith('image/');
      
      setSelectedFile({
        name: file.name,
        data: base64,
        type: file.type,
        preview: isImage ? event.target?.result as string : undefined
      });
    };

    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsDataURL(file); // Also read as base64 for unified handling
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && !selectedFile) || isLoading || !auth.currentUser) return;

    const userParts: Message['parts'] = [];
    let titleToSet = input.trim() || 'Archivo adjunto';

    if (input.trim()) {
      userParts.push({ text: input });
    }

    if (selectedFile) {
      if (selectedFile.type.startsWith('image/')) {
        userParts.push({
          inlineData: { mimeType: selectedFile.type, data: selectedFile.data }
        });
      } else if (selectedFile.type === 'text/plain') {
        const decodedText = atob(selectedFile.data);
        const lastPart = userParts.find(p => 'text' in p) as { text: string };
        const fileContentStr = `\n\n[CONTENIDO DEL ARCHIVO ${selectedFile.name}]:\n${decodedText}`;
        if (lastPart) lastPart.text += fileContentStr;
        else userParts.push({ text: `Analiza este archivo: ${fileContentStr}` });
      } else {
        userParts.push({
          inlineData: { mimeType: selectedFile.type, data: selectedFile.data }
        });
      }
    }

    const userMessage: Message = {
      role: 'user',
      parts: userParts,
      timestamp: Date.now()
    };

    // 1. Ensure chat session exists
    let currentChatId = activeChatId;
    if (!currentChatId) {
      const chatRef = await addDoc(collection(db, 'chats'), {
        userId: auth.currentUser.uid,
        title: titleToSet.substring(0, 50) + (titleToSet.length > 50 ? '...' : ''),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      currentChatId = chatRef.id;
      setActiveChatId(currentChatId);
    }

    // 2. Save user message to Firestore
    await addDoc(collection(db, 'chats', currentChatId, 'messages'), userMessage);
    await updateDoc(doc(db, 'chats', currentChatId), { updatedAt: serverTimestamp() });

    setInput('');
    setSelectedFile(null);
    setIsLoading(true);

    try {
      // We read the latest messages for history context
      const history = messages.map(m => ({
        role: m.role,
        parts: m.parts.map(p => {
          if ('text' in p) return { text: p.text };
          if ('inlineData' in p) return { inlineData: p.inlineData };
          return p;
        })
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
      5. VISIÓN & DOCUMENTOS: Puedes analizar imágenes (menús, locales, bocetos) y archivos de texto para extraer información o hacer sugerencias.
      
      CONTEXTO DINÁMICO: ${JSON.stringify(projectStats)}
      
      REGLAS DE RESPUESTA:
      - Sé profesional, directo y audaz.
      - Si sugieres código, utiliza bloques de Markdown con el lenguaje especificado (ej. \`\`\`tsx).
      - Siempre ten en cuenta que el usuario es el Administrador Principal del restaurante.
      - Idioma: Español.`;

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...history, { role: 'user', parts: userParts }],
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

      // 3. Save AI response to Firestore
      await addDoc(collection(db, 'chats', currentChatId, 'messages'), aiMessage);
      await updateDoc(doc(db, 'chats', currentChatId), { updatedAt: serverTimestamp() });

    } catch (error: any) {
      console.error("AI Error:", error);
      let errorMessage = "⚠️ Error al conectar con el cerebro de IA. Por favor, verifica tu conexión.";
      
      if (error.message === 'MISSING_API_KEY') {
        errorMessage = "⚠️ Falta la API Key de Gemini. Por favor, configúrala en el menú de Ajustes (Secretos).";
      }

      await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
        role: 'model',
        parts: [{ text: errorMessage }],
        timestamp: Date.now()
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setIsHistoryOpen(false);
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
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button 
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg mr-1 shrink-0"
          >
            <History className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-red-200 shrink-0">
            <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-gray-900 flex items-center gap-1.5 leading-none uppercase tracking-tight text-sm sm:text-base truncate">
              {activeChatId ? (chatSessions.find(c => c.id === activeChatId)?.title || 'Chat Activo') : 'Pepa Intelligence'}
            </h2>
            <span className="text-[9px] sm:text-[10px] font-bold text-green-500 uppercase flex items-center gap-1 mt-1 truncate">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shrink-0" /> Conectado
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={createNewChat}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition"
          >
            <Plus className="w-3 h-3" /> Nuevo Chat
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
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - History & Insights */}
        <AnimatePresence>
          {(isHistoryOpen || !isFullscreen) && (
            <motion.div 
              initial={isFullscreen ? { x: -320 } : false}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              className={cn(
                "w-72 border-r bg-gray-50 flex flex-col overflow-y-auto shrink-0 transition-all",
                isHistoryOpen ? "fixed inset-y-0 left-0 z-50 bg-white" : "hidden lg:flex"
              )}
            >
              <div className="p-4 border-b lg:hidden flex justify-between items-center bg-gray-900 text-white">
                <span className="text-xs font-black uppercase tracking-widest">Historial</span>
                <button onClick={() => setIsHistoryOpen(false)}><X className="w-5 h-5" /></button>
              </div>

              <div className="p-4 space-y-6">
                <button 
                  onClick={createNewChat}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition shadow-lg shadow-red-100"
                >
                  <Plus className="w-4 h-4" /> Nueva Conversación
                </button>

                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 px-1">
                    <History className="w-3 h-3" /> Conversaciones
                  </h3>
                  <div className="space-y-1">
                    {chatSessions.length === 0 ? (
                      <p className="text-[10px] text-gray-400 font-bold px-2 italic">Sin historial aún...</p>
                    ) : (
                      chatSessions.map(session => (
                        <button
                          key={session.id}
                          onClick={() => { setActiveChatId(session.id); setIsHistoryOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-xl text-left transition group",
                            activeChatId === session.id 
                              ? 'bg-gray-900 text-white' 
                              : 'hover:bg-white border border-transparent hover:border-gray-100 text-gray-600'
                          )}
                        >
                          <MessageSquare className={cn("w-4 h-4 shrink-0", activeChatId === session.id ? 'text-red-400' : 'text-gray-400')} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-black truncate uppercase leading-tight">{session.title}</p>
                            <p className="text-[8px] font-bold opacity-50 mt-0.5">
                              {session.updatedAt?.toDate?.() ? new Date(session.updatedAt.toDate()).toLocaleDateString() : 'Reciente'}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 px-1">
                    <Layout className="w-3 h-3" /> Especialidades
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { icon: Code, label: 'Arquitectura', color: 'text-blue-600' },
                      { icon: Palette, label: 'Design', color: 'text-pink-600' },
                      { icon: SeoIcon, label: 'SEO', color: 'text-orange-600' },
                      { icon: Terminal, label: 'Firebase', color: 'text-amber-600' },
                    ].map(spec => (
                      <div key={spec.label} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100 shadow-sm text-[10px] font-bold text-gray-700">
                        <spec.icon className={cn("w-3 h-3", spec.color)} />
                        {spec.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 px-1">
                    <RefreshCcw className="w-3 h-3" /> Contexto
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile History Backdrop */}
        {isHistoryOpen && (
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsHistoryOpen(false)}
          />
        )}

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
                  "flex w-full mb-4",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "flex gap-2 sm:gap-3 w-full max-w-[90vw] sm:max-w-[85%]",
                  message.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}>
                  <div className={cn(
                    "hidden sm:flex w-8 h-8 rounded-lg items-center justify-center shrink-0 shadow-sm mt-1",
                    message.role === 'user' ? "bg-gray-900" : "bg-red-600"
                  )}>
                    {message.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                  </div>
                  <div className={cn(
                    "p-3 sm:p-4 rounded-2xl text-[13px] sm:text-sm shadow-sm min-w-0 flex-1 overflow-hidden transition-all",
                    message.role === 'user' 
                      ? "bg-gray-900 text-white rounded-tr-none ml-auto" 
                      : "bg-white border border-gray-100 text-gray-800 rounded-tl-none mr-auto text-left"
                  )}>
                    <div className="prose prose-sm prose-slate max-w-none prose-headings:font-black prose-headings:text-gray-900 prose-strong:text-red-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded break-words whitespace-normal">
                      {message.parts.map((p, pIdx) => (
                        <div key={pIdx}>
                          {'text' in p && <ReactMarkdown>{p.text}</ReactMarkdown>}
                          {'inlineData' in p && (
                            <div className="mt-2 rounded-lg overflow-hidden border border-gray-100 max-w-xs">
                              {p.inlineData.mimeType.startsWith('image/') ? (
                                <img 
                                  src={`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`} 
                                  alt="Contenido adjunto" 
                                  className="w-full h-auto"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="p-3 flex items-center gap-2 bg-gray-50 text-gray-500">
                                  <FileText className="w-5 h-5 text-blue-500" />
                                  <span className="text-xs font-bold truncate">Archivo adjunto ({p.inlineData.mimeType})</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className={cn(
                      "text-[8px] font-black uppercase tracking-widest mt-2 opacity-50",
                      message.role === 'user' ? "text-right" : ""
                    )}>
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-2 sm:gap-3"
              >
                <div className="hidden sm:flex w-8 h-8 rounded-lg bg-red-600 items-center justify-center shadow-lg mt-1">
                  <Bot className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div className="p-3 sm:p-4 bg-white border border-gray-100 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                  </div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Analizando...</span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t bg-white min-w-0">
            {selectedFile && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-3 flex items-center gap-3 p-2 bg-gray-50 rounded-xl border border-gray-100 max-w-sm"
              >
                {selectedFile.preview ? (
                  <img src={selectedFile.preview} className="w-10 h-10 rounded-lg object-cover" alt="Preview" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-gray-900 truncate uppercase tracking-tight">{selectedFile.name}</p>
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{selectedFile.type}</p>
                </div>
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="flex items-center gap-2 sm:gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-100 focus-within:border-red-600 transition-all min-w-0">
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.txt,.pdf"
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 sm:p-3 text-gray-400 hover:text-red-600 hover:bg-white rounded-xl transition shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={selectedFile ? "Pide que haga algo con el archivo..." : "Pregunta algo..."}
                className="flex-1 bg-transparent border-none outline-none text-[12px] sm:text-sm font-bold px-1 py-2 text-gray-800 placeholder:text-gray-400 min-w-0"
              />
              <button 
                type="submit"
                disabled={(!input.trim() && !selectedFile) || isLoading}
                className="p-2.5 sm:p-3 bg-red-600 text-white rounded-xl shadow-lg hover:bg-red-700 transition disabled:bg-gray-200 disabled:shadow-none shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <p className="text-[7px] sm:text-[8px] text-center text-gray-400 mt-2 font-bold uppercase tracking-tight sm:tracking-widest px-2 truncate">
              Potenciado por Gemini 3 Flash • Pepa Intelligence v1.1
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
          max-width: 100%;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          margin: 1rem 0;
        }
        .prose code {
          font-family: 'JetBrains Mono', monospace;
          background: rgba(220, 38, 38, 0.1);
          color: #dc2626;
          font-weight: bold;
          word-break: break-all;
        }
        .prose p, .prose li, .prose h1, .prose h2, .prose h3 {
          word-wrap: break-word;
          overflow-wrap: anywhere;
          word-break: normal;
        }
        .prose {
          max-width: 100% !important;
          overflow-x: hidden;
        }
      `}} />
    </div>
  );
};
