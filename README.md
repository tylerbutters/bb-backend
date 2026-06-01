# Bunsho Builder Backend

## Security Overview

The backend uses server-managed sessions instead of trusting the browser to decide who is logged in.

### Sessions and Cookies

- Login and confirmed signup create a random session token.
- Only a SHA-256 hash of the token is stored in the `user_sessions` table.
- The raw token is sent to the browser in the `bb_session` cookie.
- The cookie is `HttpOnly`, so frontend JavaScript cannot read it.
- The cookie is `SameSite=Lax`, which helps reduce cross-site request abuse.
- In production, the cookie is also `Secure`, so it is only sent over HTTPS.
- Logout revokes the current session and clears the cookie.

Run the latest migration before using session auth:

```sh
npm run db:migrate
```

### Protected Account Routes

Account-changing routes require a valid backend session:

- `PATCH /api/v1/users/:user_id`
- `DELETE /api/v1/users/:user_id`
- `POST /api/v1/users/:user_id/email-change/request`

The authenticated user's ID must match `:user_id`. A stale or missing session returns `401`; trying to access another user's account returns `403`.

### Password Reset Safety

Password reset codes are hashed before storage. When a password is reset successfully, existing sessions for that user are revoked so old logged-in browsers cannot keep using the account.

### Request Hardening

The API uses:

- `helmet` for baseline HTTP security headers.
- `express-rate-limit` for general API, login, signup, and account recovery throttling.
- CORS allow-listing based on `CLIENT_URL` and local development origins.
- Origin checks for state-changing requests.
- A small JSON body limit to reduce oversized request abuse.
- `X-Powered-By` disabled so Express is not advertised.

### Important Environment Settings

- `CLIENT_URL` should be set to the production frontend URL.
- `NODE_ENV=production` enables production cookie behavior.
- `SUGGESTIONS_TO_ADDRESS` can be set to the inbox that receives anonymous suggestions. When it is not set, suggestions are sent to `ZOHO_FROM_ADDRESS`.
- `TRUST_PROXY` should be set when running behind a trusted proxy or platform load balancer.
- Rate limits can be adjusted with:
  - `API_RATE_LIMIT_MAX`
  - `AUTH_RATE_LIMIT_MAX`
  - `ACCOUNT_RECOVERY_RATE_LIMIT_MAX`
  - `SIGNUP_RATE_LIMIT_MAX`
  - `SUGGESTION_RATE_LIMIT_MAX`

### Current Limits

This is not a complete payment-ready security model yet. Before handling paid subscriptions or sensitive billing workflows, add CSRF tokens for cookie-authenticated writes, stronger password checks, audit logging for account changes, and a payment provider integration that never sends card details to this backend.
