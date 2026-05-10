"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  doctorName: string;
  onLogout: () => void;
};

export default function Sidebar({ doctorName, onLogout }: Props) {
  const pathname = usePathname();
  const onPatients = pathname.startsWith("/patients");

  return (
    <aside
      className="flex flex-col shrink-0 h-screen sticky top-0 border-r"
      style={{
        width: "var(--sidebar-w)",
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--accent)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 1.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM7 4v3l2 1.5"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight" style={{ color: "var(--text-1)" }}>
            Patient Continuity
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <NavItem
          href="/patients"
          active={onPatients}
          icon={
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M7.5 1a3 3 0 100 6 3 3 0 000-6zM2 12.5C2 10 4.5 8.5 7.5 8.5S13 10 13 12.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          label="Patients"
        />
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t space-y-0.5" style={{ borderColor: "var(--border)" }}>
        <div
          className="px-3 py-2 rounded-lg text-xs truncate"
          style={{ color: "var(--text-3)" }}
        >
          {doctorName}
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-slate-50"
          style={{ color: "var(--text-2)" }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path
              d="M5.5 13H2.5a1 1 0 01-1-1V3a1 1 0 011-1h3M10 10.5l3-3-3-3M13 7.5H5.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
      style={
        active
          ? { background: "var(--accent-light)", color: "var(--accent-text)", fontWeight: 700 }
          : { color: "var(--text-2)" }
      }
    >
      {icon}
      {label}
    </Link>
  );
}
