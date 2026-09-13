# ADR-0002: Authentication Strategy

## Context

Flux's Gateway needs to authenticate users through three distinct methods — email/password, phone-based OTP, and Google OAuth — while every other service in the system needs a single, consistent way to trust that a request is authenticated, regardless of which method the user originally logged in with.

Several sub-decisions had to be made:
1. How to model users who may authenticate via more than one method.
2. Which token format and signing approach to use, and how it should work across 7 independently deployed services.
3. Whether OAuth should be implemented via a library (e.g. Passport, `google-auth-library`) or built directly against Google's HTTP endpoints.
4. How refresh tokens should be issued, stored, and revoked.

## Decisions

### 1. Normalized identity model: `users` + `authIdentities`

Rather than storing `provider`, `passwordHash`, `googleId`, etc. directly on the `users` table, Flux separates **who a person is** (`users`) from **how they proved it** (`authIdentities`). Each row in `authIdentities` links a `userId` to a `provider` ("email" | "otp" | "google") and a `providerUid` (the email for email auth, the phone for OTP, Google's stable `sub` for Google auth), with `passwordHash` only present for the email provider.

This allows a single user to eventually link multiple login methods to one account without any schema change, and avoids a `users` table full of nullable, provider-specific columns.

### 2. JWT (RS256) access tokens + opaque refresh tokens

Access tokens are short-lived (15 minutes) JWTs signed with RS256 — an asymmetric key pair, where only Gateway holds the private signing key, and (eventually) every other service holds only the public key needed to verify a token, never the ability to forge one.

Refresh tokens are **not** JWTs. They are randomly generated opaque strings, hashed (SHA-256) and stored server-side in a `sessions` table, with the raw value only ever handed to the client. Refreshing rotates the token: the old session row is deleted and a new one issued, so any given refresh token can only be used once, and a compromised token has a limited window before rotation happens naturally.

**Why not make refresh tokens JWTs too?** A signed JWT refresh token cannot be revoked early without maintaining a separate blocklist — which defeats much of the purpose of using a JWT for it in the first place. An opaque, database-backed token can be revoked instantly (delete the row) and its validity is a simple lookup, which is the property that actually matters for a refresh token: the ability to kill a session on demand (logout, suspected compromise).

### 3. Google OAuth implemented via direct HTTP calls, no SDK

Rather than using `passport-google-oauth` or `google-auth-library`, Flux's Google login flow is built directly against Google's documented REST endpoints: the authorization redirect, the token exchange endpoint, and the userinfo endpoint, using plain `fetch` calls. This was a deliberate choice to avoid an opaque dependency wrapping a flow that is, underneath, three straightforward HTTP requests — and to demonstrate direct understanding of the OAuth2 authorization code flow rather than relying on a library to hide it.

### 4. All three login methods converge on one `issueTokens()` function

Regardless of which provider authenticated the user, every login path ends by calling the same function to sign the access token, generate the refresh token, and create the session row. No other part of the codebase signs a JWT or creates a session independently. This guarantees every service downstream of Gateway sees exactly one token shape, with no special-casing required based on how the user logged in.

## Consequences

**Positive:**
- Adding a fourth login method later (e.g. Apple Sign-In) requires no changes to the `users` table, the token format, or any downstream service — only a new row shape in `authIdentities` and a new service file that ultimately calls `issueTokens()`.
- Refresh tokens can be revoked immediately and individually — logging a user out on one device doesn't require them to be logged out everywhere.
- Downstream services (once wired) only ever need the RS256 **public** key to verify requests — the actual signing secret exists in exactly one place.
- No dependency on an OAuth library's abstractions, versioning, or behavior changes — the flow is fully visible and owned.

**Negative / trade-offs accepted:**
- More upfront schema complexity (`authIdentities` as a separate table with a unique index on `provider` + `providerUid`) than a flatter `users` table would have required.
- Building Google OAuth from raw HTTP calls means manually handling error cases (missing `code`, Google API failures) that a mature library would handle more defensively out of the box.
- Every login path must remember to route through `issueTokens()` rather than issuing tokens inline — a discipline that has to be maintained by convention, not enforced by the type system.

## Alternatives Considered

- **Provider-specific columns directly on `users`** (`googleId`, `phone`, `passwordHash` all nullable on one table): rejected — does not scale cleanly to a user with multiple linked login methods, and results in a table where most columns are null for any given row.
- **JWT-based refresh tokens**: rejected — early revocation would require a parallel blocklist, undermining the reason to use a JWT for this purpose in the first place.
- **OAuth via `passport` or `google-auth-library`**: considered for speed of implementation, but rejected in favor of demonstrating direct control over and understanding of the OAuth2 flow itself.