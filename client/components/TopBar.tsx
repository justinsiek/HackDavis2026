"use client";

import { ReactNode } from "react";

type Props = {
  doctorName: string;
  onLogout: () => void;
  leftAction?: ReactNode;
  rightActions?: ReactNode;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TopBar({ doctorName, onLogout, leftAction, rightActions }: Props) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between px-8 py-1 gap-4 bg-white"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Left: brand + optional page-specific left action */}
      <div className="flex items-center gap-5 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/clair-logo.png"
          alt="Clair"
          className="h-20 w-auto select-none -ml-2 shrink-0"
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

        {/* Identity: dark avatar circle + name + chevron */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white"
            style={{ background: "#0F172A" }}
            aria-hidden="true"
          >
            {initials(doctorName)}
          </div>
          <span
            className="inline-flex items-center gap-2"
            style={{ fontSize: 16, color: "#0F172A", fontWeight: 500 }}
          >
            {doctorName}
            <svg width="11" height="11" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path
                d="M2 4l3 3 3-3"
                stroke="#94A3B8"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        <span aria-hidden="true" style={{ width: 1, height: 14, background: "#E2E8F0" }} />
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
