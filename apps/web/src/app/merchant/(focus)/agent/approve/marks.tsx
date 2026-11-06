"use client";

import type { ReactNode } from "react";
import { KeyValue } from "@/final";

type Rows = [ReactNode, ReactNode][];

export function ApproveMarks({ rows, publicRows }: { rows: Rows; publicRows: Rows }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <KeyValue rows={rows} />
      </div>
      <div>
        <KeyValue rows={publicRows} />
      </div>
    </div>
  );
}
