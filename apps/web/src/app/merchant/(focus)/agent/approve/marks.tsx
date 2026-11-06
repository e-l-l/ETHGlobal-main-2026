"use client";

import type { ReactNode } from "react";
import { KeyValue, WorldMark } from "@/final";
import { useWorldView } from "@/lib/world-view";

type Rows = [ReactNode, ReactNode][];

export function ApproveMarks({ rows, publicRows }: { rows: Rows; publicRows: Rows }) {
  const wv = useWorldView();
  return (
    <div className="flex flex-col gap-3">
      <WorldMark kind="priv" show={wv}>
        <KeyValue rows={rows} />
      </WorldMark>
      <WorldMark kind="pub" show={wv}>
        <KeyValue rows={publicRows} />
      </WorldMark>
    </div>
  );
}
