"""Test complet de bout en bout VELTRON v2 (serveur lancé sur http://127.0.0.1:8000).
Usage :
  php backend/bin/install_db.php
  python backend/tests/smoke.py
"""
import json, sys, urllib.request, urllib.error

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:8000"
PWD = "Veltron#2026"
failures = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": "Bearer " + token} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + ("" if cond else f"  -> {info}"))
    if not cond:
        failures.append(name)


def pax_login(email):
    s, d = call("POST", "/api/passenger/auth/login", {"email": email, "password": PWD})
    assert s == 200, (email, s, d)
    return d["token"]


def agency_login(public_code, agency_name, email):
    s, init = call(
        "POST",
        "/api/agency/auth/initiate",
        {
            "public_code": public_code,
            "agency_name": agency_name,
            "email": email,
            "password": PWD,
        },
    )
    assert s == 200 and "dev_code" in init, (s, init)
    s2, ver = call("POST", "/api/agency/auth/verify", {"challenge": init["challenge"], "code": init["dev_code"]})
    assert s2 == 200, (s2, ver)
    return ver["token"], ver["session"], init["challenge"]


# 1. Pays du monde entier + devises + ordre alphabétique
s, countries = call("GET", "/api/countries?lang=fr")
check("liste mondiale >= 200 pays avec devises", s == 200 and len(countries) >= 200 and "default_currency" in countries[0], len(countries) if isinstance(countries, list) else countries)
names_fr = [c["name_fr"] for c in countries[:5]]
check("pays triés alphabétiquement", s == 200 and countries[0]["iso2"] in ("AF", "ZA"), names_fr)

# 2. Unicité stricte de l'adresse physique d'agence (même écrite différemment)
s, dup = call("POST", "/api/agencies/check-address", {"address": "Cameroun, Douala, Akwa, Bd de la Liberte, face Total", "email": "nouveau@test.cm"})
check("deux agences ne peuvent pas avoir la même adresse (409)", s == 409, dup)
s, ok_addr = call("POST", "/api/agencies/check-address", {"address": "Cameroun, Yaoundé, Quartier Bastos, Rue 1810 Immeuble Rubis", "email": "bastos@trans.cm"})
check("adresse inédite autorisée", s == 200 and ok_addr.get("available") is True, ok_addr)

# 3. Création d'agence : code PIN 5 chiffres + délai 50s + Audit IA automatique (approbation vs escalade propriétaire)
s, pin1 = call("POST", "/api/agencies/verification/send", {"email": "direction@alliance-cameroun.com"})
check("PIN 5 chiffres envoyé pour prouver l'appartenance de l'e-mail", s == 200 and len(pin1.get("dev_code", "")) == 5 and pin1.get("resend_in") == 50, pin1)
s_cool, _ = call("POST", "/api/agencies/verification/send", {"email": "direction@alliance-cameroun.com"})
check("renvoi immédiat bloqué pendant le délai de 50 s (429)", s_cool == 429, s_cool)
s, proof1 = call("POST", "/api/agencies/verification/check", {"challenge": pin1["challenge"], "code": pin1["dev_code"]})
check("PIN 5 chiffres validé -> jeton signé", s == 200 and proof1.get("verified") is True, proof1)

# Sans PIN valide -> refusé
s_nop, _ = call("POST", "/api/agencies/register", {
    "agency": {"name": "Pirate Bus", "country_id": 1, "currency_code": "XAF", "address": "Yaoundé Biyem-Assi Carrefour Acacias 44", "email": "pirate@bus.com", "phone": "+237699112233"},
    "owner": {"first_name": "Jean", "last_name": "Dupont", "email": "pirate@bus.com", "password": "Password#123"},
    "verification_token": "faux-jeton",
})
check("création d'agence sans preuve PIN refusée (422)", s_nop == 422, s_nop)

# Sans acceptation du contrat 0,5% -> refusé
s_noc, _ = call("POST", "/api/agencies/register", {
    "agency": {"name": "Alliance Cameroun Express", "country_id": 1, "currency_code": "XAF", "address": "Cameroun, Yaoundé, Quartier Mvan, Gare Routière Sud Porte 4", "email": "direction@alliance-cameroun.com", "phone": "+237691223344"},
    "owner": {"first_name": "Samuel", "last_name": "Mbappe", "email": "direction@alliance-cameroun.com", "password": PWD},
    "verification_token": proof1["verification_token"],
    "contract_accepted": False,
})
check("création d'agence sans acceptation du contrat 0,5% refusée (422)", s_noc == 422, s_noc)

