import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../core/api";
import { useAuth } from "../core/auth";
import { initials } from "../core/format";
import { soundFX } from "../core/soundFx";
import WhatsAppVoicePlayer from "../components/WhatsAppVoicePlayer";
import WhatsAppCallModal from "../components/WhatsAppCallModal";
import "../styles/whatsapp-chat.css";

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
  kind: "text" | "system" | "module_request" | "voice" | "image" | "call_started" | "call_ended";
  ciphertext: string;
  text?: string;
  created_at: string;
  first_name: string;
  last_name: string;
  role: string | null;
}

interface ActiveCallData {
  id: number;
  group_id: number;
  caller_id: number;
  caller_name: string;
  caller_role: string;
  status: "calling" | "connected" | "ended";
  sdp_offer: string | null;
  sdp_answer: string | null;
}

const THEME_META: Record<string, { label: string; dot: string }> = {
  whatsapp: { label: "WhatsApp Émeraude Pro", dot: "#1fa855" },
  aurora: { label: "Veltron Aurora", dot: "#8c6bb8" },
  instagram: { label: "Instagram Direct", dot: "#d62976" },
  ocean: { label: "Océan Profond", dot: "#2563eb" },
  savane: { label: "Or Savane", dot: "#d97706" },
  minimal: { label: "Ardoise Pro", dot: "#475569" },
};

const ROLE_NAMES: Record<string, string> = {
  owner: "Administrateur",
  manager: "Programmation",
  secretary: "Secrétaire",
  driver: "Chauffeur",
  staff: "Personnel de Quai",
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
  "🎫 Client enregistré au guichet",
];

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "👏", "🚌", "🔥"];

