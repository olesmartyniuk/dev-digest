# Sources

Research compiled 2026-09-21 for the `react-frontend-best-practices` skill. Grouped by topic so they can be reused directly (e.g. for a future deep-dive, or to re-verify claims after React/tooling changes).

## Folder structure & feature-based organization

- [React Folder Structure Best Practices (2026) — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- [How to Structure a Scalable React Project in 2026 — Chirag Mehta, Medium](https://medium.com/@chiragmehta900/how-to-structure-a-scalable-react-project-in-2026-folder-architecture-guide-5562a6280b1e)
- [React Folder Structure Best Practices for Scalable Apps — TVL IT Solutions](https://www.tvlitsolutions.com/react-folder-structure-best-practices/)
- [Popular React Folder Structures and Screaming Architecture — profy.dev](https://profy.dev/article/react-folder-structure)
- [How to structure a React app in 2026 — dangz.dev](https://dangz.dev/blog/how-to-structure-a-react-app-in-2026)
- [React Folder Structure Best Practices in 2026 — Adept Dev](https://www.adeptdev.io/blogs/react-folder-structure-best-practices)
- [React project structure best practices? — Differenz System](https://www.differenzsystem.com/blog/react-project-structure/)
- [Recommended folder structure for React (2025) — DEV Community](https://dev.to/pramod_boda/recommended-folder-structure-for-react-2025-48mc)
- [React Folder Structure: 7 Ways to Organize a React App (And Exactly When Each One Breaks) — Frontend Master, Medium](https://rahuulmiishra.medium.com/react-folder-structure-7-ways-to-organize-a-react-app-and-exactly-when-each-one-breaks-ccb10dba68c2)

## Bulletproof React (reference architecture)

- [bulletproof-react — GitHub (alan2207)](https://github.com/alan2207/bulletproof-react)
- [bulletproof-react: project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [bulletproof-react: project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- [bulletproof-react Issue #238 — Project Structure Problem (discussion of tradeoffs)](https://github.com/alan2207/bulletproof-react/issues/238)
- [bulletproof-react Issue #188 — barrel file performance question](https://github.com/alan2207/bulletproof-react/issues/188)

## Feature-Sliced Design

- [Feature-Sliced Design — official site](https://feature-sliced.design/)
- [Feature-Sliced Design — docs](https://feature-sliced.design/docs)
- [Building Scalable Systems with React Architecture — FSD blog](https://feature-sliced.design/blog/scalable-react-architecture)
- [Mastering React Hooks: An Architectural Guide — FSD blog](https://feature-sliced.design/blog/react-hooks-architecture)
- [Feature-Sliced Design Architecture in React with TypeScript — Codewithzahid, Medium](https://medium.com/@codewithxohii/feature-sliced-design-architecture-in-react-with-typescript-a-comprehensive-guide-b2652283c6b2)
- [Feature-Sliced Design: A Guide To Scalable Frontend Architecture — Godel Technologies](https://www.godeltech.com/blog/feature-sliced-design-a-guide-to-scalable-frontend-architecture/)

## Colocation principle

- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation)
- [State Colocation will make your React app faster — Kent C. Dodds](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [Where should related code live? A structured look at an unresolved debate — DEV Community](https://dev.to/lucabro/where-should-related-code-live-a-structured-look-at-an-unresolved-debate-4b44)
- [Locality of Behavior / Co-location — Matias Kinnunen](https://mtsknn.fi/blog/locality-of-behavior-and-co-location/)

## Constants, utils, helpers, services naming

- [Libs vs Utils vs Services Folders: Simple Explanation for Developers — Ali Bey, Medium](https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f)
- [Services vs Utils — DEV Community](https://dev.to/moshfiqrony/services-vs-utils-what-is-the-difference-between-services-and-utils-5fh6)
- [What's the difference between helpers and utils? — GitHub discussion](https://github.com/erikras/react-redux-universal-hot-example/issues/808)
- [Front-end naming conventions — NEWTONFLASH](https://www.newtonflash.com/technology/front-end-naming-conventions/)
- [JavaScript file naming conventions — DEV Community](https://dev.to/codewithluke/javascript-file-naming-conventions-1fn7)

## Business logic separation (hooks vs. components vs. services)

- [Path To A Clean(er) React Architecture (Part 6) — Business Logic Separation — profy.dev](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- [React Separation of Concern: separation of UI and business logic — Mehul Thakkar](https://mehulcse.com/blogs/react-separation-of-concern)
- [React: separating responsibilities using hooks — Sairys, Medium](https://sairys.medium.com/react-separating-responsibilities-using-hooks-b9c90dbb3ab9)
- [Best Practices for Writing Clean React Code with Examples — DEV Community](https://dev.to/serifcolakel/best-practices-for-writing-clean-react-code-with-examples-4b90)

## Barrel files (index.ts re-exports) — performance & pitfalls

- [Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026) — DEV Community](https://dev.to/childrentime/barrel-files-why-indexts-re-exports-hurt-tree-shaking-nextjs-dev-memory-and-tsc-2026-3kpm)
- [Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking... — ReactUse blog](https://reactuse.com/blog/barrel-files-tree-shaking/)
- [Barrel files are the clean-code habit quietly wrecking your bundle — DEV Community](https://dev.to/adioof/barrel-files-are-the-clean-code-habit-quietly-wrecking-your-bundle-1cn6)
- [Barrel Files in JavaScript: Pros, Cons, and When to Use Them — Frontend Master, Medium](https://rahuulmiishra.medium.com/barrel-files-in-javascript-pros-cons-and-when-to-use-them-6efbeb22a8b6)
- [Should You Re-Export from index.ts? — Deepak Kharah, Medium](https://deepak-kharah.medium.com/should-you-re-export-from-index-ts-thats-the-question-46337ecf53ec)
- [Vite — Performance guide (Avoid Barrel Files section)](https://vite.dev/guide/performance)
- [Barrel files makes Vite very very slow — vitejs/vite Issue #16100](https://github.com/vitejs/vite/issues/16100)
- [Barrel imports (index.ts re-exports) — vercel/next.js Discussion #92926](https://github.com/vercel/next.js/discussions/92926)
- [The Barrel Trap: How I Learned to Stop Re-Exporting and Love Explicit Imports — DEV Community](https://dev.to/elmay/the-barrel-trap-how-i-learned-to-stop-re-exporting-and-love-explicit-imports-3872)
- [A Practical Guide Against Barrel Files (for library authors) — DEV Community](https://dev.to/thepassle/a-practical-guide-against-barrel-files-for-library-authors-118c)

## Component splitting rules of thumb

- [Components and Props — React (legacy docs, still the canonical "extract when reused/complex" rule)](https://legacy.reactjs.org/docs/components-and-props.html)
- [When to break up a component into multiple components — Kent C. Dodds](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components)
- [When to Split a React Component (And When You're Over-Engineering) — DEV Community](https://dev.to/137foundry/when-to-split-a-react-component-and-when-youre-over-engineering-2a6e)
- [React components composition: how to get it right — Developer Way](https://www.developerway.com/posts/components-composition-how-to-get-it-right)
- [Thinking in React — react.dev](https://react.dev/learn/thinking-in-react)
- [reactjs/react.dev — thinking-in-react.md source](https://github.com/reactjs/react.dev/blob/main/src/content/learn/thinking-in-react.md)

## Atomic Design — critique / when (not) to use it

- [Rethinking Atomic Design in React Projects — Cheesecake Labs](https://cheesecakelabs.com/blog/rethinking-atomic-design-react-projects/)
- [Atomic Design in React: Build Scalable Component Libraries — Propelius](https://propelius.tech/blogs/atomic-design-in-react-best-practices/)
- [Atomic Design and its relevance in frontend in 2025 — DEV Community](https://dev.to/m_midas/atomic-design-and-its-relevance-in-frontend-in-2025-32e9)

## Notes on recency

Several sources above are dated 2026 (Medium/DEV posts on barrel files and folder structure) — they reflect current tooling behavior (Vite, Next.js) at research time. The `react.dev`, `kentcdodds.com`, and `feature-sliced.design` sources are living references maintained by their authors/orgs and are safe to re-fetch for updates.
