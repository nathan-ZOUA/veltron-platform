import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { formatDay, formatMoney, formatTime } from "../core/format";
import type { AgencyRole } from "../core/types";
import Desk from "./Desk";
import AgencyChat from "./AgencyChat";
import Avatar from "../components/Avatar";
import SalesAnalyticsChart from "../components/SalesAnalyticsChart";
import FleetLiveOverview from "../components/FleetLiveOverview";
import BoardingCallWorkspace from "../components/BoardingCallWorkspace";
import SeatGrid, { GridSeat } from "../components/SeatGrid";

type TabId =
  | "overview"
  | "boarding"
  | "desk"
  | "fleet_live"
  | "trips"
  | "driver"
  | "analytics"
  | "fleet"
  | "commercial"
  | "staff"
  | "finance"
  | "chat"
  | "settings";

interface TabDef {
  id: TabId;
  label: string;
  roles: AgencyRole[];
}

const TABS: TabDef[] = [
  { id: "overview", label: "📊 Vue d’ensemble", roles: ["owner"] },
  { id: "fleet_live", label: "🗺️ Flotte & GPS en Direct", roles: ["owner"] },
  { id: "trips", label: "🗓️ Voyages & Reports", roles: ["owner", "manager"] },
  { id: "analytics", label: "📈 Diagramme des Ventes", roles: ["owner", "secretary", "accountant"] },
  { id: "fleet", label: "⚙️ Flotte & Lignes", roles: ["owner"] },
  { id: "commercial", label: "🤝 Location & Vente Bus", roles: ["owner"] },
  { id: "staff", label: "👥 Comptes & Postes Équipe", roles: ["owner"] },
  { id: "finance", label: "💳 Comptabilité", roles: ["owner", "accountant"] },
  { id: "desk", label: "🎫 Guichet (Vente & Billetterie)", roles: ["secretary"] },
  { id: "boarding", label: "📋 Appel des Passagers (Embarquement)", roles: ["staff"] },
  { id: "driver", label: "🚌 Espace Chauffeur", roles: ["driver"] },
  { id: "chat", label: "💬 Discussion d’Équipe", roles: ["owner", "manager", "secretary", "driver", "staff", "accountant"] },
  { id: "settings", label: "🛡️ Sécurité, Règles & Audit", roles: ["owner"] },
];

const ROLE_LABELS: Record<AgencyRole, string> = {
  owner: "Administrateur (Créateur)",
  manager: "Responsable Programmation",
  secretary: "Secrétaire",
  driver: "Chauffeur",
  staff: "Membre du personnel",
  accountant: "Comptable",
};

const MOOD_LABELS: Record<number, string> = {
  5: "😄 En pleine forme (5/5)",
  4: "🙂 Bien reposé (4/5)",
  3: "😐 Normal / Vigilant (3/5)",
  2: "😓 Un peu fatigué (2/5)",
  1: "⚠️ Besoin de repos (1/5)",
};

const AVAIL_LABELS: Record<string, string> = {
  available: "🟢 Disponible",
  on_trip: "🔵 En cours de trajet",
  resting: "🟠 En pause / repos",
  unavailable: "🔴 Indisponible",
  maintenance: "🔧 En maintenance",
};

const TRIP_STATUS_LABELS: Record<string, string> = {
  scheduled: "⏳ En attente",
  boarding: "🚪 Embarquement",
  departed: "🚌 En cours",
  completed: "🏁 Arrivé",
  cancelled: "❌ Annulé",
};

