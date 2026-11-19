// ga frontend configuration.
//
// GOOGLE_CLIENT_ID: OAuth 2.0 Web client ID used for Google Sign-In.
//   The same client as the health site.
// GAS_ENDPOINT: the /exec URL of the social-gas web app deployment.
//   The staging build overrides it with VITE_GAS_ENDPOINT; production
//   builds leave the variable unset and use the production URL below.
//
// There is deliberately no allowed-email check on the client side:
// authorization is enforced by social-gas, which verifies the ID token
// and the account's email before returning data.

// The blog-gas web app deployment (the blog API), for the one
// payload whose answer differs per environment: the translation
// status (?o=translation-status) describes each deployment's own
// article cache, so — mirroring GAS_ENDPOINT above — an explicit
// VITE_BLOG_GAS_ENDPOINT wins, a staging build (VITE_STAGING=1)
// talks to the staging deployment, and production builds use the
// production deployment. The RSS feed and titles payload below
// deliberately stay on the production deployment for both builds:
// they carry the published articles' public metadata, which is
// the same whichever build asks.
const BLOG_GAS_ENDPOINT =
  import.meta.env.VITE_BLOG_GAS_ENDPOINT ??
  (import.meta.env.VITE_STAGING === "1"
    ? "https://script.google.com/macros/s/AKfycbxjBvowI9VBP4wIn_OpGolXW-pVZxKhigby68gGuplNGdyYPcn9GEcFYZhPzGJ9ipJK/exec"
    : "https://script.google.com/macros/s/AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH/exec");

export const CONFIG = {
  GOOGLE_CLIENT_ID:
    "728154182351-5ribj1diqcp8jpfo3rnqk9rei1aka98t.apps.googleusercontent.com",
  GAS_ENDPOINT:
    import.meta.env.VITE_GAS_ENDPOINT ??
    "https://script.google.com/macros/s/AKfycbypis7IqAtM2u0_h7ysiZ5UgztUEwNYJ1zPMnr8IbTBXiyfiapfRMtD_9CxVpc5G8YVzQ/exec",
  // The blog's RSS feed (blog-gas ?o=rss): used to turn article page
  // paths in the ranking into article titles. Public content metadata,
  // so the production feed is used for both builds.
  BLOG_RSS_URL:
    "https://script.google.com/macros/s/AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH/exec?o=rss",
  // The blog API's titles payload (blog-gas ?o=titles): carries the
  // article id -> tag list map used for the blog tab's per-genre
  // rollup. Same public-metadata treatment as the RSS feed.
  BLOG_TITLES_URL:
    "https://script.google.com/macros/s/AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH/exec?o=titles",
  // The blog's translation status (blog-gas ?o=translation-status):
  // per-article English / Chinese freshness, judged by blog-gas
  // against its own snapshots. Environment-specific like
  // GAS_ENDPOINT (see BLOG_GAS_ENDPOINT above), unlike the two
  // public-metadata payloads.
  BLOG_GAS_ENDPOINT,
  BLOG_TRANSLATION_STATUS_URL: `${BLOG_GAS_ENDPOINT}?o=translation-status`,
  SITE_ORIGIN: "https://freddiefujiwara.com",
};
