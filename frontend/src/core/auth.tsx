import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, getToken, setToken } from "./api";
import type { AgencySession, PassengerUser, PlatformAdminUser } from "./types";

// Authentification multi-espaces totalement cloisonnée :
// - Passager (user)
// - Agence   (agencySession : liée à UNE agence et UN rôle précis)
// - Supervision VELTRON (platformAdmin)

interface AuthValue {
  // Espace Passager
  user: PassengerUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PassengerUser>;
  register: (data: { email: string; password: string; first_name: string; last_name: string; phone?: string }) => Promise<PassengerUser>;
  logout: () => void;

  // Espace Agence
  agencySession: AgencySession | null;
  agencyLoading: boolean;
  saveAgencyLogin: (token: string, session: AgencySession) => void;
  refreshAgency: () => Promise<void>;
  logoutAgency: () => void;

  // Espace Propriétaire VELTRON
  platformAdmin: PlatformAdminUser | null;
  platformLoading: boolean;
  loginPlatform: (email: string, password: string) => Promise<PlatformAdminUser>;
  logoutPlatform: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PassengerUser | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken("passenger")));

  const [agencySession, setAgencySession] = useState<AgencySession | null>(null);
  const [agencyLoading, setAgencyLoading] = useState(Boolean(getToken("agency")));

  const [platformAdmin, setPlatformAdmin] = useState<PlatformAdminUser | null>(null);
  const [platformLoading, setPlatformLoading] = useState(Boolean(getToken("platform")));

  useEffect(() => {
    if (getToken("passenger")) {
      api<PassengerUser>("/passenger/me", { realm: "passenger" })
        .then(setUser)
        .catch(() => setToken(null, "passenger"))
        .finally(() => setLoading(false));
    }
    if (getToken("agency")) {
      api<AgencySession>("/agency/me", { realm: "agency" })
        .then(setAgencySession)
        .catch(() => setToken(null, "agency"))
        .finally(() => setAgencyLoading(false));
    }
    if (getToken("platform")) {
      api<PlatformAdminUser>("/platform/me", { realm: "platform" })
        .then(setPlatformAdmin)
        .catch(() => setToken(null, "platform"))
        .finally(() => setPlatformLoading(false));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: PassengerUser }>("/passenger/auth/login", {
      body: { email, password },
      realm: null,
    });
    setToken(data.token, "passenger");
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (payload: { email: string; password: string; first_name: string; last_name: string; phone?: string }) => {
      const data = await api<{ token: string; user: PassengerUser }>("/passenger/auth/register", {
        body: payload,
        realm: null,
      });
      setToken(data.token, "passenger");
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const logout = useCallback(() => {
    api("/auth/logout", { method: "POST", body: {}, realm: "passenger" }).catch(() => {});
    setToken(null, "passenger");
    setUser(null);
  }, []);

  const saveAgencyLogin = useCallback((token: string, session: AgencySession) => {
    setToken(token, "agency");
    setAgencySession(session);
  }, []);

  const refreshAgency = useCallback(async () => {
    if (!getToken("agency")) return;
    const s = await api<AgencySession>("/agency/me", { realm: "agency" });
    setAgencySession(s);
  }, []);

  const logoutAgency = useCallback(() => {
    api("/auth/logout", { method: "POST", body: {}, realm: "agency" }).catch(() => {});
    setToken(null, "agency");
    setAgencySession(null);
  }, []);

  const loginPlatform = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: PlatformAdminUser }>("/platform/auth/login", {
      body: { email, password },
      realm: null,
    });
    setToken(data.token, "platform");
    setPlatformAdmin(data.user);
    return data.user;
  }, []);

  const logoutPlatform = useCallback(() => {
    api("/auth/logout", { method: "POST", body: {}, realm: "platform" }).catch(() => {});
    setToken(null, "platform");
    setPlatformAdmin(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      agencySession,
      agencyLoading,
      saveAgencyLogin,
      refreshAgency,
      logoutAgency,
      platformAdmin,
      platformLoading,
      loginPlatform,
      logoutPlatform,
    }),
    [
      user,
      loading,
      login,
      register,
      logout,
      agencySession,
      agencyLoading,
      saveAgencyLogin,
      refreshAgency,
      logoutAgency,
      platformAdmin,
      platformLoading,
      loginPlatform,
      logoutPlatform,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
