# Example Trees

## Feature-based layout (default recommendation for most apps)

```
src/
├── app/                      # app shell: providers, router, entrypoint
│   ├── App.tsx
│   └── providers.tsx
├── components/                # shared, cross-feature primitives only
│   ├── Button/
│   │   ├── Button.tsx
│   │   └── Button.test.tsx
│   ├── Modal/
│   └── index.ts               # thin barrel: fine, this is a small public API
├── hooks/                      # shared, cross-feature hooks only
│   └── useDebounce.ts
├── utils/                      # pure, stateless, no-I/O helpers
│   ├── date.ts
│   └── currency.ts
├── services/                   # I/O: API clients, storage, analytics
│   ├── api-client.ts
│   └── analytics.ts
├── constants/                  # truly app-wide constants
│   └── routes.ts
├── types/                       # shared cross-feature types
└── features/
    ├── checkout/
    │   ├── components/         # local to checkout only
    │   │   ├── CheckoutForm.tsx
    │   │   └── OrderSummary.tsx
    │   ├── hooks/
    │   │   └── useCheckoutFlow.ts   # business logic lives here, not in the component
    │   ├── api/
    │   │   └── checkout-api.ts
    │   ├── constants.ts          # scoped to this feature
    │   ├── types.ts
    │   └── index.ts               # public surface other code imports through
    └── user-profile/
        ├── components/
        ├── hooks/
        ├── api/
        └── index.ts
```

Rules this tree encodes:
- Nothing inside `features/checkout/` is imported directly by another feature — only `features/checkout/index.ts` is.
- `components/`, `hooks/`, `utils/`, `services/`, `constants/` at the root only exist because 2+ features actually need them — not scaffolded upfront.
- A one-off component used by exactly one parent (e.g. `OrderSummary` only ever rendered inside `CheckoutForm`) can be colocated even deeper, next to `CheckoutForm.tsx`, instead of its own file in `components/`.

## Small app / prototype (type-based is fine here)

```
src/
├── components/
├── hooks/
├── utils/
├── pages/
└── App.tsx
```

Don't introduce `features/` for an app with a handful of routes and no team boundaries — the migration to feature-based is cheap later; the premature structure isn't free now.

## Feature-Sliced Design (stricter alternative for larger/multi-team apps)

```
src/
├── app/        # app-wide setup: routing, providers, global styles
├── pages/      # route-level compositions
├── widgets/    # large, self-contained UI blocks composed of features/entities
├── features/   # user-facing actions/use-cases (add-to-cart, login-form)
├── entities/   # business entities (user, product) and their UI/logic
└── shared/     # framework-agnostic reusable code: ui kit, utils, api instances
```

Dependency rule: a layer may only import from layers below it in this list (`features` can use `entities`/`shared`, never the reverse). Adopt this only when the extra ceremony is actually solving a real cross-team coordination problem — see [feature-sliced.design](https://feature-sliced.design/) for the full spec before committing to it.