const EMOJI_CATEGORIES = [
  {
    id: "smileys",
    name: "😀 Visages",
    emojis: [
      { char: "😀", keywords: "sourire content joie heureux happy smile" },
      { char: "😃", keywords: "sourire grand joie happy" },
      { char: "😄", keywords: "sourire yeux joie happy" },
      { char: "😁", keywords: "sourire dents smile" },
      { char: "😆", keywords: "rire yeux fermes lol" },
      { char: "😅", keywords: "sueur ouf soulagement sweat" },
      { char: "😂", keywords: "rire larmes mdr mort de rire tears joy" },
      { char: "🤣", keywords: "rouler par terre rire rofl" },
      { char: "😊", keywords: "sourire rougeur timide blush" },
      { char: "😇", keywords: "ange innocent pure saint" },
      { char: "🙂", keywords: "sourire leger ok" },
      { char: "😉", keywords: "clin oeil complice wink" },
      { char: "😍", keywords: "coeur yeux amour adore love" },
      { char: "🥰", keywords: "coeurs amour calin affection" },
      { char: "😘", keywords: "bisou coeur kiss" },
      { char: "😎", keywords: "lunettes soleil cool chef boss" },
      { char: "🤩", keywords: "etoiles yeux fan bravo" },
      { char: "🥳", keywords: "fete anniversaire cotillons party" },
      { char: "🤔", keywords: "reflexion reflechir penser think" },
      { char: "🫡", keywords: "salut militaire respect chef ordre" },
      { char: "🤐", keywords: "secret motus bouche cousue" },
      { char: "😴", keywords: "dormir sommeil fatigue sleep" },
      { char: "🤯", keywords: "explosion cerveau choc mindblown" },
      { char: "🥵", keywords: "chaud sueur chaleur hot" },
      { char: "🥶", keywords: "froid gel glace cold" },
      { char: "😱", keywords: "peur cri choc scream" },
      { char: "🥺", keywords: "pleurer supplication please" },
      { char: "👍", keywords: "pouce haut ok bien valide d'accord good" },
      { char: "👎", keywords: "pouce bas mauvais non bad" },
      { char: "👌", keywords: "parfait ok excellent" },
      { char: "✌️", keywords: "victoire paix peace" },
      { char: "🤞", keywords: "doigts croises chance hope" },
      { char: "🤝", keywords: "poignee main accord partenariat deal" },
      { char: "👏", keywords: "applaudir bravo felicitations clap" },
      { char: "🙌", keywords: "mains levees celebration victoire" },
      { char: "🙏", keywords: "priere merci grace gratitude please" },
      { char: "💪", keywords: "muscle force fort courage power" },
    ],
  },
  {
    id: "travel",
    name: "🚌 Trajets",
    emojis: [
      { char: "🚌", keywords: "bus autocar transport trajet route voyage" },
      { char: "🚍", keywords: "bus face transport collectif" },
      { char: "🚐", keywords: "minibus van transport agence" },
      { char: "🚎", keywords: "trolleybus bus" },
      { char: "🚖", keywords: "taxi jaune transport gare" },
      { char: "🚗", keywords: "voiture auto transport" },
      { char: "🚘", keywords: "voiture face automobile" },
      { char: "🛣️", keywords: "autoroute route corridor trajet" },
      { char: "⛽", keywords: "carburant essence gasoil pompe" },
      { char: "🚦", keywords: "feu tricolore signal circulation" },
      { char: "🎫", keywords: "billet ticket reservation pass quai" },
      { char: "🎟️", keywords: "ticket coupon entree" },
      { char: "🧳", keywords: "valise bagage voyage sac luggage" },
      { char: "🗺️", keywords: "carte plan gps itineraire map" },
      { char: "⏱️", keywords: "chrono temps heure ponctualite retard" },
      { char: "📍", keywords: "lieu position localisation gps pin" },
      { char: "🚩", keywords: "drapeau destination etape" },
      { char: "🏁", keywords: "arrivee finish terminus" },
    ],
  },
  {
    id: "work",
    name: "💼 Caisse & Gare",
    emojis: [
      { char: "💼", keywords: "valise mallette travail bureau job" },
      { char: "📋", keywords: "presse papier appel passagers manifeste controle" },
      { char: "📝", keywords: "note bloc note ecrire" },
      { char: "💵", keywords: "argent especes cash billet monnaie franc" },
      { char: "💰", keywords: "sac argent caisse total recettes" },
      { char: "💳", keywords: "carte bancaire visa mastercard paiement" },
      { char: "🏢", keywords: "agence batiment siege gare bureau" },
      { char: "🏪", keywords: "guichet comptoir boutique" },
      { char: "📞", keywords: "telephone appel combine" },
      { char: "📱", keywords: "smartphone mobile whatsapp contact" },
      { char: "🖨️", keywords: "imprimante imprimer recu ticket" },
      { char: "📦", keywords: "colis paquet fret expedition" },
      { char: "🔑", keywords: "cle acces securite contact" },
      { char: "📢", keywords: "annonce haut parleur micro quai alerte" },
      { char: "🚨", keywords: "gyrophare alerte urgence attention" },
      { char: "⚠️", keywords: "danger attention avertissement" },
      { char: "🟢", keywords: "vert a bord ok valide connecte" },
      { char: "🔴", keywords: "rouge absent stop alerte ferme" },
      { char: "🟡", keywords: "jaune attente retard warning" },
      { char: "⚪", keywords: "blanc neutre libre" },
      { char: "🔒", keywords: "cadenas verrouille securise chiffre" },
    ],
  },
  {
    id: "symbols",
    name: "❤️ Symboles",
    emojis: [
      { char: "❤️", keywords: "coeur rouge amour love heart" },
      { char: "🧡", keywords: "coeur orange" },
      { char: "💛", keywords: "coeur jaune" },
      { char: "💚", keywords: "coeur vert veltron" },
      { char: "💙", keywords: "coeur bleu" },
      { char: "💜", keywords: "coeur violet" },
      { char: "🖤", keywords: "coeur noir" },
      { char: "🤍", keywords: "coeur blanc" },
      { char: "💯", keywords: "cent 100 parfait score" },
      { char: "✨", keywords: "etincelles etoiles magic propre nouveau" },
      { char: "⭐", keywords: "etoile vip favori note star" },
      { char: "🔥", keywords: "feu flamme rapide chaud buzz fire" },
      { char: "🎉", keywords: "fete confettis bravo reussite" },
      { char: "🎊", keywords: "cotillons celebration" },
      { char: "✅", keywords: "coche vert valide approuve ok" },
      { char: "❌", keywords: "croix rouge refuse annule non" },
      { char: "❓", keywords: "point interrogation question aide" },
      { char: "❗", keywords: "point exclamation important urgent" },
      { char: "💬", keywords: "bulle message discussion chat" },
      { char: "💭", keywords: "pensee bulle reve" },
    ],
  },
];

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

  // Note Vocale HD (Enregistrement en direct)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Appel Vocal HD (WebRTC)
  const [callSession, setCallSession] = useState<{
    callId: number;
    status: "calling" | "incoming" | "connected" | "ended";
    callerName: string;
    callerRole: string;
    isIncoming: boolean;
  } | null>(null);
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const stopRingRef = useRef<(() => void) | null>(null);
  const lastKnownCallIdRef = useRef<number | null>(null);

  // Média / Photo Lightbox & Prévisualisation
  const [imagePreview, setImagePreview] = useState<{ src: string; caption: string } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Palette Emojis WhatsApp Pro avec barre de recherche
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [activeEmojiCat, setActiveEmojiCat] = useState("smileys");

  const filteredEmojis = useMemo(() => {
    if (!emojiSearch.trim()) {
      const cat = EMOJI_CATEGORIES.find((c) => c.id === activeEmojiCat) || EMOJI_CATEGORIES[0];
      return cat.emojis;
    }
    const q = emojiSearch.toLowerCase().trim();
    const allList: { char: string; keywords: string }[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const e of cat.emojis) {
        if (e.keywords.includes(q) || e.char.includes(q)) {
          allList.push(e);
        }
      }
    }
    return allList;
  }, [activeEmojiCat, emojiSearch]);

  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
    theme: "whatsapp",
    member_ids: [] as number[],
  });

  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMsgCountRef = useRef(0);

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

    // Jouer un bip de nouveau message si le nombre de messages augmente
    if (lastMsgCountRef.current > 0 && res.messages.length > lastMsgCountRef.current) {
      const lastMsg = res.messages[res.messages.length - 1];
      if (agencySession && lastMsg.sender_user_id !== agencySession.user.id) {
        soundFX.playMessageReceived();
      }
    }
    lastMsgCountRef.current = res.messages.length;

    setMessages(res.messages);
    setReads(res.reads);
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, theme: res.theme || "whatsapp", unread: 0 } : g)),
    );
  }, [agencySession]);

  const activeGroup = groups.find((g) => g.id === activeId) ?? null;

  // Polling des messages et détection des appels entrants
  useEffect(() => {
    if (!activeGroup || !agencySession) return;
    loadRoom(activeGroup).catch(() => {});

    const pollInterval = window.setInterval(async () => {
      loadRoom(activeGroup).catch(() => {});

      // Vérifier les appels vocaux actifs dans le salon
      try {
        const callRes = await api<{ active_call: ActiveCallData | null }>(
          `/agency/chat/groups/${activeGroup.id}/call/active`,
          { realm: "agency" }
        );
        const ac = callRes.active_call;

        if (ac && ac.status === "calling" && ac.caller_id !== agencySession.user.id) {
          // Un appel entrant est détecté !
          if (!callSession && lastKnownCallIdRef.current !== ac.id) {
            lastKnownCallIdRef.current = ac.id;
            stopRingRef.current?.();
            stopRingRef.current = soundFX.startIncomingRing();
            setCallSession({
              callId: ac.id,
              status: "incoming",
              callerName: ac.caller_name,
              callerRole: ac.caller_role,
              isIncoming: true,
            });
          }
        } else if (ac && ac.status === "connected" && callSession?.status === "calling") {
          // L'autre partie a décroché notre appel sortant !
          stopRingRef.current?.();
          soundFX.playCallConnected();
          if (ac.sdp_answer && peerConnRef.current) {
            try {
              const answerDesc = new RTCSessionDescription(JSON.parse(ac.sdp_answer));
              if (peerConnRef.current.signalingState !== "stable") {
                await peerConnRef.current.setRemoteDescription(answerDesc);
              }
            } catch {}
          }
          setCallSession((prev) => (prev ? { ...prev, status: "connected" } : null));
        } else if (!ac && callSession) {
          // L'appel a pris fin
          handleCleanupCall();
        }
      } catch {}
    }, 3000);

    return () => window.clearInterval(pollInterval);
  }, [activeGroup?.id, agencySession, callSession, loadRoom]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  // ===========================================================================
  // GESTION DES APPELS VOCAUX HD (WebRTC Pro)
  // ===========================================================================

  const handleCleanupCall = () => {
    stopRingRef.current?.();
    stopRingRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnRef.current) {
      peerConnRef.current.close();
      peerConnRef.current = null;
    }
    setRemoteStream(null);
    setCallSession(null);
  };

  const startVoiceCall = async () => {
    if (!activeGroup || !agencySession || callSession) return;
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      peerConnRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await api<{ call_id: number; caller_name: string }>(
        `/agency/chat/groups/${activeGroup.id}/call/initiate`,
        {
          body: { sdp_offer: JSON.stringify(offer) },
          realm: "agency",
        }
      );

      lastKnownCallIdRef.current = res.call_id;
      stopRingRef.current = soundFX.startOutgoingRing();
      setCallSession({
        callId: res.call_id,
        status: "calling",
        callerName: `${agencySession.user.first_name} ${agencySession.user.last_name}`,
        callerRole: ROLE_NAMES[agencySession.role] ?? agencySession.role,
        isIncoming: false,
      });

      await loadRoom(activeGroup);
    } catch (err: any) {
      setError(
        err.name === "NotAllowedError"
          ? "Accès au microphone refusé. Activez le micro pour les appels HD."
          : "Échec du démarrage de l'appel audio."
      );
      handleCleanupCall();
    }
  };

  const acceptIncomingCall = async () => {
    if (!activeGroup || !callSession) return;
    stopRingRef.current?.();

    try {
      const callData = await api<{ active_call: ActiveCallData | null }>(
        `/agency/chat/groups/${activeGroup.id}/call/active`,
        { realm: "agency" }
      );
      const ac = callData.active_call;
      if (!ac || !ac.sdp_offer) {
        handleCleanupCall();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      peerConnRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      const offerDesc = new RTCSessionDescription(JSON.parse(ac.sdp_offer));
      await pc.setRemoteDescription(offerDesc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await api(`/agency/chat/groups/${activeGroup.id}/call/${callSession.callId}/signal`, {
        body: { action: "answer", sdp_answer: JSON.stringify(answer) },
        realm: "agency",
      });

      soundFX.playCallConnected();
      setCallSession((prev) => (prev ? { ...prev, status: "connected" } : null));
    } catch {
      handleCleanupCall();
    }
  };

  const rejectIncomingCall = async () => {
    if (!activeGroup || !callSession) return;
    try {
      await api(`/agency/chat/groups/${activeGroup.id}/call/${callSession.callId}/end`, {
        body: { reason: "rejected" },
        realm: "agency",
      });
    } catch {}
    soundFX.playCallEnded();
    handleCleanupCall();
  };

  const hangupCall = async () => {
    if (!activeGroup || !callSession) return;
    try {
      await api(`/agency/chat/groups/${activeGroup.id}/call/${callSession.callId}/end`, {
        body: { reason: "ended" },
        realm: "agency",
      });
    } catch {}
    soundFX.playCallEnded();
    handleCleanupCall();
    await loadRoom(activeGroup);
  };

  // ===========================================================================
  // GESTION DES NOTES VOCALES HD (WhatsApp Voice Notes)
  // ===========================================================================

  const startVoiceRecording = async () => {
    if (isRecording || sending) return;
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mr.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError(
        err.name === "NotAllowedError"
          ? "Permission micro refusée pour enregistrer une note vocale."
          : "Impossible d'accéder au microphone."
      );
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const sendVoiceRecording = async () => {
    if (!activeGroup || !mediaRecorderRef.current) return;
    setSending(true);

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const duration = Math.max(1, recordingSeconds);
    const mr = mediaRecorderRef.current;

    mr.onstop = async () => {
      try {
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mime });
        const reader = new FileReader();

        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          try {
            await api(`/agency/chat/groups/${activeGroup.id}/voice`, {
              body: { audio_data: base64Data, duration_sec: duration, mime },
              realm: "agency",
            });
            soundFX.playMessageSent();
            await loadRoom(activeGroup);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Échec d'envoi de la note vocale.");
          } finally {
            setSending(false);
            setIsRecording(false);
            setRecordingSeconds(0);
          }
        };
        reader.readAsDataURL(blob);
      } catch {
        setSending(false);
        setIsRecording(false);
      }
    };

    mr.stream.getTracks().forEach((t) => t.stop());
    mr.stop();
  };

  // ===========================================================================
  // GESTION DES PHOTOS ET MÉDIAS WHATSAPP
  // ===========================================================================

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionnement automatique pour légèreté optimale
        const canvas = document.createElement("canvas");
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, w, h);
        const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);

        setImagePreview({ src: optimizedDataUrl, caption: "" });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendImageMessage = async () => {
    if (!activeGroup || !imagePreview) return;
    setSending(true);
    setError("");

    try {
      await api(`/agency/chat/groups/${activeGroup.id}/media`, {
        body: { image_data: imagePreview.src, caption: imagePreview.caption.trim() },
        realm: "agency",
      });
      soundFX.playMessageSent();
      setImagePreview(null);
      await loadRoom(activeGroup);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec de l'envoi de la photo.");
    } finally {
      setSending(false);
    }
  };

  // ===========================================================================
  // ENVOI DE TEXTE ET INTERACTIONS
  // ===========================================================================

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
      soundFX.playMessageSent();
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
      setError(err instanceof ApiError ? err.message : "Création du salon refusée.");
    }
  }

  if (!agencySession) return null;

  return (
    <div className={`chat-shell chat-theme--${activeGroup?.theme ?? "whatsapp"}`}>
      {/* Colonne gauche : Salons de discussion de l'agence façon WhatsApp Pro */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar__head">
          <div>
            <strong>Salons de l'agence</strong>
            <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
              🔒 Salons chiffrés · {agencySession.agency.name}
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
                style={{ background: THEME_META[g.theme]?.dot ?? "var(--wa-accent-green)" }}
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

      {/* Zone centrale de conversation WhatsApp */}
      <section className="chat-main">
        {activeGroup ? (
          <>
            <header className="chat-header">
              <div>
                <h3 style={{ margin: 0, fontSize: "var(--text-base)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{activeGroup.name}</span>
                  <span className="badge" style={{ background: "rgba(0, 168, 132, 0.2)", color: "#25d366", fontSize: 11 }}>
                    HD Audio WhatsApp
                  </span>
                </h3>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {activeGroup.members
                    .map((m) => `${m.first_name} (${ROLE_NAMES[m.role] ?? m.role})`)
                    .join(", ")}
                </span>
              </div>

              <div className="wa-header-actions">
                {/* Bouton d'Appel Vocal HD WhatsApp */}
                <button
                  type="button"
                  className="wa-btn-call"
                  onClick={startVoiceCall}
                  title="Démarrer un appel vocal HD avec l'équipe"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.05 15.05 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1.01A11.36 11.36 0 018.57 3.9c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.52c0-.55-.45-1-.99-1z" />
                  </svg>
                  <span>Appel HD</span>
                </button>

                {/* Bouton d'Appel Vidéo HD WhatsApp */}
                <button
                  type="button"
                  className="wa-btn-call"
                  style={{ background: "#2563eb", borderColor: "#1d4ed8" }}
                  onClick={startVoiceCall}
                  title="Démarrer un appel vidéo Full HD avec l'équipe"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                  </svg>
                  <span>Vidéo HD</span>
                </button>

                <div className="chips" style={{ position: "relative" }}>
                  <button type="button" className="chip" onClick={() => setThemeOpen((v) => !v)}>
                    🎨 Thème
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
              </div>
            </header>

            <div className="chat-encryption-banner">
              🔒 <strong>Chiffrement & Isolation Agence :</strong> Tous les échanges, appels HD et notes vocales sont
              strictement réservés aux collaborateurs actifs de <strong>{agencySession.agency.name}</strong>.
            </div>

            {/* Fil des messages façon WhatsApp */}
            <div className="chat-stream">
              {messages.length === 0 && (
                <div style={{ textAlign: "center", marginTop: 40, color: "var(--wa-text-muted)" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
                  <p>Aucun message dans ce salon. Lancez la discussion ou un appel vocal avec votre équipe !</p>
                </div>
              )}

              {messages.map((m) => {
                const mine = m.sender_user_id === agencySession.user.id;
                const timeStr = new Date(m.created_at).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const seenByOthers = reads.some(
                  (r) => r.user_id !== agencySession.user.id && Number(r.last_read_id) >= m.id,
                );

                // Message système
                if (m.kind === "system") {
                  return (
                    <div key={m.id} className="chat-system-pill">
                      {m.text ?? m.ciphertext}
                    </div>
                  );
                }

                // Appel démarré / terminé
                if (m.kind === "call_started" || m.kind === "call_ended") {
                  let callInfoText = m.text ?? m.ciphertext;
                  try {
                    const parsed = JSON.parse(m.ciphertext);
                    if (parsed.caller_name) {
                      callInfoText = `📞 ${parsed.caller_name} a lancé un appel vocal HD WhatsApp`;
                    }
                  } catch {}

                  return (
                    <div
                      key={m.id}
                      className="chat-system-pill"
                      style={{
                        background: m.kind === "call_started" ? "rgba(0, 168, 132, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        color: m.kind === "call_started" ? "#25d366" : "rgba(255, 255, 255, 0.8)",
                        border: m.kind === "call_started" ? "1px solid rgba(0, 168, 132, 0.4)" : "none",
                      }}
                    >
                      {callInfoText} · <span className="mono">{timeStr}</span>
                    </div>
                  );
                }

                // Note vocale HD façon WhatsApp
                if (m.kind === "voice") {
                  let voicePayload: any = null;
                  try {
                    voicePayload = JSON.parse(m.ciphertext);
                  } catch {
                    voicePayload = null;
                  }

                  if (!voicePayload?.audio_data) return null;

                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={mine ? "chat-bubble-row is-mine" : "chat-bubble-row"}
                    >
                      <div className={mine ? "chat-bubble chat-bubble--mine" : "chat-bubble"}>
                        {!mine && (
                          <div className="chat-bubble__author">
                            <strong>{m.first_name} {m.last_name}</strong>
                            {m.role && <span className="chat-role-tag">{ROLE_NAMES[m.role] ?? m.role}</span>}
                          </div>
                        )}
                        <WhatsAppVoicePlayer
                          audioData={voicePayload.audio_data}
                          durationSec={voicePayload.duration_sec || 1}
                          isMine={mine}
                          senderName={m.first_name}
                        />
                        <div className="chat-bubble__meta mono">
                          <span>{timeStr}</span>
                          {mine && (
                            <span className={`wa-ticks ${seenByOthers ? "is-read" : ""}`}>
                              ✓✓
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Photo / Média WhatsApp
                if (m.kind === "image") {
                  let mediaPayload: any = null;
                  try {
                    mediaPayload = JSON.parse(m.ciphertext);
                  } catch {
                    mediaPayload = null;
                  }

                  if (!mediaPayload?.image_data) return null;

                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={mine ? "chat-bubble-row is-mine" : "chat-bubble-row"}
                    >
                      <div className={mine ? "chat-bubble chat-bubble--mine" : "chat-bubble"}>
                        {!mine && (
                          <div className="chat-bubble__author">
                            <strong>{m.first_name} {m.last_name}</strong>
                            {m.role && <span className="chat-role-tag">{ROLE_NAMES[m.role] ?? m.role}</span>}
                          </div>
                        )}
                        <div className="wa-media-card" onClick={() => setLightboxSrc(mediaPayload.image_data)}>
                          <img
                            src={mediaPayload.image_data}
                            alt="Média WhatsApp"
                            className="wa-media-img"
                            loading="lazy"
                          />
                          {mediaPayload.caption && (
                            <div className="wa-media-caption">{mediaPayload.caption}</div>
                          )}
                        </div>
                        <div className="chat-bubble__meta mono">
                          <span>{timeStr}</span>
                          {mine && (
                            <span className={`wa-ticks ${seenByOthers ? "is-read" : ""}`}>
                              ✓✓
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Demande d'évolution de module
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
                            </span>
                          </div>
                        </div>
                        <span className="mono muted" style={{ fontSize: 11 }}>{timeStr}</span>
                      </div>

                      <div style={{ margin: "10px 0" }}>
                        <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: 6, color: "var(--muted)" }}>
                          Modules sollicités :
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {(reqPayload.modules || []).map((modKey: string) => {
                            const meta = MODULE_NAMES[modKey] || { label: modKey, icon: "📦" };
                            return (
                              <span
                                key={modKey}
                                className="badge"
                                style={{
                                  background: "rgba(0, 168, 132, 0.15)",
                                  color: "var(--wa-light-green)",
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
                                ⚡ <strong>Action Administrateur :</strong> Validez-vous l'activation de ces modules ?
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  style={{ background: "#22c55e", borderColor: "#22c55e", padding: "6px 14px", fontSize: "var(--text-xs)" }}
                                  disabled={respondingId === m.id}
                                  onClick={() => handleModuleDecision(m.id, "approve")}
                                >
                                  {respondingId === m.id ? "Validation..." : "✅ Valider"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  style={{ color: "#ef4444", borderColor: "#ef4444", padding: "6px 14px", fontSize: "var(--text-xs)" }}
                                  disabled={respondingId === m.id}
                                  onClick={() => handleModuleDecision(m.id, "reject")}
                                >
                                  {respondingId === m.id ? "Refus..." : "❌ Décliner"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--muted)" }}>
                              <span>⏳</span>
                              <em>En attente de validation par l'administrateur.</em>
                            </div>
                          )}
                        </div>
                      )}

                      {status === "approved" && (
                        <div style={{ marginTop: 10, background: "rgba(34, 197, 94, 0.1)", color: "#15803d", padding: "8px 12px", borderRadius: 8, fontSize: "var(--text-xs)" }}>
                          ✅ Validé par l'administrateur {reqPayload.decided_by_name ? `(${reqPayload.decided_by_name})` : ""}.
                        </div>
                      )}

                      {status === "rejected" && (
                        <div style={{ marginTop: 10, background: "rgba(239, 68, 68, 0.1)", color: "#b91c1c", padding: "8px 12px", borderRadius: 8, fontSize: "var(--text-xs)" }}>
                          ❌ Refusé par l'administrateur.
                        </div>
                      )}
                    </div>
                  );
                }

                // Message texte standard
                const bodyText = m.text ?? m.ciphertext;

                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={mine ? "chat-bubble-row is-mine" : "chat-bubble-row"}
                  >
                    <div className={mine ? "chat-bubble chat-bubble--mine" : "chat-bubble"}>
                      {!mine && (
                        <div className="chat-bubble__author">
                          <strong>{m.first_name} {m.last_name}</strong>
                          {m.role && <span className="chat-role-tag">{ROLE_NAMES[m.role] ?? m.role}</span>}
                        </div>
                      )}
                      <p className="chat-bubble__text">{bodyText}</p>
                      <div className="chat-bubble__meta mono">
                        <span>{timeStr}</span>
                        {mine && (
                          <span className={`wa-ticks ${seenByOthers ? "is-read" : ""}`}>
                            ✓✓
                          </span>
                        )}
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

            {/* Barre de réactions rapides Emojis WhatsApp */}
            <div className="chat-quick-bar" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {EMOJI_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="chip"
                    style={{ fontSize: 16, padding: "2px 8px" }}
                    onClick={() => sendText(emoji)}
                    disabled={sending}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.15)", height: 18, margin: "0 4px" }} />
              {QUICK_REPLIES.map((qr) => (
                <button key={qr} type="button" className="chip" disabled={sending} onClick={() => sendText(qr)}>
                  {qr}
                </button>
              ))}
            </div>

            {/* Input file caché pour pièces jointes */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageSelect}
            />

            {/* PALETTE D'ÉMOJIS WHATSAPP PRO AVEC RECHERCHE */}
            {emojiPickerOpen && (
              <div
                className="card"
                style={{
                  margin: "0 12px 8px",
                  padding: "10px 14px",
                  background: "var(--surface, #1e2238)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
                  zIndex: 100,
                  maxHeight: 280,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Barre de recherche d'émojis */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="search"
                    className="input"
                    placeholder="🔍 Rechercher un émoji (ex: bus, sourire, coeur, caisse...)"
                    value={emojiSearch}
                    onChange={(e) => setEmojiSearch(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "6px 12px",
                      fontSize: "var(--text-xs)",
                      borderRadius: 20,
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setEmojiPickerOpen(false)}
                    style={{ padding: "4px 8px", fontSize: 13 }}
                  >
                    ✕
                  </button>
                </div>

                {/* Onglets catégories */}
                {!emojiSearch.trim() && (
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                    {EMOJI_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`chip ${activeEmojiCat === cat.id ? "chip--active" : ""}`}
                        onClick={() => setActiveEmojiCat(cat.id)}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          background: activeEmojiCat === cat.id ? "var(--accent)" : "transparent",
                          color: activeEmojiCat === cat.id ? "#fff" : "var(--muted)",
                        }}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Grille des émojis scrollable */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))",
                    gap: 4,
                    overflowY: "auto",
                    maxHeight: 180,
                    padding: "4px 2px",
                  }}
                >
                  {filteredEmojis.map((e, idx) => (
                    <button
                      key={`${e.char}-${idx}`}
                      type="button"
                      onClick={() => setDraft((prev) => prev + e.char)}
                      title={e.keywords}
                      style={{
                        fontSize: 22,
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        borderRadius: 6,
                        padding: 4,
                        transition: "transform 0.1s ease",
                      }}
                      onMouseEnter={(evt) => (evt.currentTarget.style.transform = "scale(1.25)")}
                      onMouseLeave={(evt) => (evt.currentTarget.style.transform = "scale(1)")}
                    >
                      {e.char}
                    </button>
                  ))}
                  {filteredEmojis.length === 0 && (
                    <div className="muted" style={{ gridColumn: "1 / -1", textAlign: "center", fontSize: 12, padding: 12 }}>
                      Aucun émoji trouvé pour « {emojiSearch} »
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Composer WhatsApp Pro : Texte + Micro Note Vocale + Pièces Jointes */}
            <form className="chat-composer" onSubmit={handleSubmit} style={{ alignItems: "center" }}>
              {isRecording ? (
                // Barre d'enregistrement Note Vocale active
                <div className="wa-recording-bar">
                  <div className="wa-recording-indicator">
                    <span className="wa-rec-dot" />
                    <span className="wa-rec-timer">
                      {Math.floor(recordingSeconds / 60)}:
                      {recordingSeconds % 60 < 10 ? "0" : ""}
                      {recordingSeconds % 60}
                    </span>
                    <div className="wa-rec-wave">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="wa-btn-rec-cancel"
                      onClick={cancelVoiceRecording}
                      title="Annuler l'enregistrement"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="wa-btn-rec-send"
                      onClick={sendVoiceRecording}
                      disabled={sending}
                      title="Envoyer la note vocale"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                // Composer standard
                <>
                  {/* Bouton Palette Emojis WhatsApp */}
                  <button
                    type="button"
                    className="wa-btn-attach"
                    style={{ fontSize: 20, padding: "0 6px" }}
                    onClick={() => setEmojiPickerOpen((v) => !v)}
                    title="Palette d'émojis WhatsApp"
                  >
                    😊
                  </button>

                  {/* Bouton Pièce jointe / Photo */}
                  <button
                    type="button"
                    className="wa-btn-attach"
                    onClick={() => fileInputRef.current?.click()}
                    title="Envoyer une photo / document"
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                      <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 015 0v10.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6H9v9.5a3.5 3.5 0 007 0V5a4.5 4.5 0 00-9 0v12.5c0 3.31 2.69 6 6 6s6-2.69 6-6V6h-2.5z" />
                    </svg>
                  </button>

                  <input
                    className="input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`Message à l'équipe dans #${activeGroup.name}…`}
                    style={{ borderRadius: 24, paddingLeft: 16 }}
                  />

                  {draft.trim() ? (
                    <button type="submit" className="wa-btn-rec-send" disabled={sending}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="wa-btn-mic"
                      onClick={startVoiceRecording}
                      title="Enregistrer une note vocale HD"
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </form>
          </>
        ) : (
          <div style={{ padding: 32 }}>
            <p className="muted">Choisissez un salon de discussion.</p>
          </div>
        )}
      </section>

      {/* MODAL APPEL VOCAL HD (WebRTC Pro) */}
      {callSession && (
        <WhatsAppCallModal
          status={callSession.status}
          callerName={callSession.callerName}
          callerRole={callSession.callerRole}
          isIncoming={callSession.isIncoming}
          remoteStream={remoteStream}
          onAccept={acceptIncomingCall}
          onReject={rejectIncomingCall}
          onHangup={hangupCall}
        />
      )}

      {/* PRÉVISUALISATION PHOTO AVANT ENVOI */}
      {imagePreview && (
        <div className="wa-media-preview-backdrop" onClick={() => setImagePreview(null)}>
          <div className="wa-media-preview-card" onClick={(e) => e.stopPropagation()}>
            <img src={imagePreview.src} alt="Prévisualisation" className="wa-media-preview-img" />
            <form
              className="wa-media-preview-form"
              onSubmit={(e) => {
                e.preventDefault();
                sendImageMessage();
              }}
            >
              <input
                className="wa-media-preview-input"
                placeholder="Ajouter une légende..."
                value={imagePreview.caption}
                onChange={(e) => setImagePreview({ ...imagePreview, caption: e.target.value })}
                autoFocus
              />
              <button type="submit" className="wa-btn-rec-send" disabled={sending}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX GRAND FORMAT POUR PHOTOS */}
      {lightboxSrc && (
        <div className="wa-media-preview-backdrop" onClick={() => setLightboxSrc(null)}>
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
            <img
              src={lightboxSrc}
              alt="Média plein écran"
              style={{ maxWidth: "100%", maxHeight: "88vh", borderRadius: 12, objectFit: "contain" }}
            />
            <button
              type="button"
              className="btn btn--icon"
              style={{ position: "absolute", top: -16, right: -16, background: "#ea4335", color: "#fff" }}
              onClick={() => setLightboxSrc(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Modale des membres du salon */}
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
              Tous les membres actifs de <strong>{agencySession.agency.name}</strong> participent à ce salon :
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

      {/* Modale de création d'un nouveau salon d'équipe */}
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
