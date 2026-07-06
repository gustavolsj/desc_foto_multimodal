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
  ChevronDown,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Settings,
  Key,
  CreditCard,
  Copy,
  Check,
  FileCode,
  Bookmark
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

// One-time migration of legacy GEMINI_API_KEY to GEMINI_API_KEY_FREE if both slots are empty
if (typeof window !== 'undefined') {
  const legacyKey = localStorage.getItem('GEMINI_API_KEY');
  const freeKey = localStorage.getItem('GEMINI_API_KEY_FREE');
  const paidKey = localStorage.getItem('GEMINI_API_KEY_PAID');
  
  if (legacyKey && !freeKey && !paidKey) {
    localStorage.setItem('GEMINI_API_KEY_FREE', legacyKey);
  }
}

// Initialize Gemini API
const getActiveKeyType = (): 'free' | 'paid' => {
  return (localStorage.getItem('GEMINI_API_KEY_ACTIVE_TYPE') as 'free' | 'paid') || 'free';
};

const getApiKey = () => {
  const activeType = getActiveKeyType();
  if (activeType === 'paid') {
    return localStorage.getItem('GEMINI_API_KEY_PAID') || '';
  }
  return localStorage.getItem('GEMINI_API_KEY_FREE') || process.env.GEMINI_API_KEY || '';
};

let ai = new GoogleGenAI({ apiKey: getApiKey() });

// Function to update AI instance when key changes
const updateAiInstance = (freeKey: string, paidKey: string, activeType: 'free' | 'paid') => {
  localStorage.setItem('GEMINI_API_KEY_FREE', freeKey);
  localStorage.setItem('GEMINI_API_KEY_PAID', paidKey);
  localStorage.setItem('GEMINI_API_KEY_ACTIVE_TYPE', activeType);
  localStorage.setItem('GEMINI_API_KEY', activeType === 'free' ? freeKey : paidKey);
  
  const selectedKey = activeType === 'paid' ? paidKey : freeKey;
  ai = new GoogleGenAI({ apiKey: selectedKey || process.env.GEMINI_API_KEY || '' });
};

