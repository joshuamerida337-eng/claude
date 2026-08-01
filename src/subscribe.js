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

const DEFAULT_LIST_ID = "UsZLgE";
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

/** Pulls the human-readable reason out of a Klaviyo error body. */
function describe(body) {
  try {
    const parsed = JSON.parse(body);
    const first = parsed.errors && parsed.errors[0];
    if (!first) return "";
    const where = first.source && first.source.pointer ? ` at ${first.source.pointer}` : "";
    return String(first.detail || first.title || "").slice(0, 160) + where;
  } catch {
    return "";
  }
}

/**
 * Stores the name and the signup context on the profile.
 *
 * This runs after the subscription and is deliberately best-effort: the email
 * is already captured by that point, so a failure here is logged and swallowed
 * rather than shown to the visitor as a failed signup.
 */
async function writeProfileDetails(apiKey, email, firstName, properties) {
  const attributes = { email, properties };
  if (firstName) attributes.first_name = firstName;

  try {
    const res = await fetch("https://a.klaviyo.com/api/profile-import/", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_REVISION,
        "Content-Type": "application/json",
        accept: "application/vnd.api+json",
      },
      body: JSON.stringify({ data: { type: "profile", attributes } }),
    });
    if (!res.ok) {
      console.error("Could not store profile details", res.status, await res.text());
    }
  } catch (err) {
    console.error("Could not store profile details", err);
  }
}

/**
 * Finds the Klaviyo key among the Worker's variables.
 *
 * Pasting the variable name into the dashboard can leave a trailing space or a
 * different case. The name then looks right on screen but no longer matches
 * env.KLAVIYO_API_KEY, which is invisible from the outside, so match loosely
 * rather than fail on something nobody can see.
 */
function findApiKey(env) {
  if (typeof env.KLAVIYO_API_KEY === "string" && env.KLAVIYO_API_KEY.trim()) {
    return env.KLAVIYO_API_KEY.trim();
  }
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    if (name.trim().toUpperCase().replace(/[\s-]/g, "_") === "KLAVIYO_API_KEY") {
      return value.trim();
    }
  }
  return null;
}

export async function handleSubscribe(request, env) {
  // The short codes below are diagnostic: they say why a signup failed without
  // revealing anything secret, so a failure can be identified from the browser.
  const apiKey = findApiKey(env);
  if (!apiKey) {
    // Report which variables the Worker can actually see — names only, never
    // values — because a secret that was saved under a slightly different name
    // looks correct in the dashboard and is otherwise impossible to spot.
    const names = Object.keys(env).filter((k) => typeof env[k] === "string");
    console.error("No Klaviyo key found. Variables present:", names);
    return json(500, {
      error: `Signup is not configured yet. (E-NOKEY: saw [${names.join(", ") || "none"}])`,
    });
  }
  if (!apiKey.startsWith("pk_")) {
    console.error("KLAVIYO_API_KEY is set but is not a private key");
    return json(500, { error: "Signup is not configured yet. (E-NOTPRIVATE)" });
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

  const firstName = clean(payload.name, 100);

  // The subscribe endpoint accepts only identifiers and consent on a profile.
  // Names and custom properties are rejected here, so they are written
  // separately below once the subscription itself has succeeded.
  const profile = {
    type: "profile",
    attributes: {
      email,
      subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
    },
  };

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
    return json(502, { error: "Could not reach the mailing list. (E-NET)" });
  }

  // Klaviyo returns 202 Accepted on success, with an empty body.
  if (!response.ok) {
    const detail = await response.text();
    console.error("Klaviyo rejected the request", response.status, detail);
    // 401 = key not accepted, 403 = key lacks the required scopes,
    // 404 = list id not found, 400 = payload rejected. Klaviyo explains a
    // rejection in the body, so pass that reason along rather than making the
    // cause guesswork from outside.
    return json(502, {
      error: `Could not sign you up. (E-${response.status}${
        describe(detail) ? ": " + describe(detail) : ""
      })`,
    });
  }

  // The subscription succeeded, which is what matters. Attaching the name and
  // the source/quiz context is a separate call, and a failure there must not
  // turn a captured email into an error for the visitor.
  await writeProfileDetails(apiKey, email, firstName, properties);

  return json(200, { ok: true });
}
