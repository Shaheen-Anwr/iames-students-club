'use client';

// Error monitoring (Sentry) + product analytics (PostHog), loaded from their CDNs so no npm
// dependency is added. Both are inert until the matching env var is set, so this is safe to
// ship immediately and "turns on" the moment keys land in the environment:
//
//   NEXT_PUBLIC_SENTRY_DSN      -> enables Sentry
//   NEXT_PUBLIC_POSTHOG_KEY     -> enables PostHog
//   NEXT_PUBLIC_POSTHOG_HOST    -> optional, defaults to https://eu.i.posthog.com
//
// When ready to graduate: swap loadSentry() for `@sentry/nextjs` (adds source maps, tracing,
// server-side capture) and the PostHog snippet for `posthog-js`. The exported surface
// (initObservability / capturePageview / identifyUser / captureError / captureEvent) stays.

interface PostHogLike {
  init: (key: string, opts: Record<string, unknown>) => void;
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string, props?: Record<string, unknown>) => void;
  reset: () => void;
  __loaded?: boolean;
}
interface SentryLike {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, ctx?: Record<string, unknown>) => void;
  setUser: (user: Record<string, unknown> | null) => void;
}

declare global {
  interface Window {
    posthog?: PostHogLike;
    Sentry?: SentryLike;
    __observabilityInit?: boolean;
  }
}

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
const SENTRY_VERSION = '8.42.0';

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

async function loadSentry() {
  if (!SENTRY_DSN || window.Sentry) return;
  try {
    await loadScript(`https://browser.sentry-cdn.com/${SENTRY_VERSION}/bundle.tracing.min.js`);
    const S = window.Sentry as SentryLike | undefined;
    S?.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      release: process.env.NEXT_PUBLIC_COMMIT_SHA,
    });
  } catch {
    // monitoring is best-effort -- never let it break the app
  }
}

function loadPostHog() {
  if (!POSTHOG_KEY || window.posthog?.__loaded) return;
  // Official PostHog stub: queues calls until /static/array.js finishes loading.
  /* eslint-disable */
  // prettier-ignore
  ;(function(t: any, e: any){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i: any,s: any,a: any){function g(t: any,e: any){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t: any){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording getSessionRecordingUrl getSessionId opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)})(document,(window as any).posthog||[]);
  /* eslint-enable */
  window.posthog!.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false, // done manually on route change -- App Router has no full reloads
    autocapture: true,
  });
}

/** Call once, client-side, as early as possible. Idempotent. */
export function initObservability() {
  if (typeof window === 'undefined' || window.__observabilityInit) return;
  window.__observabilityInit = true;
  void loadSentry();
  loadPostHog();
}

export function capturePageview(path: string) {
  window.posthog?.capture('$pageview', { $current_url: window.location.origin + path });
}

export function captureEvent(event: string, props?: Record<string, unknown>) {
  window.posthog?.capture(event, props);
}

export function identifyUser(
  user: { _id: string; role?: string; department?: string | null } | null,
) {
  if (!user) {
    window.posthog?.reset();
    window.Sentry?.setUser(null);
    return;
  }
  window.posthog?.identify(user._id, { role: user.role, department: user.department });
  window.Sentry?.setUser({ id: user._id });
}

export function captureError(err: unknown, ctx?: Record<string, unknown>) {
  window.Sentry?.captureException(err, ctx);
  if (!window.Sentry && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[captureError]', err, ctx);
  }
}
