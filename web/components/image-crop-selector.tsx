"use client";

import { useRef, useState, useCallback, useEffect, type PointerEvent as ReactPointerEvent } from "react";

type Rect = { x: number; y: number; w: number; h: number };

export function ImageCropSelector({ src, onCrop }: { src: string; onCrop: (canvas: HTMLCanvasElement) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const originRef = useRef({ x: 0, y: 0 });

  function getPos(e: ReactPointerEvent) {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const r = img.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const onDown = useCallback((e: ReactPointerEvent) => {
    const p = getPos(e);
    originRef.current = p;
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onMove = useCallback((e: ReactPointerEvent) => {
    if (!dragging) return;
    const p = getPos(e);
    const o = originRef.current;
    setRect({
      x: Math.min(o.x, p.x),
      y: Math.min(o.y, p.y),
      w: Math.abs(p.x - o.x),
      h: Math.abs(p.y - o.y)
    });
  }, [dragging]);

  const onUp = useCallback(() => setDragging(false), []);

  function doCrop() {
    const img = imgRef.current;
    if (!img || !rect || rect.w < 10 || rect.h < 10) return;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const canvas = document.createElement("canvas");
    canvas.width = rect.w * scaleX;
    canvas.height = rect.h * scaleY;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, rect.x * scaleX, rect.y * scaleY, rect.w * scaleX, rect.h * scaleY, 0, 0, canvas.width, canvas.height);
    onCrop(canvas);
  }

  return (
    <div className="crop-container">
      <div ref={containerRef} className="crop-image-wrap" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <img ref={imgRef} src={src} alt="待裁剪" className="crop-image" draggable={false} />
        {rect && rect.w > 5 ? (
          <div className="crop-rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
        ) : null}
      </div>
      <div className="crop-actions">
        <button className="button" disabled={!rect || rect.w < 10} onClick={doCrop} type="button">裁剪并分析</button>
      </div>
    </div>
  );
}
