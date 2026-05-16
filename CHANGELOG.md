# Changelog

## [1.3.0](https://github.com/9trocode/Cairn/compare/v1.2.0...v1.3.0) (2026-05-16)


### Features

* **exports:** reimagine PDF + Excel — charts, categories, goals, budgets ([0a5ff30](https://github.com/9trocode/Cairn/commit/0a5ff303967451934314db9f9c2dcbc255c1ea5a))
* **exports:** reimagined CSV — single multi-section file + dashboard fix for no-equity ([03d278a](https://github.com/9trocode/Cairn/commit/03d278a6493691d0ac36915827be35cd706d3266))
* **landing:** live GitHub stats + repo link in hero and footer ([83493e1](https://github.com/9trocode/Cairn/commit/83493e16585861b262fced4c64587c23396bbc8b))


### Bug Fixes

* **alerts:** host (NULL owner) was bypassing dedup, accumulating dupes ([6e9c5fd](https://github.com/9trocode/Cairn/commit/6e9c5fd073b2693f3aeeda98346f9c37eb5c65d4))
* **dashboard:** collapse net-worth card to one column when there's no equity ([03d278a](https://github.com/9trocode/Cairn/commit/03d278a6493691d0ac36915827be35cd706d3266))
* **migrations:** restore deleted 0018 as no-op so prod boot stops crashing ([6d907da](https://github.com/9trocode/Cairn/commit/6d907da876a52bd3102cea255a4abb8ba74a07ef))
* **mobile:** floating advisor no longer overlaps page content / iOS chrome ([5591b49](https://github.com/9trocode/Cairn/commit/5591b49e85c5febd373f4d0aa899b4fcf6a8ba38))


### Performance Improvements

* **boot:** warm DB at server start + tree-shake lucide/radix barrels ([34b33fd](https://github.com/9trocode/Cairn/commit/34b33fdb4877823af9417ee40ae50318565d25d8))
* **db:** composite indexes for the dominant 100K-tx query shapes ([929a16c](https://github.com/9trocode/Cairn/commit/929a16cce929d66655da271031916880dbf559a2))
* **memory:** right-size sqlite, cap throttle maps, stream PDF to response ([9ca9741](https://github.com/9trocode/Cairn/commit/9ca974154b472d51e9cf3e6f819049dcb7d7dcfb))
* **pages:** parallelise the leading awaits across every list page ([76157ce](https://github.com/9trocode/Cairn/commit/76157cee1d59e46ed134dc53e9b5009836d5294c))
* prefetch FX rates across every per-tx loop ([df6b798](https://github.com/9trocode/Cairn/commit/df6b798fce0dea87ab0a205bd762392eb2334650))
* prefetch FX rates in projections + savings detail; bulk seed inserts ([65a140d](https://github.com/9trocode/Cairn/commit/65a140d67332ade94eddc6bf093f90b9455f4bca))
* **prod:** kill duplicate boot work, cache brand assets, add owner+date composite ([b05f65c](https://github.com/9trocode/Cairn/commit/b05f65c04098c9066441b9d7b3815b5f6c2708bd))
* **startup:** memoise auth + parallelise layout, move accrual off response path, auto-migrate on open ([400ff61](https://github.com/9trocode/Cairn/commit/400ff619f229e9aa07bb0635bad1674415895d37))

## [1.2.0](https://github.com/9trocode/Cairn/compare/v1.1.0...v1.2.0) (2026-05-09)


### Features

* **accounts:** respect month filter — view balances as of past months ([0b15f54](https://github.com/9trocode/Cairn/commit/0b15f54a44889ad0459cbff9d38db4274176157e))
* **advisor:** "worth knowing" panel for budgets — market-anchored ([ba7c753](https://github.com/9trocode/Cairn/commit/ba7c753e7e292ee65f938623f8fd5156afe09f99))
* **advisor:** proactive idle-cash alert + goal "worth knowing" panel ([03e8de7](https://github.com/9trocode/Cairn/commit/03e8de7d56b1fb85c3a080934dc57b94bf68fa21))
* **auth:** admin-controlled registration for additional members ([17ea950](https://github.com/9trocode/Cairn/commit/17ea95032087f7ed87761f27227fff594b76e467))
* **budgets,goals:** surface "Description" field as advisor context ([7c9f763](https://github.com/9trocode/Cairn/commit/7c9f76348c350a4f76742022bfa3ddcc94e20daf))
* **db:** introduce DB adapter — keep SQLite default, leave a Postgres slot ([d691f54](https://github.com/9trocode/Cairn/commit/d691f545b1b566cb00f0cbed4613d368237726a9))
* **exports:** branded month-on-month Excel + PDF statements ([a58e474](https://github.com/9trocode/Cairn/commit/a58e47470d797026cd0b81176033ecf9fce9c011))
* **landing:** hero acknowledges multi-tenant deployment modes ([c69332e](https://github.com/9trocode/Cairn/commit/c69332ef1c9df27983a6fce200039715b8197ecd))
* **month-filter:** respect filter on alerts, cash-flow, net-worth ([e1107d7](https://github.com/9trocode/Cairn/commit/e1107d761124a9c4f8b968807781ded6535ef822))
* **multitenancy:** isolated-tenant data scoping via per-tenant SQLite ([26d0514](https://github.com/9trocode/Cairn/commit/26d0514ab27eaa572686d5d78085046d34324cd7))
* **multitenancy:** per-tenant settings — currency, AI keys, screen lock, panic URL ([77441e3](https://github.com/9trocode/Cairn/commit/77441e3d36f5b7b62fd7c48cf46c3bcf246ee465))
* **security:** screen lock + panic mode ([6f7bd98](https://github.com/9trocode/Cairn/commit/6f7bd98ab416bb2ba49bc6b747de2089dabc5c1e))
* **ui:** real user identity in sidebar + dashboard greeting ([1876656](https://github.com/9trocode/Cairn/commit/1876656ffbea775ab1e534a0b37ed49c74857476))


### Bug Fixes

* **accounts:** replace flow projection with month actuals on past-month view ([a11b11c](https://github.com/9trocode/Cairn/commit/a11b11ce84af0eec9d88e2a415be90d9ad03eca5))
* **advisor:** chat system prompt now uses scope-aware list helpers ([eb08b11](https://github.com/9trocode/Cairn/commit/eb08b11fa08e8a75e2b6481eed35b0cfbe8563ab))
* **auth:** /api/auth/logout 500 — derive redirect URL from request ([27a2df8](https://github.com/9trocode/Cairn/commit/27a2df88f2adcf2729e7405c166bfad2664f9fb5))
* **auth:** logout reachable + GET handler + bulletproof redirect ([2d8f36f](https://github.com/9trocode/Cairn/commit/2d8f36f543a3bbd8f542ed59c19079545bfbbb64))
* **auth:** logout reliably clears the session cookie ([86542cf](https://github.com/9trocode/Cairn/commit/86542cf36af1c91caab7c7673839dd8eb993bb1f))
* **brand:** logo PNGs use the actual brand charcoal, not teal ([8b8a50b](https://github.com/9trocode/Cairn/commit/8b8a50b8346fee98dbdebd48b5c01437cc717928))
* **members:** Radix Select rejects empty string — use "0" sentinel for "Never expires" ([22a48b0](https://github.com/9trocode/Cairn/commit/22a48b0e769af686580d2e9468cc2c12741f1612))
* **multitenancy:** close remaining isolation holes across advisor + UI ([b1b89f3](https://github.com/9trocode/Cairn/commit/b1b89f33bbddc97e5f5c5d003a5978279f48d1d2))
* **multitenancy:** settings reads strictly per-tenant — no host fallback ([ad3e71d](https://github.com/9trocode/Cairn/commit/ad3e71d65f9e0c4ba31afeedfdbfd3825423e148))
* **registration:** isolated tenants land in welcome flow, not host dashboard ([a50f226](https://github.com/9trocode/Cairn/commit/a50f226850ce4f513082868a87abf75e8fcb2880))
* repair corrupted LandingPage and fix session import ([75480cf](https://github.com/9trocode/Cairn/commit/75480cf4c74a614b0c90835c1e62c6f178879b46))


### Performance Improvements

* **aggregation:** batch computeNetWorthAsOf + dedupe export passes ([1594c95](https://github.com/9trocode/Cairn/commit/1594c9595ad1cd82fce13413744201aaf516a174))

## [1.1.0](https://github.com/9trocode/Fmanager/compare/v1.0.0...v1.1.0) (2026-05-08)


### Features

* **accounts:** per-account balance derivation card ([bc66ec8](https://github.com/9trocode/Fmanager/commit/bc66ec8eb62d18a4ec8928821d29cd7677b2bc37))
* **advisor:** proactive alerts — sidebar badge, /alerts, dashboard banner ([21013c4](https://github.com/9trocode/Fmanager/commit/21013c4a5f3bcd9b06447784db176c51c3845fcd))
* **advisor:** proactive tools, floating sheet on every page, FX from DB ([a395277](https://github.com/9trocode/Fmanager/commit/a395277301967fba1a422ced70b0ce902b3f22db))
* **flows:** currency-mismatch warning + one-click match-account fix ([a671e27](https://github.com/9trocode/Fmanager/commit/a671e2746c178bb409f8834e47b504a464d6dc7e))
* **predict:** chat session persistence + accounts/grants in AI context ([83f02ba](https://github.com/9trocode/Fmanager/commit/83f02ba28c9ede912054d2f8b25751a018c0221d))
* **predict:** convert one-shot to tool loop — agentic data fetching ([da6ff6d](https://github.com/9trocode/Fmanager/commit/da6ff6d8caa91ad1351f566c4fac413e7b8c7ee9))
* **predict:** interactive iterative workspace with refine + per-card save ([4443c09](https://github.com/9trocode/Fmanager/commit/4443c09fe6fe3f083507a179d4c4cdc5ed97c266))
* **predict:** proposed edits — advisor suggests concrete diffs to budgets/goals/flows ([f7665ff](https://github.com/9trocode/Fmanager/commit/f7665ff309c6cf67d2c3806acf368ca8523f6556))
* **projections:** chat-driven canvas — drafts, thread, no modal ([252be0e](https://github.com/9trocode/Fmanager/commit/252be0e8394655294f7e0eaa711c0664d8132eb1))
* **projections:** multi-scenario engine, events, goal target, AI seed ([80c188b](https://github.com/9trocode/Fmanager/commit/80c188b2fda8cb740f32c56e4714542c0e193055))
* **projections:** pure chat-first surface, everything inline ([475a187](https://github.com/9trocode/Fmanager/commit/475a18736a676942ab6cd2bdf5aa0ba353074f6f))
* **projections:** redesign Predict as a dialog with horizon control ([9c0fe4a](https://github.com/9trocode/Fmanager/commit/9c0fe4a9f039d3cbab61ab1fe003166bedddd95c))
* **projections:** summary panels + save scenarios to library ([f88bbe7](https://github.com/9trocode/Fmanager/commit/f88bbe76caf8fe6b0aa5a7d8ed6ce4d03c4c3187))
* **transactions:** show flow→tx relationship visibly ([e9f1aa1](https://github.com/9trocode/Fmanager/commit/e9f1aa1d6acd8fda2c805f5608f009507f6ec95a))


### Bug Fixes

* **advisor-chat:** stable transport + step headroom + 'write text' rule ([a0ef042](https://github.com/9trocode/Fmanager/commit/a0ef0426b7eac10c2bd212fc07f568aba4594213))
* **balance:** exclude future-dated transactions from current balance ([75200d5](https://github.com/9trocode/Fmanager/commit/75200d572d6ea75ca64679c42a2e747d7c7ac9c7))
* **balance:** FX-convert cross-currency transactions before summing ([c15b8f0](https://github.com/9trocode/Fmanager/commit/c15b8f02e8b9353e42ce9251a267ea778eb39b5f))
* **chat:** switch-session no-op + add stop button on prediction chat ([65925ed](https://github.com/9trocode/Fmanager/commit/65925ed04756f5319fad53ae37f8929bea986dfa))
* clamp goal % at 0 when in deficit; revert predict to one-shot ([f8aa269](https://github.com/9trocode/Fmanager/commit/f8aa26959d98620aba800797bb9dbe3802c5e6a0))
* **predict:** Enter sends, Shift+Enter newlines ([bacbfb9](https://github.com/9trocode/Fmanager/commit/bacbfb92079f1973956aea650bb301e71a9ef188))
* **predict:** two-phase generation — separate tool loop from structured output ([f397489](https://github.com/9trocode/Fmanager/commit/f397489e2e809ab9921d541dc93cee992b5036ea))
* **projections-ai:** currency-aware prompts + realistic contribution cap ([aef13eb](https://github.com/9trocode/Fmanager/commit/aef13eb014201435d3fc324499cbe3565dadd03b))
* **projections-ai:** flatten event schema for Gemini compatibility ([c094d42](https://github.com/9trocode/Fmanager/commit/c094d42c1bc579cdd192a575edd2f2ba560790f4))

## 1.0.0 (2026-05-07)


### Features

* Add Dockerfile, .dockerignore, and docker-compose.yml for Docker setup ([3e48075](https://github.com/9trocode/Fmanager/commit/3e48075c23f394308fd032cd036992296423471c))
* Add initial database schema for tables and columns ([8a3366e](https://github.com/9trocode/Fmanager/commit/8a3366e75f97f72063b78fd70b836c6e99dec5f6))
* Add migration files and runtime script for database migration and server entrypoint ([0ad5cee](https://github.com/9trocode/Fmanager/commit/0ad5ceecb81977fabdfe08351b26e20d21a5bd12))
* Add minimal theme provider for handling light, dark, and system themes ([bcfe5d5](https://github.com/9trocode/Fmanager/commit/bcfe5d5f380917c98860c37fd1f7a71dde837fc0))
* **advisor:** persisted multi-session chat history with resumable threads ([60fb947](https://github.com/9trocode/Fmanager/commit/60fb9479ceeb5f46ddb2a40dc6e1f0f9d242edaa))
* **advisor:** redesign chat — turn layout, tool collapse, smart scroll ([a2a6b73](https://github.com/9trocode/Fmanager/commit/a2a6b73d256706d22a26b138019036257a77e569))
* **advisor:** streaming agent with tools, file upload, and chat polish ([ca6d30c](https://github.com/9trocode/Fmanager/commit/ca6d30c403ca6f9bb800aa17fa777f888a9676eb))
* **budgets:** one-time expenses chip away at "Free" on the cash-flow panel ([9fbdaf4](https://github.com/9trocode/Fmanager/commit/9fbdaf47d4bf2b353197af44aa8ddcb0f476a69c))
* **dashboard,projections:** planned income as primary + money formatting on inputs ([a6b5fb6](https://github.com/9trocode/Fmanager/commit/a6b5fb69da9468f190fe29421f4e839abc45bb6f))
* **flows:** auto-accrue recurring flows so net worth reflects them ([03ac851](https://github.com/9trocode/Fmanager/commit/03ac851727b6754289398231d40b0002709e66fd))
* **flows:** explicit next-due date for recurring income/expense ([6b6fd1d](https://github.com/9trocode/Fmanager/commit/6b6fd1dd06666d8480a6a2dd6a4aca2f6e220d16))
* **flows:** pick a budget directly when creating a recurring expense ([458120b](https://github.com/9trocode/Fmanager/commit/458120b9c01dccaf4b772c068a454b01f6e7804e))
* **month:** apply global filter to /transactions + /cash-flow ([0911c54](https://github.com/9trocode/Fmanager/commit/0911c5412855d3c597186b33fe8ec312cac8270f))
* **month:** global month filter — sidebar-mounted, cookie-backed, 24-month range ([3a9020f](https://github.com/9trocode/Fmanager/commit/3a9020f0c13bd6fffe4d64a23eeddae08983b700))
* **month:** scrubable month filter on Home + Budgets, modal polish, fix flow→budget warning copy ([8603a19](https://github.com/9trocode/Fmanager/commit/8603a1909a13ddfeefaaf11a7b3b3ee4af5da4a3))
* **perf,landing:** streaming dashboard cards + product-snapshot landing sections ([4216d57](https://github.com/9trocode/Fmanager/commit/4216d578e23672018b32e1012e2b9f7551978fb6))
* **ui:** in-flight feedback on every actionable button ([f4676df](https://github.com/9trocode/Fmanager/commit/f4676dff3866b607bdc262f9bfc34d3e574441d4))
* **ui:** mobile-responsive layout — sheet nav, stacking grids, page headers ([6ffe9c1](https://github.com/9trocode/Fmanager/commit/6ffe9c12986840ca5eed92f789855b3515604f6e))


### Bug Fixes

* **advisor,landing:** loan terms in schema + system prompt; trimmed landing scroll ([6362d8b](https://github.com/9trocode/Fmanager/commit/6362d8b3a0082693f5572593a7413fdf5b3c2ad4))
* **cash-flow:** show one-time transactions on the page that creates them ([fda8733](https://github.com/9trocode/Fmanager/commit/fda87337dd46768789a53e70000191f36f842a6b))
* **deps:** bump transitive esbuild to &gt;=0.25.0 (GHSA dev-server) ([5c5d224](https://github.com/9trocode/Fmanager/commit/5c5d2242c809cced7936a179eb29207e8d281e11))
* **docker:** bundle better-sqlite3 transitive deps so prod migrate runs ([15e78d8](https://github.com/9trocode/Fmanager/commit/15e78d83dfe12e5751ff34948b21603c3e983273))
* **docker:** chown mounted /data on boot to fix SQLITE_CANTOPEN ([e01ada2](https://github.com/9trocode/Fmanager/commit/e01ada2cef44e1cbbea96fee2a66c3b66238507b))
* **docker:** pin packageManager to pnpm@10.32.1 ([1dbdd95](https://github.com/9trocode/Fmanager/commit/1dbdd952876beeac066a9131ec491ec07216d733))
* **flows:** post first transaction on create + add "Apply now" affordance ([5b92908](https://github.com/9trocode/Fmanager/commit/5b92908b48ab19f72182242830eaa25e5f504387))
* **goals:** hide equity-included disclosure when there are no grants ([efcaae4](https://github.com/9trocode/Fmanager/commit/efcaae482f81a19aa8106ec6f78a8f25f995ba75))
* **landing:** rebalance FeatureGrid to 3-per-section, drop dead sections ([699991b](https://github.com/9trocode/Fmanager/commit/699991b20fab61559028331ce3232691bb089c88))
* **perf,tz:** local-time month boundaries + per-request FX cache + nav skeletons ([7b81ae0](https://github.com/9trocode/Fmanager/commit/7b81ae097af5a3c98fb5172be746758977864134))
* **theme,docker:** cookie-based theme to kill script warning + slim runtime ([d889260](https://github.com/9trocode/Fmanager/commit/d889260c9b10b2390c876700536ec3d4328e1779))
* untrack data/ and make Docker build succeed from a clean image ([6913958](https://github.com/9trocode/Fmanager/commit/69139580a5f0e45e665e1a1b08d0aebaa86cb580))


### Performance Improvements

* **db:** N+1 fix on accounts, full index sweep, memo all aggregators ([9cd6684](https://github.com/9trocode/Fmanager/commit/9cd6684cf08032b6deedd478b0fd92f71cb51342))
* indexes on hot tables, SQLite tuning, throttled accrual, memoised net worth ([919542f](https://github.com/9trocode/Fmanager/commit/919542f66bb5e51b424900ad2d6a0d67f6cf2ecd))
