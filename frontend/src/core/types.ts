// Types partagés avec l'API PHP VELTRON v2 (espaces Passager, Agence & Supervision).

export type AgencyRole = "owner" | "manager" | "secretary" | "driver" | "staff" | "accountant";

export interface PassengerUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  locale: string;
  realm: "passenger";
}

export interface AgencyInfo {
  id: number;
  public_code: string;
  slug: string;
  name: string;
  primary_color: string;
  currency_code: string;
  minor_units: number;
  currency_symbol: string;
  status: "pending" | "active" | "suspended";
  verification_status: string;
  verification_score: number | null;
  fill_window_minutes: number;
  refund_cutoff_minutes: number;
  free_baggage_kg: number;
  baggage_fee_per_kg: number;
  transfer_fee: number;
  points_per_trip: number;
  email: string;
  phone: string | null;
  address: string;
}

export interface AgencySession {
  user: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    matricule?: string | null;
    custom_role?: string | null;
    job_title?: string | null;
    avatar_url?: string | null;
    dashboard_modules?: string[] | null;
  };
  role: AgencyRole;
  agency: AgencyInfo;
}

export interface PlatformAdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  platform_role: "admin" | "super_admin";
}

export interface Country {
  id: number;
  iso2: string;
  name_fr: string;
  name_en: string;
  default_currency: string;
  phone_prefix: string;
  currency_name?: string;
  currency_symbol?: string;
  minor_units?: number;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  minor_units: number;
}

export interface AgencySummary {
  id: number;
  slug: string;
  name: string;
  primary_color: string;
  logo_path: string | null;
  cover_path: string | null;
  city_name?: string | null;
  points_per_trip?: number;
  upcoming_trips?: number;
  currency_code: string;
  country: string;
  country_name?: string;
  rating: string | null;
  reviews_count: number;
}

export interface AgencyDetail {
  slug: string;
  name: string;
  primary_color: string;
  logo_path: string | null;
  currency_code: string;
  minor_units: number;
  email: string;
  phone: string | null;
  address?: string;
  points_per_trip?: number;
  refund_cutoff_minutes: number;
  free_baggage_kg: string;
  country: string;
  routes: { id: number; origin: string; destination: string; distance_km?: number | null; duration_min: number | null }[];
  refund_tiers: { min_minutes_before: number; refund_percent: number }[];
  rewards?: { id: number; title: string; description: string | null; points_required: number }[];
}

export interface Driver {
  first_name: string;
  photo_path: string | null;
  licence_verified?: number;
}

export interface TripSummary {
  id: number;
  route_id: number;
  departs_at: string;
  arrives_at: string | null;
  price: number;
  vip_price: number | null;
  delay_minutes?: number;
  distance_km?: number | null;
  origin: string;
  destination: string;
  timezone: string;
  bus_label: string;
  bus_type: string;
  seat_count: number;
  free_seats: number;
  drivers: Driver[];
}

export interface Seat {
  id: number;
  seat_no: number;
  row_no: number;
  col_no: number;
  seat_class: "standard" | "vip";
  taken: boolean;
}

export interface TripDetail {
  id: number;
  departs_at: string;
  arrives_at: string | null;
  price: number;
  vip_price: number | null;
  status: string;
  delay_minutes?: number;
  points_per_trip?: number;
  bus_label: string;
  bus_type: string;
  layout: { seats_per_row: number[] };
  origin: string;
  destination: string;
  timezone: string;
  agency_slug: string;
  agency_name: string;
  primary_color: string;
  currency_code: string;
  minor_units: number;
  refund_cutoff_minutes: number;
  seats: Seat[];
}

export interface RefundQuote {
  allowed: boolean;
  percent: number;
  amount: number;
  minutes_before: number;
  cutoff_minutes: number;
}

export interface TicketListItem {
  id: number;
  status: string;
  passenger_name: string;
  price: number;
  seat_no: number;
  reference: string;
  currency_code: string;
  trip_id: number;
  trip_status?: string;
  delay_minutes?: number;
  departs_at: string;
  origin: string;
  destination: string;
  timezone: string;
  slug: string;
  agency_name: string;
  primary_color: string;
  reviewed: boolean;
  refund: RefundQuote;
}

