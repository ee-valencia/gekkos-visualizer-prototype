// src/hooks/useZarrTile.ts
import { useState, useCallback } from "react";
import { HTTPStore, openArray } from "zarr";
import { TILE_SIZE } from "../config";

export interface TileOpts {
  /** Dataset name, e.g. "TNE01" */
  dataset: string;
  /** Zarr level (0 = full-res, 1 = half-res, etc.) */
  level: number;
  /** "inline" or "crossline" */
  sliceType: "inline" | "crossline";
  /** Which inline/crossline index to slice at */
  sliceNumber: number;
  /** Horizontal tile index (0,1,2,…) */
  tileX: number;
  /** Vertical tile index (0,1,2,…) */
  tileY: number;
}

export interface TileResult {
  /** 2D array [row][col] of amplitudes */
  data: number[][];
  /** Pixel width = number of samples in X per tile */
  width: number;
  /** Pixel height = number of samples in Y per tile */
  height: number;
  /** Min / max within this tile (for local normalization) */
  min: number;
  max: number;
  /** Round-trip fetch time in ms */
  fetchTime: number;
}

export function useZarrTile() {
  const [result, setResult] = useState<TileResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTile = useCallback(async (opts: TileOpts) => {
    setLoading(true);
    setError(null);

    try {
      const { dataset, level, sliceType, sliceNumber, tileX, tileY } = opts;
      const api = import.meta.env.VITE_API_URL!;
      const base = `${api}/zarr/${dataset}/level_${level}/seismic`;
      const store = new HTTPStore(base, { cache: false });
      const arr = await openArray({ store, mode: "r", cache: false });

      const start = performance.now();

      // Calculate sample windows for this tile
      const yStart = tileY * TILE_SIZE;
      const yStop  = yStart + TILE_SIZE;
      const xStart = tileX * TILE_SIZE;
      const xStop  = xStart + TILE_SIZE;

      // Build the Zarr selector: [inline, crossline, sample]
      const sel =
        sliceType === "inline"
          ? [sliceNumber,
             { start: yStart, stop: yStop },
             { start: xStart, stop: xStop }] as const
          : [{ start: yStart, stop: yStop },
             sliceNumber,
             { start: xStart, stop: xStop }] as const;

      // @ts-ignore: sliceRaw has .shape and .data fields
      const sliceRaw: any = await arr.get(sel);

      // Unwrap an Array of TypedArray rows into a JS number[][]
      const rows  = sliceRaw.shape[0] as number;
      const cols  = sliceRaw.shape[1] as number;
      const tile2d: number[][] = (sliceRaw.data as ArrayBufferView[]).map(row =>
        Array.from(row as any)
      );

      // Compute tile stats
      const flat = tile2d.flat();
      const min  = Math.min(...flat);
      const max  = Math.max(...flat);
      const fetchTime = performance.now() - start;

      setResult({ data: tile2d, width: cols, height: rows, min, max, fetchTime });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, fetchTile };
}