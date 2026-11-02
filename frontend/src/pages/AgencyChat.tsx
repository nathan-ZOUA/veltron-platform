import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { initials } from "../core/format";

interface ChatMember {
  user_id: number;
  first_name: string;
  last_name: string;
  role: string;
  job_title: string | null;
  availability: string | null;
  mood: number | null;
}

interface ChatGroup {
  id: number;
  name: string;
  description: string | null;
  kind: string;
  theme: string;
  is_admin: boolean;
  unread: number;
  members: ChatMember[];
}

interface Colleague {
  user_id: number;
  first_name: string;
  last_name: string;
  role: string;
}

interface ChatMessageItem {
  id: number;
  sender_user_id: number;
  kind: "text" | "system" | "module_request";
  ciphertext: string;
  text?: string;
  created_at: string;
  first_name: string;
  last_name: string;
  role: string | null;
}

const THEME_META: Record<string, { label: string; dot: string }> = {
  aurora: { label: "Veltron Aurora", dot: "#8c6bb8" },
  whatsapp: { label: "WhatsApp Émeraude", dot: "#1fa855" },
  instagram: { label: "Instagram Direct", dot: "#d62976" },
  ocean: { label: "Océan Profond", dot: "#2563eb" },
  savane: { label: "Or Savane", dot: "#d97706" },
  minimal: { label: "Ardoise Pro", dot: "#475569" },
};

const ROLE_NAMES: Record<string, string> = {
  owner: "Admin",
  manager: "Programmation",
  secretary: "Secrétaire",
  driver: "Chauffeur",
  staff: "Personnel",
  accountant: "Comptable",
};

const AVAIL_LABELS: Record<string, string> = {
  available: "🟢 Disponible",
  on_trip: "🚌 En course",
  resting: "☕ En pause",
  unavailable: "🔴 Indisponible",
  maintenance: "🔧 En maintenance",
};

const QUICK_REPLIES = [
  "👍 Bien reçu",
  "🚌 Prêt au départ",
  "🚦 Trafic fluide sur l’axe",
  "📦 Embarquement clôturé",
];

