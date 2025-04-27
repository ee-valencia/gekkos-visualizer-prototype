// src/pages/VisualizerPage.tsx
import React, { useState } from "react";
import ControlsPanel, { CtrlOpts } from "../components/ControlsPanel";
import TileCanvas from "../components/TileCanvas";

const VisualizerPage: React.FC = () => {
  const [sliceOpts, setSliceOpts] =
    useState<Extract<CtrlOpts, { type: "slice" }> | null>(null);

  const handleControlsChange = (opts: CtrlOpts) => {
    if (opts.type === "slice") {
      setSliceOpts(opts);
    } else {
      // metadata branch (unchanged)
      fetch(
        `${import.meta.env.VITE_API_URL}/zarr/${opts.dataset}/geo_metadata.json`
      )
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(meta => console.log("Metadata:", meta))
        .catch(err => console.error("Metadata error:", err));
      setSliceOpts(null);
    }
  };

  return (
    <div style={{ padding: 20, top: "0px", position: "absolute", alignContent: "center"}}>
      <h1>Seismic Visualizer Prototype</h1>
      <p>Select dataset, level, slice type & number.</p>

      <ControlsPanel onChange={handleControlsChange} />

      {sliceOpts && (
        <TileCanvas
          dataset={sliceOpts.dataset}
          level={sliceOpts.level}
          sliceType={sliceOpts.sliceType}
          sliceNumber={sliceOpts.sliceNumber}
        />
      )}
    </div>
  );
};

export default VisualizerPage;