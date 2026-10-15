"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Stage,
  Layer,
  Rect,
  Line,
  Group,
  Transformer,
  Image as KonvaImage,
} from "react-konva";
import { KonvaEventObject } from "konva/lib/Node";
import useImage from "use-image";
import { v4 as uuidv4 } from "uuid";
import { Upload, Trash2, BringToFront, SendToBack, Undo2 } from "lucide-react"; // Ícones do Lucide
import { jsPDF } from "jspdf";
import localforage from "localforage";

// 1. Definição da estrutura de dados de cada recorte
export interface JournalItem {
  id: string;
  src: string;
  srcTransparent?: string | null; // Usaremos na Etapa 4
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

// 2. Componente encapsulado para carregar e renderizar imagens
const URLImage = ({
  item,
  isSelected,
  onSelect,
  onChange,
  paperWidth,
  paperHeight,
}: {
  item: JournalItem;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (newAttrs: any) => void;
  paperWidth: number;
  paperHeight: number;
}) => {
  const [img] = useImage(item.srcTransparent || item.src);
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const SNAP_THRESHOLD = 15; // Distância de atração em pixels
  const SNAP_SIZE = 25; // Grade padrão de fallback

  // Função avançada para aplicar o snap na movimentação e no redimensionamento
  const applySnapping = (
    x: number,
    y: number,
    width: number,
    height: number,
    isResizing = false,
  ) => {
    let snappedX = x;
    let snappedY = y;
    let snappedWidth = width;
    let snappedHeight = height;

    // --- SNAP VERTICAL (Eixo X) ---
    const itemLeft = x;
    const itemRight = x + width;

    const distToLeftBorder = Math.abs(itemLeft - 0);
    const distToRightBorder = Math.abs(itemRight - paperWidth);
    const distToCenter = Math.abs(itemLeft - paperWidth / 2);
    const distToRightCenter = Math.abs(itemRight - paperWidth / 2);

    if (distToLeftBorder < SNAP_THRESHOLD) {
      if (isResizing) {
        // Se estiver redimensionando e chegar na borda esquerda, o x vira zero e a largura se ajusta
        snappedX = 0;
        snappedWidth = width + (x - 0);
      } else {
        snappedX = 0;
      }
    } else if (distToRightBorder < SNAP_THRESHOLD) {
      if (isResizing) {
        // Cola a largura na borda direita
        snappedWidth = paperWidth - x;
      } else {
        snappedX = paperWidth - width;
      }
    } else if (distToCenter < SNAP_THRESHOLD) {
      if (isResizing) {
        snappedX = paperWidth / 2;
        snappedWidth = width + (x - paperWidth / 2);
      } else {
        snappedX = paperWidth / 2;
      }
    } else if (distToRightCenter < SNAP_THRESHOLD) {
      if (isResizing) {
        snappedWidth = paperWidth / 2 - x;
      } else {
        snappedX = paperWidth / 2 - width;
      }
    } else if (!isResizing) {
      // Snap padrão da grade só se não estivermos redimensionando
      snappedX = Math.round(x / SNAP_SIZE) * SNAP_SIZE;
    }

    // --- SNAP HORIZONTAL (Eixo Y) ---
    const itemTop = y;
    const itemBottom = y + height;

    const distToTopBorder = Math.abs(itemTop - 0);
    const distToBottomBorder = Math.abs(itemBottom - paperHeight);

    if (distToTopBorder < SNAP_THRESHOLD) {
      if (isResizing) {
        snappedY = 0;
        snappedHeight = height + (y - 0);
      } else {
        snappedY = 0;
      }
    } else if (distToBottomBorder < SNAP_THRESHOLD) {
      if (isResizing) {
        snappedHeight = paperHeight - y;
      } else {
        snappedY = paperHeight - height;
      }
    } else if (!isResizing) {
      snappedY = Math.round(y / SNAP_SIZE) * SNAP_SIZE;
    }

    return {
      x: snappedX,
      y: snappedY,
      width: snappedWidth,
      height: snappedHeight,
    };
  };

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  // Função auxiliar para lidar com as proporções no redimensionamento
  const handleTransforming = (e: KonvaEventObject<any>) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Calcula as dimensões com base na escala atual da ação
    const currentWidth = node.width() * scaleX;
    const currentHeight = node.height() * scaleY;

    // Aplica o ímã de bordas considerando que o elemento está sendo "esticado"
    const { x, y, width, height } = applySnapping(
      node.x(),
      node.y(),
      currentWidth,
      currentHeight,
      true, // Ativa a lógica específica para redimensionamento
    );

    // Ajusta o nó no canvas em tempo real
    node.x(x);
    node.y(y);
    // Para manter a consistência, dividimos de volta a largura snapping pela escala de renderização
    node.width(width / scaleX);
    node.height(height / scaleY);
  };