# Agence authentique complète -> approuvée immédiatement par l'IA (score >= 75) + ID AG-XXXXXX + contrat 0,5% signé
s, reg_ok = call("POST", "/api/agencies/register", {
    "agency": {
        "name": "Alliance Cameroun Express",
        "legal_id": "RC/YAO/2026/B/8841",
        "email": "direction@alliance-cameroun.com",
        "phone": "+237691223344",
        "city_name": "Yaoundé",
        "address": "Cameroun, Yaoundé, Quartier Mvan, Gare Routière Sud Porte 4",
        "country_id": 1,
        "currency_code": "XAF",
        "primary_color": "#1E8A5E",
    },
    "owner": {
        "first_name": "Samuel",
        "last_name": "Mbappe",
        "email": "direction@alliance-cameroun.com",
        "password": PWD,
    },
    "verification_token": proof1["verification_token"],
    "contract_accepted": True,
})
check("agence authentique activée immédiatement par l'IA + ID AG-XXXXXX + contrat 0,5% accepté", s == 201 and reg_ok.get("status") == "active" and reg_ok.get("public_code", "").startswith("AG-") and reg_ok.get("commission_rate_bps") == 50, reg_ok)

# Agence incomplète / douteuse -> mise en revue + alerte propriétaire (WhatsApp + Email)
s, pin2 = call("POST", "/api/agencies/verification/send", {"email": "test@mailinator.com"})
_, proof2 = call("POST", "/api/agencies/verification/check", {"challenge": pin2["challenge"], "code": pin2["dev_code"]})
s, reg_flag = call("POST", "/api/agencies/register", {
    "agency": {
        "name": "Test Flou",
        "legal_id": "",
        "email": "test@mailinator.com",
        "phone": "+999000",
        "address": "Quelque part sans numéro précis 123",
        "country_id": 1,
        "currency_code": "XAF",
        "primary_color": "#C84B6A",
    },
    "owner": {"first_name": "X", "last_name": "Y", "email": "test@mailinator.com", "password": PWD},
    "verification_token": proof2["verification_token"],
    "contract_accepted": True,
})
check("dossier douteux mis en revue par l'IA (pending)", s == 201 and reg_flag.get("status") == "pending", reg_flag)

# 4. Supervision Propriétaire VELTRON : reçoit l'alerte avec liens WhatsApp & Email et peut valider
s, plat_login = call("POST", "/api/platform/auth/login", {"email": "admin@veltron.test", "password": PWD})
check("connexion Propriétaire VELTRON réussie", s == 200 and "token" in plat_login, plat_login)
plat_tok = plat_login["token"]
s, overview = call("GET", "/api/platform/overview", token=plat_tok)
has_alert = any(a["agency_id"] is not None and a["channels"].get("agency_mailto_url") and a["channels"].get("agency_whatsapp_url") for a in overview.get("alerts", []))
check("propriétaire reçoit l'alerte IA avec liens directs de contact (Email/WhatsApp)", s == 200 and has_alert, overview.get("alerts", [])[:1])

# 5. Connexion "J'ai une agence" (ID auto + Nom + Email + MDP + Code 5 chiffres + 50s) & Isolation stricte des rôles
s_init, init_sec = call("POST", "/api/agency/auth/initiate", {
    "public_code": "AG-EQT001",
    "agency_name": "Équateur Voyages",
    "email": "desk.equateur@veltron.test",
    "password": PWD,
})
check("connexion agence étape 1 -> code 5 chiffres envoyé", s_init == 200 and len(init_sec.get("dev_code", "")) == 5, init_sec)
s_res, _ = call("POST", "/api/agency/auth/resend", {"challenge": init_sec["challenge"]})
check("réinitialisation du code agence bloquée avant 50 s (429)", s_res == 429, s_res)
s_ver, ver_sec = call("POST", "/api/agency/auth/verify", {"challenge": init_sec["challenge"], "code": init_sec["dev_code"]})
sec_tok = ver_sec["token"]
check("connexion secrétaire validée avec rôle isolé", s_ver == 200 and ver_sec["session"]["role"] == "secretary", ver_sec)

pax1 = pax_login("passager1@veltron.test")
pax2 = pax_login("passager2@veltron.test")
drv_tok, _, _ = agency_login("AG-EQT001", "Équateur Voyages", "driver1.equateur@veltron.test")
own_tok, _, _ = agency_login("AG-EQT001", "Équateur Voyages", "owner.equateur@veltron.test")

check("étanchéité : jeton passager refusé sur l'espace agence (403)", call("GET", "/api/agency/me", token=pax1)[0] == 403)
check("étanchéité : jeton agence refusé sur l'espace passager (403)", call("GET", "/api/passenger/me", token=sec_tok)[0] == 403)
check("isolation des comptes : secrétaire refusée sur comptabilité (403)", call("GET", "/api/agency/finance", token=sec_tok)[0] == 403)
check("isolation des comptes : secrétaire refusée sur création de personnel (403)", call("POST", "/api/agency/staff", {"role": "staff"}, token=sec_tok)[0] == 403)
check("isolation des comptes : chauffeur refusé au guichet secrétaire (403)", call("GET", "/api/desk/trips", token=drv_tok)[0] == 403)

