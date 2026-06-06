// Open-source catalog. Descriptions ported verbatim from rarebit-static-v2's
// openSource.ts (the source-of-truth copy per its CLAUDE.md); repo slugs map
// to github.com/rarebit-one/<repo>.

export type Repo = {
  name: string;
  repo: string;
  kind: string; // "Ruby gem"
  version: string;
  description: string;
  body: string;
  bullets?: string[];
};

export type RepoCategory = {
  id: string;
  title: string;
  repos: Repo[];
};

export const openSourceCatalog: RepoCategory[] = [
  {
    id: "auth",
    title: "Authentication & Identity",
    repos: [
      {
        name: "StandardId",
        repo: "standard_id",
        kind: "Ruby gem",
        version: "v0.20.1",
        description: "A comprehensive authentication engine for Rails 8.",
        body: "A complete, secure-by-default auth solution built on Rails' own security primitives. Dual-engine architecture cleanly separates cookie-based web auth (/) from JWT-based API auth (/api), with OAuth 2.0 / OpenID Connect, passwordless email & SMS OTP, and STI-backed session management.",
        bullets: [
          "Full OAuth 2.0 + OIDC with PKCE enforcement and client-secret rotation",
          "Hardened passwordless OTP with enumeration defense and atomic attempt tracking",
          "Polymorphic multi-tenant OAuth clients with audit trail",
          "Decoupled event system via ActiveSupport::Notifications",
          "Optional Inertia.js integration for React/Vue/Svelte SPAs",
        ],
      },
      {
        name: "StandardId · Google",
        repo: "standard_id-google",
        kind: "Ruby gem",
        version: "v0.3.0",
        description: "Google Sign In as an opt-in plugin for StandardId.",
        body: "A standalone provider gem that adds Google OAuth without bloating the core engine. Auto-registers with StandardId's configuration block on require.",
      },
      {
        name: "StandardId · Apple",
        repo: "standard_id-apple",
        kind: "Ruby gem",
        version: "v0.4.0",
        description: "Apple Sign In as an opt-in plugin for StandardId.",
        body: "Adds Apple login independently of the core engine, configured with team/key/client credentials and coordinated through a standardized provider interface.",
      },
      {
        name: "StandardId · Provider",
        repo: "standard_id-provider",
        kind: "Ruby gem",
        version: "v0.2.0",
        description: "Scaffolding for building StandardId provider plugins.",
        body: "The base framework and conventions behind the Google and Apple providers — a blueprint that keeps third-party integrations consistent and enables an extensible provider ecosystem.",
      },
      {
        name: "StandardSingpass",
        repo: "standard_singpass",
        kind: "Ruby gem",
        version: "v0.1.0",
        description: "Singpass MyInfo (FAPI 2.0) client for Rails.",
        body: "A library-only gem packaging the hard parts of integrating with Singapore's national digital identity service — including native ECDH-ES JWE decryption that the upstream jwt gem does not support. Deliberately owns no routes, models, or UI; the host app keeps full control of persistence and presentation.",
        bullets: [
          "FAPI 2.0 OAuth with PKCE, DPoP, and private_key_jwt",
          "JWS verification with JWKS caching and one-shot rotation retry",
          "Person-data parser covering 40+ fields across identity, income, employment, housing, and assets",
          "Optional circuit-breaker integration for network resilience",
        ],
      },
    ],
  },
  {
    id: "reliability",
    title: "Reliability & Observability",
    repos: [
      {
        name: "StandardCircuit",
        repo: "standard_circuit",
        kind: "Ruby gem",
        version: "v0.2.0",
        description: "Circuit breaker primitives for Rails, built on stoplight.",
        body: "Wraps stoplight with an opinionated error taxonomy that distinguishes tracked network failures from caller/config errors, plus SDK-specific adapter bundles for Stripe, AWS, Faraday, and SMTP.",
        bullets: [
          "Built-in Logger, Sentry, and Metrics subscribers",
          "ActiveStorage per-S3-bucket keying and ActionMailer wrappers",
          "Controller concern returning standardized 503s for orchestrator probes",
          "RSpec helpers force_open and force_closed with auto-cleanup",
        ],
      },
      {
        name: "StandardHealth",
        repo: "standard_health",
        kind: "Ruby gem",
        version: "v0.4.0",
        description: "Drop-in health checks and environment auditing for Rails 8.",
        body: "A mountable engine exposing /health/alive, /health/ready, and /health/diagnostics/env. Ships checks for ActiveRecord, SolidQueue, and SolidCache, with a DSL for declaring required/recommended env vars.",
        bullets: [
          "Pluggable custom checks via inheritance",
          "Per-check criticality flips overall readiness status",
          "EnvSpec DSL with predicates, mode aliases, and consumed-by pointers",
          "HTTP 503/200 semantics matching standard probe conventions",
        ],
      },
      {
        name: "StandardAudit",
        repo: "standard_audit",
        kind: "Ruby gem",
        version: "v0.5.0",
        description: "Database-backed audit logging via Rails events.",
        body: "Captures audit events into a dedicated table using GlobalID polymorphic references — no foreign keys, no schema coupling. Subscribes to Rails.event on Rails 8.1+ with an ActiveSupport::Notifications fallback, and wires to StandardId with zero direct references between the gems.",
        bullets: [
          "Composable scope queries for_actor, for_target, by_event_type",
          "Async processing with retry caps",
          "GDPR anonymization and data export",
          "Automatic stripping of sensitive keys including passwords and tokens",
        ],
      },
    ],
  },
  {
    id: "data",
    title: "Data Patterns",
    repos: [
      {
        name: "StandardLedger",
        repo: "standard_ledger",
        kind: "Ruby gem",
        version: "v0.4.0",
        description: "Immutable journal entries with declarative aggregate projections.",
        body: "Captures the recurring append-only entry → N projection updates pattern as a DSL on host ActiveRecord models, with idempotency enforced by unique index and deterministic log replay.",
        bullets: [
          "Five projection modes: inline, async, sql, matview, trigger",
          "rebuild! replays the entry log; refresh! handles ad-hoc matview refresh",
          "Pure SQL projections using UPDATE ... FROM with no Ruby-side handler",
          "doctor rake task validates host-owned Postgres triggers",
        ],
      },
    ],
  },
  {
    id: "beyond-ruby",
    title: "Beyond Ruby",
    repos: [
      {
        name: "Ktor Armour",
        repo: "ktor-armour",
        kind: "Kotlin library",
        version: "multi-module",
        description: "A Ktor library suite: core, retry, and reporting.",
        body: "Hardening primitives for Ktor services, split into focused Gradle modules so hosts pull only what they need.",
      },
      {
        name: "Luminality UI",
        repo: "luminality-ui",
        kind: "npm package",
        version: "GitHub Packages",
        description: "The shared design system behind the Luminality apps.",
        body: "React components and tokens shared across the Luminality web and mobile surfaces, published to GitHub Packages.",
      },
    ],
  },
];