const maskApiKey = (key: string | null) => {
  if (!key) return '';
  if (key.length <= 5) return key;
  return `*******${key.slice(-5)}`;
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

const ANALYSIS_PROMPT = `Actúa como un archivista profesional experto en la descripción de fotografías históricas de México, con acceso a bases de datos globales de museos, archivos y bibliotecas y normas de descripcion como la ISADG y la norma mexicana de catalogacio0n de fotografia, IPTC subjects. Analiza las fotografías e identifica su contenido con la mayor precisión posible. Proporciona los siguientes elementos: 
- Titulo sugerido en máximo 6 palabras
- descripción narrativa en 50 palabras, 
- tres frases o palabras clave que describan los temas, aquí  no repitas información de otros campos, 
fecha estimada (solo pon el año).  
- ubicación estimada,  
- ciudad y pais,  
- coordenadas geográficas latitud y longitud, 

En la sección 'descripcion_material', identifica lo siguiente 
- Técnica o proceso fotográfico (por ejemplo, albumina, plata gelatina, difusion de colorantes, etc)
- Tipología fotografica (imopresion, diapositiva, negativo o imagen de cámara)
- soporte físico (debe ser únicamente una de estas opciones: papel, metal, vidrio, o plastico)
- Polaridad (positivo o negativo)
- Tono (debe ser únicamente una de estas opciones: monocromática o policromática)
- Otros elementos distintivos de una fotografía analógica (rollo 35mm con perforaciones, placa con muescas, marco de un daguerrotipo, etc.).
- Fabricante y modelo de película solo si hay indicios como muescas, codigos o textos que lo indiquen

En la sección 'justificacion', realiza lo siguiente:
1. Explica detalladamente los argumentos técnicos (estilo fotográfico, vestimenta, arquitectura, monumentos o lugares reconocibles, elementos tecnologicos de alguna epoca presentes) que sustentan tu análisis.
2. Busca y proporciona enlaces específicos y directos a registros de catálogos de museos o artículos de investigación que traten exactamente sobre el evento, el lugar o los elementos visuales identificados. Evita enlaces genéricos a páginas de inicio; busca la URL del objeto o registro específico si es posible.

Responde en formato JSON.`;

interface PromptOptions {
  includeTitulo: boolean;
  includeDescripcion: boolean;
  includePalabrasClave: boolean;
  includeFecha: boolean;
  includeUbicacion: boolean;
  includeCiudadPais: boolean;
  includeCoordenadas: boolean;
  includeTecnica: boolean;
  includeTipologia: boolean;
  includeSoporte: boolean;
  includePolaridad: boolean;
  includeTono: boolean;
  includeOtrosElementos: boolean;
  includeFabricante: boolean;
}

const DEFAULT_OPTIONS: PromptOptions = {
  includeTitulo: true,
  includeDescripcion: true,
  includePalabrasClave: true,
  includeFecha: true,
  includeUbicacion: true,
  includeCiudadPais: true,
  includeCoordenadas: true,
  includeTecnica: true,
  includeTipologia: true,
  includeSoporte: true,
  includePolaridad: true,
  includeTono: true,
  includeOtrosElementos: true,
  includeFabricante: true,
};

function buildDynamicPrompt(options: PromptOptions): string {
  const contentItems: string[] = [];
  if (options.includeTitulo) {
    contentItems.push("- Título sugerido en máximo 6 palabras (colócalo en 'descriptores[0]').");
  }
  if (options.includeDescripcion) {
    contentItems.push("- Descripción narrativa de unas 50 palabras (campo 'descripcion').");
  }
  if (options.includePalabrasClave) {
    contentItems.push("- Tres palabras/frases clave de temas descriptivos (colócalas en 'descriptores').");
  }
  if (options.includeFecha) {
    contentItems.push("- Fecha estimada de captura (indica solo el año en 'epoca_estimada').");
  }
  if (options.includeUbicacion) {
    contentItems.push("- Ubicación estimada (campo 'ubicacion_estimada').");
  }
  if (options.includeCiudadPais) {
    contentItems.push("- Ciudad y país (campo 'ubicacion_estimada').");
  }
  if (options.includeCoordenadas) {
    contentItems.push("- Coordenadas geográficas latitud y longitud decimales (campo 'coordenadas').");
  }

  const materialItems: string[] = [];
  if (options.includeTecnica) {
    materialItems.push("- Técnica o proceso fotográfico (por ejemplo, albúmina, plata gelatina, difusión de colorantes, etc.).");
  }
  if (options.includeTipologia) {
    materialItems.push("- Tipología fotográfica (impresión, diapositiva, negativo o imagen de cámara).");
  }
  if (options.includeSoporte) {
    materialItems.push("- Soporte físico (papel, metal, plástico o vidrio).");
  }
  if (options.includePolaridad) {
    materialItems.push("- Polaridad (positivo o negativo).");
  }
  if (options.includeTono) {
    materialItems.push("- Tono (monocroma o policroma).");
  }
  if (options.includeOtrosElementos) {
    materialItems.push("- Otros elementos distintivos analógicos (rollo 35mm con perforaciones, placa con muescas, marcos, etc.).");
  }
  if (options.includeFabricante) {
    materialItems.push("- Fabricante y modelo de película si hay indicios.");
  }

  let prompt = `Actúa como archivista profesional de fotografía histórica de México. Analiza la imagen y genera ÚNICAMENTE los siguientes aspectos solicitados:\n\n`;

  if (contentItems.length > 0) {
    prompt += `Identificación de Contenido:\n${contentItems.join("\n")}\n\n`;
  }

  if (materialItems.length > 0) {
    prompt += `Materialidad Física (campo 'descripcion_material'):\n${materialItems.join("\n")}\n\n`;
  }

  prompt += `En la sección 'justificacion':
1. Explica brevemente los argumentos técnicos que sustentan tu análisis.
2. Proporciona de ser posible enlaces directos y específicos a registros de catálogos de museos o artículos que traten exactamente sobre el evento o lugar identificado.\n\n`;

  prompt += `Responde estrictamente en formato JSON utilizando el esquema de salida especificado.`;

  return prompt;
}

function buildDynamicSchema(options: PromptOptions) {
  const properties: any = {
    confianza: {
      type: Type.NUMBER,
      description: "Nivel de certeza del análisis (0-100).",
    },
    justificacion: {
      type: Type.STRING,
      description: "Argumentos técnicos y enlaces precisos a fuentes confiables en formato Markdown.",
    },
  };

  const required = ["confianza", "justificacion"];

  if (options.includeDescripcion) {
    properties.descripcion = {
      type: Type.STRING,
      description: "Un párrafo breve que describe el contenido histórico de la imagen.",
    };
    required.push("descripcion");
  }

  if (options.includeTitulo || options.includePalabrasClave) {
    properties.descriptores = {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Un array de descriptores clave. El primer elemento es el título sugerido.",
    };
    required.push("descriptores");
  }

  if (options.includeUbicacion || options.includeCiudadPais) {
    properties.ubicacion_estimada = {
      type: Type.STRING,
      description: "Nombre de la ciudad, región o lugar específico.",
    };
    required.push("ubicacion_estimada");
  }

  if (options.includeCoordenadas) {
    properties.coordenadas = {
      type: Type.OBJECT,
      properties: {
        lat: { type: Type.NUMBER },
        lng: { type: Type.NUMBER },
      },
      required: ["lat", "lng"],
    };
    required.push("coordenadas");
  }

  if (options.includeFecha) {
    properties.epoca_estimada = {
      type: Type.STRING,
      description: "Década o año aproximado de la fotografía.",
    };
    required.push("epoca_estimada");
  }

  const hasMaterial = options.includeTecnica || 
                      options.includeTipologia || 
                      options.includeSoporte || 
                      options.includePolaridad || 
                      options.includeTono || 
                      options.includeOtrosElementos || 
                      options.includeFabricante;

  if (hasMaterial) {
    properties.descripcion_material = {
      type: Type.STRING,
      description: "Detalles técnicos sobre el soporte físico, película y fabricante.",
    };
    required.push("descripcion_material");
  }

  return {
    type: Type.OBJECT,
    properties,
    required,
  };
}

export default function App() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showAllExportDropdown, setShowAllExportDropdown] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  
  const [promptMode, setPromptMode] = useState<'custom' | 'structured'>(() => {
    return (localStorage.getItem('CATALOG_PROMPT_MODE') as 'custom' | 'structured') || 'custom';
  });
  
  const [promptOptions, setPromptOptions] = useState<PromptOptions>(() => {
    const saved = localStorage.getItem('CATALOG_PROMPT_OPTIONS');
    if (saved) {
      try {
        return { ...DEFAULT_OPTIONS, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_OPTIONS;
      }
    }
    return DEFAULT_OPTIONS;
  });

  const [tempPromptMode, setTempPromptMode] = useState<'custom' | 'structured'>('custom');
  const [tempPromptOptions, setTempPromptOptions] = useState<PromptOptions>(DEFAULT_OPTIONS);

  const [editablePrompt, setEditablePrompt] = useState(() => localStorage.getItem('CATALOG_USER_PROMPT') || ANALYSIS_PROMPT);
  const [tempPrompt, setTempPrompt] = useState(() => localStorage.getItem('CATALOG_USER_PROMPT') || ANALYSIS_PROMPT);
  
  const [apiKeyInputFree, setApiKeyInputFree] = useState(() => 
    maskApiKey(localStorage.getItem('GEMINI_API_KEY_FREE'))
  );
  const [apiKeyInputPaid, setApiKeyInputPaid] = useState(() => 
    maskApiKey(localStorage.getItem('GEMINI_API_KEY_PAID'))
  );
  const [activeKeyType, setActiveKeyType] = useState<'free' | 'paid'>(() => getActiveKeyType());
  const [tempActiveType, setTempActiveType] = useState<'free' | 'paid'>(() => getActiveKeyType());

  const toggleActiveKeyType = (type: 'free' | 'paid') => {
    const originalFree = localStorage.getItem('GEMINI_API_KEY_FREE') || '';
    const originalPaid = localStorage.getItem('GEMINI_API_KEY_PAID') || '';
    updateAiInstance(originalFree, originalPaid, type);
    setActiveKeyType(type);
    setApiKeyInputFree(maskApiKey(originalFree));
    setApiKeyInputPaid(maskApiKey(originalPaid));
  };

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
    let freeKey = apiKeyInputFree;
    let paidKey = apiKeyInputPaid;

    const originalFree = localStorage.getItem('GEMINI_API_KEY_FREE') || '';
    const originalPaid = localStorage.getItem('GEMINI_API_KEY_PAID') || '';

    if (freeKey.startsWith('*******')) {
      freeKey = originalFree;
    }
    if (paidKey.startsWith('*******')) {
      paidKey = originalPaid;
    }

    updateAiInstance(freeKey, paidKey, tempActiveType);
    setActiveKeyType(tempActiveType);
    setShowSettings(false);
    window.location.reload(); // Refresh to re-init everything with new key
  };

  const analyzeImage = async (index: number) => {
    const item = items[index];
    if (!item || !item.url || item.result) return;

    setItems(prev => prev.map((it, i) => i === index ? { ...it, isAnalyzing: true, error: null } : it));

    try {
      const base64Data = item.url.split(',')[1];
      
      const promptToSend = promptMode === 'custom' 
        ? editablePrompt 
        : buildDynamicPrompt(promptOptions);
      
      const dynamicSchema = promptMode === 'custom' 
        ? {
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
          }
        : buildDynamicSchema(promptOptions);
      
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
              text: promptToSend,
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
          responseSchema: dynamicSchema,
        },
      } as any);
 
      const parsed = JSON.parse(response.text);
      
      const defaultResult = {
        descripcion: "No solicitado",
        descriptores: ["No solicitado"],
        ubicacion_estimada: "No solicitado",
        coordenadas: { lat: 19.4326, lng: -99.1332 },
        epoca_estimada: "No solicitado",
        autor_probable: "No solicitado",
        confianza: 0,
        justificacion: "*Información no solicitada en este análisis.*",
        descripcion_material: "No solicitado"
      };

      const analysis = { ...defaultResult, ...parsed };
      if (parsed.coordenadas) {
        analysis.coordenadas = { ...defaultResult.coordenadas, ...parsed.coordenadas };
      }
      if (parsed.descriptores && Array.isArray(parsed.descriptores)) {
        analysis.descriptores = parsed.descriptores.length > 0 ? parsed.descriptores : ["No solicitado"];
      }

      setItems(prev => prev.map((it, i) => i === index ? { ...it, result: analysis, isAnalyzing: false } : it));
    } catch (err: any) {
      console.error("Error analyzing image:", err);
      let errorMsg = "Error en el análisis de IA";
      
      const errStr = JSON.stringify(err) + " " + String(err) + " " + (err?.message || "");
      if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota") || errStr.includes("Quota")) {
        errorMsg = "Límite de cuota de la API excedido (Error 429). Por favor, configura tu propia API Key de Gemini en Configuración para continuar de forma ilimitada y gratuita.";
      } else if (errStr.includes("API key not valid") || errStr.includes("API_KEY_INVALID") || errStr.includes("not found") || errStr.includes("invalid key")) {
        errorMsg = "La API Key de Gemini ingresada es inválida o expiró. Por favor, revísala en Configuración.";
      } else if (err?.message) {
        errorMsg = `Error de IA: ${err.message}`;
      }
      
      setItems(prev => prev.map((it, i) => i === index ? { ...it, isAnalyzing: false, error: errorMsg } : it));
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

  const exportCurrentToCSV = (formatType: 'dc' | 'cb') => {
    if (!currentItem || !currentItem.result) return;
    const res = currentItem.result;

    const descMaterialLower = res.descripcion_material.toLowerCase();
    
    // Polaridad (Positivo / Negativo)
    let polaridad = "Positivo";
    if (descMaterialLower.includes("negativo")) {
      polaridad = "Negativo";
    }

    // Tipología (Impresión, Diapositiva, Negativo, Tarjeta Postal, etc.)
    let tipologia = "Impresión";
    if (descMaterialLower.includes("postal") || currentItem.name.toLowerCase().includes("postcard") || currentItem.name.toLowerCase().includes("postal")) {
      tipologia = "Tarjeta Postal";
    } else if (descMaterialLower.includes("diapositiva")) {
      tipologia = "Diapositiva";
    } else if (descMaterialLower.includes("negativo")) {
      tipologia = "Negativo";
    }

    // Soporte Físico (papel, metal, vidrio, o plastico)
    let soporte = "papel";
    if (descMaterialLower.includes("vidrio")) {
      soporte = "vidrio";
    } else if (descMaterialLower.includes("metal") || descMaterialLower.includes("daguerrotipo") || descMaterialLower.includes("ferrotipo")) {
      soporte = "metal";
    } else if (
      descMaterialLower.includes("película") || 
      descMaterialLower.includes("pelicula") || 
      descMaterialLower.includes("acetato") || 
      descMaterialLower.includes("nitrato") || 
      descMaterialLower.includes("plástico") || 
      descMaterialLower.includes("plastico") || 
      descMaterialLower.includes("poliester") ||
      descMaterialLower.includes("poliéster") ||
      descMaterialLower.includes("film")
    ) {
      soporte = "plastico";
    }

    // Iluminación (Reflexión / Transmisión)
    let iluminacion = "Reflexión";
    if (soporte === "vidrio" || soporte === "plastico" || polaridad === "Negativo") {
      iluminacion = "Transmisión";
    }

    // Tono (monocromática o policromática)
    let tono = "monocromática";
    if (descMaterialLower.includes("color") || descMaterialLower.includes("policrom") || descMaterialLower.includes("policromática") || descMaterialLower.includes("policromatica")) {
      tono = "policromática";
    }

    // Proceso
    let proceso = "Impresión plata gelatina de revelado";
    if (descMaterialLower.includes("albúmina") || descMaterialLower.includes("albumina")) {
      proceso = "Albúmina";
    } else if (descMaterialLower.includes("daguerrotipo")) {
      proceso = "Daguerrotipo";
    } else if (descMaterialLower.includes("colodión") || descMaterialLower.includes("colodion")) {
      proceso = "Colodión húmedo";
    } else if (descMaterialLower.includes("cianotipo")) {
      proceso = "Cianotipo";
    } else if (descMaterialLower.includes("platino")) {
      proceso = "Platinotipia";
    } else {
      const match = res.descripcion_material.match(/^([^.,]+)/);
      if (match && match[1] && match[1].length < 60) {
        proceso = match[1].trim();
      }
    }

    const objectId = currentItem.name.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_") || `item_${currentItem.id}`;

    // Apply strict filtering if we are in structured mode
    const isStructured = promptMode === 'structured';
    
    const cleanTitle = (isStructured && !promptOptions.includeTitulo) 
      ? "" 
      : (res.descriptores[0] && res.descriptores[0] !== "No solicitado"
          ? (res.descriptores[0].charAt(0).toUpperCase() + res.descriptores[0].slice(1)) 
          : "Sin título");

    const subjectVal = (isStructured && !promptOptions.includePalabrasClave)
      ? ""
      : res.descriptores.filter(d => d !== "No solicitado").join("; ");

    const creatorVal = res.autor_probable === "No solicitado" ? "" : res.autor_probable;

    const dateVal = (isStructured && !promptOptions.includeFecha)
      ? ""
      : (res.epoca_estimada === "No solicitado" ? "" : res.epoca_estimada);

    const descriptionVal = (isStructured && !promptOptions.includeDescripcion)
      ? ""
      : (res.descripcion === "No solicitado" ? "" : res.descripcion);

    const locationVal = (isStructured && !promptOptions.includeUbicacion && !promptOptions.includeCiudadPais)
      ? ""
      : (res.ubicacion_estimada === "No solicitado" ? "" : res.ubicacion_estimada);

    const latVal = (isStructured && !promptOptions.includeCoordenadas)
      ? ""
      : res.coordenadas.lat.toString();

    const lngVal = (isStructured && !promptOptions.includeCoordenadas)
      ? ""
      : res.coordenadas.lng.toString();

    const polaridadVal = (isStructured && !promptOptions.includePolaridad)
      ? ""
      : polaridad;

    const tipologiaVal = (isStructured && !promptOptions.includeTipologia)
      ? ""
      : tipologia;

    const soporteVal = (isStructured && !promptOptions.includeSoporte)
      ? ""
      : soporte;

    const iluminacionVal = (isStructured && !promptOptions.includeSoporte && !promptOptions.includePolaridad)
      ? ""
      : iluminacion;

    const tonoVal = (isStructured && !promptOptions.includeTono)
      ? ""
      : tono;

    const procesoVal = (isStructured && !promptOptions.includeTecnica)
      ? ""
      : proceso;

    // Dublin Core coverage computation
    let coverageParts: string[] = [];
    if (!isStructured || promptOptions.includeUbicacion || promptOptions.includeCiudadPais) {
      if (res.ubicacion_estimada && res.ubicacion_estimada !== "No solicitado") {
        coverageParts.push(res.ubicacion_estimada);
      }
    }
    if (!isStructured || promptOptions.includeCoordenadas) {
      if (res.coordenadas && res.coordenadas.lat !== 0 && res.coordenadas.lng !== 0) {
        coverageParts.push(`(${res.coordenadas.lat}, ${res.coordenadas.lng})`);
      }
    }
    const coverageVal = coverageParts.join(" ");

    let headers: string[];
    let row: string[];
    let filenamePrefix: string;

    if (formatType === 'cb') {
      headers = [
        "objectid",
        "filename",
        "title",
        "format",
        "subject",
        "creator",
        "date",
        "description",
        "",
        "location",
        "latitude",
        "longitude",
        "source",
        "identifier",
        "type",
        "youtubeid",
        "language",
        "rights",
        "rightsstatement",
        "polaridad",
        "tipologia",
        "soporte",
        "iluminacion",
        "tono",
        "proceso"
      ];
      row = [
        objectId,
        currentItem.name,
        cleanTitle,
        "image/jpeg",
        subjectVal,
        creatorVal,
        dateVal,
        descriptionVal,
        "",
        locationVal,
        latVal,
        lngVal,
        "Archivo Histórico Vision",
        currentItem.id,
        "Image;StillImage",
        "",
        "es",
        "",
        "http://rightsstatements.org/vocab/NoC-US/1.0/",
        polaridadVal,
        tipologiaVal,
        soporteVal,
        iluminacionVal,
        tonoVal,
        procesoVal
      ];
      filenamePrefix = "cb_";
    } else {
      headers = [
        "dc:title", 
        "dc:creator", 
        "dc:subject", 
        "dc:description", 
        "dc:date", 
        "dc:coverage", 
        "dc:format", 
        "ai:confidence", 
        "ai:justification", 
        "ai:material_description"
      ];
      row = [
        cleanTitle,
        creatorVal,
        subjectVal,
        descriptionVal,
        dateVal,
        coverageVal,
        "image/jpeg",
        `${res.confianza}%`,
        res.justificacion,
        (isStructured && !promptOptions.includeTecnica && !promptOptions.includeTipologia && !promptOptions.includeSoporte && !promptOptions.includePolaridad && !promptOptions.includeTono && !promptOptions.includeOtrosElementos && !promptOptions.includeFabricante) ? "" : res.descripcion_material
      ];
      filenamePrefix = "catalogacion_";
    }

    const csvContent = [
      headers.join(","),
      row.map(field => {
        const escaped = (field || "").replace(/"/g, '""');
        if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
          return `"${escaped}"`;
        }
        return escaped;
      }).join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filenamePrefix}${currentItem.name.split('.')[0]}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAllToCSV = (formatType: 'dc' | 'cb') => {
    const catalogedItems = items.filter(it => it.result !== null);
    if (catalogedItems.length === 0) return;

    let headers: string[] = [];
    const rows: string[][] = [];
    let filenamePrefix = "catalogacion_lote_";

    if (formatType === 'cb') {
      headers = [
        "objectid",
        "filename",
        "title",
        "format",
        "subject",
        "creator",
        "date",
        "description",
        "",
        "location",
        "latitude",
        "longitude",
        "source",
        "identifier",
        "type",
        "youtubeid",
        "language",
        "rights",
        "rightsstatement",
        "polaridad",
        "tipologia",
        "soporte",
        "iluminacion",
        "tono",
        "proceso"
      ];
      filenamePrefix = "cb_lote_";
    } else {
      headers = [
        "dc:title", 
        "dc:creator", 
        "dc:subject", 
        "dc:description", 
        "dc:date", 
        "dc:coverage", 
        "dc:format", 
        "ai:confidence", 
        "ai:justification", 
        "ai:material_description"
      ];
    }

    const isStructured = promptMode === 'structured';

    catalogedItems.forEach(item => {
      const res = item.result!;
      const descMaterialLower = res.descripcion_material.toLowerCase();
      
      // Polaridad (Positivo / Negativo)
      let polaridad = "Positivo";
      if (descMaterialLower.includes("negativo")) {
        polaridad = "Negativo";
      }

      // Tipología (Impresión, Diapositiva, Negativo, Tarjeta Postal, etc.)
      let tipologia = "Impresión";
      if (descMaterialLower.includes("postal") || item.name.toLowerCase().includes("postcard") || item.name.toLowerCase().includes("postal")) {
        tipologia = "Tarjeta Postal";
      } else if (descMaterialLower.includes("diapositiva")) {
        tipologia = "Diapositiva";
      } else if (descMaterialLower.includes("negativo")) {
        tipologia = "Negativo";
      }

      // Soporte Físico (papel, metal, vidrio, o plastico)
      let soporte = "papel";
      if (descMaterialLower.includes("vidrio")) {
        soporte = "vidrio";
      } else if (descMaterialLower.includes("metal") || descMaterialLower.includes("daguerrotipo") || descMaterialLower.includes("ferrotipo")) {
        soporte = "metal";
      } else if (
        descMaterialLower.includes("película") || 
        descMaterialLower.includes("pelicula") || 
        descMaterialLower.includes("acetato") || 
        descMaterialLower.includes("nitrato") || 
        descMaterialLower.includes("plástico") || 
        descMaterialLower.includes("plastico") || 
        descMaterialLower.includes("poliester") ||
        descMaterialLower.includes("poliéster") ||
        descMaterialLower.includes("film")
      ) {
        soporte = "plastico";
      }

      // Iluminación (Reflexión / Transmisión)
      let iluminacion = "Reflexión";
      if (soporte === "vidrio" || soporte === "plastico" || polaridad === "Negativo") {
        iluminacion = "Transmisión";
      }

      // Tono (monocromática o policromática)
      let tono = "monocromática";
      if (descMaterialLower.includes("color") || descMaterialLower.includes("policrom") || descMaterialLower.includes("policromática") || descMaterialLower.includes("policromatica")) {
        tono = "policromática";
      }

      // Proceso
      let proceso = "Impresión plata gelatina de revelado";
      if (descMaterialLower.includes("albúmina") || descMaterialLower.includes("albumina")) {
        proceso = "Albúmina";
      } else if (descMaterialLower.includes("daguerrotipo")) {
        proceso = "Daguerrotipo";
      } else if (descMaterialLower.includes("colodión") || descMaterialLower.includes("colodion")) {
        proceso = "Colodión húmedo";
      } else if (descMaterialLower.includes("cianotipo")) {
        proceso = "Cianotipo";
      } else if (descMaterialLower.includes("platino")) {
        proceso = "Platinotipia";
      } else {
        const match = res.descripcion_material.match(/^([^.,]+)/);
        if (match && match[1] && match[1].length < 60) {
          proceso = match[1].trim();
        }
      }

      const objectId = item.name.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_") || `item_${item.id}`;
      
      const cleanTitle = (isStructured && !promptOptions.includeTitulo) 
        ? "" 
        : (res.descriptores[0] && res.descriptores[0] !== "No solicitado"
            ? (res.descriptores[0].charAt(0).toUpperCase() + res.descriptores[0].slice(1)) 
            : "Sin título");

      const subjectVal = (isStructured && !promptOptions.includePalabrasClave)
        ? ""
        : res.descriptores.filter(d => d !== "No solicitado").join("; ");

      const creatorVal = res.autor_probable === "No solicitado" ? "" : res.autor_probable;

      const dateVal = (isStructured && !promptOptions.includeFecha)
        ? ""
        : (res.epoca_estimada === "No solicitado" ? "" : res.epoca_estimada);

      const descriptionVal = (isStructured && !promptOptions.includeDescripcion)
        ? ""
        : (res.descripcion === "No solicitado" ? "" : res.descripcion);

      const locationVal = (isStructured && !promptOptions.includeUbicacion && !promptOptions.includeCiudadPais)
        ? ""
        : (res.ubicacion_estimada === "No solicitado" ? "" : res.ubicacion_estimada);

      const latVal = (isStructured && !promptOptions.includeCoordenadas)
        ? ""
        : res.coordenadas.lat.toString();

      const lngVal = (isStructured && !promptOptions.includeCoordenadas)
        ? ""
        : res.coordenadas.lng.toString();

      const polaridadVal = (isStructured && !promptOptions.includePolaridad)
        ? ""
        : polaridad;

      const tipologiaVal = (isStructured && !promptOptions.includeTipologia)
        ? ""
        : tipologia;

      const soporteVal = (isStructured && !promptOptions.includeSoporte)
        ? ""
        : soporte;

      const iluminacionVal = (isStructured && !promptOptions.includeSoporte && !promptOptions.includePolaridad)
        ? ""
        : iluminacion;

      const tonoVal = (isStructured && !promptOptions.includeTono)
        ? ""
        : tono;

      const procesoVal = (isStructured && !promptOptions.includeTecnica)
        ? ""
        : proceso;

      let coverageParts: string[] = [];
      if (!isStructured || promptOptions.includeUbicacion || promptOptions.includeCiudadPais) {
        if (res.ubicacion_estimada && res.ubicacion_estimada !== "No solicitado") {
          coverageParts.push(res.ubicacion_estimada);
        }
      }
      if (!isStructured || promptOptions.includeCoordenadas) {
        if (res.coordenadas && res.coordenadas.lat !== 0 && res.coordenadas.lng !== 0) {
          coverageParts.push(`(${res.coordenadas.lat}, ${res.coordenadas.lng})`);
        }
      }
      const coverageVal = coverageParts.join(" ");

      let row: string[];
      if (formatType === 'cb') {
        row = [
          objectId,
          item.name,
          cleanTitle,
          "image/jpeg",
          subjectVal,
          creatorVal,
          dateVal,
          descriptionVal,
          "",
          locationVal,
          latVal,
          lngVal,
          "Descripción de fotografías de archivo con IA",
          item.id,
          "Image;StillImage",
          "",
          "es",
          "",
          "http://rightsstatements.org/vocab/NoC-US/1.0/",
          polaridadVal,
          tipologiaVal,
          soporteVal,
          iluminacionVal,
          tonoVal,
          procesoVal
        ];
      } else {
        row = [
          cleanTitle,
          creatorVal,
          subjectVal,
          descriptionVal,
          dateVal,
          coverageVal,
          "image/jpeg",
          `${res.confianza}%`,
          res.justificacion,
          (isStructured && !promptOptions.includeTecnica && !promptOptions.includeTipologia && !promptOptions.includeSoporte && !promptOptions.includePolaridad && !promptOptions.includeTono && !promptOptions.includeOtrosElementos && !promptOptions.includeFabricante) ? "" : res.descripcion_material
        ];
      }
      rows.push(row);
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(field => {
          const escaped = (field || "").replace(/"/g, '""');
          if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
            return `"${escaped}"`;
          }
          return escaped;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filenamePrefix}${Date.now()}.csv`);
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
            <Archive className="w-6 h-6 text-primary animate-pulse" />
            <h1 className="text-xl font-heading font-bold tracking-tight">Descripción de fotografías de archivo con IA</h1>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setTempActiveType(activeKeyType);
                setShowSettings(true);
              }} 
              className={`text-xs uppercase font-mono tracking-tighter h-8 border-border/60 ${!getApiKey() ? 'text-red-500 animate-pulse border-red-500/30' : 'hover:bg-accent hover:text-accent-foreground'}`}
            >
              <Settings className="w-3 h-3 mr-1" /> Configurar Llaves API ({activeKeyType === 'free' ? 'Gratis' : 'Pago'})
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setTempPrompt(editablePrompt);
                setTempPromptMode(promptMode);
                setTempPromptOptions(promptOptions);
                setShowPromptModal(true);
              }} 
              className="text-xs uppercase font-mono tracking-tighter h-8 text-amber-500 hover:text-amber-400 hover:bg-amber-500/5"
            >
              <FileCode className="w-3 h-3 mr-1" /> Ver Prompt
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} className="text-xs uppercase font-mono tracking-tighter">
              <Trash2 className="w-3 h-3 mr-1" /> Limpiar Todo
            </Button>

            {items.some(it => it.result !== null) && (
              <div className="relative">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowAllExportDropdown(!showAllExportDropdown)} 
                  className="text-xs uppercase font-mono tracking-tighter h-8 text-emerald-500 hover:text-emerald-400 font-semibold animate-in fade-in zoom-in duration-300"
                >
                  <Download className="w-3 h-3 mr-1" /> Exportar Lote
                  <ChevronDown className={`w-3 h-3 ml-1 transition-transform duration-200 ${showAllExportDropdown ? 'rotate-180' : ''}`} />
                </Button>
                
                <AnimatePresence>
                  {showAllExportDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowAllExportDropdown(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-20 overflow-hidden"
                      >
                        <div className="p-1 flex flex-col text-left">
                          <div className="px-2 py-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40 mb-1">
                            Exportar Lote Completo ({items.filter(it => it.result !== null).length})
                          </div>
                          <button
                            onClick={() => {
                              exportAllToCSV('dc');
                              setShowAllExportDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs rounded hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5"
                          >
                            <span className="font-medium text-foreground">Formato Dublin Core</span>
                            <span className="text-[10px] text-muted-foreground">Estándar (dc:title, dc:creator, etc.)</span>
                          </button>
                          <button
                            onClick={() => {
                              exportAllToCSV('cb');
                              setShowAllExportDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs rounded hover:bg-accent hover:text-accent-foreground transition-colors border-t border-border/40 mt-1 pt-2 flex flex-col gap-0.5"
                          >
                            <span className="font-medium text-primary">Collection Builder</span>
                            <span className="text-[10px] text-muted-foreground">Estructura optimizada (prefijo cb:)</span>
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Header elements completed */}
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
              
              <div className="px-4 pb-3">
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input 
                    type="text"
                    placeholder="Búsqueda en catálogo (por nombre, época, material...)" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 font-mono text-[10px] h-8 bg-background/50 border-border/40 focus-visible:ring-primary/40 focus-visible:ring-1"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 text-muted-foreground hover:text-foreground text-[12px] font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <CardContent className="p-0">
                <ScrollArea className="h-[396px] px-4">
                  <div className="space-y-2 pb-4">
                    <AnimatePresence initial={false}>
                      {items.map((item, idx) => ({ item, idx })).filter(({ item }) => {
                        if (!searchQuery) return true;
                        const query = searchQuery.toLowerCase();
                        const nameMatch = (item.name || "").toLowerCase().includes(query);
                        const descMatch = (item.result?.descripcion || "").toLowerCase().includes(query);
                        const keywordsMatch = item.result?.descriptores?.some(d => (d || "").toLowerCase().includes(query)) || false;
                        const locationMatch = (item.result?.ubicacion_estimada || "").toLowerCase().includes(query);
                        const processMatch = (item.result?.descripcion_material || "").toLowerCase().includes(query);
                        return nameMatch || descMatch || keywordsMatch || locationMatch || processMatch;
                      }).map(({ item, idx }) => (
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
                    {items.length > 0 && items.map((item, idx) => ({ item, idx })).filter(({ item }) => {
                      if (!searchQuery) return true;
                      const query = searchQuery.toLowerCase();
                      const nameMatch = (item.name || "").toLowerCase().includes(query);
                      const descMatch = (item.result?.descripcion || "").toLowerCase().includes(query);
                      const keywordsMatch = item.result?.descriptores?.some(d => (d || "").toLowerCase().includes(query)) || false;
                      const locationMatch = (item.result?.ubicacion_estimada || "").toLowerCase().includes(query);
                      const processMatch = (item.result?.descripcion_material || "").toLowerCase().includes(query);
                      return nameMatch || descMatch || keywordsMatch || locationMatch || processMatch;
                    }).length === 0 && (
                      <div className="py-20 text-center space-y-2 opacity-50">
                        <Search className="w-6 h-6 mx-auto text-muted-foreground" />
                        <p className="text-[10px] font-mono uppercase">Sin coincidencias</p>
                        <p className="text-[9px] text-muted-foreground">Pruebe con otros términos</p>
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

                    <div className="flex items-center gap-2 relative">
                       {currentItem.result && (
                         <div className="relative">
                           <Button 
                             variant="default" 
                             size="sm" 
                             onClick={() => setShowExportDropdown(!showExportDropdown)} 
                             className="h-8 text-xs flex items-center gap-1.5"
                           >
                             <Download className="w-3 h-3" /> 
                             Exportar Metadatos
                             <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} />
                           </Button>
                           
                           <AnimatePresence>
                             {showExportDropdown && (
                               <>
                                 {/* Overlay to close dropdown */}
                                 <div 
                                   className="fixed inset-0 z-10" 
                                   onClick={() => setShowExportDropdown(false)} 
                                 />
                                 <motion.div
                                   initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                   animate={{ opacity: 1, y: 0, scale: 1 }}
                                   exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                   transition={{ duration: 0.15 }}
                                   className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-20 overflow-hidden"
                                 >
                                   <div className="p-1 flex flex-col">
                                     <button
                                       onClick={() => {
                                         exportCurrentToCSV('dc');
                                         setShowExportDropdown(false);
                                       }}
                                       className="w-full text-left px-3 py-2 text-xs rounded hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5"
                                     >
                                       <span className="font-medium">Formato Dublin Core</span>
                                       <span className="text-[10px] text-muted-foreground">Estándar de biblioteca (dc:title, dc:creator)</span>
                                     </button>
                                     <button
                                       onClick={() => {
                                         exportCurrentToCSV('cb');
                                         setShowExportDropdown(false);
                                       }}
                                       className="w-full text-left px-3 py-2 text-xs rounded hover:bg-accent hover:text-accent-foreground transition-colors border-t border-border/40 mt-1 pt-2 flex flex-col gap-0.5"
                                     >
                                       <span className="font-medium text-primary">Collection Builder</span>
                                       <span className="text-[10px] text-muted-foreground">Estructura estática optimizada (prefijo cb:)</span>
                                     </button>
                                   </div>
                                 </motion.div>
                               </>
                             )}
                           </AnimatePresence>
                         </div>
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
                          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 text-center">
                            <div className="space-y-4 max-w-sm bg-card border border-destructive/25 p-5 rounded-lg shadow-xl">
                              <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
                              <div className="space-y-1">
                                <h4 className="text-xs font-mono uppercase tracking-widest text-destructive">Error en el Proceso</h4>
                                <p className="text-xs text-foreground/80 leading-relaxed font-sans">{currentItem.error}</p>
                              </div>
                              <div className="flex gap-2 justify-center">
                                <Button variant="outline" size="sm" onClick={() => analyzeImage(currentIndex!)}>
                                  Reintentar
                                </Button>
                                {(currentItem.error.includes("cuota") || currentItem.error.includes("API Key") || currentItem.error.includes("API_KEY_INVALID")) && (
                                  <Button variant="default" size="sm" onClick={() => setShowSettings(true)}>
                                    Configurar API Key
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>

                    <div className="space-y-4">
                      {currentItem.result ? (
                        promptMode === 'structured' ? (
                          (() => {
                            const tableRows = [];
                            
                            if (promptOptions.includeTitulo) {
                              tableRows.push({
                                campo: "Título Sugerido",
                                valor: currentItem.result.descriptores[0] || "No detectado",
                                icon: <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeDescripcion) {
                              tableRows.push({
                                campo: "Descripción Narrativa",
                                valor: currentItem.result.descripcion || "No detectado",
                                icon: <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includePalabrasClave) {
                              const tags = currentItem.result.descriptores.slice(1).filter(d => d && d !== "No solicitado");
                              tableRows.push({
                                campo: "Palabras Clave / Temas",
                                valor: tags.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {tags.map((tag, i) => (
                                      <Badge key={i} variant="secondary" className="text-[10px] py-0">{tag}</Badge>
                                    ))}
                                  </div>
                                ) : "No detectadas",
                                icon: <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeFecha) {
                              tableRows.push({
                                campo: "Época Estimada",
                                valor: currentItem.result.epoca_estimada || "No detectado",
                                icon: <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeUbicacion || promptOptions.includeCiudadPais) {
                              tableRows.push({
                                campo: "Ubicación Estimada",
                                valor: currentItem.result.ubicacion_estimada || "No detectada",
                                icon: <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeCoordenadas) {
                              tableRows.push({
                                campo: "Coordenadas Geográficas",
                                valor: (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-xs">{currentItem.result.coordenadas.lat}, {currentItem.result.coordenadas.lng}</span>
                                    {currentItem.result.coordenadas.lat !== 0 && (
                                      <Button 
                                        variant="link" 
                                        size="sm" 
                                        className="h-auto p-0 text-[10px] font-mono uppercase text-primary"
                                        onClick={() => window.open(`https://www.google.com/maps?q=${currentItem.result!.coordenadas.lat},${currentItem.result!.coordenadas.lng}`, '_blank')}
                                      >
                                        <Globe className="w-3 h-3 mr-1" /> Ver en Maps
                                      </Button>
                                    )}
                                  </div>
                                ),
                                icon: <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            const descMaterialLower = (currentItem.result.descripcion_material || "").toLowerCase();
                            
                            // Polaridad (Positivo / Negativo)
                            let polaridad = "Positivo";
                            if (descMaterialLower.includes("negativo")) {
                              polaridad = "Negativo";
                            }

                            // Tipología (Impresión, Diapositiva, Negativo, Tarjeta Postal, etc.)
                            let tipologia = "Impresión";
                            if (descMaterialLower.includes("postal") || currentItem.name.toLowerCase().includes("postcard") || currentItem.name.toLowerCase().includes("postal")) {
                              tipologia = "Tarjeta Postal";
                            } else if (descMaterialLower.includes("diapositiva")) {
                              tipologia = "Diapositiva";
                            } else if (descMaterialLower.includes("negativo")) {
                              tipologia = "Negativo";
                            }

                            // Soporte Físico (papel, metal, vidrio, o plastico)
                            let soporte = "papel";
                            if (descMaterialLower.includes("vidrio")) {
                              soporte = "vidrio";
                            } else if (descMaterialLower.includes("metal") || descMaterialLower.includes("daguerrotipo") || descMaterialLower.includes("ferrotipo")) {
                              soporte = "metal";
                            } else if (
                              descMaterialLower.includes("película") || 
                              descMaterialLower.includes("pelicula") || 
                              descMaterialLower.includes("acetato") || 
                              descMaterialLower.includes("nitrato") || 
                              descMaterialLower.includes("plástico") || 
                              descMaterialLower.includes("plastico") || 
                              descMaterialLower.includes("poliester") ||
                              descMaterialLower.includes("poliéster") ||
                              descMaterialLower.includes("film")
                            ) {
                              soporte = "plastico";
                            }

                            // Iluminación (Reflexión / Transmisión)
                            let iluminacion = "Reflexión";
                            if (soporte === "vidrio" || soporte === "plastico" || polaridad === "Negativo") {
                              iluminacion = "Transmisión";
                            }

                            // Tono (monocromática o policromática)
                            let tono = "monocromática";
                            if (descMaterialLower.includes("color") || descMaterialLower.includes("policrom") || descMaterialLower.includes("policromática") || descMaterialLower.includes("policromatica")) {
                              tono = "policromática";
                            }

                            // Proceso
                            let proceso = "Impresión plata gelatina de revelado";
                            if (descMaterialLower.includes("albúmina") || descMaterialLower.includes("albumina")) {
                              proceso = "Albúmina";
                            } else if (descMaterialLower.includes("daguerrotipo")) {
                              proceso = "Daguerrotipo";
                            } else if (descMaterialLower.includes("colodión") || descMaterialLower.includes("colodion")) {
                              proceso = "Colodión húmedo";
                            } else if (descMaterialLower.includes("cianotipo")) {
                              proceso = "Cianotipo";
                            } else if (descMaterialLower.includes("platino")) {
                              proceso = "Platinotipia";
                            } else {
                              const match = currentItem.result.descripcion_material.match(/^([^.,]+)/);
                              if (match && match[1] && match[1].length < 60) {
                                proceso = match[1].trim();
                              }
                            }

                            if (promptOptions.includeTecnica) {
                              tableRows.push({
                                campo: "Técnica / Proceso",
                                valor: proceso,
                                icon: <Film className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeTipologia) {
                              tableRows.push({
                                campo: "Tipología Fotográfica",
                                valor: tipologia,
                                icon: <Film className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeSoporte) {
                              tableRows.push({
                                campo: "Soporte Físico",
                                valor: soporte,
                                icon: <Film className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includePolaridad) {
                              tableRows.push({
                                campo: "Polaridad",
                                valor: polaridad,
                                icon: <Film className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeSoporte || promptOptions.includePolaridad) {
                              tableRows.push({
                                campo: "Iluminación",
                                valor: iluminacion,
                                icon: <Film className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeTono) {
                              tableRows.push({
                                campo: "Tono / Coloración",
                                valor: tono,
                                icon: <Film className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            if (promptOptions.includeOtrosElementos || promptOptions.includeFabricante) {
                              tableRows.push({
                                campo: "Detalles Materiales Adicionales",
                                valor: currentItem.result.descripcion_material || "No detectado",
                                icon: <Film className="w-3.5 h-3.5 text-muted-foreground" />
                              });
                            }
                            
                            tableRows.push({
                              campo: "Certidumbre del Análisis",
                              valor: (
                                <Badge 
                                  className={`text-[10px] font-mono uppercase tracking-tighter px-1.5 py-0 ${
                                    currentItem.result.confianza > 80 ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                                    currentItem.result.confianza > 50 ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' : 'bg-red-500/10 text-red-600 border-red-500/20'
                                  }`}
                                >
                                  {currentItem.result.confianza}%
                                </Badge>
                              ),
                              icon: <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                            });
                            
                            tableRows.push({
                              campo: "Justificación y Fuentes",
                              valor: (
                                <div className="text-xs leading-relaxed text-muted-foreground font-sans prose prose-xs prose-stone dark:prose-invert max-w-none prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
                                  <ReactMarkdown
                                    components={{
                                      a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline transition-colors decoration-blue-400 underline-offset-2" />
                                    }}
                                  >
                                    {currentItem.result.justificacion}
                                  </ReactMarkdown>
                                </div>
                              ),
                              icon: <Bookmark className="w-3.5 h-3.5 text-muted-foreground" />
                            });

                            return (
                              <div className="space-y-4">
                                <div className="border border-border/40 rounded-lg overflow-hidden bg-muted/10 shadow-sm">
                                  <div className="bg-muted/30 px-4 py-3 border-b border-border/40 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Archive className="w-4 h-4 text-primary" />
                                      <span className="text-xs font-mono uppercase tracking-widest text-foreground font-bold">Ficha de Catalogación Estructurada</span>
                                    </div>
                                    <Badge variant="outline" className="text-[8px] font-mono uppercase tracking-tighter px-1.5 py-0">#AI-TABLE</Badge>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-muted/20 border-b border-border/30">
                                          <th className="p-3 text-[9px] font-mono uppercase tracking-wider text-muted-foreground w-1/3">Campo</th>
                                          <th className="p-3 text-[9px] font-mono uppercase tracking-wider text-muted-foreground w-2/3">Valor Detectado</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/20">
                                        {tableRows.map((row, idx) => (
                                          <tr key={idx} className="hover:bg-muted/5 transition-colors">
                                            <td className="p-3 text-xs font-medium text-foreground/95 flex items-center gap-2">
                                              {row.icon}
                                              <span>{row.campo}</span>
                                            </td>
                                            <td className="p-3 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                                              {row.valor}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
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
                        )
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

                  {currentItem.result && promptMode !== 'structured' && (
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
              className="w-full max-w-lg"
            >
              <Card className="border-border/80 shadow-2xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" /> CONFIGURACIÓN DE LLAVES GEMINI
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Elige qué nivel de servicio deseas usar y configura tus llaves de API de forma segura en tu navegador.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Selector de Servicio Activo */}
                  <div className="space-y-2 border-b border-border/40 pb-4">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                      Tipo de Servicio Activo:
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 border border-border/30 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTempActiveType('free')}
                        className={`flex items-center justify-center gap-2 py-2.5 text-xs font-mono uppercase tracking-wider rounded-md transition-all ${
                          tempActiveType === 'free'
                            ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20 shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                        }`}
                      >
                        <Key className="w-3.5 h-3.5" /> Gratis (AI Studio)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempActiveType('paid')}
                        className={`flex items-center justify-center gap-2 py-2.5 text-xs font-mono uppercase tracking-wider rounded-md transition-all ${
                          tempActiveType === 'paid'
                            ? 'bg-blue-500/15 text-blue-400 font-bold border border-blue-500/20 shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Pago (Vertex AI)
                      </button>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-4">
                    {/* Clave Gratuita */}
                    <div className={`p-4 rounded-lg border transition-all ${tempActiveType === 'free' ? 'border-emerald-500/30 bg-emerald-500/5 shadow-inner' : 'border-border/40 bg-card/50 opacity-60'}`}>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium flex items-center gap-1.5 text-emerald-400">
                            <Key className="w-3.5 h-3.5" /> Llave Gratuita (Google AI Studio)
                          </label>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/20 text-emerald-400 font-mono">Recomendado</Badge>
                        </div>
                        <Input 
                          type="text"
                          placeholder="Ingresa tu clave gratuita (comienza con AIzaSy...)"
                          value={apiKeyInputFree}
                          onFocus={() => {
                            if (apiKeyInputFree.startsWith('*******')) {
                              setApiKeyInputFree('');
                            }
                          }}
                          onChange={(e) => setApiKeyInputFree(e.target.value)}
                          className="font-mono text-xs h-9 bg-background/50"
                        />
                        <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                          Para uso gratuito personal. Obtén tu clave en <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline text-primary inline-flex items-center gap-0.5 hover:text-primary/85">Google AI Studio <ExternalLink className="w-2.5 h-2.5" /></a> de forma inmediata.
                        </p>
                      </div>
                    </div>

                    {/* Clave de Pago */}
                    <div className={`p-4 rounded-lg border transition-all ${tempActiveType === 'paid' ? 'border-blue-500/30 bg-blue-500/5 shadow-inner' : 'border-border/40 bg-card/50 opacity-60'}`}>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium flex items-center gap-1.5 text-blue-400">
                          <CreditCard className="w-3.5 h-3.5" /> Llave de Pago (Vertex AI / Cloud Console)
                        </label>
                        <Input 
                          type="text"
                          placeholder="Ingresa tu clave de pago"
                          value={apiKeyInputPaid}
                          onFocus={() => {
                            if (apiKeyInputPaid.startsWith('*******')) {
                              setApiKeyInputPaid('');
                            }
                          }}
                          onChange={(e) => setApiKeyInputPaid(e.target.value)}
                          className="font-mono text-xs h-9 bg-background/50"
                        />
                        <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                          Para proyectos de producción o cuotas ilimitadas de pago por uso.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1 text-xs h-9 uppercase font-mono tracking-wider" onClick={saveSettings}>Guardar y Recargar</Button>
                    <Button variant="ghost" className="text-xs h-9 uppercase font-mono tracking-wider" onClick={() => setShowSettings(false)}>Cancelar</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}

        {showPromptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-2xl"
            >
              <Card className="border-amber-500/20 shadow-2xl bg-card">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2 text-amber-400">
                      <FileCode className="w-4 h-4" /> Instrucciones del Agente de Catalogación
                    </CardTitle>
                    <Badge variant="outline" className="border-amber-500/30 text-amber-400 font-mono text-[9px] px-1.5 py-0 h-4 uppercase">
                      Prompt de Sistema (Gemini)
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    Este es el prompt estructurado y las directrices precisas que se envían al modelo Gemini junto a cada imagen seleccionada para su catalogación. ¡Puedes editarlo para personalizar tus resultados!
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0 space-y-0">
                  {/* Mode Selector Toggle */}
                  <div className="p-4 border-b border-border/40 bg-muted/10">
                    <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 border border-border/35 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTempPromptMode('custom')}
                        className={`flex items-center justify-center gap-2 py-2 text-xs font-mono uppercase tracking-wider rounded-md transition-all ${
                          tempPromptMode === 'custom'
                            ? 'bg-amber-500 text-black font-semibold shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                        }`}
                      >
                        <FileCode className="w-3.5 h-3.5" /> Prompt General/Personalizado
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempPromptMode('structured')}
                        className={`flex items-center justify-center gap-2 py-2 text-xs font-mono uppercase tracking-wider rounded-md transition-all ${
                          tempPromptMode === 'structured'
                            ? 'bg-amber-500 text-black font-semibold shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                        }`}
                      >
                        <Settings className="w-3.5 h-3.5" /> Selección de Campos
                      </button>
                    </div>
                  </div>

                  <ScrollArea className="h-[420px] p-6">
                    {tempPromptMode === 'custom' ? (
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">Instrucción Principal (Prompt de Usuario):</span>
                            <Button 
                              variant="link" 
                              size="sm" 
                              className="text-[9px] uppercase font-mono tracking-wider text-amber-500 hover:text-amber-400 h-auto p-0"
                              onClick={() => setTempPrompt(ANALYSIS_PROMPT)}
                            >
                              Restaurar Predeterminado
                            </Button>
                          </div>
                          <textarea
                            value={tempPrompt}
                            onChange={(e) => setTempPrompt(e.target.value)}
                            className="w-full h-[260px] p-3 rounded-lg bg-background border border-border/80 text-xs font-mono leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-y"
                            placeholder="Modifica las directrices..."
                          />
                        </div>

                        <div className="space-y-2 pb-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">Esquema de Respuesta Requerido (JSON Output Schema):</span>
                          <div className="p-4 rounded-lg bg-muted/20 border border-border/30 text-[11px] font-mono text-muted-foreground/90 leading-relaxed overflow-x-auto select-text">
                            <pre>{JSON.stringify({
                              descripcion: "Descripción breve del contenido histórico.",
                              descriptores: ["descriptor1", "descriptor2", "descriptor3"],
                              ubicacion_estimada: "Nombre del lugar, región o ciudad.",
                              coordenadas: { lat: 0.0, lng: 0.0 },
                              epoca_estimada: "Época o año estimado de captura.",
                              autor_probable: "Fotógrafo o 'Anónimo'.",
                              confianza: 95,
                              justificacion: "Argumentos técnicos y referencias de catálogos en Markdown.",
                              descripcion_material: "Soporte, tipo de fotografía, fabricante de la película."
                            }, null, 2)}</pre>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Checkbox controls header */}
                        <div className="flex gap-4 justify-between items-center pb-3 border-b border-border/20">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Elementos de catalogación a incluir:</span>
                          <div className="flex gap-3">
                            <button 
                              type="button"
                              onClick={() => setTempPromptOptions({
                                includeTitulo: true,
                                includeDescripcion: true,
                                includePalabrasClave: true,
                                includeFecha: true,
                                includeUbicacion: true,
                                includeCiudadPais: true,
                                includeCoordenadas: true,
                                includeTecnica: true,
                                includeTipologia: true,
                                includeSoporte: true,
                                includePolaridad: true,
                                includeTono: true,
                                includeOtrosElementos: true,
                                includeFabricante: true,
                              })}
                              className="text-[10px] uppercase font-mono tracking-wider text-amber-500 hover:text-amber-400 transition-colors"
                            >
                              Activar Todos
                            </button>
                            <span className="text-border">|</span>
                            <button 
                              type="button"
                              onClick={() => setTempPromptOptions({
                                includeTitulo: false,
                                includeDescripcion: false,
                                includePalabrasClave: false,
                                includeFecha: false,
                                includeUbicacion: false,
                                includeCiudadPais: false,
                                includeCoordenadas: false,
                                includeTecnica: false,
                                includeTipologia: false,
                                includeSoporte: false,
                                includePolaridad: false,
                                includeTono: false,
                                includeOtrosElementos: false,
                                includeFabricante: false,
                              })}
                              className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Desactivar Todos
                            </button>
                          </div>
                        </div>

                        {/* Section 1: Contenido */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-mono uppercase tracking-widest text-amber-400/90 flex items-center gap-1.5 font-semibold">
                            <FileText className="w-3.5 h-3.5" /> Contenido e Identificación
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeTitulo} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeTitulo: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Título sugerido</span>
                                <span className="text-[10px] text-muted-foreground">Máximo 6 palabras</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeDescripcion} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeDescripcion: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Descripción narrativa</span>
                                <span className="text-[10px] text-muted-foreground">Extensión aproximada de 50 palabras</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includePalabrasClave} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includePalabrasClave: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Palabras clave / Temas</span>
                                <span className="text-[10px] text-muted-foreground">Tres frases descriptivas de temas clave</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeFecha} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeFecha: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Fecha estimada</span>
                                <span className="text-[10px] text-muted-foreground">Únicamente el año de captura</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeUbicacion} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeUbicacion: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Ubicación estimada</span>
                                <span className="text-[10px] text-muted-foreground">Lugar específico del acontecimiento</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeCiudadPais} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeCiudadPais: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Ciudad y país</span>
                                <span className="text-[10px] text-muted-foreground">Nombre de la ciudad y el país</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeCoordenadas} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeCoordenadas: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Coordenadas geográficas</span>
                                <span className="text-[10px] text-muted-foreground">Latitud y longitud decimal estimada</span>
                              </div>
                            </label>
                          </div>
                        </div>

                        {/* Section 2: Materialidad */}
                        <div className="space-y-3 pt-2">
                          <h4 className="text-xs font-mono uppercase tracking-widest text-amber-400/90 flex items-center gap-1.5 font-semibold">
                            <Film className="w-3.5 h-3.5" /> Materialidad y Soporte
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeTecnica} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeTecnica: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Técnica o proceso</span>
                                <span className="text-[10px] text-muted-foreground">Albúmina, plata gelatina, difusión de color, etc.</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeTipologia} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeTipologia: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Tipología fotográfica</span>
                                <span className="text-[10px] text-muted-foreground">Impresión, diapositiva, negativo o de cámara</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeSoporte} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeSoporte: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Soporte físico</span>
                                <span className="text-[10px] text-muted-foreground">Papel, metal, plástico o vidrio</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includePolaridad} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includePolaridad: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Polaridad</span>
                                <span className="text-[10px] text-muted-foreground">Positivo o negativo</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeTono} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeTono: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Tono</span>
                                <span className="text-[10px] text-muted-foreground">Monocroma o policroma</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeOtrosElementos} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeOtrosElementos: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Otros elementos analógicos</span>
                                <span className="text-[10px] text-muted-foreground">Rollo de 35mm, placa con muescas, marcos, etc.</span>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors select-none">
                              <input 
                                type="checkbox" 
                                checked={tempPromptOptions.includeFabricante} 
                                onChange={(e) => setTempPromptOptions(prev => ({ ...prev, includeFabricante: e.target.checked }))}
                                className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500/30 accent-amber-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">Fabricante y modelo de película</span>
                                <span className="text-[10px] text-muted-foreground">Solo si existen indicios, códigos o textos</span>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </ScrollArea>
                  
                  <div className="flex gap-2 p-4 border-t border-border/40 bg-muted/15 justify-end">
                    {tempPromptMode === 'custom' && (
                      <Button 
                        variant="outline" 
                        className="text-xs h-9 uppercase font-mono tracking-wider text-amber-400 border-amber-500/20 hover:bg-amber-500/5 hover:text-amber-300 mr-auto"
                        onClick={() => {
                          navigator.clipboard.writeText(tempPrompt);
                          setCopiedPrompt(true);
                          setTimeout(() => setCopiedPrompt(false), 2000);
                        }}
                      >
                        {copiedPrompt ? (
                          <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-emerald-500" /> ¡Copiado!</span>
                        ) : (
                          <span className="flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar</span>
                        )}
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      className="text-xs h-9 uppercase font-mono tracking-wider" 
                      onClick={() => setShowPromptModal(false)}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      variant="default" 
                      className="text-xs h-9 uppercase font-mono tracking-wider px-6 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                      onClick={() => {
                        setPromptMode(tempPromptMode);
                        setPromptOptions(tempPromptOptions);
                        setEditablePrompt(tempPrompt);
                        localStorage.setItem('CATALOG_PROMPT_MODE', tempPromptMode);
                        localStorage.setItem('CATALOG_PROMPT_OPTIONS', JSON.stringify(tempPromptOptions));
                        localStorage.setItem('CATALOG_USER_PROMPT', tempPrompt);
                        setShowPromptModal(false);
                      }}
                    >
                      Guardar y Aplicar
                    </Button>
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