  return (
    <React.Fragment>
      <KonvaImage
        ref={shapeRef}
        image={img}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rotation={item.rotation}
        scaleX={item.scaleX}
        scaleY={item.scaleY}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={(e) => {
          const node = e.target;
          const { x, y } = applySnapping(
            node.x(),
            node.y(),
            item.width * item.scaleX,
            item.height * item.scaleY,
            false,
          );
          node.x(x);
          node.y(y);
        }}
        onDragEnd={(e) => {
          const node = e.target;
          const { x, y } = applySnapping(
            node.x(),
            node.y(),
            item.width * item.scaleX,
            item.height * item.scaleY,
            false,
          );

          node.position({ x, y });
          node.getLayer()?.batchDraw();

          onChange({
            ...item,
            x,
            y,
          });
        }}
        onTransform={handleTransforming} // SNAP EM TEMPO REAL DURANTE O RESIZE
        onTransformEnd={() => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          node.scaleX(1);
          node.scaleY(1);

          const rawWidth = node.width() * scaleX;
          const rawHeight = node.height() * scaleY;

          // Aplica o snap definitivo para corrigir qualquer pequena imperfeição ao soltar o mouse
          const { x, y, width, height } = applySnapping(
            node.x(),
            node.y(),
            rawWidth,
            rawHeight,
            true,
          );

          node.position({ x, y });
          node.width(width);
          node.height(height);
          node.getLayer()?.batchDraw();

          onChange({
            ...item,
            x,
            y,
            rotation: node.rotation(),
            width,
            height,
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 10 || newBox.height < 10) return oldBox;
            return newBox;
          }}
        />
      )}
    </React.Fragment>
  );
};

const SizePanel = ({
  selectedItem,
  items,
  selectedId,
  handleUpdateItems,
}: any) => {
  // Guarda o texto exato que o usuário está digitando (permite vírgulas e strings vazias)
  const [localW, setLocalW] = useState(
    (selectedItem.width / 40).toFixed(1).replace(".", ","),
  );
  const [localH, setLocalH] = useState(
    (selectedItem.height / 40).toFixed(1).replace(".", ","),
  );
  const [isFocused, setIsFocused] = useState(false);

  // Sincroniza se a imagem for arrastada/redimensionada pelo mouse (só se não estiver digitando)
  useEffect(() => {
    if (!isFocused) {
      setLocalW((selectedItem.width / 40).toFixed(1).replace(".", ","));
      setLocalH((selectedItem.height / 40).toFixed(1).replace(".", ","));
    }
  }, [selectedItem.width, selectedItem.height, isFocused]);

  const applyChange = (dimension: "width" | "height", val: string) => {
    if (dimension === "width") setLocalW(val);
    else setLocalH(val);

    // Converte a vírgula brasileira para o ponto matemático do JavaScript
    const num = parseFloat(val.replace(",", "."));

    // Se estiver vazio ou for inválido, apenas aceita a digitação, mas não altera o Canvas ainda
    if (isNaN(num) || num <= 0) return;

    const aspectRatio = selectedItem.width / selectedItem.height;
    let newPxWidth = selectedItem.width;
    let newPxHeight = selectedItem.height;

    if (dimension === "width") {
      newPxWidth = num * 40;
      newPxHeight = newPxWidth / aspectRatio;
    } else {
      newPxHeight = num * 40;
      newPxWidth = newPxHeight * aspectRatio;
    }

    const newItems = items.map((item: any) =>
      item.id === selectedId
        ? { ...item, width: newPxWidth, height: newPxHeight }
        : item,
    );
    handleUpdateItems(newItems);
  };

  return (
    <div className="mb-2">
      <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-1 block">
        Tamanho da Impressão (cm)
      </span>
      <div className="bg-black/40 border border-white/5 p-2 rounded text-xs text-gray-300 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="w-5 text-center font-bold text-gray-500">L:</label>
          <input
            type="text"
            value={localW}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => applyChange("width", e.target.value)}
            className="w-full bg-white/10 text-white rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
          />
          <span className="w-4 text-gray-500">cm</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="w-5 text-center font-bold text-gray-500">A:</label>
          <input
            type="text"
            value={localH}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => applyChange("height", e.target.value)}
            className="w-full bg-white/10 text-white rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
          />
          <span className="w-4 text-gray-500">cm</span>
        </div>
        <span className="text-[9px] text-gray-500 text-center mt-1">
          *Proporção mantida
        </span>
      </div>
    </div>
  );
};

