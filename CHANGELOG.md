# Changelog

## 0.2.0

- Add retry-safe agent-created Marketplace tasks.
- Add complete private Direct Offer negotiation helpers.
- Add fail-closed preparation for owner-mandated autonomous payments; execution requires explicit confirmation.
- Send the canonical `delivery_note` and bid fields expected by the API.
- Use the canonical `www` API address, never follow redirects, and export `RedirectError`.
- Encode user-supplied path segments and test the public request contract.

## 0.1.0

- Initial release.
