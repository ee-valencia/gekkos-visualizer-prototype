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
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const [zoom,    setZoom]    = useState(1);
  const [offset,  setOffset]  = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart  = useRef({ x: 0, y: 0 });

  const [metrics, setMetrics] = useState({
    tilesLoaded:    0,
    totalFetchTime: 0,
    avgFetchTime:   0,
  });

  // Pan & zoom event handlers
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(z => Math.min(5, Math.max(0.2, z * factor)));
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
      setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
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

  // Main effect: open Zarr & draw visible tiles
  useEffect(() => {
    let canceled = false;

    (async () => {
      const api  = import.meta.env.VITE_API_URL!;
      const base = `${api}/zarr/${dataset}/level_${level}/seismic`;
      const store = new HTTPStore(base, { cache: false });
      const arr   = await openArray({ store, mode: "r", cache: false });

      const [nInline, nCrossline, nSample] = arr.shape as number[];
      const fullW = nSample;
      const fullH = sliceType === "inline" ? nCrossline : nInline;

      const canvas = canvasRef.current;
      if (!canvas || canceled) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width  = fullW;
      canvas.height = fullH;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, fullW, fullH);
      ctx.setTransform(zoom, 0, 0, zoom, offset.x, offset.y);

      const viewW = canvas.parentElement!.clientWidth;
      const viewH = canvas.parentElement!.clientHeight;
      const invZ  = 1/zoom;
      const x0 = Math.floor(-offset.x * invZ / TILE_SIZE);
      const y0 = Math.floor(-offset.y * invZ / TILE_SIZE);
      const x1 = Math.ceil ((viewW  - offset.x) * invZ / TILE_SIZE);
      const y1 = Math.ceil ((viewH  - offset.y) * invZ / TILE_SIZE);
      const txMin = Math.max(0, x0);
      const tyMin = Math.max(0, y0);
      const txMax = Math.min(Math.ceil(fullW/TILE_SIZE), x1);
      const tyMax = Math.min(Math.ceil(fullH/TILE_SIZE), y1);

      let count = 0, accum = 0;
      const tasks: Promise<void>[] = [];

      for (let ty = tyMin; ty < tyMax; ty++) {
        for (let tx = txMin; tx < txMax; tx++) {
          tasks.push((async () => {
            const t0 = performance.now();
            const y0 = ty * TILE_SIZE;
            const y1 = Math.min(y0 + TILE_SIZE, fullH);
            const x0 = tx * TILE_SIZE;
            const x1 = Math.min(x0 + TILE_SIZE, fullW);

            const sel = sliceType === "inline"
              ? [ sliceNumber, zarrSlice(y0, y1), zarrSlice(x0, x1) ] as const
              : [ zarrSlice(y0, y1), sliceNumber, zarrSlice(x0, x1) ] as const;

            // @ts-ignore
            const raw: any = await arr.get(sel);
            if (canceled) return;

            const rows = raw.data as ArrayBufferView[];
            const h = y1 - y0, w = x1 - x0;
            const img = ctx.createImageData(w, h);

            const flat = rows.flatMap(r => Array.from(r as any) as number[]);
            const mn = Math.min(...flat), mx = Math.max(...flat);

            for (let r = 0; r < h; r++) {
              const rowArr = Array.from(rows[r] as any) as number[];
              for (let c = 0; c < w; c++) {
                const v = rowArr[c];
                const n = Math.floor(((v - mn)/(mx - mn))*255);
                const idx = (r*w + c)*4;
                img.data[idx]   = n;
                img.data[idx+1] = n;
                img.data[idx+2] = n;
                img.data[idx+3] = 255;
              }
            }

            ctx.putImageData(img, x0, y0);

            const dt = performance.now() - t0;
            count++; accum += dt;
          })());
        }
      }

      await Promise.all(tasks);
      if (!canceled) {
        setMetrics({
          tilesLoaded:    count,
          totalFetchTime: Math.round(accum),
          avgFetchTime:   Math.round(accum/count),
        });
      }
    })();

    return () => { canceled = true; };
  }, [dataset, level, sliceType, sliceNumber, zoom, offset]);

  return (
    <div
      ref={containerRef}
      style={{
        position:    "relative",
        width:       "100%",
        height:      "80vh",
        overflow:    "hidden",
        cursor:      panning ? "grabbing" : "grab",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ touchAction: "none", userSelect: "none", display: "block" }}
      />
      <div
        style={{
          position:      "absolute",
          top:           8,
          left:          8,
          padding:      "6px 12px",
          background:   "rgba(0,0,0,0.6)",
          color:        "#fff",
          fontSize:     12,
          borderRadius: 4,
          pointerEvents:"none",
        }}
      >
        <div>Tiles:      {metrics.tilesLoaded}</div>
        <div>Total fetch: {metrics.totalFetchTime} ms</div>
        <div>Avg tile:    {metrics.avgFetchTime} ms</div>
      </div>
    </div>
  );
};

export default TileCanvas;