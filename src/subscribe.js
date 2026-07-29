/**
 * Handles POST /api/subscribe.
 *
 * Receives a form submission from the site and subscribes the person to a
 * Klaviyo list. This runs on Cloudflare's servers, not in the browser, so the
 * private Klaviyo API key is never exposed to visitors.
 *
 * Required Worker secrets / variables:
 *   KLAVIYO_API_KEY  - private API key, starts with "pk_"
 *   KLAVIYO_LIST_ID  - optional; defaults to the list below
 */

const DEFAULT_LIST_ID = "Y3RxhC";
const KLAVIYO_REVISION = "2024-10-15";

// Only these sources are accepted, so the endpoint can't be used to write
// arbitrary junk into the list.
const SOURCES = {
  "homepage-hero": "Homepage cheat sheet form",
  "homepage-quiz": "Homepage quiz result",
  consulting: "Consulting booking request",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Trim to a sane length so a huge paste can't bloat the profile. */
const clean = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function handleSubscribe(request, env) {
  const apiKey = env.KLAVIYO_API_KEY;
  if (!apiKey) {
    console.error("KLAVIYO_API_KEY is not set");
    return json(500, { error: "Signup is not configured yet." });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid request." });
  }

  const email = clean(payload.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return json(400, { error: "Please enter a valid email address." });
  }

  const source = SOURCES[payload.source] ? payload.source : "homepage-hero";

  // Everything beyond the email is optional context we attach to the profile
  // so the list can be segmented later.
  const properties = { "Signup source": SOURCES[source] };

  const note = clean(payload.note, 2000);
  if (note) properties["Consulting note"] = note;

  if (Array.isArray(payload.quizAnswers) && payload.quizAnswers.length) {
    properties["Quiz answers"] = payload.quizAnswers
      .slice(0, 10)
      .map((answer) => clean(answer, 200))
      .filter(Boolean);
  }

  const result = clean(payload.quizResult, 300);
  if (result) properties["Quiz result"] = result;

  const profile = {
    type: "profile",
    attributes: {
      email,
      properties,
      subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
    },
  };

  const firstName = clean(payload.name, 100);
  if (firstName) profile.attributes.first_name = firstName;

  const body = {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        profiles: { data: [profile] },
        historical_import: false,
      },
      relationships: {
        list: {
          data: { type: "list", id: env.KLAVIYO_LIST_ID || DEFAULT_LIST_ID },
        },
      },
    },
  };

  let response;
  try {
    response = await fetch(
      "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/",
      {
        method: "POST",
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          revision: KLAVIYO_REVISION,
          "Content-Type": "application/json",
          accept: "application/vnd.api+json",
        },
        body: JSON.stringify(body),
      }
    );
  } catch (err) {
    console.error("Klaviyo request failed", err);
    return json(502, { error: "Could not reach the mailing list. Try again." });
  }

  // Klaviyo returns 202 Accepted on success, with an empty body.
  if (!response.ok) {
    const detail = await response.text();
    console.error("Klaviyo rejected the request", response.status, detail);
    return json(502, { error: "Could not sign you up. Try again." });
  }

  return json(200, { ok: true });
}