// Messagerie d'équipe interne à chaque agence : tous les membres d'une même agence
// voient directement tous les messages qu'ils s'échangent entre eux (style WhatsApp / Instagram Direct).
export default function AgencyChat() {
  const { agencySession } = useAuth();
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [reads, setReads] = useState<{ user_id: number; last_read_id: number }[]>([]);
  const [draft, setDraft] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
    theme: "whatsapp",
    member_ids: [] as number[],
  });

  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canCreateGroup =
    agencySession && ["owner", "manager", "secretary"].includes(agencySession.role);

  const bootstrap = useCallback(async () => {
    const data = await api<{ groups: ChatGroup[]; colleagues: Colleague[] }>("/agency/chat/bootstrap", {
      realm: "agency",
    });
    setGroups(data.groups);
    setColleagues(data.colleagues);
    if (data.groups.length > 0) {
      setActiveId((prev) => prev ?? data.groups[0].id);
    }
    return data.groups;
  }, []);

  useEffect(() => {
    if (!agencySession) return;
    bootstrap().catch((e) => {
      setError(e instanceof ApiError ? e.message : "Impossible de charger la messagerie d'équipe.");
    });
  }, [agencySession, bootstrap]);

  const loadRoom = useCallback(async (group: ChatGroup) => {
    const res = await api<{
      theme: string;
      messages: ChatMessageItem[];
      reads: { user_id: number; last_read_id: number }[];
    }>(`/agency/chat/groups/${group.id}/messages`, { realm: "agency" });

    setMessages(res.messages);
    setReads(res.reads);
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, theme: res.theme, unread: 0 } : g)),
    );
  }, []);

  const activeGroup = groups.find((g) => g.id === activeId) ?? null;

  useEffect(() => {
    if (!activeGroup) return;
    loadRoom(activeGroup).catch(() => {});

    const timer = window.setInterval(() => {
      loadRoom(activeGroup).catch(() => {});
    }, 3500);
    return () => window.clearInterval(timer);
  }, [activeGroup?.id, loadRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  async function sendText(textToSend: string) {
    if (!activeGroup || !textToSend.trim()) return;
    setSending(true);
    setError("");
    try {
      await api(`/agency/chat/groups/${activeGroup.id}/messages`, {
        body: { text: textToSend.trim() },
        realm: "agency",
      });
      setDraft("");
      await loadRoom(activeGroup);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await sendText(draft);
  }

  async function changeTheme(theme: string) {
    if (!activeGroup) return;
    setThemeOpen(false);
    try {
      await api(`/agency/chat/groups/${activeGroup.id}/theme`, { body: { theme }, realm: "agency" });
      await loadRoom(activeGroup);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible de changer le thème.");
    }
  }

  const [respondingId, setRespondingId] = useState<number | null>(null);

  async function handleModuleDecision(messageId: number, decision: "approve" | "reject") {
    if (!activeGroup) return;
    setRespondingId(messageId);
    setError("");
    try {
      await api(`/agency/chat/module-request/${messageId}/respond`, {
        body: { decision },
        realm: "agency",
      });
      await loadRoom(activeGroup);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors du traitement de la demande.");
    } finally {
      setRespondingId(null);
    }
  }

  async function createCustomGroup(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await api<{ id: number }>("/agency/chat/groups", {
        body: newGroup,
        realm: "agency",
      });
      setNewGroupOpen(false);
      setNewGroup({ name: "", description: "", theme: "whatsapp", member_ids: [] });
      const list = await bootstrap();
      const createdGrp = list.find((g) => g.id === res.id);
      if (createdGrp) setActiveId(createdGrp.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Création du groupe refusée.");
    }
  }

  if (!agencySession) return null;

  return (
    <div className={`chat-shell chat-theme--${activeGroup?.theme ?? "aurora"}`}>
      {/* Colonne gauche : Salons de discussion de l'agence façon WhatsApp / Instagram */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar__head">
          <div>
            <strong>Salons de l'agence</strong>
            <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
              💬 Visibles par toute l'équipe {agencySession.agency.name}
            </div>
          </div>
          {canCreateGroup && (
            <button type="button" className="chip is-active" onClick={() => setNewGroupOpen(true)}>
              + Salon
            </button>
          )}
        </div>

        <div className="chat-sidebar__list">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className={g.id === activeId ? "chat-room-btn is-active" : "chat-room-btn"}
              onClick={() => setActiveId(g.id)}
            >
              <span
                className="chat-room-btn__avatar"
                style={{ background: THEME_META[g.theme]?.dot ?? "var(--accent)" }}
              >
                {initials(g.name)}
              </span>
              <div className="chat-room-btn__meta">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <strong>{g.name}</strong>
                  {g.unread > 0 && <span className="chat-unread">{g.unread}</span>}
                </div>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {g.members.length} membre(s) · {THEME_META[g.theme]?.label ?? g.theme}
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Zone centrale de conversation */}
      <section className="chat-main">
        {activeGroup ? (
          <>
            <header className="chat-header">
              <div>
                <h3 style={{ margin: 0, fontSize: "var(--text-base)" }}>{activeGroup.name}</h3>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {activeGroup.members
                    .map((m) => `${m.first_name} (${ROLE_NAMES[m.role] ?? m.role})`)
                    .join(", ")}
                </span>
              </div>

              <div className="chips" style={{ position: "relative" }}>
                <button type="button" className="chip" onClick={() => setThemeOpen((v) => !v)}>
                  🎨 Thème : {THEME_META[activeGroup.theme]?.label ?? activeGroup.theme}
                </button>
                <button type="button" className="chip" onClick={() => setMembersModalOpen(true)}>
                  👥 Équipe ({activeGroup.members.length})
                </button>

                {themeOpen && (
                  <div className="chat-theme-popover card">
                    {Object.entries(THEME_META).map(([key, meta]) => (
                      <button
                        key={key}
                        type="button"
                        className={activeGroup.theme === key ? "chat-theme-item is-active" : "chat-theme-item"}
                        onClick={() => changeTheme(key)}
                      >
                        <span className="chat-theme-dot" style={{ background: meta.dot }} />
                        <span>{meta.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </header>

            <div className="chat-encryption-banner">
              💬 Canal interne direct de <strong>{agencySession.agency.name}</strong> : tous les membres de votre agence
              (administrateur, programmation, secrétaire, chauffeurs, personnel et comptable) voient instantanément tous
              les messages échangés ici.
            </div>

            <div className="chat-stream">
              {messages.length === 0 && (
                <p className="muted" style={{ textAlign: "center", marginTop: 28 }}>
                  Aucun message dans ce salon. Lancez la discussion avec votre équipe !
                </p>
              )}

              {messages.map((m) => {
                const bodyText = m.text ?? m.ciphertext;
                const timeStr = new Date(m.created_at).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                if (m.kind === "system") {
                  return (
                    <div key={m.id} className="chat-system-pill">
                      {bodyText}
                    </div>
                  );
                }

                if (m.kind === "module_request") {
                  let reqPayload: any = null;
                  try {
                    reqPayload = JSON.parse(m.ciphertext);
                  } catch {
                    reqPayload = null;
                  }
                  if (!reqPayload) return null;

                  const isOwner = agencySession.role === "owner";
                  const status = reqPayload.status || "pending";

                  const MODULE_NAMES: Record<string, { label: string; icon: string }> = {
                    desk: { label: "Guichet (Vente & Billetterie)", icon: "🎫" },
                    boarding: { label: "Appel Passagers (Embarquement)", icon: "📋" },
                    fleet: { label: "Flotte & Lignes", icon: "🚌" },
                    tracking: { label: "Flotte & GPS en Direct", icon: "🗺️" },
                    rentals: { label: "Location de Bus", icon: "🤝" },
                    sales: { label: "Bourse & Vente Bus", icon: "🛒" },
                    analytics: { label: "Diagramme des Ventes", icon: "📊" },
                    cash_journal: { label: "Comptabilité & Caisse", icon: "💼" },
                    settings: { label: "Sécurité & Audit", icon: "⚙️" },
                    trips: { label: "Programmation des voyages", icon: "🗓️" },
                  };

                  return (
                    <div
                      key={m.id}
                      className="chat-module-request-card"
                      style={{
                        margin: "12px auto",
                        maxWidth: 520,
                        width: "100%",
                        background: "var(--surface)",
                        border: `2px solid ${status === "approved" ? "#22c55e" : status === "rejected" ? "#ef4444" : "var(--accent)"}`,
                        borderRadius: 14,
                        padding: "14px 16px",
                        boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 22 }}>📋</span>
                          <div>
                            <strong style={{ fontSize: "var(--text-sm)", display: "block" }}>
                              Demande d'Évolution de Tableau de Bord
                            </strong>
                            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                              {reqPayload.applicant_name} ({ROLE_NAMES[reqPayload.applicant_role] ?? reqPayload.applicant_role})
                              {reqPayload.applicant_matricule ? ` · Matricule : ${reqPayload.applicant_matricule}` : ""}
                            </span>
                          </div>
                        </div>
                        <span className="mono muted" style={{ fontSize: 11 }}>{timeStr}</span>
                      </div>

                      <div style={{ margin: "10px 0" }}>
                        <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: 6, color: "var(--muted)" }}>
                          Modules sollicités par l'employé :
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {(reqPayload.modules || []).map((modKey: string) => {
                            const meta = MODULE_NAMES[modKey] || { label: modKey, icon: "📦" };
                            return (
                              <span
                                key={modKey}
                                className="badge"
                                style={{
                                  background: "rgba(140, 107, 184, 0.15)",
                                  color: "var(--accent)",
                                  fontSize: "var(--text-xs)",
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                }}
                              >
                                {meta.icon} {meta.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {status === "pending" && (
                        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                          {isOwner ? (
                            <div>
                              <div style={{ fontSize: "var(--text-xs)", marginBottom: 8, color: "var(--text)" }}>
                                ⚡ <strong>Action Administrateur requise :</strong> Validez-vous l'ajout de ces modules au poste de cet agent ?
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  style={{ background: "#22c55e", borderColor: "#22c55e", padding: "6px 14px", fontSize: "var(--text-xs)" }}
                                  disabled={respondingId === m.id}
                                  onClick={() => handleModuleDecision(m.id, "approve")}
                                >
                                  {respondingId === m.id ? "Validation..." : "✅ Oui / Valider"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  style={{ color: "#ef4444", borderColor: "#ef4444", padding: "6px 14px", fontSize: "var(--text-xs)" }}
                                  disabled={respondingId === m.id}
                                  onClick={() => handleModuleDecision(m.id, "reject")}
                                >
                                  {respondingId === m.id ? "Refus..." : "❌ Non / Décliner"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--muted)" }}>
                              <span>⏳</span>
                              <em>En attente de validation par l'Administrateur de l'agence.</em>
                            </div>
                          )}
                        </div>
                      )}

                      {status === "approved" && (
                        <div style={{ marginTop: 10, background: "rgba(34, 197, 94, 0.1)", color: "#15803d", padding: "8px 12px", borderRadius: 8, fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>✅</span>
                          <strong>Validé par l'administrateur {reqPayload.decided_by_name ? `(${reqPayload.decided_by_name})` : ""}. Modules activés sans perte de données.</strong>
                        </div>
                      )}

                      {status === "rejected" && (
                        <div style={{ marginTop: 10, background: "rgba(239, 68, 68, 0.1)", color: "#b91c1c", padding: "8px 12px", borderRadius: 8, fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>❌</span>
                          <strong>Demande refusée par l'administrateur {reqPayload.decided_by_name ? `(${reqPayload.decided_by_name})` : ""}.</strong>
                        </div>
                      )}
                    </div>
                  );
                }

                const mine = m.sender_user_id === agencySession.user.id;
                const seenByOthers = reads.some(
                  (r) => r.user_id !== agencySession.user.id && Number(r.last_read_id) >= m.id,
                );

                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={mine ? "chat-bubble-row is-mine" : "chat-bubble-row"}
                  >
                    <div className={mine ? "chat-bubble chat-bubble--mine" : "chat-bubble"}>
                      {!mine && (
                        <div className="chat-bubble__author">
                          <strong>
                            {m.first_name} {m.last_name}
                          </strong>
                          {m.role && <span className="chat-role-tag">{ROLE_NAMES[m.role] ?? m.role}</span>}
                        </div>
                      )}
                      <p className="chat-bubble__text">{bodyText}</p>
                      <div className="chat-bubble__meta mono">
                        <span>{timeStr}</span>
                        {mine && <span>{seenByOthers ? "✓✓" : "✓"}</span>}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {error && (
              <p className="error" style={{ paddingInline: 16, margin: 0 }}>
                {error}
              </p>
            )}

            <div className="chat-quick-bar">
              {QUICK_REPLIES.map((qr) => (
                <button key={qr} type="button" className="chip" disabled={sending} onClick={() => sendText(qr)}>
                  {qr}
                </button>
              ))}
            </div>

            <form className="chat-composer" onSubmit={handleSubmit}>
              <input
                className="input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Écrire un message à l'équipe dans #${activeGroup.name}…`}
              />
              <button type="submit" className="btn" disabled={!draft.trim() || sending}>
                {sending ? "…" : "Envoyer ➤"}
              </button>
            </form>
          </>
        ) : (
          <div style={{ padding: 32 }}>
            <p className="muted">Choisissez un salon de discussion.</p>
          </div>
        )}
      </section>

      {/* Modale des membres du salon et état des chauffeurs */}
      {membersModalOpen && activeGroup && (
        <div className="modal-backdrop" onClick={() => setMembersModalOpen(false)}>
          <div className="modal-panel card form-grid" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel__head">
              <h3 className="subheading" style={{ margin: 0 }}>
                👥 Membres du salon « {activeGroup.name} »
              </h3>
              <button type="button" className="btn btn--icon" onClick={() => setMembersModalOpen(false)}>
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Tous les membres actifs de <strong>{agencySession.agency.name}</strong> voient et reçoivent en temps réel
              les messages échangés dans ce salon :
            </p>
            <ul className="call-list">
              {activeGroup.members.map((m) => (
                <li key={m.user_id} className="call-row">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>
                      {m.first_name} {m.last_name} ({ROLE_NAMES[m.role] ?? m.role})
                    </strong>
                    <span className="badge">
                      {m.availability ? (AVAIL_LABELS[m.availability] ?? m.availability) : "Membre actif"}
                    </span>
                  </div>
                  {m.job_title && (
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      {m.job_title}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Modale de création d'un nouveau groupe d'équipe */}
      {newGroupOpen && (
        <div className="modal-backdrop" onClick={() => setNewGroupOpen(false)}>
          <form className="modal-panel card form-grid" onClick={(e) => e.stopPropagation()} onSubmit={createCustomGroup}>
            <div className="modal-panel__head">
              <h3 className="subheading" style={{ margin: 0 }}>Créer un nouveau salon d’équipe</h3>
              <button type="button" className="btn btn--icon" onClick={() => setNewGroupOpen(false)}>
                ✕
              </button>
            </div>

            <label className="field">
              <span className="field__label">Nom du salon</span>
              <input
                className="input"
                required
                placeholder="Ex. Urgences Axe Nord / Secrétariat & Chauffeurs"
                value={newGroup.name}
                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field__label">Thème visuel initial</span>
              <select
                className="select"
                value={newGroup.theme}
                onChange={(e) => setNewGroup({ ...newGroup, theme: e.target.value })}
              >
                {Object.entries(THEME_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="field">
              <span className="field__label">Membres de l'agence associés</span>
              <div className="chips">
                {colleagues.map((col) => {
                  const checked = newGroup.member_ids.includes(col.user_id);
                  return (
                    <button
                      key={col.user_id}
                      type="button"
                      className={checked ? "chip is-active" : "chip"}
                      onClick={() =>
                        setNewGroup((prev) => ({
                          ...prev,
                          member_ids: checked
                            ? prev.member_ids.filter((id) => id !== col.user_id)
                            : [...prev.member_ids, col.user_id],
                        }))
                      }
                    >
                      {checked ? "✓ " : "+ "}
                      {col.first_name} ({ROLE_NAMES[col.role] ?? col.role})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="wizard-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setNewGroupOpen(false)}>
                Annuler
              </button>
              <button type="submit" className="btn">
                Créer le salon d'équipe
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