# 6. Passager : Réservation + Points fidélité annuels + Échange récompense + Location & Achat bus
s, tdetail = call("GET", "/api/trips/1")
free_seat = next(x["id"] for x in tdetail["seats"] if not x["taken"])
s, bk = call("POST", "/api/bookings", {"trip_id": 1, "passengers": [{"seat_id": free_seat, "name": "Amina Voyageuse"}]}, pax1)
s, pay = call("POST", f"/api/bookings/{bk['id']}/pay", {"provider": "sandbox", "idempotency_key": "v2-pay-1"}, pax1)
check("réservation payée + points fidélité crédités (+10 pts)", s == 200 and pay.get("points_earned") == 10, pay)

s, loy = call("GET", "/api/me/loyalty", token=pax1)
eq_loy = next(a for a in loy["agencies"] if a["slug"] == "equateur-voyages")
check("solde fidélité annuel cumulé (50 pts)", s == 200 and eq_loy["balance"] == 50, eq_loy)
reward_30 = next(r for r in eq_loy["rewards"] if r["points_required"] == 30)
s, red = call("POST", "/api/me/loyalty/redeem", {"reward_id": reward_30["id"]}, pax1)
check("récompense fidélité débloquée avec code RWD-XXXXXX", s == 201 and red.get("code", "").startswith("RWD-"), red)

s, rent = call("POST", "/api/rentals", {
    "country_id": 1, "agency_id": 1, "departure": "Douala", "destination": "Kribi",
    "start_date": "2027-01-15", "end_date": "2027-01-17", "passengers": 40,
    "bus_type": "coach", "with_driver": True,
    "contact_name": "Amina", "contact_email": "passager1@veltron.test", "contact_phone": "+237690001122"
}, pax1)
check("demande de location de bus créée (LOC-XXXXXX)", s == 201 and rent.get("reference", "").startswith("LOC-"), rent)

s, listings = call("GET", "/api/bus-listings")
check("catalogue achat de bus disponible", s == 200 and len(listings) >= 3, len(listings) if isinstance(listings, list) else listings)
s, inq = call("POST", f"/api/bus-listings/{listings[0]['id']}/inquire", {
    "name": "Acheteur Pro", "email": "acheteur@compagnie.cm", "phone": "+237677000000", "message": "Intéressé pour achat immédiat."
}, pax1)
check("demande d'achat de bus transmise au vendeur", s == 201 and inq.get("sent") is True, inq)

# 7. Chauffeur : Disponibilité (dont maintenance), Ressenti, Suivi Manuel/GPS & Historique GPS
s, prof = call("POST", "/api/agency/driver/profile", {"availability": "on_trip", "mood": 5, "mood_note": "En pleine forme, route maîtrisée", "photo_consent": True}, drv_tok)
check("chauffeur partage sa disponibilité et son ressenti", s == 200, prof)
s, rep = call("POST", "/api/agency/driver/trips/9/report", {
    "kind": "delay", "cause": "traffic", "delay_minutes": 20, "speed_kmh": 34, "progress_pct": 48,
    "lat": 3.8012, "lng": 10.1345, "note": "Bouchon au péage d'Édéa"
}, drv_tok)
check("chauffeur déclare bouchon + vitesse 34 km/h + coordonnées GPS", s == 200, rep)

s, trk = call("GET", "/api/tracking/live?reference=VLT-9TRK42")
match = trk.get("match", {})
check("passager voit la vitesse 34 km/h, la cause 'traffic', les coordonnées GPS et l'ETA recalculée",
      s == 200 and match.get("speed_kmh") == 34 and match.get("active_cause") == "traffic" and match.get("estimated_arrives_at") is not None, match)
s_live, live_all = call("GET", "/api/tracking/live")
check("historique GPS des anciens trajets terminés disponible", s_live == 200 and len(live_all.get("history_trips", [])) >= 1, live_all.get("history_trips", []))

# 8. Secrétaire : Retardataire, Absent & Remplissage SANS bagage uniquement si départ proche (<= 40 min) + accord physique
s, mf = call("GET", "/api/desk/trips/1/manifest", token=sec_tok)
by_name = {t["passenger_name"]: t for t in mf["tickets"]}
check("signalement client en retard par la secrétaire", call("POST", f"/api/desk/tickets/{by_name['Client Test Un']['id']}/action", {"action": "late", "note": "Arrive dans 8 min"}, sec_tok)[0] == 200)
check("déclaration absent (libère le siège #2)", call("POST", f"/api/desk/tickets/{by_name['Client Test Un B']['id']}/action", {"action": "absent"}, sec_tok)[0] == 200)

