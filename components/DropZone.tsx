"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  onFile: (contents: string, filename: string) => void;
  loading: boolean;
  stage: string;
  error: string | null;
};

export default function DropZone({ onFile, loading, stage, error }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      const text = await file.text();
      onFile(text, file.name);
    },
    [onFile],
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition ${
          dragging
            ? "border-neutral-900 bg-neutral-100"
            : "border-neutral-300 bg-white hover:border-neutral-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".json,.yaml,.yml,.py,.txt,.xml"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-sm font-medium text-neutral-800">
          Drop a protocol file, or click to browse
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Supports Autoprotocol JSON, canonical JSON, Opentrons Python, or
          free-text protocols (LLM-extracted)
        </p>
      </div>

      {loading && (
        <div className="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
          {stage || "Screening…"}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-risk-5 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}
    </div>
  );
}
