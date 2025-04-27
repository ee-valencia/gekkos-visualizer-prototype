// src/components/TileCanvas.tsx
import { FC, useRef, useEffect, useState } from "react";
import * as zarr from "zarr";
import { TILE_SIZE } from "../config";

const { HTTPStore, openArray } = zarr;
// @ts-ignore slice helper exists at runtime
const zarrSlice: (start: number, stop: number) => any = (zarr as any).slice;

interface Props {
  dataset: string;
  level: number;
  sliceType: "inline" | "crossline";
  sliceNumber: number;
}

const TileCanvas: FC<Props> = ({ dataset, level, sliceType, sliceNumber }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  const [metrics, setMetrics] = useState({
    tilesLoaded: 0,
    totalFetchTime: 0,
    avgFetchTime: 0,
  });

  const [fullSize, setFullSize] = useState({ width: 1000, height: 1000 });

  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((z) => Math.min(5, Math.max(0.2, z * factor)));
    };
    const onDown = (e: MouseEvent) => {
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!panning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      panStart.current = { x: e.clientX, y: e.clientY };
      setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    };
    const onUp = () => setPanning(false);

    cont.addEventListener("wheel", onWheel, { passive: false });
    cont.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      cont.removeEventListener("wheel", onWheel);
      cont.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panning]);

  useEffect(() => {
    let canceled = false;

    (async () => {
      const api = import.meta.env.VITE_API_URL!;
      const base = `${api}/zarr/${dataset}/level_${level}/seismic`;
      const store = new HTTPStore(base, { cache: false });
      const arr = await openArray({ store, mode: "r", cache: false });

      const [nInline, nCrossline, nSample] = arr.shape as number[];
      const fullW = nSample;
      const fullH = sliceType === "inline" ? nCrossline : nInline;

      setFullSize({ width: fullH, height: fullW });

      const canvas = canvasRef.current;
      if (!canvas || canceled) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = fullH;
      canvas.height = fullW;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, fullH, fullW);

      ctx.scale(zoom, zoom);
      ctx.translate(offset.x, offset.y);

      const txMax = Math.ceil(fullW / TILE_SIZE);
      const tyMax = Math.ceil(fullH / TILE_SIZE);

      let count = 0, accum = 0;
      const tasks: Promise<void>[] = [];

      for (let tx = 0; tx < txMax; tx++) {
        for (let ty = 0; ty < tyMax; ty++) {
          tasks.push(
            (async () => {
              const t0 = performance.now();

              const sliceX0 = tx * TILE_SIZE;
              const sliceX1 = Math.min(sliceX0 + TILE_SIZE, fullW);
              const sliceY0 = ty * TILE_SIZE;
              const sliceY1 = Math.min(sliceY0 + TILE_SIZE, fullH);

              const sel =
                sliceType === "inline"
                  ? [sliceNumber, zarrSlice(sliceY0, sliceY1), zarrSlice(sliceX0, sliceX1)] as const
                  : [zarrSlice(sliceY0, sliceY1), sliceNumber, zarrSlice(sliceX0, sliceX1)] as const;

              // @ts-ignore
              const raw: any = await arr.get(sel);
              if (canceled) return;

              const rows = raw.data as ArrayBufferView[];
              const tileH = sliceY1 - sliceY0;
              const tileW = sliceX1 - sliceX0;

              const rotatedImg = ctx.createImageData(tileH, tileW);

              const flat = rows.flatMap((r) => Array.from(r as any) as number[]);
              const tileMin = Math.min(...flat);
              const tileMax = Math.max(...flat);

              for (let r = 0; r < tileH; r++) {
                const rowArr = Array.from(rows[r] as any) as number[];
                for (let c = 0; c < tileW; c++) {
                  const v = rowArr[c];
                  const n = Math.floor(((v - tileMin) / (tileMax - tileMin)) * 255);
                  const dstIdx = (c * tileH + r) * 4; // rotate 90°
                  rotatedImg.data[dstIdx] = n;
                  rotatedImg.data[dstIdx + 1] = n;
                  rotatedImg.data[dstIdx + 2] = n;
                  rotatedImg.data[dstIdx + 3] = 255;
                }
              }

              const drawX = ty * TILE_SIZE;
              const drawY = tx * TILE_SIZE;
              ctx.putImageData(rotatedImg, drawX, drawY);

              const dt = performance.now() - t0;
              count++;
              accum += dt;
            })()
          );
        }
      }

      await Promise.all(tasks);
      if (!canceled) {
        setMetrics({
          tilesLoaded: count,
          totalFetchTime: Math.round(accum),
          avgFetchTime: Math.round(accum / count),
        });
      }
    })();

    return () => {
      canceled = true;
    };
  }, [dataset, level, sliceType, sliceNumber, zoom, offset]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: 0,
        width: `${fullSize.width}px`,
        height: `${fullSize.height}px`,
        overflow: "auto",
        cursor: panning ? "grabbing" : "grab",
        backgroundColor: "#c6c6c6",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ touchAction: "none", userSelect: "none", display: "block" }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          padding: "6px 12px",
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          fontSize: 12,
          borderRadius: 4,
          pointerEvents: "none",
        }}
      >
        <div>Tiles: {metrics.tilesLoaded}</div>
        <div>Total fetch: {metrics.totalFetchTime} ms</div>
        <div>Avg tile: {metrics.avgFetchTime} ms</div>
      </div>
    </div>
  );
};

export default TileCanvas;