"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Doctor, getStoredDoctor, setStoredDoctor } from "./api";

type AuthContextValue = {
  doctor: Doctor | null;
  setDoctor: (doctor: Doctor | null) => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [doctor, setDoctorState] = useState<Doctor | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setDoctorState(getStoredDoctor());
    setIsLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      doctor,
      isLoading,
      setDoctor: (d) => {
        setStoredDoctor(d);
        setDoctorState(d);
      },
    }),
    [doctor, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
