import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import PassengerLayout from "../components/PassengerLayout";
import AgencyLayout from "../components/AgencyLayout";
import RequireAuth from "../components/RequireAuth";

import Gateway from "../pages/Gateway";
import Home from "../pages/Home";
import Agencies from "../pages/Agencies";
import AgencyPage from "../pages/AgencyPage";
import TripBooking from "../pages/TripBooking";
import TicketPage from "../pages/TicketPage";
import MyTickets from "../pages/MyTickets";
import Tracking from "../pages/Tracking";
import BusRental from "../pages/BusRental";
import BusSales from "../pages/BusSales";
import LoyaltyPage from "../pages/LoyaltyPage";
import Auth from "../pages/Auth";

import AgencyHub from "../pages/AgencyHub";
import Partner from "../pages/Partner";
import AgencyLogin from "../pages/AgencyLogin";
import AgencyWorkspace from "../pages/AgencyWorkspace";
import Admin from "../pages/Admin";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />

      <Routes>
        {/* 1. Écran initial : demande immédiatement si le visiteur est Passager ou Agence */}
        <Route path="/" element={<Gateway />} />

        {/* 2. Univers Passager (totalement séparé des agences) */}
        <Route path="/passager" element={<PassengerLayout />}>
          <Route index element={<Home />} />
          <Route path="agences" element={<Agencies />} />
          <Route path="a/:slug" element={<AgencyPage />} />
          <Route path="reserver/:tripId" element={<TripBooking />} />
          <Route
            path="billet/:id"
            element={
              <RequireAuth realm="passenger">
                <TicketPage />
              </RequireAuth>
            }
          />
          <Route
            path="mes-billets"
            element={
              <RequireAuth realm="passenger">
                <MyTickets />
              </RequireAuth>
            }
          />
          <Route path="suivi" element={<Tracking />} />
          <Route path="location" element={<BusRental />} />
          <Route path="achat-bus" element={<BusSales />} />
          <Route path="fidelite" element={<LoyaltyPage />} />
          <Route path="connexion" element={<Auth />} />
        </Route>

        {/* 3. Univers Agence (totalement séparé des passagers, 6 comptes isolés + E2EE) */}
        <Route path="/agence" element={<AgencyLayout />}>
          <Route index element={<AgencyHub />} />
          <Route path="creer" element={<Partner />} />
          <Route path="connexion" element={<AgencyLogin />} />
          <Route
            path="espace"
            element={
              <RequireAuth realm="agency">
                <AgencyWorkspace />
              </RequireAuth>
            }
          />
        </Route>

        {/* 4. Console de Supervision Propriétaire VELTRON */}
        <Route path="/supervision" element={<Admin />} />

        {/* Redirections des anciennes URLs vers les nouveaux portails cloisonnés */}
        <Route path="/agences" element={<Navigate to="/passager/agences" replace />} />
        <Route path="/suivi" element={<Navigate to="/passager/suivi" replace />} />
        <Route path="/mes-billets" element={<Navigate to="/passager/mes-billets" replace />} />
        <Route path="/devenir-partenaire" element={<Navigate to="/agence/creer" replace />} />
        <Route path="/guichet" element={<Navigate to="/agence/espace" replace />} />
        <Route path="/admin" element={<Navigate to="/supervision" replace />} />
        <Route path="/connexion" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