export interface TicketDetail {
  id: number;
  trip_id: number;
  trip_status?: string;
  delay_minutes?: number;
  status: string;
  passenger_name: string;
  id_type: string | null;
  qr_token: string;
  price: number;
  seat_no: number;
  seat_class: string;
  reference: string;
  currency_code: string;
  departs_at: string;
  arrives_at: string | null;
  origin: string;
  destination: string;
  timezone: string;
  bus_label: string;
  slug: string;
  agency_name: string;
  primary_color: string;
  minor_units: number;
  transfer_fee?: number;
  refund: RefundQuote;
  postpone_options?: { id: number; departs_at: string; bus_label: string; free_seats: number }[];
  luggage: { tag_code: string; pieces: number; weight_kg: string; status: string }[];
  drivers: Driver[];
}

export interface TrackingUpdate {
  id: number;
  kind: "departed" | "position" | "delay" | "prolonged_stop" | "deviation" | "breakdown" | "resumed" | "arrived" | "info";
  cause: string | null;
  delay_minutes: number | null;
  lat?: number | null;
  lng?: number | null;
  speed_kmh: number | null;
  progress_pct: number | null;
  note: string | null;
  created_at: string;
  author?: string;
}

export interface MapsConfig {
  provider: "none" | "google" | "mapbox" | string;
  google_maps_api_key: string;
  mapbox_access_token: string;
}

export interface LiveTrackingData {
  trip_id: number;
  reference: string | null;
  agency_name: string;
  agency_slug: string;
  primary_color: string;
  origin: string;
  destination: string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  dest_lat?: number | null;
  dest_lng?: number | null;
  current_lat?: number | null;
  current_lng?: number | null;
  timezone: string;
  bus_label: string;
  plate: string;
  has_gps?: boolean;
  gps_device_id?: string | null;
  tracking_mode?: "gps" | "manual";
  status: string;
  departs_at: string;
  scheduled_arrives_at: string | null;
  estimated_arrives_at: string | null;
  postponed_from: string | null;
  distance_km: number;
  remaining_km: number;
  progress_pct: number;
  speed_kmh: number;
  avg_speed_kmh: number;
  delay_minutes: number;
  active_cause: string | null;
  drivers: Driver[];
  updates: TrackingUpdate[];
}

export interface DeskTrip {
  id: number;
  agency_id: number;
  departs_at: string;
  arrives_at: string | null;
  status: string;
  delay_minutes: number;
  price: number;
  origin: string;
  destination: string;
  timezone: string;
  bus_label: string;
  plate: string;
  seat_count: number;
  fill_window_minutes: number;
  booked: number;
  boarded: number;
  no_shows: number;
  current_lat?: number | null;
  current_lng?: number | null;
  current_speed_kmh?: number | null;
  current_progress_pct?: number | null;
  last_gps_at?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
}

export interface ManifestTicket {
  id: number;
  status: string;
  passenger_name: string;
  id_type: string | null;
  id_number: string | null;
  phone: string | null;
  checked_in_at: string | null;
  late_notice: string | null;
  seat_id: number;
  seat_no: number;
  seat_class: string;
  reference: string;
  luggage_pieces: number;
}

export interface Manifest {
  trip_id: number;
  departs_at: string;
  arrives_at: string | null;
  status: string;
  delay_minutes: number;
  fill_window_minutes: number;
  price: number;
  currency_code: string;
  layout: { seats_per_row: number[] } | null;
  seats: { id: number; seat_no: number; row_no: number; col_no: number; seat_class: string }[];
  tickets: ManifestTicket[];
}

export interface FillCandidate {
  ticket_id: number;
  passenger_name: string;
  reference: string;
  seat_no: number;
  from_trip_id: number;
  from_departs_at: string;
  gap_minutes: number;
  checked_in: boolean;
}

export interface VerificationReport {
  approved: boolean;
  verification_status: string;
  agency_status: string;
  score: number;
  summary: string;
  flags: string[];
  checks: { code: string; ok: boolean; points: number; label: string }[];
  ai_used: boolean;
}
