import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { formatDay, formatMoney, formatTime } from "../core/format";
import type { AgencyRole } from "../core/types";
import Desk from "./Desk";
import AgencyChat from "./AgencyChat";

type TabId =
  | "overview"
  | "desk"
  | "trips"
  | "driver"
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
  { id: "overview", label: "📊 Vue d’ensemble", roles: ["owner", "manager"] },
  { id: "desk", label: "🎫 Guichet & Embarquement", roles: ["owner", "manager", "secretary", "staff"] },
  { id: "trips", label: "🗓️ Voyages & Reports", roles: ["owner", "manager", "secretary"] },
  { id: "driver", label: "🚌 Espace Chauffeur", roles: ["driver", "owner", "manager"] },
  { id: "fleet", label: "⚙️ Flotte & Lignes", roles: ["owner", "manager"] },
  { id: "commercial", label: "🤝 Location & Vente Bus", roles: ["owner", "manager", "secretary", "accountant"] },
  { id: "staff", label: "👥 Comptes Équipe (6 rôles)", roles: ["owner", "manager"] },
  { id: "finance", label: "💳 Comptabilité", roles: ["owner", "accountant"] },
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

  const allowedTabs = useMemo(() => TABS.filter((t) => t.roles.includes(role)), [role]);
  const [tab, setTab] = useState<TabId>(() => {
    if (role === "secretary" || role === "staff") return "desk";
    if (role === "driver") return "driver";
    if (role === "accountant") return "finance";
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
    avg_speed_kmh: 75,
    has_gps: false,
    gps_device_id: "",
  });
  const [routeForm, setRouteForm] = useState({ origin_name: "", dest_name: "", distance_km: 240, duration_min: 210 });

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

  // Équipe (6 rôles isolés)
  const [staffRows, setStaffRows] = useState<
    {
      user_id: number;
      role: AgencyRole;
      job_title: string | null;
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
    password: "",
  });

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
    payments: { id: number; reference: string; channel: string; provider: string; amount: number; status: string; created_at: string }[];
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
      } else if (tab === "staff") {
        const s = await api<typeof staffRows>("/agency/staff", { realm: "agency" });
        setStaffRows(s);
      } else if (tab === "commercial") {
        const r = await api<typeof rentals>("/agency/rentals", { realm: "agency" });
        setRentals(r);
        if (role === "owner" || role === "manager") {
          const m = await api<typeof market>("/agency/bus-listings", { realm: "agency" });
          setMarket(m);
        }
      } else if (tab === "finance") {
        const f = await api<NonNullable<typeof finance>>("/agency/finance", { realm: "agency" });
        setFinance(f);
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

  if (!agencySession) return null;

  // --- Actions ---
  async function createTrip(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    try {
      await api("/agency/trips", {
        body: {
          ...tripForm,
          driver_id: tripForm.driver_id || null,
          vip_price: tripForm.vip_price ? Number(tripForm.vip_price) : null,
        },
        realm: "agency",
      });
      setNotice("✓ Nouveau voyage programmé et ouvert à la réservation !");
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
      setNewStaff({ role: "secretary", first_name: "", last_name: "", email: "", phone: "", job_title: "", password: "" });
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

  return (
    <div className="container page">
      {/* En-tête de session isolée */}
      <div className="workspace-banner card">
        <div>
          <div className="chips" style={{ marginBottom: 6 }}>
            <span className="badge mono">ID : {agencySession.agency.public_code}</span>
            <span className="badge">{ROLE_LABELS[role]}</span>
            <span className="badge">
              {agencySession.agency.status === "active" ? "🟢 Agence active" : "🟠 En revue de vérification"}
            </span>
          </div>
          <h1 className="display display-xl" style={{ margin: 0 }}>
            {agencySession.agency.name}
          </h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
            Session personnelle cloisonnée de <strong>{agencySession.user.first_name} {agencySession.user.last_name}</strong> ({agencySession.user.email}) ·{" "}
            📍 {agencySession.agency.address}
          </p>
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

      {/* ==================== 2. GUICHET & SECRÉTARIAT ==================== */}
      {tab === "desk" && <Desk embedded />}

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
            <form className="card form-grid" onSubmit={createTrip}>
              <h3 className="subheading" style={{ margin: 0 }}>Programmer un nouveau départ</h3>
              <label className="field">
                <span className="field__label">Ligne</span>
                <select
                  className="select"
                  value={tripForm.route_id}
                  onChange={(e) => setTripForm({ ...tripForm, route_id: Number(e.target.value) })}
                >
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
                  value={tripForm.bus_id}
                  onChange={(e) => setTripForm({ ...tripForm, bus_id: Number(e.target.value) })}
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} ({b.plate} · {b.seat_count} pl.)
                    </option>
                  ))}
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

              <button type="submit" className="btn" disabled={!tripForm.route_id || !tripForm.bus_id}>
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
                      <div>
                        <button
                          type="button"
                          className={reportForm.trip_id === tr.id ? "chip is-active" : "chip"}
                          onClick={() => setReportForm({ ...reportForm, trip_id: tr.id })}
                        >
                          Sélectionner pour signaler mon évolution
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
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
                  <span className="field__label">Rangées</span>
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
              <button type="submit" className="btn">
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

      {/* ==================== 7. COMPTES ÉQUIPE ISOLÉS (6 RÔLES) ==================== */}
      {tab === "staff" && (
        <div className="agency-layout">
          <div className="card form-grid">
            <div>
              <h2 className="subheading" style={{ margin: 0 }}>Comptes du personnel ({staffRows.length})</h2>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
                Chaque membre possède ses propres identifiants et son propre code PIN à 5 chiffres. Aucun employé ne
                peut ouvrir l’interface d’un autre rôle.
              </p>
            </div>

            <ul className="call-list">
              {staffRows.map((m) => (
                <li key={m.user_id} className="call-row">
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <strong>
                        {m.first_name} {m.last_name}
                      </strong>{" "}
                      <span className="badge">{ROLE_LABELS[m.role]}</span>
                    </div>
                    <span className="badge">{m.status === "active" ? "Actif" : "Révoqué"}</span>
                  </div>
                  <span className="muted mono" style={{ fontSize: "var(--text-xs)" }}>
                    {m.email} {m.phone ? `· ${m.phone}` : ""}
                  </span>
                  {m.role === "driver" && (
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      {AVAIL_LABELS[m.availability ?? "available"]} ·{" "}
                      {m.mood ? MOOD_LABELS[m.mood] : ""}{" "}
                      {m.mood_note ? `— « ${m.mood_note} »` : ""}
                    </span>
                  )}
                  {role === "owner" && m.role !== "owner" && (
                    <div>
                      <button type="button" className="chip" onClick={() => toggleStaff(m.user_id)}>
                        {m.status === "active" ? "Verrouiller / Révoquer l’accès" : "Réactiver le compte"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {role === "owner" && (
            <aside className="side-stack">
              <form className="card form-grid" onSubmit={createStaffAccount}>
                <h3 className="subheading" style={{ margin: 0 }}>Ajouter un compte isolé</h3>
                <label className="field">
                  <span className="field__label">Type de compte (droits cloisonnés)</span>
                  <select
                    className="select"
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as AgencyRole })}
                  >
                    <option value="secretary">Secrétaire (Départs-arrivées, billets, reports, absents)</option>
                    <option value="driver">Chauffeur (Bus alloués, évolution km/h, bouchons, ressenti)</option>
                    <option value="staff">Membre du personnel (Contrôle QR & bagages)</option>
                    <option value="manager">Responsable Programmation (Flotte, lignes, horaires)</option>
                    <option value="accountant">Comptable (Recettes, remboursements, devis)</option>
                  </select>
                </label>

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
              <span className="muted">Recette nette agence (99,5 %)</span>
              <strong className="display kpi-card__value mono">{money(finance.net)}</strong>
            </div>
          </div>

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
                      Canal : {p.channel} · {p.provider} · {p.status}
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
    </div>
  );
}
