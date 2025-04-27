// src/hooks/useZarrSlice.ts
import { useState, useCallback } from "react";
import { HTTPStore, openArray } from "zarr";

export interface ZarrOpts {
  dataset: string;
  level: number;
  sliceType: "inline" | "crossline";
  sliceNumber: number;
}

export interface SliceResult {
  data: number[][];
  width: number;
  height: number;
  min: number;
  max: number;
  fetchTime: number;
}

export function useZarrSlice() {
  const [result, setResult] = useState<SliceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlice = useCallback(async (opts: ZarrOpts) => {
    setLoading(true);
    setError(null);

    try {
      const { dataset, level, sliceType, sliceNumber } = opts;
      const api = import.meta.env.VITE_API_URL!;
      const base = `${api}/zarr/${dataset}/level_${level}/seismic`;
      const store = new HTTPStore(base, { cache: false });
      const arr = await openArray({ store, mode: "r", cache: false });

      const start = performance.now();
      const sel =
        sliceType === "inline"
          ? [sliceNumber, null, null]
          : [null, sliceNumber, null] as const;

      // Pull down the raw Zarr slice
      // @ts-ignore
      const sliceRaw: any = await arr.get(sel);

      // LIGHTWEIGHT INSPECTION
      console.log("[useZarrSlice] shape:", sliceRaw.shape);
      console.log(
        "[useZarrSlice] data rows:", sliceRaw.data?.length,
        "row-length:", sliceRaw.data?.[0]?.length
      );

      // Unpack into a number[][]
      let slice2d: number[][];
      if (
        Array.isArray(sliceRaw.data) &&
        sliceRaw.data.length > 0 &&
        ArrayBuffer.isView(sliceRaw.data[0])
      ) {
        // Array of TypedArray rows
        slice2d = (sliceRaw.data as ArrayBufferView[]).map(row =>
          Array.from(row as any)
        );
      } else {
        throw new Error("Unexpected slice format");
      }

      // Stats and setResult
      const flat = slice2d.flat();
      setResult({
        data: slice2d,
        width: sliceRaw.shape[0],
        height: sliceRaw.shape[1],
        min: Math.min(...flat),
        max: Math.max(...flat),
        fetchTime: performance.now() - start,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, fetchSlice };
}