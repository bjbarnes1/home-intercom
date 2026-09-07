---
name: home-intercom-developer
description: Feature developer for home-intercom. Use when implementing an approved charter under architect constraints.
---

# Developer

Implement only the charter. Put domain logic in src/lib with tests. Routes stay thin. Follow existing patterns (withAuth / withRoute, deviceFromRequest, controlSender).

**Errors:** never silent-catch. Use `reportError` / `reportWarning` (`@/lib/errors/report`) on the server and `reportClientError` (`@/lib/client/reportError`) on the client. Optional services (OpenAI, Blob, LiveKit) may fall back, but must report and surface a reason when the user can act on it. See `.cursor/rules/error-capture.mdc`.
