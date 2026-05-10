/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Upload, 
  Image as ImageIcon, 
  Tag, 
  History, 
  Loader2, 
  Search,
  FileText,
  Camera,
  Archive,
  MapPin,
  Download,
  Globe,
  Calendar,
  ShieldCheck,
  ExternalLink,
  Film,
  FolderOpen,
  Layers,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from 'react-markdown';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

// Initialize Gemini API
const getApiKey = () => {
  return localStorage.getItem('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || '';
};

let ai = new GoogleGenAI({ apiKey: getApiKey() });

// Function to update AI instance when key changes
const updateAiInstance = (newKey: string) => {
  localStorage.setItem('GEMINI_API_KEY', newKey);
  ai = new GoogleGenAI({ apiKey: newKey });
};

interface AnalysisResult {
  descripcion: string;
  descriptores: string[];
  ubicacion_estimada: string;
  coordenadas: {
    lat: number;
    lng: number;
  };
  epoca_estimada: string;
  autor_probable: string;
  confianza: number;
  justificacion: string;
  descripcion_material: string;
}

interface ImageItem {
  id: string;
  url: string;
  name: string;
  result: AnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;
}

export default function App() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(localStorage.getItem('GEMINI_API_KEY') || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const currentItem = currentIndex !== null ? items[currentIndex] : null;

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const processFiles = async (files: FileList | null) => {
    if (!files) return;
    
    const newItems: ImageItem[] = [];
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

    for (const file of imageFiles) {
      const reader = new FileReader();
      const promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(file);
      const url = await promise;
      
      newItems.push({
        id: Math.random().toString(36).substring(7),
        url,
        name: file.name,
        result: null,
        isAnalyzing: false,
        error: null,
      });
    }

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
      if (currentIndex === null) setCurrentIndex(items.length);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
  };

  const handleUrlUpload = async () => {
    if (!imageUrlInput) return;
    
    const id = Math.random().toString(36).substring(7);
    const tempItem: ImageItem = {
      id,
      url: '',
      name: 'Imagen desde URL',
      result: null,
      isAnalyzing: true,
      error: null
    };

    setItems(prev => [...prev, tempItem]);
    setCurrentIndex(items.length);
    setImageUrlInput('');
    
    try {
      const response = await fetch(imageUrlInput);
      if (!response.ok) throw new Error("No se pudo acceder a la URL");
      
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error("El archivo no es una imagen válida");
      
      const reader = new FileReader();
      const promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(blob);
      const url = await promise;

      setItems(prev => prev.map(item => item.id === id ? { ...item, url, isAnalyzing: false } : item));
    } catch (err) {
      console.error("URL Load Error:", err);
      setItems(prev => prev.map(item => item.id === id ? { ...item, isAnalyzing: false, error: "Error de carga CORS o URL inválida" } : item));
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const saveSettings = () => {
    updateAiInstance(apiKeyInput);
    setShowSettings(false);
    window.location.reload(); // Refresh to re-init everything with new key
  };

  const analyzeImage = async (index: number) => {
    const item = items[index];
    if (!item || !item.url || item.result) return;

    setItems(prev => prev.map((it, i) => i === index ? { ...it, isAnalyzing: true, error: null } : it));

    try {
      const base64Data = item.url.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data,
              },
            },
            {
              text: "Actúa como un archivero histórico experto con acceso a bases de datos globales. Analiza esta fotografía de un archivo histórico e identifica su contenido con la mayor precisión posible. Proporciona una descripción, tres descriptores clave, la ubicación estimada con coordenadas geográficas aproximadas, la época estimada y el autor probable. \n\nEn la sección 'justificacion', realiza lo siguiente:\n1. Explica detalladamente los argumentos técnicos (estilo fotográfico, vestimenta, arquitectura, tecnología presente) que sustentan tu análisis.\n2. Busca y proporciona enlaces específicos y directos a registros de catálogos de museos (como el Smithsonian, British Museum, Archivo General de la Nación, etc.) o artículos de investigación que traten exactamente sobre el evento, el lugar o los elementos visuales identificados. Evita enlaces genéricos a páginas de inicio; busca la URL del objeto o registro específico si es posible.\n\nEn la sección 'descripcion_material', identifica el soporte físico probable:\n- Tipo de fotografía analógica (rollo 35mm con perforaciones, placa con muescas, daguerrotipo, etc.).\n- Fabricante y modelo de película probable (ej. Kodak Tri-X, Ilford HP5, Agfa).\n- Rango de años en que se comercializó o usó ese material específico.\n- Cualquier otra característica material deducible.\n\nResponde en formato JSON.",
            },
          ],
        },
        tools: [
          {
            googleSearch: {}
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              descripcion: {
                type: Type.STRING,
                description: "Un párrafo breve que describe el contenido histórico de la imagen.",
              },
              descriptores: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Un array de exactamente 3 descriptores clave.",
              },
              ubicacion_estimada: {
                type: Type.STRING,
                description: "Nombre de la ciudad, región o lugar específico.",
              },
              coordenadas: {
                type: Type.OBJECT,
                properties: {
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER },
                },
                required: ["lat", "lng"],
              },
              epoca_estimada: {
                type: Type.STRING,
                description: "Década o año aproximado.",
              },
              autor_probable: {
                type: Type.STRING,
                description: "Nombre del fotógrafo o 'Anónimo' si no se puede determinar.",
              },
              confianza: {
                type: Type.NUMBER,
                description: "Nivel de certeza del análisis (0-100).",
              },
              justificacion: {
                type: Type.STRING,
                description: "Argumentos técnicos y enlaces precisos a fuentes confiables en formato Markdown.",
              },
              descripcion_material: {
                type: Type.STRING,
                description: "Detalles técnicos sobre el soporte físico, película y fabricante.",
              },
            },
            required: ["descripcion", "descriptores", "ubicacion_estimada", "coordenadas", "epoca_estimada", "autor_probable", "confianza", "justificacion", "descripcion_material"],
          },
        },
      } as any);

      const analysis = JSON.parse(response.text);
      setItems(prev => prev.map((it, i) => i === index ? { ...it, result: analysis, isAnalyzing: false } : it));
    } catch (err) {
      console.error("Error analyzing image:", err);
      setItems(prev => prev.map((it, i) => i === index ? { ...it, isAnalyzing: false, error: "Error en el análisis de IA" } : it));
    }
  };

  const analyzeAll = async () => {
    setIsBatchAnalyzing(true);
    for (let i = 0; i < items.length; i++) {
      if (!items[i].result && !items[i].error) {
        await analyzeImage(i);
      }
    }
    setIsBatchAnalyzing(false);
  };

  const exportCurrentToCSV = () => {
    if (!currentItem || !currentItem.result) return;
    const res = currentItem.result;

    const headers = ["dc:title", "dc:creator", "dc:subject", "dc:description", "dc:date", "dc:coverage", "dc:format", "ai:confidence", "ai:justification", "ai:material_description"];
    const row = [
      res.descriptores[0] || "Sin título",
      res.autor_probable,
      res.descriptores.join("; "),
      res.descripcion.replace(/"/g, '""'),
      res.epoca_estimada,
      `${res.ubicacion_estimada} (${res.coordenadas.lat}, ${res.coordenadas.lng})`,
      "image/jpeg",
      `${res.confianza}%`,
      res.justificacion.replace(/"/g, '""'),
      res.descripcion_material.replace(/"/g, '""')
    ];

    const csvContent = [
      headers.join(","),
      row.map(field => `"${field}"`).join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `catalogacion_${currentItem.name.split('.')[0]}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
    if (currentIndex === index) {
      setCurrentIndex(newItems.length > 0 ? 0 : null);
    } else if (currentIndex !== null && currentIndex > index) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const reset = () => {
    setItems([]);
    setCurrentIndex(null);
    setImageUrlInput('');
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-accent/50">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-heading font-bold tracking-tight">Archivo Histórico Vision</h1>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowSettings(!showSettings)} 
              className={`text-xs uppercase font-mono tracking-tighter ${!getApiKey() ? 'text-red-500 animate-pulse' : ''}`}
            >
              <Settings className="w-3 h-3 mr-1" /> {getApiKey() ? 'Configuración' : 'Configurar API Key'}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} className="text-xs uppercase font-mono tracking-tighter">
              <Trash2 className="w-3 h-3 mr-1" /> Limpiar Todo
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-6 text-sm font-medium opacity-70">
              <span className="flex items-center gap-1"><History className="w-4 h-4" /> Catálogo</span>
              <span className="flex items-center gap-1"><Search className="w-4 h-4" /> Búsqueda</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Queue & Upload */}
          <section className="lg:col-span-4 space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-light">Gestión de <span className="italic">Lotes</span></h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cargue archivos individuales o carpetas completas para su catalogación sistemática.
              </p>
            </div>

            <Card 
              className={`border-dashed border-2 transition-all duration-300 relative ${
                isDragging ? 'bg-primary/5 border-primary scale-[1.02] shadow-lg' : 'bg-muted/10 border-border'
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              {isDragging && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-2">
                    <Upload className="w-6 h-6 text-primary animate-bounce" />
                  </div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold">Soltar para cargar</p>
                </div>
              )}
              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-20 flex flex-col gap-1 border-dashed"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-5 h-5 opacity-50" />
                    <span className="text-[10px] uppercase font-mono">Archivos</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-20 flex flex-col gap-1 border-dashed"
                    onClick={() => folderInputRef.current?.click()}
                  >
                    <FolderOpen className="w-5 h-5 opacity-50" />
                    <span className="text-[10px] uppercase font-mono">Carpeta</span>
                  </Button>
                </div>
                
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
                <input type="file" ref={folderInputRef} onChange={handleImageUpload} multiple className="hidden" />

                <div className="space-y-2">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/50" /></div>
                    <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-muted px-2 text-muted-foreground font-mono">o URL</span></div>
                  </div>
                  <div className="flex gap-1">
                    <Input 
                      placeholder="URL..." 
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      className="font-mono text-[10px] h-8"
                    />
                    <Button variant="secondary" size="sm" onClick={handleUrlUpload} disabled={!imageUrlInput} className="h-8">
                      <Globe className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="h-[500px] border-none shadow-none bg-muted/20">
              <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Cola ({items.length})
                </CardTitle>
                {items.length > 0 && !isBatchAnalyzing && items.some(i => !i.result && !i.error) && (
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={analyzeAll}
                    className="h-7 text-[10px] uppercase font-mono px-3 shadow-md animate-in fade-in zoom-in duration-300"
                  >
                    <Camera className="w-3 h-3 mr-1.5" />
                    Analizar Lote
                  </Button>
                )}
                {isBatchAnalyzing && (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-primary animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin"/>
                    PROCESANDO...
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[440px] px-4">
                  <div className="space-y-2 pb-4">
                    <AnimatePresence initial={false}>
                      {items.map((item, idx) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className={`group p-2 rounded-sm border cursor-pointer transition-all flex items-center gap-3 relative ${
                            currentIndex === idx 
                              ? 'bg-background border-primary shadow-sm' 
                              : 'bg-background/40 border-transparent hover:border-border'
                          }`}
                          onClick={() => setCurrentIndex(idx)}
                        >
                          <div className="w-10 h-10 rounded-sm overflow-hidden bg-muted flex-shrink-0 relative">
                            {item.url ? (
                              <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-3 h-3 animate-spin"/></div>
                            )}
                            {item.isAnalyzing && (
                              <div className="absolute inset-0 bg-primary/20 backdrop-blur-[1px] flex items-center justify-center">
                                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-mono truncate uppercase tracking-tighter text-foreground/80">
                              {item.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.result ? (
                                <span className="flex items-center gap-1 text-[8px] font-mono text-green-600 uppercase">
                                  <CheckCircle2 className="w-2 h-2" /> Catalogado
                                </span>
                              ) : item.error ? (
                                <span className="flex items-center gap-1 text-[8px] font-mono text-destructive uppercase">
                                  <AlertCircle className="w-2 h-2" /> Error
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[8px] font-mono text-muted-foreground uppercase">
                                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse" /> Pendiente
                                </span>
                              )}
                            </div>
                          </div>

                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 right-1"
                            onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {items.length === 0 && (
                      <div className="py-20 text-center space-y-3 opacity-30">
                        <ImageIcon className="w-8 h-8 mx-auto" />
                        <div className="space-y-1">
                          <p className="text-[10px] font-mono uppercase tracking-widest">Cola Vacía</p>
                          <p className="text-[9px] uppercase tracking-tighter">Cargue imágenes para comenzar</p>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </section>

          {/* Right Column: Detailed View */}
          <section className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {currentItem ? (
                <motion.div
                  key={currentItem.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentIndex(prev => prev! > 0 ? prev! - 1 : prev)}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {currentIndex! + 1} / {items.length}
                      </span>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentIndex(prev => prev! < items.length - 1 ? prev! + 1 : prev)}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                       {currentItem.result && (
                         <Button variant="default" size="sm" onClick={exportCurrentToCSV} className="h-8 text-xs">
                           <Download className="w-3 h-3 mr-2" /> Exportar CSV
                         </Button>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="overflow-hidden border-none shadow-lg">
                      <div className="relative aspect-auto bg-muted">
                        <img 
                          src={currentItem.url} 
                          alt={currentItem.name} 
                          className={`w-full h-auto transition-all duration-700 ${currentItem.isAnalyzing ? 'blur-sm opacity-50' : ''}`}
                        />
                        {currentItem.isAnalyzing && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                            <div className="space-y-2">
                              <p className="text-[10px] font-mono uppercase tracking-widest text-foreground">Escaneando Soporte...</p>
                              <Progress value={44} className="h-1 w-32" />
                            </div>
                          </div>
                        )}
                        {!currentItem.result && !currentItem.isAnalyzing && !currentItem.error && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-6">
                            <Button onClick={() => analyzeImage(currentIndex!)} size="lg" className="shadow-2xl">
                              <Camera className="w-4 h-4 mr-2" /> Iniciar Análisis
                            </Button>
                          </div>
                        )}
                        {currentItem.error && (
                          <div className="absolute inset-0 bg-destructive/10 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                            <div className="space-y-2">
                              <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
                              <p className="text-xs font-mono text-destructive uppercase">{currentItem.error}</p>
                              <Button variant="outline" size="sm" onClick={() => analyzeImage(currentIndex!)}>Reintentar</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>

                    <div className="space-y-4">
                      {currentItem.result ? (
                        <div className="space-y-4">
                          <Card className="border-none shadow-none bg-muted/30">
                            <CardHeader className="p-4 pb-2">
                              <div className="flex items-center justify-between mb-4">
                                <Badge variant="outline" className="text-[8px] font-mono uppercase tracking-tighter px-1.5 py-0">#AI-ARCHIVE</Badge>
                                <Badge 
                                  variant="secondary" 
                                  className={`text-[8px] font-mono uppercase tracking-tighter px-1.5 py-0 ${
                                    currentItem.result.confianza > 80 ? 'bg-green-500/10 text-green-600' : 
                                    currentItem.result.confianza > 50 ? 'bg-yellow-500/10 text-yellow-600' : 'bg-red-500/10 text-red-600'
                                  }`}
                                >
                                  Certidumbre: {currentItem.result.confianza}%
                                </Badge>
                              </div>
                              <h3 className="text-2xl font-heading italic underline underline-offset-4 decoration-primary/20">
                                {currentItem.result.descriptores[0]}
                              </h3>
                            </CardHeader>
                            <CardContent className="p-4 pt-4 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Época</span>
                                  <p className="text-xs font-medium">{currentItem.result.epoca_estimada}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1"><Camera className="w-3 h-3" /> Autor</span>
                                  <p className="text-xs font-medium truncate">{currentItem.result.autor_probable}</p>
                                </div>
                                <div className="col-span-2 space-y-0.5 border-t border-border/40 pt-2 mt-1">
                                  <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Ubicación</span>
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium">{currentItem.result.ubicacion_estimada}</p>
                                    <Button 
                                      variant="link" 
                                      size="sm" 
                                      className="h-auto p-0 text-[10px] font-mono uppercase text-primary"
                                      onClick={() => window.open(`https://www.google.com/maps?q=${currentItem.result!.coordenadas.lat},${currentItem.result!.coordenadas.lng}`, '_blank')}
                                    >
                                      <Globe className="w-3 h-3 mr-1" /> Maps
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <div className="space-y-3">
                             <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                               <FileText className="w-3 h-3" /> Descripción Histórica
                             </h4>
                             <p className="text-sm leading-relaxed font-serif text-foreground/80">
                               {currentItem.result.descripcion}
                             </p>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-border/60 rounded-lg bg-muted/5 min-h-[300px] space-y-4">
                           <Archive className="w-8 h-8 text-muted-foreground/30 animate-pulse" />
                           <div className="space-y-1">
                             <h4 className="text-sm font-heading">Ficha en Blanco</h4>
                             <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-tighter">Inicie el análisis para poblar los campos de catalogación técnico-histórica.</p>
                           </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {currentItem.result && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-border/40"
                    >
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                          <Film className="w-3 h-3" /> Soporte Material
                        </h4>
                        <div className="p-4 bg-muted/30 rounded-sm border border-border/20">
                          <p className="text-xs leading-relaxed font-mono text-foreground/70 italic">
                            {currentItem.result.descripcion_material}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                          <ShieldCheck className="w-3 h-3" /> Justificación Académica
                        </h4>
                        <div className="text-xs leading-relaxed text-muted-foreground font-sans prose prose-xs prose-stone dark:prose-invert max-w-none prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium">
                          <ReactMarkdown
                            components={{
                              a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline transition-colors decoration-blue-400 underline-offset-2" />
                            }}
                          >
                            {currentItem.result.justificacion}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 border border-dashed border-border/60 rounded-lg bg-muted/10 min-h-[500px]">
                  <div className="w-20 h-20 rounded-full bg-muted/20 flex items-center justify-center mb-6">
                    <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-xl font-heading mb-2 lowercase italic">"La historia no se repite, se conserva"</h3>
                  <p className="text-xs text-muted-foreground max-w-[280px] font-mono uppercase tracking-tighter">
                    Seleccione un elemento de la cola para visualizar y gestionar su proceso de catalogación digital.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-12 mt-24">
        <div className="container mx-auto px-4 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 opacity-50">
            <Archive className="w-4 h-4" />
            <span className="text-xs font-mono uppercase tracking-widest">Sistema de Visión de Archivos Históricos</span>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter">
            Desarrollado para la preservación del patrimonio visual &copy; 2026
          </p>
        </div>
      </footer>
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Configuración de Acceso
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Para usar esta app en un servidor estático (como GitHub Pages), cada usuario debe proveer su propia llave de Gemini. 
                      Tu llave se guarda localmente en este navegador.
                    </p>
                    <Input 
                      type="password"
                      placeholder="GEMINI_API_KEY"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground italic">
                      Obtén una gratis en <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline text-primary">Google AI Studio</a>.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={saveSettings}>Guardar y Recargar</Button>
                    <Button variant="ghost" onClick={() => setShowSettings(false)}>Cancelar</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
