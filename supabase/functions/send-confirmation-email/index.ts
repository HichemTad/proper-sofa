import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// FROM_EMAIL env var: set to "contact@propersofa.be" once domain is verified in Resend.
// Until then, use "onboarding@resend.dev" for testing.
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";
const FROM_NAME  = "Proper Sofa";
// BCC_EMAIL: copy every confirmation to the business inbox (only when domain is verified)
const BCC_EMAIL  = Deno.env.get("BCC_EMAIL") ?? null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_KEY) {
    console.error("Missing RESEND_API_KEY env variable");
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let data: Record<string, string | number | null>;
  try {
    data = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    reference, date, heure, type_meuble,
    nom, email, telephone, adresse,
    prix_total, commentaire, lang,
  } = data as Record<string, string | number | null>;

  if (!email || !reference) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isNL = lang === "nl";

  /* ── Format date ─────────────────────────────────────── */
  const [year, month, day] = String(date).split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dateFormatted = dateObj.toLocaleDateString(isNL ? "nl-BE" : "fr-BE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  /* ── Format heure ────────────────────────────────────── */
  const slotMap: Record<string, string> = {
    "08:00": "8h – 10h",
    "10:00": "10h – 12h",
    "14:00": "14h – 16h",
    "16:00": "16h – 18h",
  };
  const slotDisplay = slotMap[String(heure)] ?? String(heure);

  /* ── Build & send email ──────────────────────────────── */
  const subject = isNL
    ? `Aanvraag ontvangen – ${reference} | Proper Sofa`
    : `Demande reçue – ${reference} | Proper Sofa`;

  const html = buildEmailHtml({
    reference: String(reference),
    dateFormatted,
    slotDisplay,
    type_meuble: String(type_meuble),
    nom: String(nom),
    email: String(email),
    telephone: String(telephone),
    adresse: String(adresse),
    prix_total: Number(prix_total),
    commentaire: commentaire ? String(commentaire) : null,
    isNL,
  });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [String(email)],
      ...(BCC_EMAIL ? { bcc: [BCC_EMAIL] } : {}),
      subject,
      html,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    console.error("[Resend] error:", resendRes.status, err);
    return new Response(JSON.stringify({ error: err }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resendData = await resendRes.json();
  console.log("[Resend] sent:", resendData.id);

  return new Response(JSON.stringify({ ok: true, id: resendData.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

/* ─────────────────────────────────────────────────────────
   Email HTML builder
───────────────────────────────────────────────────────── */
function buildEmailHtml(opts: {
  reference: string;
  dateFormatted: string;
  slotDisplay: string;
  type_meuble: string;
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  prix_total: number;
  commentaire: string | null;
  isNL: boolean;
}): string {
  const { reference, dateFormatted, slotDisplay, type_meuble, nom, email,
          telephone, adresse, prix_total, commentaire, isNL } = opts;

  const prenom = nom.split(" ")[0];

  const t = isNL ? {
    tagline:       "THUISREINIGING",
    title:         "Uw aanvraag is goed ontvangen",
    intro:         `Beste <strong>${prenom}</strong>,<br>We hebben uw aanvraag goed ontvangen en zullen zo snel mogelijk uw afspraak bevestigen.`,
    refLabel:      "Referentie",
    detailsTitle:  "Afspraakdetails",
    dateLabel:     "Datum",
    timeLabel:     "Tijdslot",
    furnitureLabel:"Meubilair",
    addressLabel:  "Adres",
    priceLabel:    "Geschatte prijs",
    contactTitle:  "Uw gegevens",
    nameLabel:     "Naam",
    emailLabel:    "E-mail",
    phoneLabel:    "Telefoon",
    commentLabel:  "Opmerking",
    nextTitle:     "Volgende stappen",
    next1:         "We controleren uw aanvraag en nemen zo snel mogelijk contact met u op.",
    next2:         "U ontvangt een definitieve bevestiging zodra alles in orde is.",
    greeting:      "Met vriendelijke groeten,<br><strong>Het team van Proper Sofa</strong>",
    footer:        "Vragen? Antwoord gerust op deze e-mail.",
  } : {
    tagline:       "NETTOYAGE À DOMICILE",
    title:         "Votre demande a bien été reçue",
    intro:         `Bonjour <strong>${prenom}</strong>,<br>Nous avons bien reçu votre demande de nettoyage et reviendrons vers vous très prochainement pour confirmer le créneau.`,
    refLabel:      "Référence",
    detailsTitle:  "Détails de l'intervention",
    dateLabel:     "Date",
    timeLabel:     "Créneau",
    furnitureLabel:"Mobilier",
    addressLabel:  "Adresse",
    priceLabel:    "Prix estimé",
    contactTitle:  "Vos coordonnées",
    nameLabel:     "Nom",
    emailLabel:    "Email",
    phoneLabel:    "Téléphone",
    commentLabel:  "Commentaire",
    nextTitle:     "Prochaines étapes",
    next1:         "Nous vérifions votre demande et vous recontactons très prochainement.",
    next2:         "Un email de confirmation vous sera envoyé une fois le créneau validé.",
    greeting:      "À bientôt,<br><strong>L'équipe Proper Sofa</strong>",
    footer:        "Une question ? Répondez simplement à cet email.",
  };

  const commentBlock = commentaire ? `
      <!-- COMMENT -->
      <tr>
        <td style="padding:0 32px 24px;">
          <div style="border-left:3px solid #485d92;padding:14px 18px;background:#dae2ff;border-radius:0 8px 8px 0;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2f4578;font-family:Roboto,Arial,sans-serif;">${t.commentLabel}</p>
            <p style="margin:0;font-size:14px;color:#44464f;font-style:italic;line-height:1.6;font-family:Roboto,Arial,sans-serif;">${commentaire}</p>
          </div>
        </td>
      </tr>` : "";

  return `<!DOCTYPE html>
<html lang="${isNL ? "nl" : "fr"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${t.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Fira+Sans:ital,wght@0,500;0,700;1,700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f7f9ff;font-family:Roboto,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f9ff;padding:32px 16px;">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" border="0"
           style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(72,93,146,0.12);">

      <!-- ── HEADER ─────────────────────────────── -->
      <tr>
        <td style="background:#485d92;padding:28px 40px;text-align:center;">
          <img src="https://propersofa.be/asset/LOGO-email.png" alt="Proper Sofa" width="220" height="72"
               style="display:block;margin:0 auto;max-width:220px;height:auto;">
          <span style="display:block;color:rgba(255,255,255,0.75);font-family:Roboto,Arial,sans-serif;font-size:11px;font-weight:500;letter-spacing:3px;margin-top:10px;text-transform:uppercase;">${t.tagline}</span>
        </td>
      </tr>

      <!-- ── REFERENCE BADGE ────────────────────── -->
      <tr>
        <td style="background:#ebeef3;padding:12px 40px;border-bottom:1px solid #e1e2ec;">
          <span style="font-size:12px;color:#585e71;font-family:Roboto,Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;">${t.refLabel}&nbsp;&nbsp;</span>
          <span style="display:inline-block;background:#485d92;color:#fff;font-family:Roboto,Arial,sans-serif;font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:1px;">${reference}</span>
        </td>
      </tr>

      <!-- ── INTRO ──────────────────────────────── -->
      <tr>
        <td style="padding:32px 40px 24px;">
          <h1 style="margin:0 0 14px;font-size:22px;color:#181c20;font-weight:500;line-height:1.3;font-family:'Fira Sans',Arial,sans-serif;">${t.title}</h1>
          <p style="margin:0;font-size:15px;color:#44464f;line-height:1.7;font-family:Roboto,Arial,sans-serif;">${t.intro}</p>
        </td>
      </tr>

      <!-- ── DETAILS BLOCK ──────────────────────── -->
      <tr>
        <td style="padding:0 32px 24px;">
          <div style="background:#f1f4f9;border-radius:12px;padding:24px 28px;border:1px solid #e1e2ec;">
            <p style="margin:0 0 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#485d92;font-family:Roboto,Arial,sans-serif;">${t.detailsTitle}</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e1e2ec;color:#585e71;font-size:13px;font-family:Roboto,Arial,sans-serif;">${t.dateLabel}</td>
                <td style="padding:10px 0;border-bottom:1px solid #e1e2ec;text-align:right;color:#181c20;font-size:14px;font-weight:700;font-family:Roboto,Arial,sans-serif;">${dateFormatted}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e1e2ec;color:#585e71;font-size:13px;font-family:Roboto,Arial,sans-serif;">${t.timeLabel}</td>
                <td style="padding:10px 0;border-bottom:1px solid #e1e2ec;text-align:right;color:#181c20;font-size:14px;font-weight:700;font-family:Roboto,Arial,sans-serif;">${slotDisplay}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e1e2ec;color:#585e71;font-size:13px;font-family:Roboto,Arial,sans-serif;">${t.furnitureLabel}</td>
                <td style="padding:10px 0;border-bottom:1px solid #e1e2ec;text-align:right;color:#181c20;font-size:14px;font-family:Roboto,Arial,sans-serif;">${type_meuble}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e1e2ec;color:#585e71;font-size:13px;font-family:Roboto,Arial,sans-serif;">${t.addressLabel}</td>
                <td style="padding:10px 0;border-bottom:1px solid #e1e2ec;text-align:right;color:#181c20;font-size:14px;font-family:Roboto,Arial,sans-serif;">${adresse}</td>
              </tr>
              <tr>
                <td style="padding:14px 0 0;color:#585e71;font-size:13px;font-family:Roboto,Arial,sans-serif;">${t.priceLabel}</td>
                <td style="padding:14px 0 0;text-align:right;">
                  <span style="font-size:24px;font-weight:700;color:#485d92;font-family:'Fira Sans',Arial,sans-serif;">${prix_total}&nbsp;€</span>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>

      <!-- ── CONTACT BLOCK ──────────────────────── -->
      <tr>
        <td style="padding:0 32px 24px;">
          <div style="background:#f1f4f9;border-radius:12px;padding:24px 28px;border:1px solid #e1e2ec;">
            <p style="margin:0 0 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#485d92;font-family:Roboto,Arial,sans-serif;">${t.contactTitle}</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e1e2ec;color:#585e71;font-size:13px;font-family:Roboto,Arial,sans-serif;">${t.nameLabel}</td>
                <td style="padding:8px 0;border-bottom:1px solid #e1e2ec;text-align:right;color:#181c20;font-size:14px;font-family:Roboto,Arial,sans-serif;">${nom}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e1e2ec;color:#585e71;font-size:13px;font-family:Roboto,Arial,sans-serif;">${t.emailLabel}</td>
                <td style="padding:8px 0;border-bottom:1px solid #e1e2ec;text-align:right;color:#181c20;font-size:14px;font-family:Roboto,Arial,sans-serif;">${email}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#585e71;font-size:13px;font-family:Roboto,Arial,sans-serif;">${t.phoneLabel}</td>
                <td style="padding:8px 0;text-align:right;color:#181c20;font-size:14px;font-family:Roboto,Arial,sans-serif;">${telephone}</td>
              </tr>
            </table>
          </div>
        </td>
      </tr>

      ${commentBlock}

      <!-- ── NEXT STEPS ─────────────────────────── -->
      <tr>
        <td style="padding:0 40px 32px;">
          <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#585e71;font-family:Roboto,Arial,sans-serif;">${t.nextTitle}</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="28" valign="top" style="padding:5px 0;color:#485d92;font-size:16px;font-weight:700;">✓</td>
              <td style="padding:5px 0;font-size:14px;color:#44464f;line-height:1.6;font-family:Roboto,Arial,sans-serif;">${t.next1}</td>
            </tr>
            <tr>
              <td width="28" valign="top" style="padding:5px 0;color:#485d92;font-size:16px;font-weight:700;">✓</td>
              <td style="padding:5px 0;font-size:14px;color:#44464f;line-height:1.6;font-family:Roboto,Arial,sans-serif;">${t.next2}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ── FOOTER ─────────────────────────────── -->
      <tr>
        <td style="background:#485d92;padding:28px 40px;text-align:center;border-radius:0 0 16px 16px;">
          <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.9);line-height:1.7;font-family:Roboto,Arial,sans-serif;">${t.greeting}</p>
          <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.6);font-family:Roboto,Arial,sans-serif;">${t.footer}</p>
          <p style="margin:10px 0 0;font-size:12px;font-family:Roboto,Arial,sans-serif;">
            <a href="https://propersofa.be" style="color:rgba(255,255,255,0.85);text-decoration:none;">propersofa.be</a>
          </p>
        </td>
      </tr>

    </table>

  </td></tr>
</table>

</body>
</html>`;
}
