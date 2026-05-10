"use client";

import { ReactNode } from "react";

type Props = {
  doctorName: string;
  onLogout: () => void;
  leftAction?: ReactNode;
  rightActions?: ReactNode;
};

export default function TopBar({ doctorName, onLogout, leftAction, rightActions }: Props) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between bg-white px-6 py-2 gap-4"
      style={{
        borderBottom: "1px solid #E2E8F0",
      }}
    >
      {/* Left: brand + optional page-specific left action */}
      <div className="flex items-center gap-5 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/clair-logo.png"
          alt="Clair"
          className="h-12 w-auto select-none -ml-2 shrink-0"
          draggable={false}
        />
        {leftAction && <div className="flex items-center min-w-0">{leftAction}</div>}
      </div>

      {/* Right: optional actions + identity + sign out */}
      <div className="flex items-center gap-3 shrink-0">
        {rightActions && (
          <>
            <div className="flex items-center gap-2">{rightActions}</div>
            <span aria-hidden="true" style={{ width: 1, height: 16, background: "#E2E8F0" }} />
          </>
        )}
        <span style={{ fontSize: 13, color: "#475569" }}>{doctorName}</span>
        <span aria-hidden="true" style={{ width: 1, height: 16, background: "#E2E8F0" }} />
        <button
          type="button"
          onClick={onLogout}
          className="cursor-pointer transition-colors"
          style={{ fontSize: 13, color: "#94A3B8" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#0F172A")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