// 3. O Editor Principal
export default function CanvasEditor() {
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(0.8);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Estado das imagens no Canvas
  const [items, setItems] = useState<JournalItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<JournalItem[]>([]);
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [history, setHistory] = useState<JournalItem[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  const PAPER_WIDTH = 297 * 4;
  const PAPER_HEIGHT = 210 * 4;

  const handleUpdateItems = (newItems: JournalItem[]) => {
    setItems(newItems);

    // Apaga os "futuros" caso o usuário tenha desfeito algo e faça uma nova ação
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newItems);

    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  // 1. LOAD: Busca os dados ao montar o componente
  useEffect(() => {
    const loadSavedJournal = async () => {
      try {
        const savedItems =
          await localforage.getItem<JournalItem[]>("journal_spread");
        if (savedItems && savedItems.length > 0) {
          setItems(savedItems);
          setHistory([savedItems]);
          setHistoryStep(0);
        }
      } catch (error) {
        console.error("Erro ao carregar do IndexedDB:", error);
      } finally {
        setIsLoaded(true); // Libera a permissão de salvamento
      }
    };

    loadSavedJournal();
  }, []);

  // 2. SAVE: Atualiza o banco sempre que o array 'items' for mutado
  useEffect(() => {
    // Só salva se o load inicial já tiver terminado para não sobrescrever com array vazio
    if (isLoaded) {
      localforage
        .setItem("journal_spread", items)
        .catch((err) => console.error("Erro ao salvar no IndexedDB:", err));
    }
  }, [items, isLoaded]);

  useEffect(() => {
    const updateSize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    updateSize();
    window.addEventListener("resize", updateSize);
    setPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const gridLines = useMemo(() => {
    const lines = [];
    const gridExtent = 5000;
    for (let i = -gridExtent; i < gridExtent; i += 50) {
      lines.push(
        <Line
          key={`v-${i}`}
          points={[i, -gridExtent, i, gridExtent]}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />,
      );
      lines.push(
        <Line
          key={`h-${i}`}
          points={[-gridExtent, i, gridExtent, i]}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />,
      );
    }
    return lines;
  }, []);

  const dotPattern = useMemo(() => {
    if (typeof window === "undefined") return undefined;

    // 5mm de distância física = 20px de espaçamento no nosso Canvas
    const canvas = document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 20;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)"; // Cor do pontilhado
      ctx.beginPath();
      ctx.arc(10, 10, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
  }, []);

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    if (newScale < 0.1 || newScale > 5) return;
    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  // Função para tirar a seleção ao clicar no fundo
  const checkDeselect = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const clickedOnEmpty =
      e.target === e.target.getStage() || e.target.name() === "background";
    if (clickedOnEmpty) {
      setSelectedId(null);
    }
  };

  // Upload de Imagem convertido para Base64 local
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.src = src;
      img.onload = () => {
        // Redimensiona imagens gigantes para caber na tela inicialmente
        const maxWidth = 300;
        const ratio = img.width / img.height;
        const width = img.width > maxWidth ? maxWidth : img.width;
        const height = width / ratio;

        const newItem: JournalItem = {
          id: uuidv4(),
          src,
          x: -width / 2, // Inicia no centro do papel (pois o papel está em 0,0)
          y: -height / 2,
          width,
          height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        };
        handleUpdateItems([...items, newItem]);
        setSelectedId(newItem.id);
      };
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reseta o input
  };

  // Funções de UI (Z-Index e Deleção)
  const handleDelete = () => {
    handleUpdateItems(items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;

      // Deletar
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId !== null
      ) {
        e.preventDefault();
        handleUpdateItems(items.filter((item) => item.id !== selectedId));
        setSelectedId(null);
      }

      // Desfazer (Ctrl+Z)
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (historyStep > 0) {
          const previousStep = historyStep - 1;
          setItems(history[previousStep]);
          setHistoryStep(previousStep);
          setSelectedId(null);
        }
      }

      // Copiar (Ctrl+C)
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        if (selectedId !== null) {
          const itemToCopy = items.find((i) => i.id === selectedId);
          if (itemToCopy) setClipboard([itemToCopy]); // clipboard ainda usa array, o que está correto
        }
      }

      // Colar (Ctrl+V)
      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        if (clipboard.length > 0) {
          // Gera novos IDs e desloca 20px no eixo X e Y para dar o efeito visual de colagem
          const pastedItems = clipboard.map((item) => ({
            ...item,
            id: uuidv4(),
            x: item.x + 20,
            y: item.y + 20,
          }));

          handleUpdateItems([...items, ...pastedItems]);
          // Seleciona automaticamente os itens recém-colados
          setSelectedId(pastedItems[0].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, items, clipboard, history, historyStep]);

  const removeBackground = async () => {
    if (!selectedId) return;

    // Encontra o item atual
    const currentItem = items.find((i) => i.id === selectedId);
    if (!currentItem || currentItem.srcTransparent) return; // Evita recortar duas vezes

    setIsProcessingBg(true);

    try {
      // 1. Converte o Base64 nativamente para Blob (Evita falhas do fetch local)
      const base64Data = currentItem.src.split(",")[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/png" });

      // 2. Monta o formulário
      const formData = new FormData();
      formData.append("file", blob, "image.png");

      // 3. Dispara para o backend
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const apiRes = await fetch(`${API_URL}/api/remove-background`, {
        method: "POST",
        body: formData,
      });

      if (!apiRes.ok) throw new Error(`Falha na API: ${apiRes.status}`);

      const transparentBlob = await apiRes.blob();

      // Força a engine do JS a esperar a conversão assíncrona terminar antes de prosseguir
      const base64TransparentImage = await new Promise<string>(
        (resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) resolve(reader.result as string);
            else reject(new Error("Falha ao converter Blob para Base64"));
          };
          reader.onerror = () =>
            reject(new Error("Erro de leitura no FileReader"));
          reader.readAsDataURL(transparentBlob);
        },
      );

      // Atualiza o estado apenas quando a string Base64 estiver garantida na memória
      handleUpdateItems(
        items.map((item) =>
          item.id === selectedId
            ? { ...item, srcTransparent: base64TransparentImage }
            : item,
        ),
      );
    } catch (error) {
      console.error("Erro ao remover fundo:", error);
      alert("Erro ao conectar com o motor de recorte ou processar a imagem.");
    } finally {
      setIsProcessingBg(false);
    }
  };

  const exportToPDF = async () => {
    if (items.length === 0) return;

    setIsProcessingBg(true); // Reutilizamos o state para mostrar que está carregando

    try {
      // Cria um documento A4 padrão, medido em milímetros
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const PAGE_WIDTH = 210;
      const PAGE_HEIGHT = 297;
      const MARGIN = 10;
      const SPACING = 5; // Espaço de 5mm entre os adesivos para facilitar o corte com a tesoura

      let currentX = MARGIN;
      let currentY = MARGIN;
      let currentRowHeight = 0;

      for (const item of items) {
        // Conversão de Escala: (Largura Visual * Zoom do item) / 4 (nosso fator)
        const widthInMm = (item.width * item.scaleX) / 4;
        const heightInMm = (item.height * item.scaleY) / 4;

        // Se a imagem for mais larga que a própria página A4, forçamos ela a caber
        const finalWidth =
          widthInMm > PAGE_WIDTH - MARGIN * 2
            ? PAGE_WIDTH - MARGIN * 2
            : widthInMm;
        const finalHeight =
          widthInMm > PAGE_WIDTH - MARGIN * 2
            ? heightInMm * (finalWidth / widthInMm)
            : heightInMm;

        // Se bater na borda direita, desce uma "prateleira"
        if (currentX + finalWidth > PAGE_WIDTH - MARGIN) {
          currentX = MARGIN;
          currentY += currentRowHeight + SPACING;
          currentRowHeight = 0;
        }

        // Se bater no fim da folha, cria uma página nova
        if (currentY + finalHeight > PAGE_HEIGHT - MARGIN) {
          doc.addPage();
          currentX = MARGIN;
          currentY = MARGIN;
          currentRowHeight = 0;
        }

        // Precisamos converter o blob/base64 da imagem para injetar no PDF
        let imgSrc = item.srcTransparent || item.src;

        // Adiciona a imagem no PDF desconsiderando a rotação
        // Decisão técnica: Se imprimirmos elas retas (rotação 0), economizamos muito papel
        doc.addImage(
          imgSrc,
          "PNG",
          currentX,
          currentY,
          finalWidth,
          finalHeight,
        );

        // Prepara as coordenadas para o próximo adesivo
        currentX += finalWidth + SPACING;
        currentRowHeight = Math.max(currentRowHeight, finalHeight);
      }

      // Baixa o arquivo automaticamente
      doc.save("reading-journal-adesivos.pdf");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Ocorreu um erro ao gerar o arquivo de impressão.");
    } finally {
      setIsProcessingBg(false);
    }
  };

  const moveLayer = (direction: "up" | "down") => {
    if (!selectedId) return;
    const currentIndex = items.findIndex((i) => i.id === selectedId);
    if (currentIndex < 0) return;
    if (direction === "up" && currentIndex === items.length - 1) return;
    if (direction === "down" && currentIndex === 0) return;

    const newItems = [...items];
    const item = newItems.splice(currentIndex, 1)[0];
    newItems.splice(
      direction === "up" ? currentIndex + 1 : currentIndex - 1,
      0,
      item,
    );
    handleUpdateItems(newItems);
  };

  if (windowSize.width === 0) return null;

  return (
    <div className="relative w-full h-full bg-[#121212]">
      {/* TOOLBAR ESQUERDA */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3 bg-black/80 p-4 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl">
        <h1 className="text-white font-bold text-sm mb-2">Editor A4</h1>

        {/* Botão de Upload Customizado */}
        <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded cursor-pointer transition-colors">
          <Upload size={16} />
          Subir Imagem
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>

        {/* Ferramentas do Objeto Selecionado */}
        {selectedId && (
          <div className="flex flex-col gap-2 pt-3 border-t border-white/10">
            {/* NOVO: Painel de Informações de Tamanho */}
            {items.find((i) => i.id === selectedId) && (
              <SizePanel
                selectedItem={items.find((i) => i.id === selectedId)}
                items={items}
                selectedId={selectedId}
                handleUpdateItems={handleUpdateItems}
              />
            )}

            <span className="text-gray-400 text-[10px] uppercase tracking-wider mt-1 block">
              Ações
            </span>

            {/* Botões de Z-Index e Deleção (Mantém o seu código atual) */}
            <div className="flex gap-2">
              <button
                onClick={() => moveLayer("up")}
                title="Trazer para Frente"
                className="p-2 bg-white/5 hover:bg-white/10 text-white rounded transition-colors"
              >
                <BringToFront size={16} />
              </button>
              <button
                onClick={() => moveLayer("down")}
                title="Enviar para Trás"
                className="p-2 bg-white/5 hover:bg-white/10 text-white rounded transition-colors"
              >
                <SendToBack size={16} />
              </button>
              <button
                onClick={handleDelete}
                title="Deletar"
                className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded transition-colors ml-auto"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* O Botão de Recorte (Mantém o seu código atual) */}
            {items.find((i) => i.id === selectedId) &&
              !items.find((i) => i.id === selectedId)?.srcTransparent && (
                <button
                  onClick={removeBackground}
                  disabled={isProcessingBg}
                  className="mt-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white py-2 px-3 rounded transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessingBg ? "Processando (IA)..." : "🪄 Remover Fundo"}
                </button>
              )}

            {/* Restauração (Mantém o seu código atual) */}
            {items.find((i) => i.id === selectedId)?.srcTransparent && (
              <button
                onClick={() =>
                  setItems(
                    items.map((i) =>
                      i.id === selectedId ? { ...i, srcTransparent: null } : i,
                    ),
                  )
                }
                className="mt-2 text-xs border border-white/20 hover:bg-white/10 text-gray-300 py-1.5 px-3 rounded transition-colors"
              >
                Restaurar Fundo Original
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-3 border-t border-white/10 ">
          <button
            onClick={() => {
              if (historyStep > 0) {
                const previousStep = historyStep - 1;
                setItems(history[previousStep]);
                setHistoryStep(previousStep);
                setSelectedId(null);
              }
            }}
            disabled={historyStep === 0}
            title="Desfazer (Ctrl+Z)"
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 flex justify-center items-center disabled:opacity-30 disabled:hover:bg-white/10 text-white  rounded-xl transition-colors"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={exportToPDF}
            disabled={items.length === 0 || isProcessingBg}
            className=" flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg shadow-lg transition-colors"
          >
            {isProcessingBg ? "Gerando..." : "🖨️ Exportar para Imprimir (PDF)"}
          </button>
        </div>
      </div>

      <Stage
        width={windowSize.width}
        height={windowSize.height}
        draggable
        onWheel={handleWheel}
        onMouseDown={checkDeselect}
        onTouchStart={checkDeselect} // Touch para mobile
        x={position.x}
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        style={{ cursor: "grab" }}
      >
        <Layer>{gridLines}</Layer>

        <Layer>
          <Group x={-PAPER_WIDTH / 2} y={-PAPER_HEIGHT / 2}>
            {/* 1. Páginas Inferiores (Ilusão de volume e espessura do caderno) */}
            <Rect
              x={-4}
              y={4}
              width={PAPER_WIDTH + 8}
              height={PAPER_HEIGHT + 4}
              fill="#e0e0e0"
              cornerRadius={12}
              shadowColor="black"
              shadowBlur={25}
              shadowOpacity={0.3}
              shadowOffsetX={10}
              shadowOffsetY={15}
              listening={false}
            />
            <Rect
              x={-2}
              y={2}
              width={PAPER_WIDTH + 4}
              height={PAPER_HEIGHT + 2}
              fill="#eeeeee"
              cornerRadius={10}
              listening={false}
            />

            {/* 2. Folha Principal (Textura Papel Leuchtturm1917 / Moleskine) */}
            <Rect
              width={PAPER_WIDTH}
              height={PAPER_HEIGHT}
              fill="#F4F4F0" // Off-white mais confortável aos olhos
              cornerRadius={8}
              name="background"
            />

            {/* 3. Textura Bullet Journal (Dot Grid de 5mm) */}
            {dotPattern && (
              <Rect
                width={PAPER_WIDTH}
                height={PAPER_HEIGHT}
                fillPatternImage={dotPattern}
                cornerRadius={8}
                listening={false}
              />
            )}

            {/* 4. Iluminação da Lombada (Efeito 3D com Linear Gradient) */}
            <Rect
              x={PAPER_WIDTH / 2 - 40}
              y={0}
              width={80}
              height={PAPER_HEIGHT}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: 80, y: 0 }}
              fillLinearGradientColorStops={[
                0,
                "rgba(0,0,0,0)",
                0.3,
                "rgba(0,0,0,0.03)",
                0.5,
                "rgba(0,0,0,0.12)", // Sombra máxima no vinco
                0.7,
                "rgba(0,0,0,0.03)",
                1,
                "rgba(0,0,0,0)",
              ]}
              listening={false}
            />

            {/* 5. Linha de Costura da Encadernação */}
            <Line
              points={[PAPER_WIDTH / 2, 0, PAPER_WIDTH / 2, PAPER_HEIGHT]}
              stroke="rgba(0,0,0,0.1)"
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
          </Group>
        </Layer>

        {/* Camada das Imagens */}
        <Layer>
          <Group x={-PAPER_WIDTH / 2} y={-PAPER_HEIGHT / 2}>
            {items.map((item, i) => (
              <URLImage
                key={item.id}
                item={item}
                isSelected={item.id === selectedId}
                onSelect={() => setSelectedId(item.id)}
                onChange={(newAttrs) => {
                  const newItems = items.slice();
                  newItems[i] = newAttrs;
                  handleUpdateItems(newItems);
                }}
                paperWidth={PAPER_WIDTH}
                paperHeight={PAPER_HEIGHT}
              />
            ))}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