function defaultDateTimeLocal(hoursAhead = 4): string {
  const d = new Date(Date.now() + hoursAhead * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AgencyWorkspace() {
  const { i18n } = useTranslation();
  const { agencySession, refreshAgency } = useAuth();
  const role = agencySession?.role ?? "staff";
  const [userDashboardModules, setUserDashboardModules] = useState<string[]>(
    agencySession?.user.dashboard_modules || []
  );

  const allowedTabs = useMemo(() => {
    return TABS.filter((t) => {
      if (t.id === "chat") return true;

      const isDefaultRoleTab = t.roles.includes(role);

      if (userDashboardModules && userDashboardModules.length > 0) {
        if (t.id === "boarding" && userDashboardModules.includes("boarding")) return true;
        if (t.id === "desk" && userDashboardModules.includes("desk")) return true;
        if (t.id === "fleet_live" && (userDashboardModules.includes("tracking") || userDashboardModules.includes("fleet_live"))) return true;
        if (t.id === "fleet" && userDashboardModules.includes("fleet")) return true;
        if (t.id === "analytics" && userDashboardModules.includes("analytics")) return true;
        if (t.id === "commercial" && (userDashboardModules.includes("rentals") || userDashboardModules.includes("commercial") || userDashboardModules.includes("sales"))) return true;
        if (t.id === "finance" && (userDashboardModules.includes("cash_journal") || userDashboardModules.includes("finance") || userDashboardModules.includes("sales"))) return true;
        if (t.id === "settings" && userDashboardModules.includes("settings")) return true;
        if (t.id === "trips" && userDashboardModules.includes("trips")) return true;
        if (t.id === "staff" && userDashboardModules.includes("staff")) return true;
        if (t.id === "overview" && userDashboardModules.includes("overview")) return true;

        if (t.id === "boarding" && !userDashboardModules.includes("boarding")) return false;
        if (t.id === "desk" && !userDashboardModules.includes("desk")) return false;
        if (t.id === "fleet_live" && !userDashboardModules.includes("tracking") && !userDashboardModules.includes("fleet_live")) return false;
        if (t.id === "fleet" && !userDashboardModules.includes("fleet")) return false;
        if (t.id === "analytics" && !userDashboardModules.includes("analytics")) return false;
        if (t.id === "commercial" && !userDashboardModules.includes("rentals") && !userDashboardModules.includes("commercial") && !userDashboardModules.includes("sales")) return false;
        if (t.id === "finance" && !userDashboardModules.includes("cash_journal") && !userDashboardModules.includes("finance") && !userDashboardModules.includes("sales")) return false;
        if (t.id === "settings" && !userDashboardModules.includes("settings")) return false;
        if (t.id === "trips" && !userDashboardModules.includes("trips")) return false;
        if (t.id === "staff" && !userDashboardModules.includes("staff")) return false;
        if (t.id === "overview" && !userDashboardModules.includes("overview")) return false;
      }

      return isDefaultRoleTab;
    });
  }, [role, userDashboardModules]);

  const [tab, setTab] = useState<TabId>(() => {
    if (role === "secretary") return "desk";
    if (role === "staff") return "boarding";
    if (role === "driver") return "driver";
    if (role === "accountant") return "finance";
    if (role === "manager") return "trips";
    return "overview";
  });

  useEffect(() => {
    if (!allowedTabs.some((t) => t.id === tab) && allowedTabs[0]) {
      setTab(allowedTabs[0].id);
    }
  }, [allowedTabs, tab]);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // États partagés des onglets
  const [stats, setStats] = useState<Record<string, number>>({});
  const [buses, setBuses] = useState<
    { id: number; plate: string; label: string; bus_type: string; seat_count: number; avg_speed_kmh: number; has_gps?: boolean; gps_device_id?: string | null; status: string }[]
  >([]);
  const [routes, setRoutes] = useState<{ id: number; origin: string; destination: string; distance_km: number; duration_min: number }[]>([]);
  const [driversList, setDriversList] = useState<{ id: number; first_name: string; last_name: string; availability: string; mood: number | null }[]>([]);
  const [trips, setTrips] = useState<
    {
      id: number;
      departs_at: string;
      arrives_at: string | null;
      price: number;
      vip_price: number | null;
      status: string;
      delay_minutes: number;
      postponed_from: string | null;
      origin: string;
      destination: string;
      timezone: string;
      bus_label: string;
      plate: string;
      seat_count: number;
      reserved_seats: number;
      boarded_seats: number;
      driver_names: string | null;
    }[]
  >([]);

  //Formulaires Programmation & Report
  const [tripForm, setTripForm] = useState({
    route_id: 0,
    bus_id: 0,
    driver_id: 0,
    departs_local: defaultDateTimeLocal(5),
    price: 5500,
    vip_price: "",
  });
  const [postponeTarget, setPostponeTarget] = useState<{ id: number; label: string } | null>(null);
  const [postponeForm, setPostponeForm] = useState({ new_departs_local: defaultDateTimeLocal(8), reason: "Ajustement opérationnel" });

  // Formulaires Flotte & Lignes
  const [busForm, setBusForm] = useState({
    plate: "",
    label: "",
    bus_type: "coach",
    cols_left: 2,
    cols_right: 2,
    rows: 12,
    vip_rows: 2,
    co_drivers: 2,
    avg_speed_kmh: 75,
    has_gps: false,
    gps_device_id: "",
  });
  const [selectedBusPreviewId, setSelectedBusPreviewId] = useState<number | null>(null);

  // Génération dynamique des sièges pour l'aperçu réaliste de l'autocar en temps réel
  const previewBusSeats = useMemo(() => {
    const list: GridSeat[] = [];
    const totalCols = (busForm.cols_left || 2) + (busForm.cols_right || 2);
    let seatNo = 1;
    for (let r = 1; r <= (busForm.rows || 12); r++) {
      for (let c = 1; c <= totalCols; c++) {
        list.push({
          id: seatNo,
          seat_no: seatNo,
          row_no: r,
          col_no: c,
          seat_class: r <= (busForm.vip_rows || 0) ? "vip" : "standard",
          taken: false,
        });
        seatNo++;
      }
    }
    return list;
  }, [busForm.cols_left, busForm.cols_right, busForm.rows, busForm.vip_rows]);

  const [routeForm, setRouteForm] = useState({ origin_name: "", dest_name: "", distance_km: 240, duration_min: 210 });

  // Matrice de calcul de la disponibilité en temps réel de chaque autocar
  const busAvailabilityMap = useMemo(() => {
    const map = new Map<number, { status: "available" | "boarding" | "transit" | "maintenance"; label: string; details?: string }>();
    buses.forEach((b) => {
      if (b.status === "maintenance") {
        map.set(b.id, { status: "maintenance", label: "🔧 En maintenance", details: "Immobilisé pour révision technique" });
        return;
      }
      const activeTrip = trips.find(
        (t) => (t.plate === b.plate || t.bus_label === b.label) && (t.status === "boarding" || t.status === "departed")
      );
      if (activeTrip) {
        if (activeTrip.status === "boarding") {
          map.set(b.id, {
            status: "boarding",
            label: "🚪 En embarquement",
            details: `${activeTrip.origin} ➔ ${activeTrip.destination} (${activeTrip.boarded_seats}/${activeTrip.seat_count} à bord)`,
          });
        } else {
          map.set(b.id, {
            status: "transit",
            label: "🔵 En route (Transit)",
            details: `${activeTrip.origin} ➔ ${activeTrip.destination} (${activeTrip.reserved_seats} passagers)`,
          });
        }
      } else {
        map.set(b.id, { status: "available", label: "🟢 Disponible au dépôt", details: "Prêt pour affectation immédiate" });
      }
    });
    return map;
  }, [buses, trips]);

  // Espace Chauffeur (suivi manuel sans GPS + connexion GPS / Google Maps / Mapbox + historique des anciens trajets)
  const [driverData, setDriverData] = useState<{
    driver: { id: number; availability: string; mood: number; mood_note: string | null; photo_consent: boolean } | null;
    trips: {
      id: number;
      departs_at: string;
      arrives_at: string | null;
      actual_departed_at?: string | null;
      actual_arrived_at?: string | null;
      status: string;
      delay_minutes: number;
      origin: string;
      destination: string;
      timezone: string;
      distance_km: number;
      bus_label: string;
      plate: string;
      seat_count: number;
      has_gps?: boolean;
      gps_device_id?: string | null;
      passengers_count: number;
      updates?: {
        id: number;
        kind: string;
        cause: string | null;
        delay_minutes: number | null;
        lat: number | null;
        lng: number | null;
        speed_kmh: number | null;
        progress_pct: number | null;
        note: string | null;
        created_at: string;
      }[];
    }[];
    maps_config?: { provider: string; google_maps_api_key: string; mapbox_access_token: string };
  } | null>(null);
  const [reportForm, setReportForm] = useState({
    trip_id: 0,
    kind: "position",
    cause: "traffic",
    speed_kmh: 72,
    progress_pct: 45,
    delay_minutes: 15,
    lat: "",
    lng: "",
    note: "",
  });
  const [gpsStatus, setGpsStatus] = useState<string>("");

  // Équipe (Postes illimités, Matricules uniques & Avatars)
  const [staffRows, setStaffRows] = useState<
    {
      user_id: number;
      role: AgencyRole;
      job_title: string | null;
      custom_role?: string | null;
      matricule?: string | null;
      avatar_url?: string | null;
      status: string;
      last_login_at: string | null;
      email: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      availability: string | null;
      mood: number | null;
      mood_note: string | null;
    }[]
  >([]);
  const [newStaff, setNewStaff] = useState({
    role: "secretary" as AgencyRole,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    job_title: "",
    custom_role: "",
    matricule: "",
    password: "",
  });
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");

  // Demandes d'adhésion du personnel (Self-onboarding, validation, rejet, signalement fraude)
  const [joinRequests, setJoinRequests] = useState<
    {
      id: number;
      agency_id: number;
      first_name: string;
      last_name: string;
      email: string;
      phone: string | null;
      requested_role: string;
      custom_role_title: string | null;
      modules: string[];
      status: "pending" | "approved" | "rejected" | "reported";
      matricule_generated: string | null;
      ip: string | null;
      user_agent: string | null;
      reported_reason: string | null;
      reported_evidence: any | null;
      decided_at: string | null;
      created_at: string;
    }[]
  >([]);
  const [complaintModal, setComplaintModal] = useState<any | null>(null);
  const [reportReasonPrompt, setReportReasonPrompt] = useState<{ id: number; name: string; email: string } | null>(null);
  const [reportReasonText, setReportReasonText] = useState("Tentative d'usurpation d'identité ou intrusion non autorisée");
  const [dashboardModulesModal, setDashboardModulesModal] = useState(false);
  const [delegateModal, setDelegateModal] = useState<{ userId: number; name: string; matricule?: string | null } | null>(null);
  const [selectedDelegateTo, setSelectedDelegateTo] = useState<number>(0);

  // Contrôle financier & Réconciliation quotidienne pour le Comptable & Administrateur
  const [reconciliationDate, setReconciliationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reconciliationData, setReconciliationData] = useState<{
    date: string;
    currency_code: string;
    summary: {
      total_trips: number;
      total_expected: number;
      total_collected: number;
      net_difference: number;
      discrepant_trips_count: number;
    };
    trips: Array<{
      id: number;
      status: string;
      departs_at: string;
      arrives_at: string | null;
      price: number;
      vip_price: number | null;
      origin: string;
      destination: string;
      bus_label: string;
      plate: string;
      seat_count: number;
      passengers_count: number;
      expected_amount: number;
      collected_amount: number;
      cash_amount: number;
      momo_amount: number;
      card_amount: number;
      is_full: boolean;
      has_discrepancy: boolean;
      discrepancy_amount: number;
    }>;
  } | null>(null);
  const [inspectFinanceTripModal, setInspectFinanceTripModal] = useState<{
    trip: any;
    tickets: Array<{
      id: number;
      passenger_name: string;
      phone: string | null;
      id_number: string | null;
      status: string;
      price: number;
      seat_no: number;
      seat_class: string;
      provider: string;
      paid_amount: number;
      payment_status: string | null;
      paid_at: string | null;
      reference: string;
    }>;
  } | null>(null);
  const [reportingTripId, setReportingTripId] = useState<number | null>(null);
  const [loadingReconciliation, setLoadingReconciliation] = useState(false);

  // Analytics des ventes
  const [salesPeriod, setSalesPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("weekly");
  const [salesAnalytics, setSalesAnalytics] = useState<{
    period: string;
    currency_code: string;
    data: { label: string; date?: string; gross: number; net: number; commission: number; tickets: number }[];
    summary: { total_gross: number; total_net: number; total_commission: number; total_tickets: number };
  } | null>(null);

  // Flotte temps réel GPS
  const [fleetLive, setFleetLive] = useState<{
    id: number;
    status: string;
    departs_at: string;
    arrives_at: string | null;
    delay_minutes: number;
    current_lat: number | null;
    current_lng: number | null;
    current_speed_kmh: number | null;
    current_progress_pct: number | null;
    last_gps_at: string | null;
    origin: string;
    destination: string;
    distance_km: number;
    bus_label: string;
    plate: string;
    seat_count: number;
    booked_seats: number;
    boarded_seats: number;
    is_full: boolean;
    driver_name: string | null;
    driver_phone: string | null;
  }[]>([]);

  // Suivi GPS chauffeur continu
  const [isGpsWatching, setIsGpsWatching] = useState(false);
  const [gpsWatchStatus, setGpsWatchStatus] = useState("");
  const gpsWatchIdRef = useRef<number | null>(null);

  // Commercial (Location & Vente Bus)
  const [rentals, setRentals] = useState<
    {
      id: number;
      reference: string;
      departure: string;
      destination: string;
      start_date: string;
      end_date: string;
      passengers: number;
      bus_type: string;
      contact_name: string;
      contact_email: string;
      contact_phone: string;
      notes: string | null;
      status: string;
      quote_amount: number | null;
      agency_reply: string | null;
    }[]
  >([]);
  const [quoteDrafts, setQuoteDrafts] = useState<Record<number, { amount: string; reply: string }>>({});
  const [market, setMarket] = useState<{
    listings: { id: number; title: string; brand: string; year: number; seats: number; price: number; status: string }[];
    inquiries: { id: number; listing_title: string; name: string; email: string; phone: string | null; message: string }[];
  }>({ listings: [], inquiries: [] });
  const [listingForm, setListingForm] = useState({
    title: "",
    brand: "",
    model: "",
    year: 2022,
    seats: 50,
    mileage_km: 85000,
    price: 45000000,
    description: "",
  });

  // Comptabilité
  const [finance, setFinance] = useState<{
    gross: number;
    refunded: number;
    veltron_commission?: number;
    commission_rate_bps?: number;
    net: number;
    wallet_balance?: number;
    payout_settings?: { payout_method: string; payout_account_number: string; payout_account_name: string };
    payments: {
      id: number;
      reference: string;
      channel: string;
      provider: string;
      payer_account?: string | null;
      agency_payout_account?: string | null;
      agency_net_amount?: number | null;
      amount: number;
      status: string;
      created_at: string;
    }[];
    refunds: { id: number; reference: string; passenger_name: string; amount: number; status: string; requested_at: string }[];
    commissions?: {
      id: number;
      trip_id: number;
      origin: string;
      destination: string;
      departs_at: string;
      seats_filled: number;
      seat_capacity: number;
      is_full_bus: boolean;
      gross_amount: number;
      commission_amount: number;
      trigger_event: string;
      settled_at: string;
    }[];
  } | null>(null);
  const [payoutForm, setPayoutForm] = useState({
    payout_method: "orange_money",
    payout_account_number: "",
    payout_account_name: "",
  });

  // Paramètres & Audit
  const [settings, setSettings] = useState({
    fill_window_minutes: agencySession?.agency.fill_window_minutes ?? 40,
    refund_cutoff_minutes: agencySession?.agency.refund_cutoff_minutes ?? 120,
    free_baggage_kg: agencySession?.agency.free_baggage_kg ?? 20,
    baggage_fee_per_kg: agencySession?.agency.baggage_fee_per_kg ?? 0,
    transfer_fee: agencySession?.agency.transfer_fee ?? 0,
    points_per_trip: agencySession?.agency.points_per_trip ?? 10,
    primary_color: agencySession?.agency.primary_color ?? "#1E8A5E",
  });
  const [auditLogs, setAuditLogs] = useState<
    { id: number; action: string; entity: string; ip: string | null; created_at: string; first_name: string | null; email: string | null }[]
  >([]);

  const cur = agencySession?.agency.currency_code ?? "XAF";
  const minor = agencySession?.agency.minor_units ?? 0;
  const money = (n: number) => formatMoney(n, cur, minor, i18n.language);

  const handleErr = (e: unknown) => setError(e instanceof ApiError ? e.message : "Action impossible.");

  const loadTabContent = useCallback(async () => {
    if (!agencySession) return;
    setError("");
    try {
      if (tab === "overview") {
        const d = await api<{ stats: Record<string, number> }>("/agency/dashboard", { realm: "agency" });
        setStats(d.stats);
      } else if (tab === "trips") {
        const [tList, rList, bList, dList] = await Promise.all([
          api<typeof trips>("/agency/trips", { realm: "agency" }),
          api<typeof routes>("/agency/routes", { realm: "agency" }),
          api<typeof buses>("/agency/buses", { realm: "agency" }),
          api<typeof driversList>("/agency/drivers", { realm: "agency" }),
        ]);
        setTrips(tList);
        setRoutes(rList);
        setBuses(bList);
        setDriversList(dList);
        if (rList[0] && bList[0]) {
          setTripForm((f) => ({
            ...f,
            route_id: f.route_id || rList[0].id,
            bus_id: f.bus_id || bList[0].id,
            driver_id: f.driver_id || (dList[0]?.id ?? 0),
          }));
        }
      } else if (tab === "fleet") {
        const [bList, rList] = await Promise.all([
          api<typeof buses>("/agency/buses", { realm: "agency" }),
          api<typeof routes>("/agency/routes", { realm: "agency" }),
        ]);
        setBuses(bList);
        setRoutes(rList);
      } else if (tab === "driver") {
        const d = await api<NonNullable<typeof driverData>>("/agency/driver/me", { realm: "agency" });
        setDriverData(d);
        if (d.trips[0]) {
          setReportForm((f) => ({ ...f, trip_id: f.trip_id || d.trips[0].id }));
        }
      } else if (tab === "fleet_live") {
        const fl = await api<typeof fleetLive>("/agency/fleet-live", { realm: "agency" });
        setFleetLive(fl);
      } else if (tab === "analytics") {
        const an = await api<NonNullable<typeof salesAnalytics>>(`/agency/sales-analytics?period=${salesPeriod}`, { realm: "agency" });
        setSalesAnalytics(an);
      } else if (tab === "staff") {
        const [s, jr] = await Promise.all([
          api<typeof staffRows>("/agency/staff", { realm: "agency" }),
          api<typeof joinRequests>("/agency/join-requests", { realm: "agency" }).catch(() => []),
        ]);
        setStaffRows(s);
        setJoinRequests(jr);
      } else if (tab === "commercial") {
        const r = await api<typeof rentals>("/agency/rentals", { realm: "agency" });
        setRentals(r);
        if (role === "owner" || role === "manager") {
          const m = await api<typeof market>("/agency/bus-listings", { realm: "agency" });
          setMarket(m);
        }
      } else if (tab === "finance") {
        const [f, rec] = await Promise.all([
          api<NonNullable<typeof finance>>("/agency/finance", { realm: "agency" }),
          api<NonNullable<typeof reconciliationData>>(`/agency/finance/daily-reconciliation?date=${reconciliationDate}`, { realm: "agency" }).catch(() => null),
        ]);
        setFinance(f);
        if (rec) setReconciliationData(rec);
        if (f.payout_settings) {
          setPayoutForm({
            payout_method: f.payout_settings.payout_method || "orange_money",
            payout_account_number: f.payout_settings.payout_account_number || "",
            payout_account_name: f.payout_settings.payout_account_name || "",
          });
        }
      } else if (tab === "settings") {
        const logs = await api<typeof auditLogs>("/agency/audit", { realm: "agency" });
        setAuditLogs(logs);
      }
    } catch (e) {
      handleErr(e);
    }
  }, [agencySession, tab, role]);

  useEffect(() => {
    loadTabContent();
  }, [loadTabContent]);

  useEffect(() => {
    if (routes.length > 0 && (!tripForm.route_id || !routes.some((r) => r.id === tripForm.route_id))) {
      setTripForm((f) => ({ ...f, route_id: routes[0].id }));
    }
  }, [routes]);

  useEffect(() => {
    if (buses.length > 0 && (!tripForm.bus_id || !buses.some((b) => b.id === tripForm.bus_id))) {
      setTripForm((f) => ({ ...f, bus_id: buses[0].id }));
    }
  }, [buses]);

  if (!agencySession) return null;

  // --- Actions ---
  async function createTrip(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    const effectiveRouteId = tripForm.route_id || routes[0]?.id;
    const effectiveBusId = tripForm.bus_id || buses[0]?.id;
    if (!effectiveRouteId) {
      setError("Veuillez d'abord configurer ou sélectionner une ligne de transport.");
      return;
    }
    if (!effectiveBusId) {
      setError("Veuillez d'abord ajouter ou sélectionner un bus disponible.");
      return;
    }
    if (!tripForm.departs_local) {
      setError("Veuillez sélectionner la date et l'heure de départ.");
      return;
    }
    try {
      await api("/agency/trips", {
        body: {
          ...tripForm,
          route_id: effectiveRouteId,
          bus_id: effectiveBusId,
          driver_id: tripForm.driver_id || null,
          vip_price: tripForm.vip_price ? Number(tripForm.vip_price) : null,
        },
        realm: "agency",
      });
      setNotice("✓ Nouveau voyage programmé avec succès et ouvert à la réservation !");
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function submitPostpone(e: FormEvent) {
    e.preventDefault();
    if (!postponeTarget) return;
    setNotice("");
    setError("");
    try {
      await api(`/agency/trips/${postponeTarget.id}/postpone`, {
        body: postponeForm,
        realm: "agency",
      });
      setNotice("✓ Voyage reporté et tous les passagers ont été notifiés !");
      setPostponeTarget(null);
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function createBus(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    try {
      const r = await api<{ seat_count: number }>("/agency/buses", { body: busForm, realm: "agency" });
      setNotice(`✓ Bus ajouté à la flotte (${r.seat_count} sièges générés automatiquement).`);
      setBusForm({ ...busForm, plate: "", label: "" });
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function createRoute(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    try {
      await api("/agency/routes", { body: routeForm, realm: "agency" });
      setNotice("✓ Nouvelle ligne interurbaine enregistrée.");
      setRouteForm({ origin_name: "", dest_name: "", distance_km: 240, duration_min: 210 });
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function saveDriverProfile(e: FormEvent) {
    e.preventDefault();
    if (!driverData?.driver) return;
    setNotice("");
    setError("");
    try {
      await api("/agency/driver/profile", { body: driverData.driver, realm: "agency" });
      setNotice("✓ Votre disponibilité et votre ressenti ont été transmis à la programmation.");
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  function connectDeviceGps() {
    if (!("geolocation" in navigator)) {
      setGpsStatus("Géolocalisation non disponible sur cet appareil — utilisez le mode manuel.");
      return;
    }
    setGpsStatus("Connexion au capteur GPS en cours…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const spd = pos.coords.speed && pos.coords.speed > 0 ? Math.round(pos.coords.speed * 3.6) : reportForm.speed_kmh;
        setReportForm((f) => ({ ...f, lat, lng, speed_kmh: spd }));
        setGpsStatus(`📡 Coordonnées GPS acquises : ${lat}, ${lng}`);
      },
      () => {
        setGpsStatus("Signal GPS refusé ou indisponible — saisie manuelle active.");
      },
      { enableHighAccuracy: true, timeout: 7000 },
    );
  }

  async function sendDriverReport(e: FormEvent) {
    e.preventDefault();
    if (!reportForm.trip_id) return;
    setNotice("");
    setError("");
    try {
      const alertKinds = ["delay", "prolonged_stop", "deviation", "breakdown"];
      const speedKinds = ["position", "delay", "prolonged_stop", "deviation", "resumed"];
      await api(`/agency/driver/trips/${reportForm.trip_id}/report`, {
        body: {
          kind: reportForm.kind,
          cause: alertKinds.includes(reportForm.kind)
            ? reportForm.kind === "prolonged_stop" || reportForm.kind === "deviation"
              ? reportForm.kind
              : reportForm.cause
            : null,
          speed_kmh: speedKinds.includes(reportForm.kind) ? reportForm.speed_kmh : null,
          progress_pct: speedKinds.includes(reportForm.kind) ? reportForm.progress_pct : null,
          delay_minutes: alertKinds.includes(reportForm.kind) ? reportForm.delay_minutes : null,
          lat: reportForm.lat ? Number(reportForm.lat) : null,
          lng: reportForm.lng ? Number(reportForm.lng) : null,
          note: reportForm.note,
        },
        realm: "agency",
      });
      setNotice("✓ Évolution transmise ! L’heure d’arrivée estimée (ETA) des passagers a été recalculée en direct.");
      setReportForm((f) => ({ ...f, note: "" }));
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function createStaffAccount(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    try {
      await api("/agency/staff", { body: newStaff, realm: "agency" });
      setNotice(
        `✓ Compte isolé (${ROLE_LABELS[newStaff.role]}) créé ! Cet employé peut désormais se connecter sur « J’ai une agence » avec l’ID ${agencySession!.agency.public_code}.`,
      );
      setNewStaff({ role: "secretary", first_name: "", last_name: "", email: "", phone: "", job_title: "", custom_role: "", matricule: "", password: "" });
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function toggleStaff(uid: number) {
    setNotice("");
    setError("");
    try {
      await api(`/agency/staff/${uid}/toggle`, { body: {}, realm: "agency" });
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  // Traiter une demande d'adhésion : Valider (approve) ou Rejeter (reject)
  async function handleJoinRequestAction(reqId: number, action: "approve" | "reject") {
    setNotice("");
    setError("");
    try {
      const res = await api<{ ok: boolean; action: string; matricule?: string; message?: string }>(
        `/agency/join-requests/${reqId}/action`,
        {
          body: { action },
          realm: "agency",
        }
      );
      if (action === "approve") {
        setNotice(res.message || `Demande validée ! Matricule unique officiel : ${res.matricule}`);
      } else {
        setNotice("La demande d'adhésion a été rejetée.");
      }
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  // Signaler pour fraude / intrusion et générer la plainte judiciaire
  async function handleReportFraud() {
    if (!reportReasonPrompt) return;
    setNotice("");
    setError("");
    try {
      const res = await api<{ ok: boolean; action: string; complaint_file: any; message: string }>(
        `/agency/join-requests/${reportReasonPrompt.id}/action`,
        {
          body: { action: "report", reason: reportReasonText },
          realm: "agency",
        }
      );
      setComplaintModal(res.complaint_file);
      setReportReasonPrompt(null);
      setNotice(res.message);
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  // Sauvegarder les modules du tableau de bord configurés par le membre
  async function handleSaveDashboardModules() {
    setNotice("");
    setError("");
    try {
      const res = await api<{ ok: boolean; modules: string[] }>("/agency/me/dashboard-modules", {
        body: { modules: userDashboardModules },
        realm: "agency",
      });
      setUserDashboardModules(res.modules);
      setDashboardModulesModal(false);
      setNotice("✓ Votre tableau de bord a été personnalisé avec succès selon vos fonctions choisies (zéro perte de données).");
      await refreshAgency();
      if (role !== "owner") {
        api("/agency/chat/request-modules", {
          body: { modules: userDashboardModules },
          realm: "agency",
        }).catch(() => {});
      }
    } catch (err) {
      handleErr(err);
    }
  }

  // Déclaration de départ : « Je ne suis plus employé de l'agence »
  async function handleResign() {
    if (
      !confirm(
        "Confirmez-vous que vous ne faites plus partie du personnel de cette agence ? Vos accès seront clôturés immédiatement en toute sécurité, tout en préservant l'historique complet de vos opérations pour l'agence."
      )
    )
      return;
    setNotice("");
    setError("");
    try {
      await api("/agency/me/resign", { body: {}, realm: "agency" });
      alert("Votre départ a été enregistré avec succès. Vos accès ont été révoqués.");
      window.location.href = "/";
    } catch (err) {
      handleErr(err);
    }
  }

  // Déléguer les attributions d'un poste à un autre membre
  async function handleDelegate() {
    if (!delegateModal || !selectedDelegateTo) return;
    setNotice("");
    setError("");
    try {
      const res = await api<{ ok: boolean; message: string }>(`/agency/staff/${delegateModal.userId}/delegate`, {
        body: { delegate_to_user_id: selectedDelegateTo },
        realm: "agency",
      });
      setNotice(res.message);
      setDelegateModal(null);
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function sendRentalQuote(rentalId: number) {
    const draft = quoteDrafts[rentalId];
    if (!draft?.amount) return;
    setNotice("");
    setError("");
    try {
      await api(`/agency/rentals/${rentalId}/quote`, {
        body: { quote_amount: Number(draft.amount), agency_reply: draft.reply },
        realm: "agency",
      });
      setNotice("✓ Devis de location envoyé au client !");
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function publishBusListing(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    try {
      await api("/agency/bus-listings", { body: listingForm, realm: "agency" });
      setNotice("✓ Annonce de vente publiée dans l’espace Achat de Bus !");
      setListingForm({ ...listingForm, title: "", brand: "", model: "", description: "" });
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function loadReconciliation(selectedDate: string) {
    setLoadingReconciliation(true);
    try {
      const res = await api<NonNullable<typeof reconciliationData>>(`/agency/finance/daily-reconciliation?date=${selectedDate}`, { realm: "agency" });
      setReconciliationData(res);
    } catch (err) {
      handleErr(err);
    } finally {
      setLoadingReconciliation(false);
    }
  }

  async function openFinanceTripDetails(tripId: number) {
    try {
      const res = await api<{ trip: any; tickets: any[] }>(`/agency/finance/trips/${tripId}/details`, { realm: "agency" });
      setInspectFinanceTripModal(res);
    } catch (err) {
      handleErr(err);
    }
  }

  async function handleReportDiscrepancy(tripId: number) {
    const note = prompt(
      "Précisez une note pour l'alerte d'anomalie financière transmise à l'administrateur et dans la discussion d'équipe :",
      "Incohérence détectée entre passagers inscrits et recettes réelles"
    );
    if (!note) return;
    try {
      setReportingTripId(tripId);
      const res = await api<{ ok: boolean; message: string }>(`/agency/finance/trips/${tripId}/report-discrepancy`, {
        body: { note },
        realm: "agency",
      });
      setNotice(`✓ ${res.message}`);
    } catch (err) {
      handleErr(err);
    } finally {
      setReportingTripId(null);
    }
  }

  async function handleClearGpsHistory(tripId: number) {
    if (!confirm("Voulez-vous réinitialiser à zéro l'historique GPS de ce trajet ?")) return;
    try {
      await api(`/agency/driver/trips/${tripId}/clear-history`, { realm: "agency" });
      setNotice("✓ Historique GPS réinitialisé à zéro pour ce voyage.");
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function saveAgencySettings(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    try {
      await api("/agency/settings", { body: settings, realm: "agency" });
      await refreshAgency();
      setNotice("✓ Paramètres de sécurité et règles opérationnelles enregistrés.");
    } catch (err) {
      handleErr(err);
    }
  }

  async function savePayoutSettings(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    try {
      await api("/agency/payout-settings", { body: payoutForm, realm: "agency" });
      setNotice("✓ Compte de réception des paiements de l’agence enregistré !");
      loadTabContent();
    } catch (err) {
      handleErr(err);
    }
  }

  async function loadSalesAnalytics(period: "daily" | "weekly" | "monthly" | "yearly") {
    try {
      const an = await api<NonNullable<typeof salesAnalytics>>(`/agency/sales-analytics?period=${period}`, { realm: "agency" });
      setSalesAnalytics(an);
    } catch (e) {
      handleErr(e);
    }
  }

  function startLiveGpsTracking(tripId: number) {
    if (!("geolocation" in navigator)) {
      setGpsWatchStatus("❌ Géolocalisation non supportée par votre appareil.");
      return;
    }
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
    }
    setIsGpsWatching(true);
    setGpsWatchStatus("🛰️ Recherche du signal satellite GPS en cours…");

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const spd = pos.coords.speed && pos.coords.speed > 0 ? Math.round(pos.coords.speed * 3.6) : null;
        setGpsWatchStatus(`🟢 GPS Smartphone Actif : ${lat}, ${lng} ${spd !== null ? `· ${spd} km/h` : ""}`);

        try {
          await api(`/agency/driver/trips/${tripId}/live-ping`, {
            body: { lat, lng, speed_kmh: spd },
            realm: "agency",
          });
        } catch {
          // ignore transient ping failure
        }
      },
      (err) => {
        setGpsWatchStatus(`⚠️ Signal GPS perdu : ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    );
  }

  function stopLiveGpsTracking() {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setIsGpsWatching(false);
    setGpsWatchStatus("⏸️ Suivi GPS en direct arrêté.");
  }

  function openGoogleMapsNavigation(origin: string, destination: string) {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    window.open(url, "_blank");
  }

  async function updateAvatar(url: string) {
    setNotice("");
    setError("");
    try {
      await api("/agency/me/avatar", { body: { avatar_url: url }, realm: "agency" });
      setNotice("✓ Photo de profil mise à jour !");
      setAvatarModalOpen(false);
      await refreshAgency();
      loadTabContent();
    } catch (e) {
      handleErr(e);
    }
  }

  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, []);

  return (
    <div className="container page">
      {/* En-tête de session isolée */}
      <div className="workspace-banner card">
        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Avatar name={`${agencySession.user.first_name} ${agencySession.user.last_name}`} photo={agencySession.user.avatar_url} size={64} />
            <button
              type="button"
              className="chip"
              style={{ position: "absolute", bottom: -6, right: -6, padding: "2px 6px", fontSize: "0.7rem", cursor: "pointer" }}
              title="Modifier ma photo de profil"
              onClick={() => {
                setAvatarPreview(agencySession.user.avatar_url || "");
                setAvatarModalOpen(true);
              }}
            >
              📷
            </button>
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="chips" style={{ marginBottom: 6 }}>
              <span className="badge mono">ID : {agencySession.agency.public_code}</span>
              <span className="badge mono" style={{ background: "rgba(245, 158, 11, 0.18)", color: "#fbbf24", borderColor: "#fbbf24" }}>🗄️ DB Auto-Créée : veltron_tenant_{agencySession.agency.public_code.toLowerCase().replace(/[^a-z0-9]/g, "_")}</span>
              {agencySession.user.matricule && (
                <span className="badge mono" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", borderColor: "#10b981" }}>
                  Matricule : {agencySession.user.matricule}
                </span>
              )}
              <span className="badge">{agencySession.user.custom_role || ROLE_LABELS[role]}</span>
              <span className="badge">
                {agencySession.agency.status === "active" ? "🟢 Agence active" : "🟠 En revue de vérification"}
              </span>
            </div>
            <h1 className="display display-xl" style={{ margin: 0 }}>
              {agencySession.agency.name}
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
              Session personnelle de <strong>{agencySession.user.first_name} {agencySession.user.last_name}</strong> ({agencySession.user.email}) ·{" "}
              📍 {agencySession.agency.address}
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDashboardModulesModal(true)}
                style={{ fontSize: "var(--text-xs)", border: "1px solid var(--accent)", color: "var(--accent)", padding: "4px 10px" }}
              >
                ⚙️ Modifier mon tableau de bord
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleResign}
                style={{ fontSize: "var(--text-xs)", color: "#ef4444", border: "1px dashed rgba(239, 68, 68, 0.4)", padding: "4px 10px" }}
                title="Déclarer votre départ et clôturer votre session en toute sécurité"
              >
                🚪 Je ne suis plus employé de l'agence
              </button>
            </div>
          </div>
        </div>

        <div className="workspace-tabs" role="tablist">
          {allowedTabs.map((tItem) => (
            <button
              key={tItem.id}
              type="button"
              role="tab"
              aria-selected={tab === tItem.id}
              className={tab === tItem.id ? "chip is-active" : "chip"}
              onClick={() => {
                setNotice("");
                setError("");
                setTab(tItem.id);
              }}
            >
              {tItem.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="demo-note" role="status">
          <strong>{notice}</strong>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {/* ==================== 1. VUE D'ENSEMBLE ==================== */}
      {tab === "overview" && (
        <div className="form-grid">
          <div className="kpi-grid">
            <div className="card kpi-card">
              <span className="muted">Départs programmés</span>
              <strong className="display kpi-card__value mono">{stats.upcoming_trips ?? 0}</strong>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                En route actuellement : {stats.active_trips ?? 0}
              </span>
            </div>
            <div className="card kpi-card">
              <span className="muted">Flotte & Lignes</span>
              <strong className="display kpi-card__value mono">
                {stats.buses_count ?? 0} bus · {stats.routes_count ?? 0} lignes
              </strong>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Fenêtre remplissage sans bagage : ≤ {agencySession.agency.fill_window_minutes} min
              </span>
            </div>
            <div className="card kpi-card">
              <span className="muted">Comptes actifs (isolés)</span>
              <strong className="display kpi-card__value mono">{stats.staff_count ?? 0}</strong>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Passagers enregistrés (24 h) : {stats.tickets_today ?? 0}
              </span>
            </div>
            {stats.revenue_total !== undefined && (
              <div className="card kpi-card kpi-card--accent">
                <span className="muted">Chiffre d’affaires encaissé</span>
                <strong className="display kpi-card__value mono">{money(stats.revenue_total)}</strong>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  Fidélité : +{agencySession.agency.points_per_trip} pts / voyage
                </span>
              </div>
            )}
          </div>

          <div className="agency-grid">
            <div className="card form-grid">
              <h3 className="subheading" style={{ margin: 0 }}>Actions rapides d’exploitation</h3>
              <div className="chips">
                <button type="button" className="btn" onClick={() => setTab("trips")}>
                  Programmer ou reporter un voyage
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setTab("desk")}>
                  Ouvrir le Guichet
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setTab("chat")}>
                  Messagerie E2EE d’équipe
                </button>
                {role === "owner" && (
                  <button type="button" className="btn btn--ghost" onClick={() => setTab("staff")}>
                    Ajouter Secrétaire / Chauffeur
                  </button>
                )}
              </div>
            </div>

            <div className="card form-grid">
              <h3 className="subheading" style={{ margin: 0 }}>Cloisonnement & Sécurité active</h3>
              <ul className="plain-list muted" style={{ fontSize: "var(--text-sm)" }}>
                <li>Jeton serveur révocable SHA-256 lié au rôle <strong>{ROLE_LABELS[role]}</strong></li>
                <li>Double authentification par code PIN à 5 chiffres (renouvellement 50 s)</li>
                <li>Salons d’équipe chiffrés de bout en bout (ECDH P-256 + AES-256-GCM)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 1b. APPEL DES PASSAGERS (AGENT D'EMBARQUEMENT / POINTEUR) ==================== */}
      {tab === "boarding" && <BoardingCallWorkspace />}

      {/* ==================== 2. GUICHET (SECRÉTAIRE & VENTE) ==================== */}
      {tab === "desk" && <Desk embedded />}

      {/* ==================== 2b. FLOTTE & GPS EN DIRECT ==================== */}
      {tab === "fleet_live" && (
        <div className="form-grid">
          {/* Matrice de Disponibilité de la Flotte en Temps Réel pour l'Admin */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: "1.05rem", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🚌</span> Disponibilité Opérationnelle de la Flotte ({buses.length} autocars)
                </strong>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  Suivi instantané de l'état de tous les bus de l'agence (disponible, en transit, en embarquement, maintenance)
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid #10b981" }}>
                  🟢 {buses.filter((b) => busAvailabilityMap.get(b.id)?.status === "available").length} Disponibles au dépôt
                </span>
                <span className="badge" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", border: "1px solid #3b82f6" }}>
                  🔵 {buses.filter((b) => busAvailabilityMap.get(b.id)?.status === "transit").length} En transit / route
                </span>
                <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid #f59e0b" }}>
                  🚪 {buses.filter((b) => busAvailabilityMap.get(b.id)?.status === "boarding").length} En embarquement
                </span>
                <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid #ef4444" }}>
                  🔧 {buses.filter((b) => busAvailabilityMap.get(b.id)?.status === "maintenance").length} En maintenance
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {buses.map((b) => {
                const avail = busAvailabilityMap.get(b.id) || { status: "available", label: "🟢 Disponible au dépôt" };
                return (
                  <div
                    key={b.id}
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{b.label}</strong>
                      <span className="mono badge" style={{ fontSize: "0.75rem" }}>{b.plate}</span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                      Capacité : {b.seat_count} places ({b.bus_type})
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span
                        className="badge"
                        style={{
                          fontSize: "0.76rem",
                          background:
                            avail.status === "available"
                              ? "rgba(16, 185, 129, 0.15)"
                              : avail.status === "transit"
                                ? "rgba(59, 130, 246, 0.15)"
                                : avail.status === "boarding"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "rgba(239, 68, 68, 0.15)",
                          color:
                            avail.status === "available"
                              ? "#10b981"
                              : avail.status === "transit"
                                ? "#3b82f6"
                                : avail.status === "boarding"
                                  ? "#f59e0b"
                                  : "#ef4444",
                        }}
                      >
                        {avail.label}
                      </span>
                    </div>
                    {avail.details && (
                      <div className="muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>
                        {avail.details}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <FleetLiveOverview
            fleet={fleetLive}
            onRefresh={loadTabContent}
            timezone={Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Douala"}
            language={i18n.language}
          />
        </div>
      )}

      {/* ==================== 3. PROGRAMMATION DES VOYAGES & REPORTS ==================== */}
      {tab === "trips" && (
        <div className="agency-layout">
          <div className="form-grid">
            <h2 className="subheading" style={{ margin: 0 }}>
              Voyages programmés, places réservées & reports
            </h2>
            <ul className="call-list">
              {trips.map((tr) => {
                const pct = Math.round((tr.reserved_seats / Math.max(1, tr.seat_count)) * 100);
                return (
                  <li key={tr.id} className="card form-grid" style={{ padding: "var(--space-4)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <strong>
                          {tr.origin} → {tr.destination}
                        </strong>{" "}
                        <span className="muted mono">
                          · {formatDay(tr.departs_at, tr.timezone, i18n.language)} à{" "}
                          {formatTime(tr.departs_at, tr.timezone, i18n.language)}
                        </span>
                      </div>
                      <span className="badge">{tr.status}</span>
                    </div>

                    <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
                      Bus : <strong>{tr.bus_label}</strong> ({tr.plate}) · Chauffeur :{" "}
                      <strong>{tr.driver_names ?? "À affecter"}</strong> · Tarif : <strong className="mono">{money(tr.price)}</strong>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginBottom: 4 }}>
                        <span>
                          Places réservées : <strong className="mono">{tr.reserved_seats} / {tr.seat_count}</strong> ({tr.boarded_seats} embarqués)
                        </span>
                        <span className="mono">{pct}%</span>
                      </div>
                      <div className="progress">
                        <div className="progress__bar" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {(tr.status === "scheduled" || tr.status === "boarding") && (
                      <div className="chips">
                        <button
                          type="button"
                          className="chip"
                          onClick={() =>
                            setPostponeTarget({
                              id: tr.id,
                              label: `${tr.origin} → ${tr.destination} (${formatTime(tr.departs_at, tr.timezone, i18n.language)})`,
                            })
                          }
                        >
                          📅 Reporter ce voyage
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="side-stack">
            {/* Matrice de Disponibilité de tous les bus de l'agence pour le Responsable Programmation */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: "0.95rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🚌</span> Flotte de l'Agence ({buses.length} bus)
                </strong>
                <span className="badge mono" style={{ fontSize: "0.76rem", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid #10b981" }}>
                  {buses.filter((b) => busAvailabilityMap.get(b.id)?.status === "available").length} libres
                </span>
              </div>
              <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 10px" }}>
                Cliquez sur un car libre pour l'affecter immédiatement :
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {buses.length === 0 ? (
                  <div className="muted" style={{ fontSize: "0.82rem", textAlign: "center", padding: 8 }}>
                    Aucun bus enregistré dans l'agence.
                  </div>
                ) : (
                  buses.map((b) => {
                    const avail = busAvailabilityMap.get(b.id) || { status: "available", label: "🟢 Disponible au dépôt" };
                    const isSelected = tripForm.bus_id === b.id;
                    const isFree = avail.status === "available";
                    return (
                      <div
                        key={b.id}
                        onClick={() => {
                          if (isFree) setTripForm((prev) => ({ ...prev, bus_id: b.id }));
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                          background: isSelected ? "rgba(140, 107, 184, 0.12)" : "var(--bg)",
                          cursor: isFree ? "pointer" : "default",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.85rem",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div>
                          <strong>{b.label}</strong>{" "}
                          <span className="mono muted" style={{ fontSize: "0.8rem" }}>({b.plate})</span>
                          <span className="muted" style={{ display: "block", fontSize: "0.74rem" }}>
                            {b.seat_count} pl. · {avail.details || ""}
                          </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: "0.74rem",
                              background:
                                avail.status === "available"
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : avail.status === "transit"
                                    ? "rgba(59, 130, 246, 0.15)"
                                    : avail.status === "boarding"
                                      ? "rgba(245, 158, 11, 0.15)"
                                      : "rgba(239, 68, 68, 0.15)",
                              color:
                                avail.status === "available"
                                  ? "#10b981"
                                  : avail.status === "transit"
                                    ? "#3b82f6"
                                    : avail.status === "boarding"
                                      ? "#f59e0b"
                                      : "#ef4444",
                            }}
                          >
                            {avail.label}
                          </span>
                          {isSelected && (
                            <span style={{ display: "block", fontSize: "0.72rem", color: "var(--accent)", fontWeight: 700, marginTop: 2 }}>
                              ✓ Sélectionné
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <form className="card form-grid" onSubmit={createTrip}>
              <h3 className="subheading" style={{ margin: 0 }}>Programmer un nouveau départ</h3>
              <label className="field">
                <span className="field__label">Ligne</span>
                <select
                  className="select"
                  value={tripForm.route_id || (routes[0]?.id ?? 0)}
                  onChange={(e) => setTripForm({ ...tripForm, route_id: Number(e.target.value) })}
                >
                  {routes.length === 0 && <option value={0}>— Aucune ligne configurée —</option>}
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.origin} → {r.destination} ({r.distance_km} km)
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Bus alloué</span>
                <select
                  className="select"
                  value={tripForm.bus_id || (buses[0]?.id ?? 0)}
                  onChange={(e) => setTripForm({ ...tripForm, bus_id: Number(e.target.value) })}
                >
                  {buses.length === 0 && <option value={0}>— Aucun bus disponible —</option>}
                  {buses.map((b) => {
                    const avail = busAvailabilityMap.get(b.id);
                    const tag = avail?.status === "available" ? "🟢 [DISPO] " : avail?.status === "transit" ? "🔵 [EN ROUTE] " : avail?.status === "boarding" ? "🚪 [EMBARQUEMENT] " : "🔧 [MAINTENANCE] ";
                    return (
                      <option key={b.id} value={b.id}>
                        {tag}{b.label} ({b.plate} · {b.seat_count} pl.)
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Chauffeur affecté</span>
                <select
                  className="select"
                  value={tripForm.driver_id}
                  onChange={(e) => setTripForm({ ...tripForm, driver_id: Number(e.target.value) })}
                >
                  <option value={0}>— Affecter plus tard —</option>
                  {driversList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.first_name} {d.last_name} ({AVAIL_LABELS[d.availability] ?? d.availability})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Date & heure locale de départ</span>
                <input
                  className="input"
                  type="datetime-local"
                  required
                  value={tripForm.departs_local}
                  onChange={(e) => setTripForm({ ...tripForm, departs_local: e.target.value })}
                />
              </label>

              <div className="search-grid">
                <label className="field">
                  <span className="field__label">Prix standard ({cur})</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    required
                    value={tripForm.price}
                    onChange={(e) => setTripForm({ ...tripForm, price: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Prix VIP ({cur}, opt.)</span>
                  <input
                    className="input"
                    type="number"
                    placeholder="Optionnel"
                    value={tripForm.vip_price}
                    onChange={(e) => setTripForm({ ...tripForm, vip_price: e.target.value })}
                  />
                </label>
              </div>

              <button type="submit" className="btn">
                Publier ce départ
              </button>
            </form>

            {postponeTarget && (
              <form className="card form-grid" onSubmit={submitPostpone}>
                <h3 className="subheading" style={{ margin: 0 }}>
                  Reporter : {postponeTarget.label}
                </h3>
                <label className="field">
                  <span className="field__label">Nouvel horaire local</span>
                  <input
                    className="input"
                    type="datetime-local"
                    required
                    value={postponeForm.new_departs_local}
                    onChange={(e) => setPostponeForm({ ...postponeForm, new_departs_local: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Motif communiqué aux voyageurs</span>
                  <input
                    className="input"
                    required
                    value={postponeForm.reason}
                    onChange={(e) => setPostponeForm({ ...postponeForm, reason: e.target.value })}
                  />
                </label>
                <div className="wizard-actions">
                  <button type="button" className="btn btn--ghost" onClick={() => setPostponeTarget(null)}>
                    Annuler
                  </button>
                  <button type="submit" className="btn">
                    Confirmer le report
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      )}

      {/* ==================== 4. ESPACE DÉDIÉ CHAUFFEUR ==================== */}
      {tab === "driver" && (
        <div className="agency-layout">
          <div className="form-grid">
            <h2 className="subheading" style={{ margin: 0 }}>
              Mes bus, statut du voyage (En attente, En cours, Arrivé) & évolution
            </h2>
            {!driverData || driverData.trips.length === 0 ? (
              <div className="card">
                <p className="muted">Aucun départ ne vous est attribué pour le moment.</p>
              </div>
            ) : (
              <ul className="call-list">
                {driverData.trips
                  .filter((tr) => tr.status !== "completed")
                  .map((tr) => (
                    <li key={tr.id} className="card form-grid" style={{ padding: "var(--space-4)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <strong>
                          {tr.origin} → {tr.destination} ({tr.distance_km} km)
                        </strong>
                        <div className="chips">
                          <span className="badge">{TRIP_STATUS_LABELS[tr.status] ?? tr.status}</span>
                          <span className="badge">
                            {tr.has_gps ? "📡 GPS intégré" : "✋ Mode manuel (sans GPS)"}
                          </span>
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
                        Départ :{" "}
                        <strong className="mono">
                          {formatDay(tr.departs_at, tr.timezone, i18n.language)} à{" "}
                          {formatTime(tr.departs_at, tr.timezone, i18n.language)}
                        </strong>{" "}
                        · Bus : <strong>{tr.bus_label}</strong> (<span className="mono">{tr.plate}</span>) · Passagers :{" "}
                        <strong className="mono">
                          {tr.passengers_count}/{tr.seat_count}
                        </strong>
                      </div>
                      <div className="chips" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className={reportForm.trip_id === tr.id ? "chip is-active" : "chip"}
                          onClick={() => setReportForm({ ...reportForm, trip_id: tr.id })}
                        >
                          {reportForm.trip_id === tr.id ? "✓ Voyage sélectionné" : "Sélectionner ce voyage"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm"
                          style={{ background: "#2563eb", borderColor: "#2563eb", color: "#fff" }}
                          onClick={() => openGoogleMapsNavigation(tr.origin, tr.destination)}
                        >
                          🗺️ Lancer Google Maps (Navigation Chauffeur)
                        </button>
                        {isGpsWatching && reportForm.trip_id === tr.id ? (
                          <button
                            type="button"
                            className="btn btn--sm"
                            style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}
                            onClick={stopLiveGpsTracking}
                          >
                            ⏹️ Arrêter le suivi GPS
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--sm"
                            style={{ background: "#10b981", borderColor: "#10b981", color: "#fff" }}
                            onClick={() => {
                              setReportForm((f) => ({ ...f, trip_id: tr.id, kind: "departed" }));
                              startLiveGpsTracking(tr.id);
                            }}
                          >
                            🚀 Valider Départ & Démarrer Suivi GPS Smartphone
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            )}

            {/* Alerte GPS Chauffeur Actif */}
            {isGpsWatching && (
              <div className="card" style={{ background: "rgba(16, 185, 129, 0.12)", border: "1px solid #10b981", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <strong style={{ color: "#10b981" }}>🛰️ Suivi GPS Smartphone en Direct</strong>
                  <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>{gpsWatchStatus}</p>
                </div>
                <button type="button" className="btn btn--sm" onClick={stopLiveGpsTracking} style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}>
                  Arrêter le GPS
                </button>
              </div>
            )}

            {/* Formulaire de signalement d'évolution en direct (Manuel + Connexion GPS / Google Maps / Mapbox) */}
            {driverData && driverData.trips.length > 0 && (
              <form className="card form-grid" onSubmit={sendDriverReport}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <h3 className="subheading" style={{ margin: 0 }}>
                    📡 Évolution du trajet (Mode Manuel ou Connexion GPS)
                  </h3>
                  <button type="button" className="chip is-active" onClick={connectDeviceGps}>
                    📍 Connexion GPS (récupérer mes coordonnées)
                  </button>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                  Si le bus n’a pas de GPS intégré, signalez manuellement votre vitesse et votre avancement. Vous pouvez
                  aussi connecter le GPS de votre appareil ou brancher une clé API Google Maps / Mapbox.
                </p>

                {gpsStatus && (
                  <div className="demo-note" style={{ fontSize: "var(--text-xs)" }}>
                    {gpsStatus}
                  </div>
                )}

                <div className="chips">
                  {[
                    { id: "departed", label: "🚀 Départ (En cours)" },
                    { id: "position", label: "📍 Vitesse & Position" },
                    { id: "delay", label: "🚦 Retard / Bouchon" },
                    { id: "prolonged_stop", label: "⏸️ Arrêt prolongé" },
                    { id: "deviation", label: "↪️ Déviation d’itinéraire" },
                    { id: "breakdown", label: "🔧 Panne technique" },
                    { id: "resumed", label: "✅ Route dégagée" },
                    { id: "arrived", label: "🏁 Arrivé à destination" },
                  ].map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className={reportForm.kind === k.id ? "chip is-active" : "chip"}
                      onClick={() => setReportForm({ ...reportForm, kind: k.id })}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>

                {["delay", "prolonged_stop", "deviation", "breakdown"].includes(reportForm.kind) && (
                  <div className="search-grid">
                    <label className="field">
                      <span className="field__label">Type d’alerte / Cause exacte</span>
                      <select
                        className="select"
                        value={reportForm.cause}
                        onChange={(e) => setReportForm({ ...reportForm, cause: e.target.value })}
                      >
                        <option value="traffic">🚦 Bouchon / Embouteillage</option>
                        <option value="prolonged_stop">⏸️ Arrêt prolongé en route</option>
                        <option value="deviation">↪️ Déviation d’itinéraire</option>
                        <option value="breakdown">🔧 Panne ou vérification mécanique</option>
                        <option value="weather">🌧️ Pluie forte / Intempéries</option>
                        <option value="police">🛂 Contrôle routier</option>
                        <option value="accident">⚠️ Accident sur l’axe</option>
                        <option value="fuel">⛽ Arrêt carburant</option>
                        <option value="other">ℹ️ Autre cause</option>
                      </select>
                    </label>
                    <label className="field">
                      <span className="field__label">Retard estimé ajouté (minutes)</span>
                      <input
                        className="input"
                        type="number"
                        min={5}
                        max={480}
                        value={reportForm.delay_minutes}
                        onChange={(e) => setReportForm({ ...reportForm, delay_minutes: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                )}

                {["position", "delay", "prolonged_stop", "deviation", "resumed"].includes(reportForm.kind) && (
                  <>
                    <div className="search-grid">
                      <label className="field">
                        <span className="field__label">Vitesse actuelle du bus (km/h)</span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={140}
                          value={reportForm.speed_kmh}
                          onChange={(e) => setReportForm({ ...reportForm, speed_kmh: Number(e.target.value) })}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Progression manuelle ({reportForm.progress_pct} %)</span>
                        <input
                          type="range"
                          min={5}
                          max={98}
                          value={reportForm.progress_pct}
                          onChange={(e) => setReportForm({ ...reportForm, progress_pct: Number(e.target.value) })}
                        />
                      </label>
                    </div>

                    <div className="search-grid">
                      <label className="field">
                        <span className="field__label">Latitude GPS (optionnel si mode manuel)</span>
                        <input
                          className="input mono"
                          placeholder="Ex. 3.950000"
                          value={reportForm.lat}
                          onChange={(e) => setReportForm({ ...reportForm, lat: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Longitude GPS (optionnel si mode manuel)</span>
                        <input
                          className="input mono"
                          placeholder="Ex. 10.800000"
                          value={reportForm.lng}
                          onChange={(e) => setReportForm({ ...reportForm, lng: e.target.value })}
                        />
                      </label>
                    </div>
                  </>
                )}

                <label className="field">
                  <span className="field__label">Message court pour les voyageurs & la gare</span>
                  <input
                    className="input"
                    placeholder="Ex. Bouchon dense au péage d’Édéa, circulation lente à 28 km/h"
                    value={reportForm.note}
                    onChange={(e) => setReportForm({ ...reportForm, note: e.target.value })}
                  />
                </label>

                <button type="submit" className="btn btn--lg">
                  Publier mon évolution en direct
                </button>
              </form>
            )}

            {/* Historique GPS : consulter les anciens trajets */}
            {driverData && driverData.trips.some((t) => t.status === "completed" || (t.updates && t.updates.length > 0)) && (
              <div className="card form-grid">
                <h3 className="subheading" style={{ margin: 0 }}>
                  🗺️ Historique GPS & Anciens trajets
                </h3>
                <ul className="call-list">
                  {driverData.trips
                    .filter((t) => t.status === "completed" || (t.updates && t.updates.length > 0))
                    .map((tr) => (
                      <li key={tr.id} className="call-row">
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                          <strong>
                            {tr.origin} → {tr.destination} · {tr.bus_label} (<span className="mono">{tr.plate}</span>)
                          </strong>
                          <span className="badge">{TRIP_STATUS_LABELS[tr.status] ?? tr.status}</span>
                        </div>
                        <span className="muted mono" style={{ fontSize: "var(--text-xs)" }}>
                          Départ : {formatDay(tr.departs_at, tr.timezone, i18n.language)} à{" "}
                          {formatTime(tr.departs_at, tr.timezone, i18n.language)}
                          {tr.actual_arrived_at
                            ? ` · Arrivé à ${formatTime(tr.actual_arrived_at, tr.timezone, i18n.language)}`
                            : ""}
                        </span>
                        {tr.updates && tr.updates.length > 0 && (
                          <div className="chips" style={{ marginTop: 4 }}>
                            {tr.updates.slice(0, 4).map((u) => (
                              <span key={u.id} className="badge mono" style={{ fontSize: "0.72rem" }}>
                                {u.kind}
                                {u.speed_kmh !== null ? ` · ${u.speed_kmh} km/h` : ""}
                                {u.lat !== null && u.lng !== null ? ` · (${u.lat.toFixed(2)}, ${u.lng.toFixed(2)})` : ""}
                                {u.note ? ` · ${u.note}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 6, borderTop: "1px dashed var(--border)", paddingTop: 6 }}>
                          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                            {tr.updates?.length || 0} coordonnée(s) GPS enregistrée(s)
                          </span>
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.4)", fontSize: "var(--text-xs)", padding: "3px 8px" }}
                            onClick={() => handleClearGpsHistory(tr.id)}
                          >
                            🔄 Réinitialiser à zéro l'historique GPS
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          <aside className="side-stack">
            <div className="card form-grid">
              <h3 className="subheading" style={{ margin: 0 }}>🗺️ Architecture GPS / Google Maps / Mapbox</h3>
              <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                Le suivi fonctionne immédiatement en <strong>mode manuel</strong> (sans GPS intégré) et est prêt pour la
                télémétrie <strong>Google Maps</strong> ou <strong>Mapbox</strong> dès activation des clés dans{" "}
                <code>backend/.env</code> :
              </p>
              <div className="chips">
                <span className="badge mono">
                  Fournisseur : {(driverData?.maps_config?.provider || "none").toUpperCase()}
                </span>
                <span className="badge">
                  {driverData?.maps_config?.google_maps_api_key ? "🟢 Clé Google Maps active" : "⚪ Google Maps (prêt)"}
                </span>
                <span className="badge">
                  {driverData?.maps_config?.mapbox_access_token ? "🟢 Token Mapbox actif" : "⚪ Mapbox (prêt)"}
                </span>
              </div>
            </div>

            {driverData?.driver && (
              <form className="card form-grid" onSubmit={saveDriverProfile}>
                <h3 className="subheading" style={{ margin: 0 }}>
                  Ma disponibilité (Disponible, Indisponible, En maintenance) & Ressenti
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                  Partagez votre disponibilité et l’état de votre véhicule avec la programmation.
                </p>

                <label className="field">
                  <span className="field__label">Disponibilité actuelle</span>
                  <select
                    className="select"
                    value={driverData.driver.availability}
                    onChange={(e) =>
                      setDriverData({
                        ...driverData,
                        driver: { ...driverData.driver!, availability: e.target.value },
                      })
                    }
                  >
                    {Object.entries(AVAIL_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">Mon ressenti / État de forme</span>
                  <select
                    className="select"
                    value={driverData.driver.mood}
                    onChange={(e) =>
                      setDriverData({
                        ...driverData,
                        driver: { ...driverData.driver!, mood: Number(e.target.value) },
                      })
                    }
                  >
                    {[5, 4, 3, 2, 1].map((m) => (
                      <option key={m} value={m}>
                        {MOOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">Note personnelle pour l’équipe</span>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 80 }}
                    placeholder="Ex. Prêt pour la rotation du matin, bus vérifié."
                    value={driverData.driver.mood_note ?? ""}
                    onChange={(e) =>
                      setDriverData({
                        ...driverData,
                        driver: { ...driverData.driver!, mood_note: e.target.value },
                      })
                    }
                  />
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={driverData.driver.photo_consent}
                    onChange={(e) =>
                      setDriverData({
                        ...driverData,
                        driver: { ...driverData.driver!, photo_consent: e.target.checked },
                      })
                    }
                  />
                  <span>Autoriser l’affichage de ma photo sur les billets passagers</span>
                </label>

                <button type="submit" className="btn">
                  Enregistrer ma disponibilité
                </button>
              </form>
            )}
          </aside>
        </div>
      )}

      {/* ==================== 4b. DIAGRAMME DES VENTES ==================== */}
      {tab === "analytics" && (
        <SalesAnalyticsChart
          analytics={salesAnalytics}
          period={salesPeriod}
          onPeriodChange={(p) => {
            setSalesPeriod(p);
            loadSalesAnalytics(p);
          }}
          currencyCode={cur}
          minorUnits={minor}
        />
      )}

      {/* ==================== 5. FLOTTE & LIGNES ==================== */}
      {tab === "fleet" && (
        <div className="agency-layout">
          <div className="form-grid">
            <div className="card form-grid">
              <h3 className="subheading" style={{ margin: 0 }}>Flotte de bus ({buses.length})</h3>
              <ul className="call-list">
                {buses.map((b) => (
                  <li key={b.id} className="call-row">
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <strong>
                        {b.label} · <span className="mono">{b.plate}</span>
                      </strong>
                      <div className="chips">
                        <span className="badge">{b.seat_count} sièges</span>
                        <span className="badge">{b.has_gps ? "📡 GPS intégré" : "✋ Suivi manuel"}</span>
                      </div>
                    </div>
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      Catégorie : {b.bus_type.toUpperCase()} · Vitesse moyenne calcul ETA : {b.avg_speed_kmh} km/h
                      {b.gps_device_id ? ` · Traceur : ${b.gps_device_id}` : ""}
                    </span>

                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      style={{ marginTop: 8, alignSelf: "flex-start" }}
                      onClick={() => setSelectedBusPreviewId(selectedBusPreviewId === b.id ? null : b.id)}
                    >
                      {selectedBusPreviewId === b.id ? "▲ Masquer le plan du bus" : "👁️ Visualiser le plan réaliste ▼"}
                    </button>

                    {selectedBusPreviewId === b.id && (
                      <div style={{ marginTop: 12, width: "100%" }}>
                        <SeatGrid
                          seats={Array.from({ length: b.seat_count }).map((_, idx) => ({
                            id: idx + 1,
                            seat_no: idx + 1,
                            row_no: Math.floor(idx / 4) + 1,
                            col_no: (idx % 4) + 1,
                            seat_class: idx < 8 ? "vip" : "standard",
                            taken: idx % 6 === 0,
                          }))}
                          seatsPerRow={[2, 2]}
                          busLabel={b.label}
                          busPlate={b.plate}
                          busType={b.bus_type}
                          coDriverCount={2}
                          interactive={false}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card form-grid">
              <h3 className="subheading" style={{ margin: 0 }}>Lignes interurbaines ({routes.length})</h3>
              <ul className="call-list">
                {routes.map((r) => (
                  <li key={r.id} className="call-row">
                    <strong>
                      {r.origin} → {r.destination}
                    </strong>
                    <span className="muted mono" style={{ fontSize: "var(--text-xs)" }}>
                      {r.distance_km} km · ~{Math.round(r.duration_min / 60)} h {r.duration_min % 60} min
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <aside className="side-stack">
            <form className="card form-grid" onSubmit={createBus}>
              <h3 className="subheading" style={{ margin: 0 }}>Ajouter un bus (sièges générés auto)</h3>
              <div className="search-grid">
                <label className="field">
                  <span className="field__label">Immatriculation</span>
                  <input
                    className="input mono"
                    required
                    placeholder="LT-880-CE"
                    value={busForm.plate}
                    onChange={(e) => setBusForm({ ...busForm, plate: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Nom du véhicule</span>
                  <input
                    className="input"
                    required
                    placeholder="Autocar Royal 04"
                    value={busForm.label}
                    onChange={(e) => setBusForm({ ...busForm, label: e.target.value })}
                  />
                </label>
              </div>
              <div className="search-grid">
                <label className="field">
                  <span className="field__label">Disposition gauche</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={3}
                    value={busForm.cols_left}
                    onChange={(e) => setBusForm({ ...busForm, cols_left: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Disposition droite</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={3}
                    value={busForm.cols_right}
                    onChange={(e) => setBusForm({ ...busForm, cols_right: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Rangées de sièges</span>
                  <input
                    className="input"
                    type="number"
                    min={4}
                    max={18}
                    value={busForm.rows}
                    onChange={(e) => setBusForm({ ...busForm, rows: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="search-grid">
                <label className="field">
                  <span className="field__label">Rangées VIP (Dorées à l'avant)</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={busForm.rows}
                    value={busForm.vip_rows}
                    onChange={(e) => setBusForm({ ...busForm, vip_rows: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Équipage (Sièges Co-Chauffeurs)</span>
                  <select
                    className="select"
                    value={busForm.co_drivers}
                    onChange={(e) => setBusForm({ ...busForm, co_drivers: Number(e.target.value) })}
                  >
                    <option value={1}>1 Conducteur + 1 Co-Chauffeur</option>
                    <option value={2}>1 Conducteur + 2 Co-Chauffeurs / Convoyeur</option>
                  </select>
                </label>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={busForm.has_gps}
                  onChange={(e) => setBusForm({ ...busForm, has_gps: e.target.checked })}
                />
                <span>Ce bus dispose d’un boîtier GPS intégré (sinon suivi manuel par le chauffeur)</span>
              </label>
              {busForm.has_gps && (
                <label className="field">
                  <span className="field__label">Identifiant du traceur GPS (optionnel)</span>
                  <input
                    className="input mono"
                    placeholder="Ex. GPS-VLT-004"
                    value={busForm.gps_device_id}
                    onChange={(e) => setBusForm({ ...busForm, gps_device_id: e.target.value })}
                  />
                </label>
              )}

              {/* APERÇU HYPER-RÉALISTE DU BUS EN DIRECT POUR LE PROGRAMMATEUR */}
              <div style={{ marginTop: 12, borderTop: "1px dashed var(--border)", paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span className="badge" style={{ fontWeight: 700 }}>
                    🚌 Aperçu en direct : {busForm.label || "Nouvel Autocar"} ({(busForm.cols_left + busForm.cols_right) * busForm.rows} places passagers + 1 Chauffeur + {busForm.co_drivers} Co-Chauffeurs)
                  </span>
                </div>
                <SeatGrid
                  seats={previewBusSeats}
                  seatsPerRow={[busForm.cols_left || 2, busForm.cols_right || 2]}
                  busLabel={busForm.label || "Aperçu de Programmation"}
                  busPlate={busForm.plate || "IMMAT-PREVIEW"}
                  busType="Autocar Grand Tourisme"
                  coDriverCount={busForm.co_drivers ?? 2}
                  interactive={false}
                />
              </div>

              <button type="submit" className="btn" style={{ marginTop: 10 }}>
                Créer le bus ({(busForm.cols_left + busForm.cols_right) * busForm.rows} places)
              </button>
            </form>

            <form className="card form-grid" onSubmit={createRoute}>
              <h3 className="subheading" style={{ margin: 0 }}>Ouvrir une nouvelle ligne</h3>
              <div className="search-grid">
                <label className="field">
                  <span className="field__label">Ville de départ</span>
                  <input
                    className="input"
                    required
                    placeholder="Yaoundé"
                    value={routeForm.origin_name}
                    onChange={(e) => setRouteForm({ ...routeForm, origin_name: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Ville d’arrivée</span>
                  <input
                    className="input"
                    required
                    placeholder="Kribi"
                    value={routeForm.dest_name}
                    onChange={(e) => setRouteForm({ ...routeForm, dest_name: e.target.value })}
                  />
                </label>
              </div>
              <div className="search-grid">
                <label className="field">
                  <span className="field__label">Distance (km)</span>
                  <input
                    className="input"
                    type="number"
                    min={10}
                    value={routeForm.distance_km}
                    onChange={(e) => setRouteForm({ ...routeForm, distance_km: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Durée prévue (min)</span>
                  <input
                    className="input"
                    type="number"
                    min={20}
                    value={routeForm.duration_min}
                    onChange={(e) => setRouteForm({ ...routeForm, duration_min: Number(e.target.value) })}
                  />
                </label>
              </div>
              <button type="submit" className="btn">
                Ajouter la ligne
              </button>
            </form>
          </aside>
        </div>
      )}

      {/* ==================== 6. LOCATION & VENTE DE BUS ==================== */}
      {tab === "commercial" && (
        <div className="agency-layout">
          <div className="form-grid">
            <div className="card form-grid">
              <h3 className="subheading" style={{ margin: 0 }}>Demandes de location de bus reçues</h3>
              {rentals.length === 0 ? (
                <p className="muted">Aucune demande de location en attente.</p>
              ) : (
                <ul className="call-list">
                  {rentals.map((r) => (
                    <li key={r.id} className="call-row">
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong className="mono">
                          {r.reference} · {r.departure} → {r.destination}
                        </strong>
                        <span className="badge">{r.status}</span>
                      </div>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        Du {r.start_date} au {r.end_date} · {r.passengers} passagers · Client : {r.contact_name} ({r.contact_phone})
                      </span>
                      {r.notes && <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>{r.notes}</p>}

                      {r.status !== "quoted" ? (
                        <div className="search-grid" style={{ marginTop: 6 }}>
                          <input
                            className="input"
                            type="number"
                            placeholder={`Montant devis (${cur})`}
                            value={quoteDrafts[r.id]?.amount ?? ""}
                            onChange={(e) =>
                              setQuoteDrafts({
                                ...quoteDrafts,
                                [r.id]: { amount: e.target.value, reply: quoteDrafts[r.id]?.reply ?? "" },
                              })
                            }
                          />
                          <input
                            className="input"
                            placeholder="Message commercial (inclus carburant, chauffeur…)"
                            value={quoteDrafts[r.id]?.reply ?? ""}
                            onChange={(e) =>
                              setQuoteDrafts({
                                ...quoteDrafts,
                                [r.id]: { amount: quoteDrafts[r.id]?.amount ?? "", reply: e.target.value },
                              })
                            }
                          />
                          <button type="button" className="btn" onClick={() => sendRentalQuote(r.id)}>
                            Envoyer le devis
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--success)", fontSize: "var(--text-xs)" }}>
                          ✓ Devis envoyé : {r.quote_amount ? money(r.quote_amount) : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(role === "owner" || role === "manager") && market.inquiries.length > 0 && (
              <div className="card form-grid">
                <h3 className="subheading" style={{ margin: 0 }}>Acheteurs intéressés par vos bus</h3>
                <ul className="call-list">
                  {market.inquiries.map((inq) => (
                    <li key={inq.id} className="call-row">
                      <strong>
                        {inq.listing_title} — {inq.name}
                      </strong>
                      <span className="muted mono" style={{ fontSize: "var(--text-xs)" }}>
                        {inq.email} {inq.phone ? `· ${inq.phone}` : ""}
                      </span>
                      <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>{inq.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {(role === "owner" || role === "manager") && (
            <aside className="side-stack">
              <form className="card form-grid" onSubmit={publishBusListing}>
                <h3 className="subheading" style={{ margin: 0 }}>Mettre un bus en vente</h3>
                <label className="field">
                  <span className="field__label">Titre de l’annonce</span>
                  <input
                    className="input"
                    required
                    placeholder="Ex. Autocar Yutong ZK6122H9 — Climatisé"
                    value={listingForm.title}
                    onChange={(e) => setListingForm({ ...listingForm, title: e.target.value })}
                  />
                </label>
                <div className="search-grid">
                  <label className="field">
                    <span className="field__label">Marque</span>
                    <input
                      className="input"
                      required
                      placeholder="Yutong / Mercedes"
                      value={listingForm.brand}
                      onChange={(e) => setListingForm({ ...listingForm, brand: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Année</span>
                    <input
                      className="input"
                      type="number"
                      value={listingForm.year}
                      onChange={(e) => setListingForm({ ...listingForm, year: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Places</span>
                    <input
                      className="input"
                      type="number"
                      value={listingForm.seats}
                      onChange={(e) => setListingForm({ ...listingForm, seats: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span className="field__label">Prix de vente ({cur})</span>
                  <input
                    className="input"
                    type="number"
                    required
                    value={listingForm.price}
                    onChange={(e) => setListingForm({ ...listingForm, price: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">État mécanique & équipements</span>
                  <textarea
                    className="textarea"
                    value={listingForm.description}
                    onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })}
                  />
                </label>
                <button type="submit" className="btn">
                  Publier sur le marché VELTRON
                </button>
              </form>
            </aside>
          )}
        </div>
      )}

      {/* ==================== 7. COMPTES ÉQUIPE ISOLÉS & DEMANDES D'ADHÉSION ==================== */}
      {tab === "staff" && (
        <div className="agency-layout">
          <div className="card form-grid">
            {/* DEMANDES D'ADHÉSION EN ATTENTE DE VALIDATION */}
            <div style={{ border: "1.5px solid var(--accent)", borderRadius: 10, padding: "var(--space-3)", background: "rgba(140, 107, 184, 0.04)", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <div>
                  <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)" }}>
                    🔔 Demandes d'Adhésion en Attente ({joinRequests.filter((r) => r.status === "pending").length})
                  </span>
                  <h3 className="subheading" style={{ margin: "4px 0 2px", fontSize: "var(--text-base)" }}>
                    Validation des Nouveaux Membres du Personnel
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                    Les employés rejoignent l'agence avec vos codes. Validez leur profil (génère un <strong>matricule unique</strong>), rejetez ou <strong>signalez</strong> pour fraude / intrusion.
                  </p>
                </div>
              </div>

              {joinRequests.filter((r) => r.status === "pending").length === 0 ? (
                <div style={{ padding: "8px 12px", background: "var(--surface)", borderRadius: 6, fontSize: "var(--text-xs)", color: "var(--muted)", textAlign: "center" }}>
                  Aucune demande d'adhésion en attente.
                </div>
              ) : (
                <ul className="call-list" style={{ gap: 8 }}>
                  {joinRequests
                    .filter((r) => r.status === "pending")
                    .map((req) => (
                      <li
                        key={req.id}
                        className="call-row"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 10,
                          padding: "10px 12px",
                          background: "var(--surface)",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "var(--text-sm)" }}>
                              {req.first_name} {req.last_name}
                            </strong>
                            <span className="badge" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#2563eb", fontSize: 11 }}>
                              Poste demandé : {req.custom_role_title || req.requested_role}
                            </span>
                          </div>
                          <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>
                            ✉️ {req.email} · 📞 {req.phone || "Sans tél"} · 🌐 IP : {req.ip || "127.0.0.1"} · Reçu le {new Date(req.created_at).toLocaleDateString()}
                          </div>
                          {req.modules && req.modules.length > 0 && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                              {req.modules.map((m) => (
                                <span key={m} className="badge" style={{ fontSize: 10, padding: "1px 6px" }}>
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => handleJoinRequestAction(req.id, "approve")}
                            style={{ background: "#10b981", borderColor: "#059669", fontSize: 11, padding: "5px 10px", fontWeight: 700 }}
                            title="Valider l'adhésion et générer automatiquement le matricule officiel"
                          >
                            ✅ Valider
                          </button>
                          <button
                            type="button"
                            className="btn btn--outline"
                            onClick={() => handleJoinRequestAction(req.id, "reject")}
                            style={{ fontSize: 11, padding: "5px 10px" }}
                            title="Rejeter cette demande"
                          >
                            ❌ Rejeter
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setReportReasonPrompt({ id: req.id, name: `${req.first_name} ${req.last_name}`, email: req.email })}
                            style={{ background: "#ef4444", color: "#fff", border: 0, fontSize: 11, padding: "5px 10px", fontWeight: 700 }}
                            title="Signaler cette tentative pour fraude / fausse identité et ouvrir le procès-verbal de plainte"
                          >
                            🚨 Signaler
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div>
              <h2 className="subheading" style={{ margin: 0 }}>Comptes du personnel ({staffRows.length})</h2>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
                Chaque membre possède ses propres identifiants, son matricule officiel et son code PIN à 5 chiffres. Aucun employé ne
                peut ouvrir l’interface d’un autre rôle.
              </p>
            </div>

            <ul className="call-list">
              {staffRows.map((m) => (
                <li key={m.user_id} className="call-row" style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <Avatar name={`${m.first_name} ${m.last_name}`} photo={m.avatar_url} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "var(--text-base)" }}>
                          {m.first_name} {m.last_name}
                        </strong>
                        <span className="badge">{m.custom_role || ROLE_LABELS[m.role]}</span>
                        {m.matricule && (
                          <span className="badge mono" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", borderColor: "#10b981" }}>
                            Matricule : {m.matricule}
                          </span>
                        )}
                      </div>
                      <span className="badge">{m.status === "active" ? "Actif" : "Révoqué / Parti"}</span>
                    </div>
                    <span className="muted mono" style={{ fontSize: "var(--text-xs)" }}>
                      {m.email} {m.phone ? `· ${m.phone}` : ""}
                    </span>
                    {m.role === "driver" && (
                      <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 2 }}>
                        {AVAIL_LABELS[m.availability ?? "available"]} ·{" "}
                        {m.mood ? MOOD_LABELS[m.mood] : ""}{" "}
                        {m.mood_note ? `— « ${m.mood_note} »` : ""}
                      </div>
                    )}
                    {role === "owner" && m.role !== "owner" && (
                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="chip" onClick={() => toggleStaff(m.user_id)}>
                          {m.status === "active" ? "Verrouiller / Révoquer l’accès" : "Réactiver le compte"}
                        </button>
                        <button
                          type="button"
                          className="chip"
                          onClick={() => {
                            setDelegateModal({ userId: m.user_id, name: `${m.first_name} ${m.last_name}`, matricule: m.matricule });
                            const other = staffRows.find((s) => s.user_id !== m.user_id && s.status === "active");
                            setSelectedDelegateTo(other?.user_id ?? 0);
                          }}
                        >
                          🔄 Déléguer ce poste
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {role === "owner" && (
            <aside className="side-stack">
              <form className="card form-grid" onSubmit={createStaffAccount} style={{ padding: "var(--space-4)", borderRadius: 16 }}>
                <div>
                  <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)" }}>
                    👥 Nouveau Collaborateur
                  </span>
                  <h3 className="subheading" style={{ margin: "6px 0 2px" }}>Ajouter un compte isolé</h3>
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                    Créez un compte dédié et sécurisé avec matricule pour un membre de votre agence.
                  </p>
                </div>
                <label className="field">
                  <span className="field__label">Poste de base (permissions système)</span>
                  <select
                    className="select"
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as AgencyRole })}
                  >
                    <option value="staff">Agent d'embarquement / Personnel de quai (Appel passagers, à bord / absents)</option>
                    <option value="secretary">Secrétaire de gare (Guichet, vente de billets, encaissements)</option>
                    <option value="driver">Chauffeur (Bus alloués, validation départ, suivi GPS)</option>
                    <option value="manager">Responsable Programmation (Flotte, lignes, horaires)</option>
                    <option value="accountant">Comptable (Recettes, encaissements, diagramme des ventes)</option>
                  </select>
                </label>

                <div className="search-grid">
                  <label className="field">
                    <span className="field__label">Intitulé personnalisé du poste (libre)</span>
                    <input
                      className="input"
                      placeholder="Ex. Agent d'embarquement, Pointeur de quai..."
                      value={newStaff.custom_role}
                      onChange={(e) => setNewStaff({ ...newStaff, custom_role: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Matricule (optionnel, auto si vide)</span>
                    <input
                      className="input mono"
                      placeholder="Ex. AG1-SEC-05"
                      value={newStaff.matricule}
                      onChange={(e) => setNewStaff({ ...newStaff, matricule: e.target.value })}
                    />
                  </label>
                </div>

                <div className="search-grid">
                  <label className="field">
                    <span className="field__label">Prénom</span>
                    <input
                      className="input"
                      required
                      value={newStaff.first_name}
                      onChange={(e) => setNewStaff({ ...newStaff, first_name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Nom</span>
                    <input
                      className="input"
                      required
                      value={newStaff.last_name}
                      onChange={(e) => setNewStaff({ ...newStaff, last_name: e.target.value })}
                    />
                  </label>
                </div>

                <label className="field">
                  <span className="field__label">E-mail personnel (recevra son propre code PIN à la connexion)</span>
                  <input
                    className="input"
                    type="email"
                    required
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  />
                </label>

                <label className="field">
                  <span className="field__label">Mot de passe initial (8 caractères min.)</span>
                  <input
                    className="input"
                    type="password"
                    minLength={8}
                    required
                    value={newStaff.password}
                    onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  />
                </label>

                <button type="submit" className="btn">
                  Créer ce compte sécurisé
                </button>
              </form>
            </aside>
          )}
        </div>
      )}

      {/* ==================== 8. COMPTABILITÉ ==================== */}
      {tab === "finance" && finance && (
        <div className="form-grid">
          <div className="kpi-grid">
            <div className="card kpi-card">
              <span className="muted">Encaissements bruts</span>
              <strong className="display kpi-card__value mono">{money(finance.gross)}</strong>
            </div>
            <div className="card kpi-card">
              <span className="muted">Remboursements effectués</span>
              <strong className="display kpi-card__value mono">{money(finance.refunded)}</strong>
            </div>
            <div className="card kpi-card">
              <span className="muted">Commission VELTRON (0,5 % auto)</span>
              <strong className="display kpi-card__value mono">-{money(finance.veltron_commission ?? 0)}</strong>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Prélevée automatiquement par voyage au départ / bus plein
              </span>
            </div>
            <div className="card kpi-card kpi-card--accent">
              <span className="muted">Solde reçu sur le compte de l’agence (Revenu net)</span>
              <strong className="display kpi-card__value mono">{money(finance.wallet_balance ?? finance.net)}</strong>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Compte : {finance.payout_settings?.payout_account_number || "À configurer ci-dessous"}
              </span>
            </div>
          </div>

          <form className="card form-grid" onSubmit={savePayoutSettings} style={{ border: "1px solid var(--accent)" }}>
            <h3 className="subheading" style={{ margin: 0 }}>
              💳 Compte de réception des paiements de l’agence (crédit direct automatique)
            </h3>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
              Lorsqu’un passager paie son billet en ligne, l’argent est <strong>déduit directement de son compte</strong> et le montant net est <strong>versé directement sur ce compte enregistré de l’agence</strong>.
            </p>
            <div className="search-grid">
              <label className="field">
                <span className="field__label">Mode de réception</span>
                <select
                  className="select"
                  value={payoutForm.payout_method}
                  onChange={(e) => setPayoutForm({ ...payoutForm, payout_method: e.target.value })}
                >
                  <option value="orange_money">🍊 Orange Money</option>
                  <option value="mtn_momo">💛 MTN Mobile Money</option>
                  <option value="wave">🌊 Wave</option>
                  <option value="bank_transfer">🏦 Virement Bancaire / IBAN</option>
                  <option value="card">💳 Carte / Stripe</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">Numéro Mobile Money ou IBAN de l’agence</span>
                <input
                  className="input mono"
                  required
                  placeholder="+237 6... ou IBAN"
                  value={payoutForm.payout_account_number}
                  onChange={(e) => setPayoutForm({ ...payoutForm, payout_account_number: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">Nom du titulaire du compte agence</span>
                <input
                  className="input"
                  required
                  placeholder="Nom officiel de l’agence"
                  value={payoutForm.payout_account_name}
                  onChange={(e) => setPayoutForm({ ...payoutForm, payout_account_name: e.target.value })}
                />
              </label>
            </div>
            <div>
              <button type="submit" className="btn">
                Enregistrer le compte de réception de l’agence
              </button>
            </div>
          </form>

          {finance.commissions && finance.commissions.length > 0 && (
            <div className="card form-grid">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h3 className="subheading" style={{ margin: 0 }}>
                  📜 Reversements automatiques au propriétaire VELTRON (0,5 % par voyage)
                </h3>
                <span className="badge mono">Contrat : 0,50 % / départ</span>
              </div>
              <ul className="call-list">
                {finance.commissions.map((cm) => (
                  <li key={cm.id} className="call-row">
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <strong>
                        Voyage #{cm.trip_id} · {cm.origin} → {cm.destination} ({cm.seats_filled}/{cm.seat_capacity} pl.)
                      </strong>
                      <strong className="mono">
                        0,5 % = {money(cm.commission_amount)} (sur {money(cm.gross_amount)})
                      </strong>
                    </div>
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      Déclencheur : {cm.is_full_bus ? "🟢 Bus plein" : cm.trigger_event === "completed" ? "🏁 Voyage terminé" : "🚀 Départ lancé"} · Versé automatiquement
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CONTRÔLE ET RÉCONCILIATION FINANCIÈRE QUOTIDIENNE (Comptable & Administrateur) */}
          <div className="card form-grid" style={{ border: "2px solid var(--accent)", padding: "var(--space-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)" }}>
                  💼 Contrôle Financier & Réconciliation par Voyage
                </span>
                <h3 className="subheading" style={{ margin: "4px 0 2px" }}>
                  Contrôle des Recettes, Espèces & Détection Automatique des Écarts
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                  Contrôle systématique entre le montant total attendu (passagers inscrits × prix du billet) et les recettes effectivement encaissées (Espèces guichet, Mobile Money et Cartes).
                </p>
              </div>

              {/* Sélecteur de date */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>Date :</label>
                <input
                  type="date"
                  className="input"
                  style={{ width: "auto" }}
                  value={reconciliationDate}
                  onChange={(e) => {
                    const newD = e.target.value;
                    setReconciliationDate(newD);
                    loadReconciliation(newD);
                  }}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => loadReconciliation(reconciliationDate)}
                  disabled={loadingReconciliation}
                >
                  {loadingReconciliation ? "Chargement..." : "🔄 Actualiser"}
                </button>
              </div>
            </div>

            {/* KPIs de la journée choisie */}
            {reconciliationData && (
              <>
                <div className="kpi-grid" style={{ margin: "8px 0" }}>
                  <div className="card kpi-card">
                    <span className="muted">Départs programmés</span>
                    <strong className="display kpi-card__value mono">{reconciliationData.summary.total_trips}</strong>
                  </div>
                  <div className="card kpi-card">
                    <span className="muted">Recettes Attendues (Inscrits)</span>
                    <strong className="display kpi-card__value mono">{money(reconciliationData.summary.total_expected)}</strong>
                  </div>
                  <div className="card kpi-card">
                    <span className="muted">Recettes Encaissées (Reçues)</span>
                    <strong className="display kpi-card__value mono">{money(reconciliationData.summary.total_collected)}</strong>
                  </div>
                  <div className={`card kpi-card ${reconciliationData.summary.discrepant_trips_count > 0 ? "kpi-card--danger" : "kpi-card--accent"}`}>
                    <span className="muted">Contrôle de Cohérence</span>
                    <strong className="display kpi-card__value mono" style={{ color: reconciliationData.summary.discrepant_trips_count > 0 ? "#ef4444" : "#10b981" }}>
                      {reconciliationData.summary.discrepant_trips_count > 0 ? `⚠️ ${reconciliationData.summary.discrepant_trips_count} anomalie(s)` : "✓ Tout est conforme"}
                    </strong>
                    {reconciliationData.summary.discrepant_trips_count > 0 && (
                      <span className="muted" style={{ fontSize: "var(--text-xs)", color: "#ef4444" }}>
                        Écart total : -{money(reconciliationData.summary.net_difference)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Table des voyages de la journée */}
                {reconciliationData.trips.length === 0 ? (
                  <p className="muted" style={{ textAlign: "center", padding: "16px 0" }}>
                    Aucun départ programmé pour la journée du {reconciliationDate}.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="table" style={{ width: "100%", fontSize: "var(--text-xs)" }}>
                      <thead>
                        <tr>
                          <th>Voyage & Ligne</th>
                          <th>Bus / Immat</th>
                          <th>Passagers</th>
                          <th>Attendu (Inscrits)</th>
                          <th>Encaissé Réel</th>
                          <th>Modes (Espèces / MoMo)</th>
                          <th>Contrôle Financier</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciliationData.trips.map((tr) => (
                          <tr key={tr.id} style={{ background: tr.has_discrepancy ? "rgba(239, 68, 68, 0.06)" : "transparent" }}>
                            <td>
                              <strong>{tr.origin} → {tr.destination}</strong>
                              <div className="muted mono">{formatTime(tr.departs_at, "UTC", i18n.language)}</div>
                            </td>
                            <td>
                              <strong>{tr.bus_label}</strong>
                              <div className="muted mono">{tr.plate}</div>
                            </td>
                            <td>
                              <span className="badge mono">
                                {tr.passengers_count} / {tr.seat_count} pl.
                              </span>
                              {tr.is_full && <span className="badge" style={{ background: "#10b981", color: "#fff", marginLeft: 4 }}>Plein</span>}
                            </td>
                            <td className="mono" style={{ fontWeight: 600 }}>
                              {money(tr.expected_amount)}
                            </td>
                            <td className="mono" style={{ fontWeight: 700, color: tr.has_discrepancy ? "#ef4444" : "#10b981" }}>
                              {money(tr.collected_amount)}
                            </td>
                            <td style={{ fontSize: 11 }}>
                              <div>💵 Espèces : <strong className="mono">{money(tr.cash_amount)}</strong></div>
                              <div>📱 MoMo : <strong className="mono">{money(tr.momo_amount)}</strong></div>
                              {tr.card_amount > 0 && <div>💳 Carte : <strong className="mono">{money(tr.card_amount)}</strong></div>}
                            </td>
                            <td>
                              {tr.has_discrepancy ? (
                                <div style={{ background: "rgba(239, 68, 68, 0.15)", color: "#b91c1c", padding: "6px 8px", borderRadius: 6, fontWeight: 700 }}>
                                  ⚠️ Incohérence financière détectée : Écart de -{money(tr.discrepancy_amount)}
                                </div>
                              ) : (
                                <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#059669" }}>
                                  ✓ Conforme
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="btn btn--sm btn--ghost"
                                  onClick={() => openFinanceTripDetails(tr.id)}
                                >
                                  🔍 Détails
                                </button>
                                {tr.has_discrepancy && (
                                  <button
                                    type="button"
                                    className="btn btn--sm"
                                    style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}
                                    disabled={reportingTripId === tr.id}
                                    onClick={() => handleReportDiscrepancy(tr.id)}
                                  >
                                    {reportingTripId === tr.id ? "Envoi..." : "🚨 Signaler anomalie"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="agency-layout">
            <div className="card form-grid">
              <h3 className="subheading" style={{ margin: 0 }}>Derniers paiements</h3>
              <ul className="call-list">
                {finance.payments.map((p) => (
                  <li key={p.id} className="call-row">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong className="mono">{p.reference}</strong>
                      <strong className="mono">{money(p.amount)}</strong>
                    </div>
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      Canal : {p.channel} · {p.provider.toUpperCase()} · {p.status}
                      {p.payer_account ? ` · Débité de ${p.payer_account}` : ""}
                      {p.agency_payout_account ? ` → Crédité sur ${p.agency_payout_account}` : ""}
                      {p.agency_net_amount ? ` (Net agence : ${money(p.agency_net_amount)})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card form-grid">
              <h3 className="subheading" style={{ margin: 0 }}>Remboursements</h3>
              {finance.refunds.length === 0 ? (
                <p className="muted">Aucun remboursement sur la période.</p>
              ) : (
                <ul className="call-list">
                  {finance.refunds.map((rf) => (
                    <li key={rf.id} className="call-row">
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong className="mono">{rf.reference}</strong>
                        <strong className="mono">-{money(rf.amount)}</strong>
                      </div>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {rf.passenger_name} · {rf.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 9. MESSAGERIE CHIFFRÉE DE BOUT EN BOUT (E2EE) ==================== */}
      {tab === "chat" && <AgencyChat />}

      {/* ==================== 10. PARAMÈTRES, RÈGLE DES 40 MIN & JOURNAL D'AUDIT ==================== */}
      {tab === "settings" && (
        <div className="agency-layout">
          <form className="card form-grid" onSubmit={saveAgencySettings}>
            <h2 className="subheading" style={{ margin: 0 }}>Règles opérationnelles de l’agence</h2>

            <label className="field">
              <span className="field__label">
                Écart maximal entre deux départs pour avancer un passager sans bagage (en minutes, ex. 40 min)
              </span>
              <input
                className="input"
                type="number"
                min={5}
                max={240}
                value={settings.fill_window_minutes}
                onChange={(e) => setSettings({ ...settings, fill_window_minutes: Number(e.target.value) })}
              />
            </label>

            <div className="search-grid">
              <label className="field">
                <span className="field__label">Coupure remboursement avant départ (min, min. 120 = 2 h)</span>
                <input
                  className="input"
                  type="number"
                  min={120}
                  max={2880}
                  value={settings.refund_cutoff_minutes}
                  onChange={(e) => setSettings({ ...settings, refund_cutoff_minutes: Number(e.target.value) })}
                />
              </label>

              <label className="field">
                <span className="field__label">Points fidélité attribués par trajet payé</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={500}
                  value={settings.points_per_trip}
                  onChange={(e) => setSettings({ ...settings, points_per_trip: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="search-grid">
              <label className="field">
                <span className="field__label">Franchise bagages gratuite (kg)</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={settings.free_baggage_kg}
                  onChange={(e) => setSettings({ ...settings, free_baggage_kg: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span className="field__label">Tarif par kg supplémentaire ({cur})</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={settings.baggage_fee_per_kg}
                  onChange={(e) => setSettings({ ...settings, baggage_fee_per_kg: Number(e.target.value) })}
                />
              </label>
            </div>

            <button type="submit" className="btn">
              Enregistrer les règles de l’agence
            </button>
          </form>

          <aside className="card form-grid">
            <h3 className="subheading" style={{ margin: 0 }}>Journal d’audit immuable (anti-intrusion)</h3>
            <ul className="call-list">
              {auditLogs.slice(0, 18).map((log) => (
                <li key={log.id} className="call-row">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong className="mono" style={{ fontSize: "var(--text-xs)" }}>
                      {log.action}
                    </strong>
                    <span className="muted mono" style={{ fontSize: "0.72rem" }}>
                      {log.ip ?? "local"}
                    </span>
                  </div>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {log.first_name ?? "Système"} ({log.email ?? "auto"}) · #{log.entity}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {/* Modal Changement de photo de profil */}
      {avatarModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setAvatarModalOpen(false)}
        >
          <div
            className="card form-grid"
            style={{ maxWidth: 440, width: "100%", background: "var(--color-surface, #1e293b)", border: "1px solid var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subheading" style={{ margin: 0 }}>📷 Modifier ma photo de profil</h3>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Entrez l’URL directe d’une image ou téléversez une photo. Sans photo, un avatar stylisé type WhatsApp est affiché par défaut.
            </p>
            <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
              <Avatar name={`${agencySession.user.first_name} ${agencySession.user.last_name}`} photo={avatarPreview} size={84} />
            </div>
            <label className="field">
              <span className="field__label">Lien direct de l’image (URL HTTPS)</span>
              <input
                className="input"
                placeholder="https://images.unsplash.com/..."
                value={avatarPreview}
                onChange={(e) => setAvatarPreview(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Ou charger une photo depuis votre appareil</span>
              <input
                type="file"
                accept="image/*"
                className="input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") {
                        setAvatarPreview(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
            <div className="chips" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="btn btn--ghost" onClick={() => setAvatarModalOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => updateAvatar(avatarPreview)}
              >
                Enregistrer ma photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1 : PERSONNALISATION DU TABLEAU DE BORD (CERCLES MÉTIER) */}
      {dashboardModulesModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setDashboardModulesModal(false)}
        >
          <div
            className="card form-grid"
            style={{ maxWidth: 620, width: "100%", background: "var(--surface)", border: "2px solid var(--accent)", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)" }}>
                  ⚙️ Tableau de Bord Modulaire
                </span>
                <h3 className="subheading" style={{ margin: "4px 0 2px" }}>
                  Personnaliser mes Missions & Cercles Métier
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                  Ajoutez ou masquez des tâches en fonction de vos attributions. VELTRON réadapte votre tableau de bord sans aucune perte de données.
                </p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => setDashboardModulesModal(false)} style={{ fontSize: 18 }}>
                ✕
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 8,
                margin: "12px 0",
              }}
            >
              {[
                { id: "desk", label: "Guichet & Ventes", icon: "🎟️", desc: "Vente billets comptoir, encaissements espèces / Momo, bagages" },
                { id: "boarding", label: "Embarquement & Quai", icon: "📋", desc: "Appel passagers, sièges verts/rouges, passagers sans bagages" },
                { id: "trips", label: "Voyages & Programmation", icon: "🗓️", desc: "Création, programmation des départs, reports et assignation" },
                { id: "fleet", label: "Flotte & Lignes", icon: "🚌", desc: "Bus, immatriculations, plan de sièges" },
                { id: "tracking", label: "Suivi GPS en Direct", icon: "🗺️", desc: "Localisation Maps en direct et signal chauffeur" },
                { id: "analytics", label: "Diagramme Ventes", icon: "📈", desc: "Statistiques et chiffre d'affaires (jour/sem/mois/an)" },
                { id: "cash_journal", label: "Journal de Caisse", icon: "💼", desc: "Bilan espèces, Mobile Money, écarts et archives caisses" },
                { id: "commercial", label: "Location & Vente Bus", icon: "🤝", desc: "Chiffrage devis, privatisation et bourses d'autocars" },
                { id: "staff", label: "Équipe & Personnel", icon: "👥", desc: "Gestion des postes, créations et attributions" },
                { id: "settings", label: "Sécurité & Audit", icon: "🛡️", desc: "Règles agence, accès et traçabilité" },
              ].map((mod) => {
                const isSelected = userDashboardModules.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setUserDashboardModules(userDashboardModules.filter((m) => m !== mod.id));
                      } else {
                        setUserDashboardModules([...userDashboardModules, mod.id]);
                      }
                    }}
                    className="card card--interactive"
                    style={{
                      padding: "10px",
                      borderRadius: 10,
                      textAlign: "start",
                      background: isSelected ? "rgba(140, 107, 184, 0.12)" : "var(--surface)",
                      border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "var(--text-xs)" }}>
                      <span>{mod.icon}</span>
                      <span style={{ color: isSelected ? "var(--accent)" : "inherit" }}>{mod.label}</span>
                      {isSelected && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✓</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 10, marginTop: 4, lineHeight: 1.3 }}>
                      {mod.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn--ghost" onClick={() => setDashboardModulesModal(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn--primary" onClick={handleSaveDashboardModules} style={{ background: "var(--accent)" }}>
                ✓ Enregistrer & Mettre à jour mon tableau de bord
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2 : PROMPT DU MOTIF DE SIGNALEMENT FRAUDE */}
      {reportReasonPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setReportReasonPrompt(null)}
        >
          <div
            className="card form-grid"
            style={{ maxWidth: 500, width: "100%", background: "var(--surface)", border: "2px solid #ef4444" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 24 }}>🚨</span>
              <h3 className="subheading" style={{ margin: 0, color: "#dc2626" }}>
                Signaler cette tentative d'accès pour fraude
              </h3>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
              Candidat ciblé : <strong>{reportReasonPrompt.name}</strong> ({reportReasonPrompt.email}).
              Cette action génère un <strong>dossier juridique de plainte</strong> comportant l'adresse IP, le dispositif et l'empreinte numérique du suspect.
            </p>

            <label className="field">
              <span className="field__label">Motif du signalement / constat de tentative frauduleuse *</span>
              <textarea
                className="textarea"
                rows={3}
                required
                value={reportReasonText}
                onChange={(e) => setReportReasonText(e.target.value)}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn--ghost" onClick={() => setReportReasonPrompt(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleReportFraud}
                style={{ background: "#dc2626", color: "#fff", border: 0, fontWeight: 700 }}
              >
                🚨 Confirmer le signalement & Ouvrir la plainte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3 : PROCÈS-VERBAL OFFICIEL DE PLAINTE POUR FRAUDE NUMÉRIQUE */}
      {complaintModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setComplaintModal(null)}
        >
          <div
            className="card form-grid"
            style={{
              maxWidth: 680,
              width: "100%",
              background: "#ffffff",
              color: "#1e293b",
              border: "3px double #b91c1c",
              padding: "var(--space-4)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ borderBottom: "2px solid #b91c1c", paddingBottom: 10, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                RÉPUBLIQUE DU CAMEROUN · PAIX - TRAVAIL - PATRIE
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>
                DIRECTION DE LA POLICE JUDICIAIRE / DIVISION DE LA CYBERCRIMINALITÉ
              </div>
              <h2 style={{ fontSize: "var(--text-lg)", color: "#b91c1c", margin: "8px 0 2px", fontWeight: 900 }}>
                SIGNALEMENT OFFICIEL DE TENTATIVE D'INTRUSION & FRAUDE
              </h2>
              <span className="badge mono" style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #f87171" }}>
                RÉFÉRENCE PV : {complaintModal.pv_reference}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: "var(--text-xs)", margin: "10px 0" }}>
              <div style={{ background: "#f8fafc", padding: 10, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                <strong style={{ color: "#0f172a", display: "block", marginBottom: 4 }}>📋 DONNÉES DE L'AGENCE PLAINTE :</strong>
                <div>Agence : <strong>{complaintModal.agency.agency_name}</strong></div>
                <div>Officier déclarant : <strong>{complaintModal.agency.reported_by_officer}</strong></div>
                <div>Horodatage : {complaintModal.reported_at}</div>
              </div>

              <div style={{ background: "#fef2f2", padding: 10, borderRadius: 6, border: "1px solid #fecaca" }}>
                <strong style={{ color: "#991b1b", display: "block", marginBottom: 4 }}>👤 SUSPECT IDENTIFIÉ :</strong>
                <div>Identité déclarée : <strong>{complaintModal.suspect.full_name}</strong></div>
                <div>E-mail : {complaintModal.suspect.email}</div>
                <div>Téléphone : {complaintModal.suspect.phone}</div>
                <div>Adresse IP tracée : <strong className="mono">{complaintModal.suspect.ip_address}</strong></div>
              </div>
            </div>

            <div style={{ background: "#f1f5f9", padding: 10, borderRadius: 6, fontSize: "var(--text-xs)" }}>
              <strong>Empreinte technique du terminal suspect :</strong>
              <div className="mono" style={{ fontSize: 11, wordBreak: "break-all", marginTop: 4 }}>
                {complaintModal.suspect.user_agent}
              </div>
            </div>

            <div style={{ fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
              <strong style={{ color: "#b91c1c" }}>Motif & Justification :</strong> {complaintModal.justification}
              <br />
              <strong style={{ color: "#475569" }}>Base légale :</strong> {complaintModal.legal_notice}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => window.print()}
                style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}
              >
                🖨️ Imprimer le procès-verbal pour les autorités
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => setComplaintModal(null)}
                style={{ background: "#0f172a", color: "#fff" }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4 : DÉLÉGATION D'UN POSTE À UN AUTRE MEMBRE */}
      {delegateModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setDelegateModal(null)}
        >
          <div
            className="card form-grid"
            style={{ maxWidth: 480, width: "100%", background: "var(--surface)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subheading" style={{ margin: 0 }}>
              🔄 Déléguer les attributions du poste
            </h3>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
              Transférer la gestion et les responsabilités du collaborateur <strong>{delegateModal.name}</strong> ({delegateModal.matricule || "Membre"}) à un autre collaborateur actif ou à vous-même :
            </p>

            <label className="field">
              <span className="field__label">Choisir le collaborateur délégataire :</span>
              <select
                className="select"
                value={selectedDelegateTo}
                onChange={(e) => setSelectedDelegateTo(Number(e.target.value))}
              >
                {staffRows
                  .filter((s) => s.user_id !== delegateModal.userId && s.status === "active")
                  .map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.first_name} {s.last_name} ({s.matricule || s.role})
                    </option>
                  ))}
              </select>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn--ghost" onClick={() => setDelegateModal(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleDelegate}
                disabled={!selectedDelegateTo}
              >
                Confirmer la délégation
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 5 : DÉTAIL FINANCIER D'UN VOYAGE (Comptable & Admin) */}
      {inspectFinanceTripModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            zIndex: 10000,
            padding: 16,
          }}
          onClick={() => setInspectFinanceTripModal(null)}
        >
          <div
            className="card form-grid"
            style={{ maxWidth: 750, width: "100%", background: "var(--surface)", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span className="badge" style={{ background: "rgba(140, 107, 184, 0.15)", color: "var(--accent)" }}>
                  💳 Bilan Financier Détaillé
                </span>
                <h3 className="subheading" style={{ margin: "4px 0 2px" }}>
                  {inspectFinanceTripModal.trip.origin} → {inspectFinanceTripModal.trip.destination}
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                  Bus {inspectFinanceTripModal.trip.bus_label} ({inspectFinanceTripModal.trip.plate}) · Départ le{" "}
                  {formatDay(inspectFinanceTripModal.trip.departs_at, "UTC", i18n.language)} à{" "}
                  {formatTime(inspectFinanceTripModal.trip.departs_at, "UTC", i18n.language)}
                </p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => setInspectFinanceTripModal(null)} style={{ fontSize: 18 }}>
                ✕
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", fontSize: "var(--text-xs)" }}>
                <thead>
                  <tr>
                    <th>Siège</th>
                    <th>Passager</th>
                    <th>Téléphone / CNI</th>
                    <th>Réf. Billet</th>
                    <th>Prix</th>
                    <th>Moyen Paiement</th>
                    <th>Encaissé</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectFinanceTripModal.tickets.map((tk) => (
                    <tr key={tk.id}>
                      <td className="mono">
                        <strong>#{tk.seat_no}</strong> ({tk.seat_class})
                      </td>
                      <td>
                        <strong>{tk.passenger_name}</strong>
                      </td>
                      <td className="muted mono" style={{ fontSize: 11 }}>
                        {tk.phone || "—"} {tk.id_number ? `· CNI: ${tk.id_number}` : ""}
                      </td>
                      <td className="mono">{tk.reference}</td>
                      <td className="mono">{money(tk.price)}</td>
                      <td>
                        <span className="badge">
                          {tk.provider === "cash"
                            ? "💵 Espèces (Guichet)"
                            : tk.provider === "orange_money"
                            ? "🍊 Orange Money"
                            : tk.provider === "mtn_momo"
                            ? "💛 MTN MoMo"
                            : tk.provider === "card"
                            ? "💳 Carte"
                            : tk.provider}
                        </span>
                      </td>
                      <td className="mono" style={{ fontWeight: 700, color: tk.paid_amount >= tk.price ? "#10b981" : "#ef4444" }}>
                        {money(tk.paid_amount)}
                      </td>
                      <td>
                        <span className="badge">{tk.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn--primary" onClick={() => setInspectFinanceTripModal(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
