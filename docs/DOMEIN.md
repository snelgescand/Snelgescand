# Domeinnaam: Mijndomein → Namecheap → server

**Doel**: `snelgescand.nl` verhuizen van Mijndomein naar Namecheap, en daarna laten wijzen naar je Oracle VM.

## Werkt Namecheap überhaupt met .nl?

Ja, Namecheap registreert en beheert `.nl`-domeinen sinds 2014. Verlenging kost rond $11/jaar (~€10). Dat is goedkoper dan Mijndomein (€12-15) en gelijkwaardig aan TransIP.

**Twee alternatieve overwegingen**:
- **TransIP / Strato** — als je liever bij een NL-registrar blijft, is TransIP de oudgediende. Iets duurder, support in Nederlands.
- **Cloudflare Registrar** — goedkoopst (kostprijs), maar wachtlijst voor .nl en customer support is beperkt.

Voor jouw situatie is Namecheap prima.

## Stap 1 — Voorbereiding bij Mijndomein

1. Log in op https://mijn.mijndomein.nl
2. Ga naar **Mijn domeinen → snelgescand.nl → Beheer**
3. **Verhuiscode (token) opvragen**:
   - Klik op "Verhuizen" of "Verhuiscode" (de naam kan iets variëren).
   - Mijndomein stuurt de code per e-mail of toont 'm direct. Voor `.nl` heet dit een **verhuistoken** of **auth-code**.
   - Deze code is geldig voor 30 dagen.
4. **Domein-lock uitschakelen** (als optie zichtbaar — niet altijd bij .nl):
   - Onder beveiligingsinstellingen, zet "Transfer lock" uit.
5. **Controleer de WHOIS-mail**:
   - Bij .nl staat je e-mailadres als registrant. Die moet kloppen want SIDN stuurt daar de verhuisbevestiging naartoe.

## Stap 2 — Verhuizing starten bij Namecheap

1. Ga naar https://www.namecheap.com/domains/registration/transfer-domains-to-namecheap/
2. Vul in: `snelgescand.nl` → "Transfer"
3. Plak de verhuistoken die je van Mijndomein hebt gekregen
4. **Betaal de transfer** ($11.06 of zo). Dit is meteen ook 1 jaar verlenging.
5. Bevestig in de e-mail van SIDN/Namecheap die je ontvangt.

**Doorlooptijd**: 4 tot 7 dagen. SIDN bevestigt aan beide kanten. Je domein blijft tijdens deze periode gewoon werken (Mijndomein blijft de DNS hosten).

## Stap 3 — DNS instellen bij Namecheap

Zodra de transfer is afgerond, krijg je in Namecheap toegang tot het DNS-management:

1. Namecheap dashboard → **Domain List → snelgescand.nl → MANAGE**
2. Tabblad **Advanced DNS**
3. Verwijder alle bestaande records (komen mee uit Mijndomein-import).
4. Voeg deze records toe:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `@` | `<jouw-Oracle-VM-public-IP>` | 5 min |
| A Record | `www` | `<jouw-Oracle-VM-public-IP>` | 5 min |
| CNAME Record | `*` | `snelgescand.nl.` | 5 min |

De wildcard CNAME zorgt dat bv. `klant1.snelgescand.nl` ook werkt — handig als je later witlabel-subdomeinen wilt.

5. (Optioneel maar aanbevolen) E-mail records als je e-mail bij Mijndomein/elders houdt:

| Type | Host | Value | Priority | TTL |
|---|---|---|---|---|
| MX Record | `@` | `<huidige mail-provider mailserver>` | 10 | 1 hour |
| TXT Record | `@` | `v=spf1 include:_spf.<mail-provider>.nl ~all` | — | 1 hour |

Vraag de huidige SPF/MX-records bij Mijndomein op voordat je verhuist, anders ben je je mail kwijt.

## Stap 4 — DNS-propagatie afwachten

Met TTL 5 min duurt het meestal 5-15 min voor het wereldwijd zichtbaar is. Controleer:

```bash
dig +short snelgescand.nl
dig +short www.snelgescand.nl
# Moeten beide jouw Oracle-IP teruggeven.
```

Of online: https://dnschecker.org/#A/snelgescand.nl

## Stap 5 — HTTPS automatisch via Caddy

Zodra de DNS klopt en de server bereikbaar is op poort 80/443, regelt Caddy het Let's Encrypt-certificaat **automatisch** binnen 30 seconden. Geen actie nodig — wel even loggen checken:

```bash
sudo journalctl -u caddy -f
# Je ziet:
#   [INFO] [snelgescand.nl] acme: Obtaining bundled SAN certificate
#   [INFO] [snelgescand.nl] Server responded with a certificate.
```

Test in browser: https://snelgescand.nl — slot-icoon moet zichtbaar zijn, geen waarschuwingen.

## Veelvoorkomende valkuilen

| Symptoom | Oorzaak | Oplossing |
|---|---|---|
| `dig` geeft Mijndomein-records terug, dagen na transfer | Namecheap-nameservers niet ingesteld bij SIDN | Namecheap support contacteren — meestal binnen 1 dag opgelost |
| HTTPS-cert wordt niet uitgegeven | DNS wijst nog naar verkeerd IP, of poort 80 dicht | `curl -I http://snelgescand.nl` moet de Caddy-server raken |
| Mail werkt niet meer | MX-records vergeten | Mijndomein-mailrecords overzetten — zie stap 3 |
| Cookie werkt niet op subdomeinen | `COOKIE_DOMAIN` in `.env` mist de leading dot | Zet `.snelgescand.nl` (mét punt) |

## Kostenoverzicht (jaarlijks)

| Onderdeel | Kosten |
|---|---|
| Oracle Cloud (compute, storage, traffic) | **€0** |
| Namecheap .nl-registratie | ~€10/jaar |
| Caddy + Let's Encrypt HTTPS | **€0** |
| Backups naar Backblaze B2 (optioneel) | €0-2/jaar |
| **Totaal** | **~€10/jaar** |
