// src/components/ControlsPanel.tsx
import { useState, FC } from "react";

export type CtrlOpts =
  | { type: "slice"; dataset: string; level: number; sliceType: "inline" | "crossline"; sliceNumber: number }
  | { type: "meta"; dataset: string };

interface Props {
  onChange: (opts: CtrlOpts) => void;
}

const ControlsPanel: FC<Props> = ({ onChange }) => {
  const datasets = ["Dutch_Government_F3", "GN1101_Scaled", "TNE01"];
  const [dataset, setDataset] = useState(datasets[0]);
  const [level, setLevel] = useState(0);
  const [sliceType, setSliceType] = useState<"inline" | "crossline">("inline");
  const [sliceNumber, setSliceNumber] = useState(0);

  return (
    <div style={{ marginBottom: 20 }}>
      <label>
        Dataset:&nbsp;
        <select value={dataset} onChange={e => setDataset(e.target.value)}>
          {datasets.map(ds => (
            <option key={ds} value={ds}>{ds}</option>
          ))}
        </select>
      </label>{" "}
      <label>
        Level:&nbsp;
        <input
          type="number" min={0} max={2}
          value={level}
          onChange={e => setLevel(Number(e.target.value))}
        />
      </label>{" "}
      <label>
        Type:&nbsp;
        <select
          value={sliceType}
          onChange={e => setSliceType(e.target.value as "inline" | "crossline")}
        >
          <option value="inline">Inline</option>
          <option value="crossline">Crossline</option>
        </select>
      </label>{" "}
      <label>
        Number:&nbsp;
        <input
          type="number" min={0}
          value={sliceNumber}
          onChange={e => setSliceNumber(Number(e.target.value))}
        />
      </label>{" "}
      <button onClick={() => onChange({ type: "slice", dataset, level, sliceType, sliceNumber })}>
        Load Slice
      </button>{" "}
      <button onClick={() => onChange({ type: "meta", dataset })}>
        Fetch Metadata
      </button>
    </div>
  );
};

export default ControlsPanel;