s, fc = call("GET", "/api/desk/trips/1/fill-candidates", token=sec_tok)
# Le départ 10 est à +35 min (<= 40 min) alors que le départ 2 est à +180 min (> 40 min : exclu !)
cands = fc.get("candidates", [])
check("seul le départ proche (écart 35 min <= 40 min) sans bagage est proposé (départ à +3h exclu)",
      s == 200 and len(cands) == 1 and cands[0]["from_trip_id"] == 10 and cands[0]["gap_minutes"] <= 40, cands)

seat2_id = next(st["id"] for st in fc["free_seats"] if st["seat_no"] == 2)
check("transfert refusé sans accord physique du passager (422)",
      call("POST", f"/api/desk/tickets/{cands[0]['ticket_id']}/transfer", {"to_trip_id": 1, "seat_id": seat2_id, "consent": False}, sec_tok)[0] == 422)
s, adv = call("POST", f"/api/desk/tickets/{cands[0]['ticket_id']}/transfer", {"to_trip_id": 1, "seat_id": seat2_id, "consent": True}, sec_tok)
check("transfert sans bagage avec accord physique réussi (écart <= 40 min)", s == 200 and adv.get("transferred") is True, adv)

# 9. Reversement automatique 0,5% au Propriétaire VELTRON dès qu'un départ est effectué
s_dep, dep_res = call("POST", "/api/agency/trips/1/status", {"status": "departed"}, sec_tok)
check("départ du voyage #1 déclenche automatiquement la commission de 0,5% pour le propriétaire VELTRON",
      s_dep == 200 and dep_res.get("commission") is not None and dep_res["commission"]["rate_bps"] == 50 and dep_res["commission"]["commission_amount"] > 0, dep_res)

s_fin, fin_res = call("GET", "/api/agency/finance", token=own_tok)
check("comptabilité agence affiche la commission VELTRON de 0,5% déduite",
      s_fin == 200 and fin_res.get("veltron_commission", 0) > 0 and len(fin_res.get("commissions", [])) >= 2, fin_res)

s_ov2, ov2 = call("GET", "/api/platform/overview", token=plat_tok)
check("supervision propriétaire VELTRON affiche le total des commissions automatiques 0,5%",
      s_ov2 == 200 and len(ov2.get("commissions", [])) >= 3 and len(ov2.get("commission_totals", [])) >= 1, ov2.get("commission_totals"))

# 10. Messagerie de groupe en clair entre tous les membres d'une même agence + changement de thème
s, boot = call("GET", "/api/agency/chat/bootstrap", token=own_tok)
gid = boot["groups"][0]["id"]
check("bootstrap groupes de discussion de l'agence", s == 200 and len(boot["groups"]) >= 2, boot.get("groups", [])[:1])
s, msg = call("POST", f"/api/agency/chat/groups/{gid}/messages", {
    "text": "Bonjour à toute l'équipe Équateur Voyages, embarquement du bus 07h30 terminé !"
}, own_tok)
check("envoi d'un message en clair par l'administrateur", s == 201 and "id" in msg, msg)

# La secrétaire et le chauffeur de la même agence voient immédiatement le message en clair
s_sec_msgs, sec_msgs = call("GET", f"/api/agency/chat/groups/{gid}/messages", token=sec_tok)
s_drv_msgs, drv_msgs = call("GET", f"/api/agency/chat/groups/{gid}/messages", token=drv_tok)
seen_by_sec = any("embarquement du bus 07h30 terminé" in (m.get("text") or "") for m in sec_msgs.get("messages", []))
seen_by_drv = any("embarquement du bus 07h30 terminé" in (m.get("text") or "") for m in drv_msgs.get("messages", []))
check("tous les membres de la même agence (secrétaire, chauffeur, admin) lisent les messages en clair sans blocage",
      s_sec_msgs == 200 and s_drv_msgs == 200 and seen_by_sec and seen_by_drv, sec_msgs.get("messages", [])[-1:])

s, th = call("POST", f"/api/agency/chat/groups/{gid}/theme", {"theme": "whatsapp"}, sec_tok)
check("changement du thème visuel du groupe ('whatsapp')", s == 200 and th.get("theme") == "whatsapp", th)

print("\n" + ("✅ TOUS LES TESTS VELTRON V2 PASSENT AVEC SUCCÈS !" if not failures else f"❌ {len(failures)} ÉCHEC(S): {failures}"))
sys.exit(1 if failures else 0)
