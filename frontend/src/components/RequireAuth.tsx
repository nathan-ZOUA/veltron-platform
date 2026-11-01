import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../core/auth";

export default function RequireAuth({
  children,
  realm = "passenger",
}: {
  children: ReactNode;
  realm?: "passenger" | "agency";
}) {
  const { user, loading, agencySession, agencyLoading } = useAuth();
  const location = useLocation();

  if (realm === "agency") {
    if (agencyLoading) return <div className="container page"><div className="skeleton" style={{ height: 220 }} /></div>;
    if (!agencySession) return <Navigate to="/agence/connexion" replace />;
    return <>{children}</>;
  }

  if (loading) return <div className="container page"><div className="skeleton" style={{ height: 200 }} /></div>;
  if (!user) return <Navigate to={`/passager/connexion?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}
