"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function AvatarCropper({
  file,
  onCancel,
  onDone
}: {
  file: File;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function drawToCanvas(targetSize = 512) {
    return new Promise<string>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current || document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;
        const context = canvas.getContext("2d");
        if (!context) return resolve("");
        context.clearRect(0, 0, targetSize, targetSize);
        const base = Math.max(targetSize / image.width, targetSize / image.height) * scale;
        const width = image.width * base;
        const height = image.height * base;
        const x = (targetSize - width) / 2 + offsetX * targetSize * 0.35;
        const y = (targetSize - height) / 2 + offsetY * targetSize * 0.35;
        context.drawImage(image, x, y, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = imageUrl;
    });
  }

  async function save() {
    const dataUrl = await drawToCanvas();
    if (dataUrl) onDone(dataUrl);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <section className="modal-panel crop-modal" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button secondary modal-close" onClick={onCancel} type="button" aria-label="关闭">
          <X size={16} />
        </button>
        <h2 className="card-title">裁剪头像</h2>
        <div className="crop-frame">
          {imageUrl ? <img alt="待裁剪头像" src={imageUrl} style={{ transform: `translate(${offsetX * 35}%, ${offsetY * 35}%) scale(${scale})` }} /> : null}
        </div>
        <canvas ref={canvasRef} hidden />
        <div className="field">
          <label>左右</label>
          <input type="range" min={-1} max={1} step={0.01} value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
        </div>
        <div className="field">
          <label>上下</label>
          <input type="range" min={-1} max={1} step={0.01} value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
        </div>
        <div className="field">
          <label>缩放</label>
          <input type="range" min={1} max={2.8} step={0.01} value={scale} onChange={(event) => setScale(Number(event.target.value))} />
        </div>
        <div className="modal-actions">
          <button className="button secondary" onClick={onCancel} type="button">取消</button>
          <button className="button" onClick={save} type="button">保存头像</button>
        </div>
      </section>
    </div>
  );
}
