# API Contract Rubric

Evaluate this diff for breaking changes to the HTTP API contract. Return a
finding only when an existing caller — in this repo or a documented external
one — would actually break; skip purely additive changes.

## Route signature changes
- A route path, HTTP method, or `:param` renamed, removed, or newly required.
- A request field added to a zod schema with no default, so an existing
  caller's request now fails validation.

## Response shape changes
- A field removed, renamed, or its type changed on a response a caller
  already parses.
- A field's meaning changed while its name/type stayed the same (e.g.
  pagination style, enum values).

## Status codes & error semantics
- A success or error path whose status code changed without a clear
  migration reason.

## Endpoint removal or relocation
- A route deleted or moved with no deprecation period, alias, or redirect,
  while another part of this repo (a client hook, another module) still calls
  the old path.

Cite the exact route and field, name the old shape and the new shape, and say
who breaks.
